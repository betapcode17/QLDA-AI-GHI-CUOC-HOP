import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import LoadingState from '../components/LoadingState';
import SummaryBox from '../components/SummaryBox';
import TranscriptBox from '../components/TranscriptBox';
import { meetingService } from '../services/api';

function MeetingDetail() {
  const { id } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadMeeting = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await meetingService.getMeetingById(id);
        setMeeting(data);
      } catch (err) {
        setError('Meeting could not be loaded.');
      } finally {
        setLoading(false);
      }
    };

    loadMeeting();
  }, [id]);

  if (loading) {
    return <LoadingState cards={2} />;
  }

  if (error || !meeting) {
    return (
      <div className="rounded-[32px] border border-dashed border-white/10 bg-slate-950/70 px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-white">Meeting not found</h2>
        <p className="mt-3 text-sm text-slate-400">{error}</p>
        <Link
          to="/meetings"
          className="mt-6 inline-flex rounded-full bg-accent-500 px-5 py-3 text-sm font-semibold text-white"
        >
          Back to meetings
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-8 shadow-panel">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-300">
              Meeting detail
            </p>
            <h2 className="mt-3 text-4xl font-bold text-white">{meeting.title}</h2>
            <p className="mt-3 text-base text-slate-300">
              {new Date(meeting.date).toLocaleString()} · {meeting.duration} · {meeting.source}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Status', value: meeting.status },
              { label: 'Speakers', value: String(meeting.speakers) },
              { label: 'Tone', value: meeting.sentiment },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-white/5 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{item.label}</p>
                <p className="mt-2 text-sm font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
        <TranscriptBox transcript={meeting.transcript} />
        <SummaryBox summary={meeting.summary} />
      </div>
    </div>
  );
}

export default MeetingDetail;
