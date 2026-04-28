import { Link } from 'react-router-dom';

function NotFound() {
  return (
    <div className="rounded-[32px] border border-dashed border-white/10 bg-slate-950/70 px-6 py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-300">404</p>
      <h2 className="mt-3 text-4xl font-bold text-white">Page not found</h2>
      <p className="mt-3 text-sm text-slate-400">The requested route does not exist in this frontend.</p>
      <Link to="/" className="mt-6 inline-flex rounded-full bg-accent-500 px-5 py-3 text-sm font-semibold text-white">
        Go to dashboard
      </Link>
    </div>
  );
}

export default NotFound;
