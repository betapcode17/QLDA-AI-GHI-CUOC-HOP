import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AudioRecorder from '../components/AudioRecorder';
import LoadingState from '../components/LoadingState';
import MeetingCard from '../components/MeetingCard';
import { meetingService } from '../services/api';

function Dashboard() {
  const [meetings, setMeetings] = useState([]);
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

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[32px] border border-white/10 bg-slate-950/70 p-8 shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-300">
            Dashboard
          </p>
          <h2 className="mt-3 max-w-2xl text-4xl font-bold text-white">
            Record meetings locally, transcribe live, and turn conversations into action.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Meetily keeps recordings, transcripts, and AI summaries on your machine while giving your team a polished workspace for review.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/recording"
              className="rounded-full bg-accent-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-600"
            >
              Start a session
            </Link>
            <Link
              to="/meetings"
              className="rounded-full border border-white/10 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-accent-300 hover:text-accent-200"
            >
              Browse history
            </Link>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          {[
            { label: 'Meetings this week', value: '18' },
            { label: 'Average summary time', value: '22s' },
            { label: 'Transcript accuracy', value: '97%' },
          ].map((item) => (
            <div key={item.label} className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
              <p className="text-sm text-slate-400">{item.label}</p>
              <p className="mt-3 text-3xl font-bold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <AudioRecorder isRecording={false} duration="00:00" level={2} onStart={() => {}} onStop={() => {}} busy />

      <section>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-300">
              Recent meetings
            </p>
            <h2 className="mt-2 text-2xl font-bold text-white">Latest transcripts and summaries</h2>
          </div>
          <Link to="/meetings" className="text-sm font-semibold text-accent-300">
            View all
          </Link>
        </div>
        {loading ? (
          <LoadingState />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {meetings.slice(0, 3).map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
