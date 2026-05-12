import { useEffect, useMemo, useRef, useState } from 'react';
import AudioRecorder from '../components/AudioRecorder';
import SummaryBox from '../components/SummaryBox';
import TranscriptBox from '../components/TranscriptBox';
import { recordingService, uploadService } from '../services/api';

const CHUNK_MS = 2500;

const formatTime = (seconds) => {
  const totalSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const remainingSeconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

const pickSupportedMimeType = () => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
};

const mapEntriesToDisplayText = (entries) => entries.map((entry) => entry.text).join('\n');

const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();

const trimOverlapText = (previousText, nextText) => {
  const previous = normalizeText(previousText);
  const next = normalizeText(nextText);

  if (!previous || !next) {
    return nextText.trim();
  }

  if (previous === next) {
    return '';
  }

  const maxOverlap = Math.min(previous.length, next.length);

  for (let size = maxOverlap; size >= 8; size -= 1) {
    const previousSuffix = previous.slice(-size);
    const nextPrefix = next.slice(0, size);

    if (previousSuffix === nextPrefix) {
      const rawPrefix = nextText.slice(0, size);
      return nextText.slice(rawPrefix.length).trim();
    }
  }

  return nextText.trim();
};

const buildSummaryFromLlm = (llmResult, fallbackOverview) => {
  const result = llmResult?.result || {};

  return {
    overview: result.summary || fallbackOverview || 'No AI summary available yet.',
    decisions: result.decisions || [],
    actionItems: (result.action_items || []).map((item) => {
      const suffix = [item.assignee, item.deadline].filter(Boolean).join(' - ');
      return suffix ? `${item.task} (${suffix})` : item.task;
    }),
  };
};

