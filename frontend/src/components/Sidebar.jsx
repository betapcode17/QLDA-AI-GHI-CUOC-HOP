import { NavLink } from 'react-router-dom';
import logo from '../assets/logo.svg';

const items = [
  { label: 'Dashboard', to: '/' },
  { label: 'Recording', to: '/recording' },
  { label: 'Meetings', to: '/meetings' },
  { label: 'Settings', to: '/settings' },
];

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/10 bg-slate-950/75 px-6 py-8 backdrop-blur-xl lg:block">
      <div className="flex items-center gap-3">
        <img src={logo} alt="Meetily" className="h-11 w-11" />
        <div>
          <p className="text-lg font-bold text-white">Meetily</p>
          <p className="text-sm text-slate-400">Desktop meeting copilot</p>
        </div>
      </div>

      <nav className="mt-10 space-y-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                isActive
                  ? 'bg-accent-500 text-white shadow-panel'
                  : 'text-slate-300 hover:bg-white/5'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-10 rounded-[28px] bg-white/5 p-5 text-white shadow-panel">
        <p className="text-sm font-semibold">Today&apos;s capture target</p>
        <p className="mt-3 text-3xl font-bold">3 meetings</p>
        <p className="mt-2 text-sm text-white/70">Keep transcripts local, searchable, and summarized.</p>
      </div>
    </aside>
  );
}

export default Sidebar;
