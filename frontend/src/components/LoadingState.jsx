function LoadingState({ cards = 3 }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }).map((_, index) => (
        <div
          key={index}
          className="h-72 animate-pulse rounded-[28px] border border-white/10 bg-slate-950/70"
        />
      ))}
    </div>
  );
}

export default LoadingState;
