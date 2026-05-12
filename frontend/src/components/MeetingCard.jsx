import { Link } from 'react-router-dom';

function MeetingCard({ meeting }) {
  return (
    <article className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-panel transition hover:-translate-y-1">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-white">{meeting.title}</p>
          <p className="mt-2 text-sm text-slate-400">
            {new Date(meeting.date).toLocaleString()} · {meeting.duration}
          </p>
        </div>
        <span className="rounded-full bg-accent-500/15 px-3 py-1 text-xs font-semibold text-accent-200">
          {meeting.status}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white/5 px-3 py-3">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Source</p>
          <p className="mt-2 text-sm font-semibold text-white">{meeting.source}</p>
        </div>
        <div className="rounded-2xl bg-white/5 px-3 py-3">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Speakers</p>
          <p className="mt-2 text-sm font-semibold text-white">{meeting.speakers}</p>
        </div>
        <div className="rounded-2xl bg-white/5 px-3 py-3">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Tone</p>
          <p className="mt-2 text-sm font-semibold text-white">{meeting.sentiment}</p>
        </div>
      </div>
      <p className="mt-5 text-sm leading-7 text-slate-300">
        {meeting.summary?.overview}
      </p>
      <Link
        to={`/meetings/${meeting.id}`}
        className="mt-5 inline-flex rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600"
      >
        View meeting
      </Link>
    </article>
  );
}

export default MeetingCard;
