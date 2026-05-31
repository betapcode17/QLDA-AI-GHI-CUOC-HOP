import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

function MeetingCard({ meeting, onRename, onDelete }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(meeting.title || '');
  const titleInputRef = useRef(null);

  useEffect(() => {
    setTitleDraft(meeting.title || '');
  }, [meeting.title]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const saveTitle = () => {
    const nextTitle = titleDraft.trim();
    setEditingTitle(false);
    if (!nextTitle || nextTitle === meeting.title) {
      setTitleDraft(meeting.title || '');
      return;
    }
    onRename?.(meeting, nextTitle);
  };

  const cancelTitleEdit = () => {
    setTitleDraft(meeting.title || '');
    setEditingTitle(false);
  };

  return (
    <article className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-panel transition hover:-translate-y-1">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveTitle();
                if (event.key === 'Escape') cancelTitleEdit();
              }}
              className="w-full rounded-xl border border-accent-400 bg-slate-950/80 px-3 py-2 text-lg font-bold text-white outline-none ring-4 ring-accent-500/15"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="block max-w-full text-left text-lg font-bold text-white underline-offset-4 transition hover:text-accent-200 hover:underline"
              title="Click to rename meeting"
            >
              {meeting.title}
            </button>
          )}
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
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          to={`/meetings/${meeting.id}`}
          className="inline-flex rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600"
        >
          View meeting
        </Link>
        <button
          type="button"
          onClick={() => onDelete?.(meeting)}
          className="rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

export default MeetingCard;
