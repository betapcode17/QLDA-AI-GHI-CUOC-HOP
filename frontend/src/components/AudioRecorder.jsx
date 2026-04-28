function AudioRecorder({ isRecording, duration, level, onStart, onStop, busy }) {
  const bars = Array.from({ length: 18 }, (_, index) => {
    const active = isRecording ? ((index + level) % 5) + 8 : 3;
    return active;
  });

  return (
    <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-300">
            Recorder
          </p>
          <h2 className="mt-2 text-2xl font-bold text-white">
            {isRecording ? 'Recording in progress' : 'Ready to capture'}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Dual-source meeting capture with live transcription status and local AI processing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy || isRecording}
            onClick={onStart}
            className="rounded-full bg-accent-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Start recording
          </button>
          <button
            type="button"
            disabled={busy || !isRecording}
            onClick={onStop}
            className="rounded-full border border-white/10 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-rose-300 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Stop recording
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_220px]">
        <div className="rounded-[24px] bg-white/5 px-5 py-6">
          <div className="flex h-28 items-end gap-2">
            {bars.map((height, index) => (
              <span
                key={index}
                className={`w-full rounded-full transition-all ${
                  isRecording ? 'bg-accent-500' : 'bg-slate-700'
                }`}
                style={{ height: `${height * 7}px` }}
              />
            ))}
          </div>
        </div>
        <div className="rounded-[24px] bg-accent-500 p-6 text-white">
          <p className="text-sm uppercase tracking-[0.22em] text-white/65">Live status</p>
          <p className="mt-3 text-4xl font-bold">{duration}</p>
          <p className="mt-2 text-sm text-white/75">
            {isRecording ? 'Microphone and system audio active' : 'No active capture session'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default AudioRecorder;
