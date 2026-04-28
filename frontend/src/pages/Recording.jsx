import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AudioRecorder from '../components/AudioRecorder';
import SummaryBox from '../components/SummaryBox';
import TranscriptBox from '../components/TranscriptBox';
import { recordingService } from '../services/api';

const liveTranscriptSeed = [
  { speaker: 'System', time: '00:03', text: 'Recording has started. Capturing microphone and system audio.' },
  { speaker: 'Speaker 1', time: '00:18', text: 'Today we are reviewing the AI summary flow and meeting history experience.' },
  { speaker: 'Speaker 2', time: '00:42', text: 'Search quality matters most when users revisit decisions after a call.' },
  { speaker: 'Speaker 1', time: '01:15', text: 'We should keep transcript and summary side by side for quick review.' },
];

function Recording() {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [level, setLevel] = useState(3);
  const [transcript, setTranscript] = useState([]);

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
    if (!isRecording) {
      return undefined;
    }

    const feed = window.setInterval(() => {
      setTranscript((current) => {
        if (current.length >= liveTranscriptSeed.length) {
          return current;
        }
        return [...current, liveTranscriptSeed[current.length]];
      });
    }, 2500);

    return () => window.clearInterval(feed);
  }, [isRecording]);

  const formattedDuration = useMemo(() => {
    const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const seconds = String(elapsedSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [elapsedSeconds]);

  const handleStart = async () => {
    setBusy(true);
    try {
      await recordingService.startRecording();
      setTranscript([]);
      setElapsedSeconds(0);
      setIsRecording(true);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      const result = await recordingService.stopRecording();
      setIsRecording(false);
      navigate(`/meetings/${result.meetingId || 'mtg-001'}`);
    } finally {
      setBusy(false);
    }
  };

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
      <div className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
        <TranscriptBox transcript={transcript} live />
        <SummaryBox
          summary={{
            overview: isRecording
              ? 'Live meeting summary will consolidate decisions and action items as the transcript grows.'
              : 'Start a recording session to generate an AI summary after capture stops.',
            decisions: isRecording
              ? ['Transcript and summary remain visible in one workflow.', 'Local processing remains enabled during capture.']
              : [],
            actionItems: isRecording
              ? ['Monitor transcript quality while speaking.', 'Stop recording to finalize the meeting artifact.']
              : [],
          }}
        />
      </div>
    </div>
  );
}

export default Recording;
