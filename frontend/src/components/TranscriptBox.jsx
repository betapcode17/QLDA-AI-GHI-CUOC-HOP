function TranscriptBox({ transcript = [], live = false }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-300">
            Transcript
          </p>
          <h2 className="mt-2 text-xl font-bold text-white">
            {live ? 'Live transcript feed' : 'Meeting transcript'}
          </h2>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
          {transcript.length} entries
        </span>
      </div>
      <div className="mt-6 max-h-[28rem] space-y-4 overflow-auto pr-2">
        {transcript.length > 0 ? (
          transcript.map((entry, index) => (
            <article
              key={`${entry.speaker}-${entry.time}-${index}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white">{entry.speaker}</p>
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {entry.time}
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{entry.text}</p>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-400">
            Transcript will appear here once recording starts.
          </div>
        )}
      </div>
    </section>
  );
}

export default TranscriptBox;
