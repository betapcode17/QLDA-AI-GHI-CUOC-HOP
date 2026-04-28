function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-300">
            AI Meeting Assistant
          </p>
          <h1 className="mt-1 text-xl font-bold text-white">Meetily Workspace</h1>
        </div>
        <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          Local processing active
        </div>
      </div>
    </header>
  );
}

export default Navbar;