function Recording() {
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recorderRestartTimeoutRef = useRef(null);
  const processingChunkRef = useRef(false);
  const pendingChunksRef = useRef([]);
  const transcriptIndexRef = useRef(0);
  const elapsedSecondsRef = useRef(0);
  const chunkPartsRef = useRef([]);
  const shouldContinueRef = useRef(false);
  const transcriptRef = useRef([]);
  const autoAnalyzeAfterStopRef = useRef(false);
  const llmRunningRef = useRef(false);
  const isRecordingRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [level, setLevel] = useState(3);
  const [transcript, setTranscript] = useState([]);
  const [error, setError] = useState('');
  const [liveStatus, setLiveStatus] = useState('Waiting to start microphone capture.');
  const [chunksProcessed, setChunksProcessed] = useState(0);
  const [summary, setSummary] = useState(null);
  const [llmAnalyzing, setLlmAnalyzing] = useState(false);
  const [displayLanguage, setDisplayLanguage] = useState('vi');
  const [displayTranscript, setDisplayTranscript] = useState([]);
  const [translatingTranscript, setTranslatingTranscript] = useState(false);
  const [translatedTranscriptCache, setTranslatedTranscriptCache] = useState({});

  useEffect(() => {
    if (!isRecording) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
      setLevel((current) => (current + 1) % 8);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    if (displayLanguage === 'vi') {
      setDisplayTranscript(transcript);
    }
  }, [transcript, displayLanguage]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (recorderRestartTimeoutRef.current) {
        window.clearTimeout(recorderRestartTimeoutRef.current);
      }
      mediaRecorderRef.current?.stop?.();
      mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    };
  }, []);

  const formattedDuration = useMemo(() => {
    const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const seconds = String(elapsedSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [elapsedSeconds]);

  const maybeRunFinalAnalysis = async () => {
    if (
      llmRunningRef.current ||
      isRecordingRef.current ||
      processingChunkRef.current ||
      pendingChunksRef.current.length > 0 ||
      !autoAnalyzeAfterStopRef.current
    ) {
      return;
    }

    const mergedTranscript = transcriptRef.current.map((entry) => entry.text).join(' ').trim();
    if (!mergedTranscript) {
      autoAnalyzeAfterStopRef.current = false;
      setSummary({
        overview: 'No speech was captured, so there is nothing to summarize yet.',
        decisions: [],
        actionItems: [],
      });
      return;
    }

    llmRunningRef.current = true;
    autoAnalyzeAfterStopRef.current = false;
    setLlmAnalyzing(true);
    setLiveStatus('Recording stopped. Running LLM summary on the final transcript...');

    try {
      const llmResult = await uploadService.runLlmAnalysis(mergedTranscript);
      setSummary(buildSummaryFromLlm(llmResult, 'The final transcript has been summarized.'));
      setLiveStatus('Recording stopped. Final transcript and AI summary are ready.');
    } catch (analysisError) {
      setError(analysisError.message);
      setSummary({
        overview: 'The transcript is ready, but the final LLM summary failed to generate.',
        decisions: [],
        actionItems: [],
      });
    } finally {
      llmRunningRef.current = false;
      setLlmAnalyzing(false);
    }
  };

  const handleTranslateTranscript = async (nextLanguage) => {
    if (nextLanguage === displayLanguage) {
      return;
    }

    if (nextLanguage === 'vi') {
      setDisplayLanguage('vi');
      setDisplayTranscript(transcriptRef.current);
      return;
    }

    const sourceEntries = transcriptRef.current;
    if (!sourceEntries.length) {
      return;
    }

    const cacheKey = sourceEntries.map((entry) => `${entry.time}|${entry.text}`).join('||');
    if (translatedTranscriptCache[cacheKey]) {
      setDisplayLanguage('en');
      setDisplayTranscript(translatedTranscriptCache[cacheKey]);
      return;
    }

    setTranslatingTranscript(true);
    setError('');

    try {
      const translated = await uploadService.translateText(
        mapEntriesToDisplayText(sourceEntries),
        'vi-en',
      );

      const translatedLines = translated.translated_text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const translatedEntries = sourceEntries.map((entry, index) => ({
        ...entry,
        text: translatedLines[index] || entry.text,
      }));

      setTranslatedTranscriptCache((current) => ({
        ...current,
        [cacheKey]: translatedEntries,
      }));
      setDisplayLanguage('en');
      setDisplayTranscript(translatedEntries);
    } catch (translateError) {
      setError(translateError.message);
    } finally {
      setTranslatingTranscript(false);
    }
  };

  const processNextChunk = async () => {
    if (processingChunkRef.current) {
      return;
    }

    const nextChunk = pendingChunksRef.current.shift();
    if (!nextChunk) {
      return;
    }

    processingChunkRef.current = true;
    setLiveStatus('Sending audio chunk to PhoWhisper...');

    try {
      const response = await recordingService.transcribeChunk(nextChunk, 'vi');
      const text = response?.text?.trim();

      if (text) {
        setTranscript((current) => {
          const previousText = current.at(-1)?.text || '';
          const mergedText = trimOverlapText(previousText, text);

          if (!mergedText) {
            return current;
          }

          transcriptIndexRef.current += 1;
          return [
            ...current,
            {
              speaker: 'PhoWhisper',
              time: formatTime(elapsedSecondsRef.current),
              text: mergedText,
            },
          ];
        });
      }

      setChunksProcessed((current) => current + 1);
      setLiveStatus(text ? 'Transcript updated from latest audio chunk.' : 'Chunk received but no speech was detected.');
    } catch (chunkError) {
      setError(chunkError.message);
      setLiveStatus('A chunk failed to transcribe. Recording can continue.');
    } finally {
      processingChunkRef.current = false;
      if (pendingChunksRef.current.length > 0) {
        void processNextChunk();
      } else if (!shouldContinueRef.current) {
        void maybeRunFinalAnalysis();
      }
    }
  };

  const startRecorderSegment = (stream) => {
    const mimeType = pickSupportedMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    chunkPartsRef.current = [];
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) {
        return;
      }

      chunkPartsRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const chunkBlob = new Blob(chunkPartsRef.current, {
        type: recorder.mimeType || mimeType || 'audio/webm',
      });
      chunkPartsRef.current = [];

      if (chunkBlob.size > 0) {
        pendingChunksRef.current.push(chunkBlob);
        void processNextChunk();
      }

      if (shouldContinueRef.current && mediaStreamRef.current) {
        recorderRestartTimeoutRef.current = window.setTimeout(() => {
          startRecorderSegment(mediaStreamRef.current);
        }, 100);
      } else {
        mediaRecorderRef.current = null;
      }
    };

    recorder.start();

    recorderRestartTimeoutRef.current = window.setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, CHUNK_MS);
  };

  const handleStart = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('This browser does not support microphone recording.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      await recordingService.startRecording();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      pendingChunksRef.current = [];
      processingChunkRef.current = false;
      transcriptIndexRef.current = 0;
      shouldContinueRef.current = true;
      mediaStreamRef.current = stream;

      setTranscript([]);
      setDisplayTranscript([]);
      transcriptRef.current = [];
      setElapsedSeconds(0);
      setChunksProcessed(0);
      setSummary(null);
      setDisplayLanguage('vi');
      setTranslatedTranscriptCache({});
      autoAnalyzeAfterStopRef.current = false;
      setLiveStatus('Listening to microphone and sending complete audio segments to PhoWhisper...');
      setIsRecording(true);
      startRecorderSegment(stream);
    } catch (startError) {
      setError(startError.message || 'Unable to start recording.');
      setLiveStatus('Could not start microphone capture.');
      mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);

    try {
      shouldContinueRef.current = false;
      if (recorderRestartTimeoutRef.current) {
        window.clearTimeout(recorderRestartTimeoutRef.current);
      }
      autoAnalyzeAfterStopRef.current = true;
      mediaRecorderRef.current?.stop?.();
      await recordingService.stopRecording();
      setIsRecording(false);
      mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setLiveStatus('Recording stopped. Final audio segment is being processed if available.');
    } catch (stopError) {
      setError(stopError.message || 'Unable to stop recording cleanly.');
    } finally {
      setBusy(false);
    }
  };

  const transcriptHeader = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-400">{liveStatus}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTranslateTranscript('vi')}
            disabled={translatingTranscript}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              displayLanguage === 'vi'
                ? 'bg-accent-500 text-white'
                : 'border border-white/10 bg-white/5 text-slate-300 hover:border-accent-300 disabled:cursor-not-allowed disabled:text-slate-500'
            }`}
          >
            Vietnamese
          </button>
          <button
            type="button"
            onClick={() => handleTranslateTranscript('en')}
            disabled={translatingTranscript || !transcript.length}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              displayLanguage === 'en'
                ? 'bg-accent-500 text-white'
                : 'border border-white/10 bg-white/5 text-slate-300 hover:border-accent-300 disabled:cursor-not-allowed disabled:text-slate-500'
            }`}
          >
            {translatingTranscript ? 'Translating...' : 'English'}
          </button>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
          {chunksProcessed} chunks processed
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <AudioRecorder
        isRecording={isRecording}
        duration={formattedDuration}
        level={level}
        onStart={handleStart}
        onStop={handleStop}
        busy={busy}
      />

      {error ? (
        <div className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
        <TranscriptBox
          transcript={displayTranscript}
          live
          headerContent={transcriptHeader}
          emptyMessage="Start recording and speak into your microphone. Transcript chunks will appear here as PhoWhisper returns them."
        />
        <SummaryBox
          summary={
            summary ||
            {
              overview: llmAnalyzing
                ? 'The final recording is being analyzed by the LLM right now.'
                : isRecording
                  ? 'This near real-time mode sends short microphone chunks to PhoWhisper and removes overlapping text where possible before showing the transcript.'
                  : 'Start a recording session to capture microphone audio. When you stop, the final transcript will be summarized automatically.',
              decisions: isRecording
                ? ['Speech is processed chunk by chunk instead of full streaming.', 'Overlapping chunk text is trimmed before being appended.']
                : [],
              actionItems: isRecording
                ? ['Speak clearly into the microphone.', 'Pause briefly if you want the chunk boundaries to be cleaner.']
                : [],
            }
          }
        />
      </div>
    </div>
  );
}

export default Recording;
