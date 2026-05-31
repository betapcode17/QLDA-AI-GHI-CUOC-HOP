import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { meetingService, uploadService } from "../services/api";

const displayLanguageLabels = {
  en: "English",
  vi: "Vietnamese",
};
const sourceLanguageLabels = {
  en: "English audio",
  vi: "Vietnamese audio",
};

const formatTime = (seconds) => {
  const totalSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const remainingSeconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
};

const formatSpeechTime = (seconds) => {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const totalMilliseconds = Math.round(seconds * 1000);
  const minutes = String(Math.floor(totalMilliseconds / 60000)).padStart(
    2,
    "0",
  );
  const remainingMilliseconds = totalMilliseconds % 60000;
  const remainingSeconds = String(
    Math.floor(remainingMilliseconds / 1000),
  ).padStart(2, "0");
  const fractional = String(remainingMilliseconds % 1000).padStart(3, "0");
  return `${minutes}:${remainingSeconds}.${fractional}`;
};

const formatSpeechRange = (segment) =>
  `${formatSpeechTime(segment.start)} - ${formatSpeechTime(segment.end)}`;

const transcriptToEditorText = (segments = []) =>
  segments
    .map((segment) => {
      const time = formatTime(segment.start);
      const prefix = segment.speaker
        ? `[${segment.speaker} ${time}]`
        : `[${time}]`;
      return `${prefix} ${segment.text}`.trim();
    })
    .join("\n");

const buildTranscriptText = (response, preferSegments = false) => {
  const segmentText = transcriptToEditorText(
    response?.segments || response?.transcript?.segments || [],
  );

  if (preferSegments) {
    return (
      segmentText ||
      response?.text ||
      response?.merged_text ||
      response?.merged_transcript ||
      ""
    );
  }

  return (
    response?.merged_text ||
    response?.merged_transcript ||
    response?.text ||
    segmentText
  );
};

const buildSummaryView = (llmResult) => {
  const result = llmResult?.result || {};
  return {
    overview: result.summary || "No AI summary yet.",
    decisions: result.decisions || [],
    actionItems: (result.action_items || []).map((item) => {
      const suffix = [item.assignee, item.deadline].filter(Boolean).join(" - ");
      return suffix ? `${item.task} (${suffix})` : item.task;
    }),
    minutes: result.meeting_minutes || "",
    blockers: result.risks_or_blockers || [],
  };
};

