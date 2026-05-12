function SummaryBox({ summary }) {
  const safeSummary = summary || {
    overview: 'No summary available yet.',
    decisions: [],
    actionItems: [],
  };

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-300">
        AI Summary
      </p>
      <h2 className="mt-2 text-xl font-bold text-white">Key takeaways and next steps</h2>
      <div className="mt-6 space-y-6">
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-sm leading-7 text-slate-300">{safeSummary.overview}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Decisions</h3>
          <ul className="mt-3 space-y-3">
            {safeSummary.decisions.map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Action items</h3>
          <ul className="mt-3 space-y-3">
            {safeSummary.actionItems.map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default SummaryBox;
