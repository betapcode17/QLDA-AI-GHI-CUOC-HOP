import { useEffect, useMemo, useState } from 'react';
import LoadingState from '../components/LoadingState';
import MeetingCard from '../components/MeetingCard';
import { meetingService } from '../services/api';

function MeetingsList() {
  const [meetings, setMeetings] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMeetings = async () => {
      try {
        const data = await meetingService.getMeetings();
        setMeetings(data);
      } finally {
        setLoading(false);
      }
    };

    loadMeetings();
  }, []);

  const filteredMeetings = useMemo(() => {
    const normalized = search.toLowerCase().trim();
    if (!normalized) {
      return meetings;
    }
    return meetings.filter((meeting) => {
      return (
        meeting.title.toLowerCase().includes(normalized) ||
        meeting.source.toLowerCase().includes(normalized) ||
        meeting.status.toLowerCase().includes(normalized)
      );
    });
  }, [meetings, search]);

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-8 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-300">
          Meeting history
        </p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-4xl font-bold text-white">Transcripts, summaries, and searchable sessions</h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
              Review previous calls, reopen summaries, and inspect decisions captured during each meeting.
            </p>
          </div>
          <div className="w-full max-w-md">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title, source, or status"
              className="w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 outline-none transition focus:border-accent-400 focus:ring-4 focus:ring-accent-500/20"
            />
          </div>
        </div>
      </section>

      {loading ? (
        <LoadingState />
      ) : filteredMeetings.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredMeetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-white/10 bg-slate-950/70 px-6 py-16 text-center text-sm text-slate-400">
          No meetings matched your search.
        </div>
      )}
    </div>
  );
}

export default MeetingsList;