function UploadAudio() {
  const fileInputRef = useRef(null);
  const transcriptTextareaRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("vi");
  const [displayLanguage, setDisplayLanguage] = useState("vi");
  const [transcriptionMode, setTranscriptionMode] = useState("plain");
  const [expectedSpeakersCount, setExpectedSpeakersCount] = useState("2");
  const [fastMode, setFastMode] = useState(false);
  const [skipPostProcessing, setSkipPostProcessing] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState(null);
  const [models, setModels] = useState([]);
  const availableModels = useMemo(() => {
    if (!Array.isArray(models)) return 0;
    // Prefer an explicit availability flag, fallback to counting entries
    return models.filter((m) => m?.available || m?.status === "ready").length;
  }, [models]);
  const [transcription, setTranscription] = useState(null);
  const [originalTranscriptText, setOriginalTranscriptText] = useState("");
  const [editedTranscriptText, setEditedTranscriptText] = useState("");
  const [translatedCache, setTranslatedCache] = useState({});
  const [llmResult, setLlmResult] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [savedMeeting, setSavedMeeting] = useState(null);

  const transcriptSegments = transcription?.segments || [];
  const detectedSpeakers = useMemo(
    () => [
      ...new Set(
        transcriptSegments.map((segment) => segment.speaker).filter(Boolean),
      ),
    ],
    [transcriptSegments],
  );

  const selectedExpectedSpeakers = useMemo(() => {
    if (transcriptionMode !== "speaker") {
      return null;
    }

    const parsedCount = Number(expectedSpeakersCount);
    return Number.isFinite(parsedCount) ? parsedCount : null;
  }, [transcriptionMode, expectedSpeakersCount]);

  const expectedSpeakersLabel = useMemo(() => {
    if (transcriptionMode === "plain") {
      return "Transcript only";
    }

    return `${expectedSpeakersCount} people`;
  }, [transcriptionMode, expectedSpeakersCount]);

  const canTranscribe = Boolean(selectedFile) && !processing;
  const canTranslate =
    Boolean(editedTranscriptText.trim()) && !translating && !processing;
  const canAnalyze = Boolean(editedTranscriptText.trim()) && !analyzing;
  const canAsk = Boolean(question.trim()) && Boolean(llmResult) && !asking;

  const helperText = useMemo(() => {
    if (processing) return "Transcription in progress...";
    if (error) return error;
    if (!health || health?.status !== "ok") return "Backend unavailable";
    if (!selectedFile) return "Choose an audio file to get started.";
    return "Ready to generate transcript.";
  }, [processing, error, health, selectedFile]);

  const summaryView = useMemo(() => buildSummaryView(llmResult), [llmResult]);

  useEffect(() => {
    const loadBackendState = async () => {
      try {
        const [healthResponse, modelsResponse] = await Promise.all([
          uploadService.getHealth(),
          uploadService.getModelsStatus(),
        ]);
        setHealth(healthResponse);
        setModels(modelsResponse.models || []);
      } catch (loadError) {
        setError(loadError.message);
      }
    };

    loadBackendState();
  }, []);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
    };
  }, [audioPreviewUrl]);

  useEffect(() => {
    if (!transcriptTextareaRef.current) {
      return;
    }

    transcriptTextareaRef.current.style.height = "0px";
    transcriptTextareaRef.current.style.height = `${transcriptTextareaRef.current.scrollHeight}px`;
  }, [editedTranscriptText]);

  useEffect(() => {
    console.debug("[UploadAudio] diarization mode changed", {
      transcriptionMode,
      expectedSpeakersCount,
      selectedExpectedSpeakers,
    });
  }, [transcriptionMode, expectedSpeakersCount, selectedExpectedSpeakers]);

  const resetAnalysisState = () => {
    setLlmResult(null);
    setQuestion("");
    setAnswer("");
  };

  const resetTranscriptState = () => {
    setTranscription(null);
    setOriginalTranscriptText("");
    setEditedTranscriptText("");
    setTranslatedCache({});
    setSavedMeeting(null);
    resetAnalysisState();
    setError("");
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    setSelectedFile(file);
    setAudioPreviewUrl(file ? URL.createObjectURL(file) : "");
    setDisplayLanguage(sourceLanguage);
    resetTranscriptState();
  };

  const handleRemoveFile = () => {
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
    }

    setSelectedFile(null);
    setAudioPreviewUrl("");
    resetTranscriptState();

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSourceLanguageChange = (event) => {
    const nextLanguage = event.target.value;
    setSourceLanguage(nextLanguage);
    setDisplayLanguage(nextLanguage);
    resetTranscriptState();
  };

  const handleTranscriptionModeChange = (event) => {
    setTranscriptionMode(event.target.value);
    resetTranscriptState();
  };

  const handleExpectedSpeakersCountChange = (event) => {
    setExpectedSpeakersCount(event.target.value);
    resetTranscriptState();
  };

  const handleFastModeChange = (event) => {
    setFastMode(Boolean(event.target.checked));
    resetTranscriptState();
  };

  const handleSkipPostProcessingChange = (event) => {
    setSkipPostProcessing(Boolean(event.target.checked));
    resetTranscriptState();
  };

  const handleTranscribe = async () => {
    if (!selectedFile) {
      return;
    }

    if (
      transcriptionMode === "speaker" &&
      (!Number.isFinite(selectedExpectedSpeakers) ||
        selectedExpectedSpeakers < 2)
    ) {
      setError("Please enter a valid participant count of 2 or more.");
      return;
    }

    setProcessing(true);
    setError("");
    setTranscription(null);
    setOriginalTranscriptText("");
    setEditedTranscriptText("");
    setTranslatedCache({});
    setSavedMeeting(null);

    try {
      // Determine backend flags based on UI toggles
      const includeDiarization = !fastMode && transcriptionMode === "speaker";
      const includeSummary = !skipPostProcessing;
      const includeLlm = !skipPostProcessing;

      const createdMeeting = await meetingService.createMeeting({
        title: selectedFile.name.replace(/\.[^/.]+$/, "") || "Uploaded meeting",
        description: `Audio upload: ${selectedFile.name}`,
        startTime: new Date().toISOString(),
        status: "Completed",
      });

      const streamedSegments = [];
      const processResponse = await uploadService.processMeetingAudioStream(
        createdMeeting.id,
        selectedFile,
        {
          language: sourceLanguage,
          includeDiarization,
          expectedSpeakers: includeDiarization ? selectedExpectedSpeakers : null,
          includeSummary,
          includeLlm,
          onEvent: (event, data) => {
            if (event === "status") {
              setError(data.message || "");
            }
            if (event === "transcript_segment") {
              streamedSegments.push(data);
              const liveResponse = { segments: [...streamedSegments] };
              const liveText = transcriptToEditorText(streamedSegments);
              setTranscription(liveResponse);
              setOriginalTranscriptText(liveText);
              setEditedTranscriptText(liveText);
            }
            if (event === "saved") {
              setSavedMeeting({
                ...createdMeeting,
                transcriptCount: data.transcripts?.length || streamedSegments.length,
                fileId: data.file?.id,
              });
            }
          },
        },
      );
      setSavedMeeting({
        ...createdMeeting,
        transcriptCount:
          processResponse?.saved?.transcripts?.length || streamedSegments.length,
        fileId: processResponse?.saved?.file?.id,
      });
      setError("");

      const transcriptResponse =
        transcriptionMode === "speaker"
          ? processResponse?.transcript || null
          : processResponse || null;
      const editorText = buildTranscriptText(
        processResponse,
        transcriptionMode === "plain",
      );

      setTranscription({
        ...(transcriptResponse || {}),
        detected_speakers:
          transcriptionMode === "speaker"
            ? processResponse?.detected_speakers || 0
            : 0,
        expected_speakers:
          transcriptionMode === "speaker"
            ? (processResponse?.expected_speakers ?? null)
            : null,
        assigned_speakers:
          transcriptionMode === "speaker"
            ? processResponse?.assigned_speakers ||
              transcriptResponse?.num_speakers ||
              0
            : 0,
        num_speakers:
          transcriptionMode === "speaker"
            ? processResponse?.num_speakers ||
              transcriptResponse?.num_speakers ||
              0
            : 0,
        diarization:
          transcriptionMode === "speaker"
            ? processResponse?.diarization || null
            : null,
        warnings:
          transcriptionMode === "speaker"
            ? processResponse?.warnings || transcriptResponse?.warnings || []
            : transcriptResponse?.warnings || [],
      });
      setOriginalTranscriptText(editorText);
      setEditedTranscriptText(editorText);
      setDisplayLanguage(sourceLanguage);
      setTranslatedCache({});
      resetAnalysisState();
    } catch (transcribeError) {
      setError(transcribeError.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleTranslate = async (nextLanguage) => {
    if (!editedTranscriptText.trim() || nextLanguage === displayLanguage) {
      return;
    }

    if (nextLanguage === sourceLanguage) {
      setEditedTranscriptText(originalTranscriptText);
      setDisplayLanguage(nextLanguage);
      resetAnalysisState();
      return;
    }

    if (
      translatedCache[nextLanguage] &&
      editedTranscriptText === originalTranscriptText
    ) {
      setEditedTranscriptText(translatedCache[nextLanguage]);
      setDisplayLanguage(nextLanguage);
      resetAnalysisState();
      return;
    }

    setTranslating(true);
    setError("");

    try {
      const direction = sourceLanguage === "vi" ? "vi-en" : "en-vi";
      const translated = await uploadService.translateText(
        editedTranscriptText,
        direction,
      );

      if (editedTranscriptText === originalTranscriptText) {
        setTranslatedCache((current) => ({
          ...current,
          [nextLanguage]: translated.translated_text,
        }));
      }

      setEditedTranscriptText(translated.translated_text);
      setDisplayLanguage(nextLanguage);
      resetAnalysisState();
    } catch (translateError) {
      setError(translateError.message);
    } finally {
      setTranslating(false);
    }
  };

  const handleAnalyze = async () => {
    if (!editedTranscriptText.trim()) {
      return;
    }

    setAnalyzing(true);
    setError("");
    setAnswer("");

    try {
      const result = await uploadService.runLlmAnalysis(editedTranscriptText);
      setLlmResult(result);
    } catch (analysisError) {
      setError(analysisError.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAsk = async (event) => {
    event.preventDefault();
    if (!question.trim() || !llmResult) {
      return;
    }

    setAsking(true);
    try {
      const result = uploadService.buildQuestionAnswer(
        question,
        llmResult,
        displayLanguage,
      );
      setAnswer(result);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-8 shadow-panel">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-300">
              Audio upload
            </p>
            <h2 className="mt-3 text-4xl font-bold text-white">
              Editable speech-to-text, on-demand translation, and LLM analysis
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Your audio file is transcribed with PhoWhisper first. After that,
              you can edit the transcript, translate it on demand, and run
              LLM-based summary and Q&A on the revised text.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/5 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Backend
              </p>
              <p className="mt-2 text-sm font-semibold text-white">
                {health?.status === "ok" ? "Connected" : "Unavailable"}
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Models ready
              </p>
              <p className="mt-2 text-sm font-semibold text-white">
                {availableModels}/{models.length}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-300">
          Upload file
        </p>
        <h3 className="mt-2 text-xl font-bold text-white">
          Choose an input audio file
        </h3>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-100">
              Source audio language
            </span>
            <select
              value={sourceLanguage}
              onChange={handleSourceLanguageChange}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent-400 focus:ring-4 focus:ring-accent-500/20"
            >
              <option value="vi">{sourceLanguageLabels.vi}</option>
              <option value="en">{sourceLanguageLabels.en}</option>
            </select>
          </label>

          <div className="space-y-2">
            <span className="text-sm font-semibold text-slate-100">
              Generate mode
            </span>
            <select
              value={transcriptionMode}
              onChange={handleTranscriptionModeChange}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent-400 focus:ring-4 focus:ring-accent-500/20"
            >
              <option value="plain">Transcript only</option>
              <option value="speaker">Transcript + speaker labels</option>
            </select>
            <p className="text-xs text-slate-400">
              Chọn transcript-only nếu chỉ muốn text, hoặc speaker-aware nếu cần
              phân biệt người nói.
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="inline-flex items-center gap-3">
              <input
                type="checkbox"
                checked={fastMode}
                onChange={handleFastModeChange}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-slate-300">
                Fast (skip diarization)
              </span>
            </label>
            <p className="text-xs text-slate-400">
              If enabled, the backend will skip diarization for a faster
              transcript (note: speaker labels will not be produced).
            </p>

            <label className="inline-flex items-center gap-3">
              <input
                type="checkbox"
                checked={skipPostProcessing}
                onChange={handleSkipPostProcessingChange}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-slate-300">
                Skip summary & LLM post-processing
              </span>
            </label>
            <p className="text-xs text-slate-400">
              Disable expensive summarization and LLM refinement to speed up
              end-to-end processing.
            </p>
          </div>

          {transcriptionMode === "speaker" ? (
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-slate-100">
                Expected participants
              </span>
              <input
                type="number"
                min="2"
                max="10"
                step="1"
                inputMode="numeric"
                value={expectedSpeakersCount}
                onChange={handleExpectedSpeakersCountChange}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent-400 focus:ring-4 focus:ring-accent-500/20"
                placeholder="2"
              />
              <p className="text-xs text-slate-400">
                Nhập số người tham gia thực tế để diarization ổn định hơn.
              </p>
            </label>
          ) : null}

          <div className="space-y-2">
            <span className="text-sm font-semibold text-slate-100">
              Display language
            </span>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              {displayLanguageLabels[displayLanguage]}
            </div>
          </div>
        </div>

        {selectedFile ? (
          <div className="mt-6 rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-lg font-semibold text-white">
                  {selectedFile.name}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Generate mode:{" "}
                  {transcriptionMode === "speaker"
                    ? "Transcript + speaker labels"
                    : "Transcript only"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemoveFile}
                className="inline-flex rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-300 hover:bg-rose-500/20"
              >
                Remove file
              </button>
            </div>
            <audio controls src={audioPreviewUrl} className="mt-5 w-full" />
          </div>
        ) : (
          <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-white/15 bg-white/5 px-6 py-12 text-center transition hover:border-accent-400 hover:bg-white/10">
            <span className="text-lg font-semibold text-white">
              Drag and drop or click to choose a file
            </span>
            <span className="mt-2 text-sm text-slate-400">
              Supports mp3, wav, m4a, and other common audio formats
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        )}

        <div className="mt-5 rounded-2xl bg-white/5 px-4 py-4">
          <p className="text-sm font-semibold text-white">Status</p>
          <p className="mt-2 text-sm text-slate-300">{helperText}</p>
          <p className="mt-2 text-sm text-slate-300">
            Generate mode:{" "}
            {transcriptionMode === "speaker"
              ? "Transcript + speaker labels"
              : "Transcript only"}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Selected participants: {expectedSpeakersLabel}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Speaker labels:{" "}
            {transcription
              ? `${transcription.detected_speakers ?? transcription.num_speakers ?? 0} detected / ${transcription.assigned_speakers ?? transcription.num_speakers ?? 0} assigned`
              : "on"}
          </p>
          {transcriptionMode === "speaker" &&
          transcription?.expected_speakers ? (
            <p className="mt-2 text-sm text-slate-300">
              Expected participants: {transcription.expected_speakers}
            </p>
          ) : transcriptionMode === "speaker" ? (
            <p className="mt-2 text-sm text-slate-300">
              Expected participants: Auto detect
            </p>
          ) : null}
          {transcriptionMode === "speaker" && !selectedExpectedSpeakers ? (
            <p className="mt-2 text-sm text-rose-200">
              Speaker mode is selected but the participant count is invalid.
            </p>
          ) : null}
          {detectedSpeakers.length ? (
            <p className="mt-2 text-sm text-slate-300">
              Detected speakers: {detectedSpeakers.join(", ")}
            </p>
          ) : null}
          {transcription?.warnings?.length ? (
            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {transcription.warnings.map((warning, index) => (
                <p key={`${warning}-${index}`}>{warning}</p>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
            Display language: {displayLanguageLabels[displayLanguage]}
          </p>
        </div>

        <button
          type="button"
          onClick={handleTranscribe}
          disabled={!canTranscribe}
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {processing ? "Transcribing..." : "Generate transcript"}
        </button>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {savedMeeting ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4">
            <p className="text-sm font-semibold text-emerald-100">
              Saved to database
            </p>
            <p className="mt-2 text-sm text-emerald-50/80">
              Created meeting "{savedMeeting.title}" with{" "}
              {savedMeeting.transcriptCount} transcript segments.
            </p>
            <Link
              to={`/meetings/${savedMeeting.id}`}
              className="mt-3 inline-flex rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              View saved meeting
            </Link>
          </div>
        ) : null}
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-300">
                Transcript
              </p>
              <h2 className="mt-2 text-xl font-bold text-white">
                Meeting transcript
              </h2>
            </div>
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
              {editedTranscriptText
                ? editedTranscriptText.split("\n").filter(Boolean).length
                : 0}{" "}
              entries
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-slate-400">
              This transcript is fully editable. Use the language buttons to
              request translation.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleTranslate("vi")}
                disabled={!canTranslate}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  displayLanguage === "vi"
                    ? "bg-accent-500 text-white"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:border-accent-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                }`}
              >
                {translating && displayLanguage !== "vi"
                  ? "Translating..."
                  : "Vietnamese"}
              </button>
              <button
                type="button"
                onClick={() => handleTranslate("en")}
                disabled={!canTranslate}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  displayLanguage === "en"
                    ? "bg-accent-500 text-white"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:border-accent-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                }`}
              >
                {translating && displayLanguage !== "en"
                  ? "Translating..."
                  : "English"}
              </button>
            </div>
          </div>

          <textarea
            ref={transcriptTextareaRef}
            value={editedTranscriptText}
            onChange={(event) => {
              setEditedTranscriptText(event.target.value);
              resetAnalysisState();
            }}
            placeholder="Your transcript will appear here after you upload a file and generate it."
            rows={1}
            className="mt-6 w-full resize-none overflow-hidden rounded-[28px] border border-white/10 bg-white/5 px-6 py-6 text-lg leading-9 text-slate-100 outline-none transition focus:border-accent-400 focus:ring-4 focus:ring-accent-500/20"
          />

          <div className="mt-6 rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-300">
                  Speaker timeline
                </p>
                <h3 className="mt-2 text-lg font-bold text-white">
                  Who spoke, when, and what they said
                </h3>
              </div>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                {transcriptSegments.length} segments
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {transcriptSegments.length ? (
                transcriptSegments.map((segment, index) => (
                  <article
                    key={`${segment.speaker || "speaker"}-${segment.start}-${segment.end}-${index}`}
                    className="rounded-[24px] border border-white/10 bg-slate-950/80 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-accent-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent-100">
                          {segment.speaker || "SPEAKER"}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          {formatSpeechRange(segment)}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500">
                        Segment {index + 1}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-200">
                      {segment.text || "No text returned for this segment."}
                    </p>
                  </article>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/10 px-4 py-8 text-sm text-slate-500">
                  Speaker segments will appear here after transcription
                  completes.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-300">
            AI Summary
          </p>
          <div className="mt-2 flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold text-white">Summary and Q&A</h2>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {analyzing ? "Analyzing..." : "Run LLM analysis"}
            </button>
          </div>

          <div className="mt-6 space-y-6">
            <div className="rounded-2xl bg-white/5 p-4">
              <p className="text-sm leading-7 text-slate-300">
                {summaryView.overview}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                Decisions
              </h3>
              <div className="mt-3 space-y-3">
                {summaryView.decisions.length ? (
                  summaryView.decisions.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300"
                    >
                      {item}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-500">
                    No decisions yet.
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                Action items
              </h3>
              <div className="mt-3 space-y-3">
                {summaryView.actionItems.length ? (
                  summaryView.actionItems.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300"
                    >
                      {item}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-500">
                    No action items yet.
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                Q&A
              </h3>
              <form onSubmit={handleAsk} className="mt-3 space-y-4">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows="4"
                  placeholder="Ask about the summary, decisions, action items, or blockers..."
                  className="w-full rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-white outline-none transition focus:border-accent-400 focus:ring-4 focus:ring-accent-500/20"
                />
                <button
                  type="submit"
                  disabled={!canAsk}
                  className="rounded-full bg-accent-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {asking ? "Answering..." : "Ask question"}
                </button>
              </form>

              <div className="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Answer
                </p>
                <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                  {answer ||
                    "The answer will appear here after you run the LLM analysis and ask a question."}
                </pre>
              </div>
            </div>

            {summaryView.minutes ? (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Meeting minutes
                </h3>
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-300">
                  {summaryView.minutes}
                </div>
              </div>
            ) : null}

            {summaryView.blockers.length ? (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Risks / Blockers
                </h3>
                <div className="mt-3 space-y-3">
                  {summaryView.blockers.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
export default UploadAudio;
