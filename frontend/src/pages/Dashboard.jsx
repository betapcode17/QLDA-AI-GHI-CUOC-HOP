import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import LoadingState from "../components/LoadingState";
import MeetingCard from "../components/MeetingCard";
import { dashboardService, meetingService } from "../services/api";

const statusColor = {
  Completed: "bg-emerald-400",
  InProgress: "bg-sky-400",
  Scheduled: "bg-amber-300",
  Archived: "bg-slate-400",
};

function BarList({ rows, labelKey, valueKey }) {
  const max = Math.max(...rows.map((item) => item[valueKey] || 0), 1);
  return (
    <div className="space-y-3">
      {rows.map((item) => (
        <div key={item[labelKey]} className="grid grid-cols-[120px_1fr_48px] items-center gap-3">
          <span className="truncate text-sm text-slate-300">{item[labelKey]}</span>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent-400"
              style={{ width: `${Math.max(8, ((item[valueKey] || 0) / max) * 100)}%` }}
            />
          </div>
          <span className="text-right text-sm font-semibold text-white">{item[valueKey] || 0}</span>
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [overviewData, analyticsData, meetingPage] = await Promise.all([
          dashboardService.getOverview(),
          dashboardService.getAnalytics(),
          meetingService.getMeetings(),
        ]);
        setOverview(overviewData);
        setAnalytics(analyticsData);
        setMeetings(meetingPage);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const meetingTrend = useMemo(
    () =>
      (analytics?.meetingTrend || []).map((item) => ({
        label: item.status,
        count: item._count?._all || 0,
      })),
    [analytics],
  );

  const sentimentRows = useMemo(
    () =>
      (analytics?.sentimentDistribution || []).map((item) => ({
        label: item.sentimentLabel || "Unlabeled",
        count: item._count?._all || 0,
      })),
    [analytics],
  );

  const keywordRows = useMemo(
    () =>
      (analytics?.keywordTrend || []).slice(0, 8).map((item) => ({
        label: item.keyword,
        count: item.frequencyCount,
      })),
    [analytics],
  );

  if (loading) {
    return <LoadingState cards={4} />;
  }

  const stats = [
    { label: "Total meetings", value: overview?.totalMeetings || 0 },
    { label: "Completed", value: overview?.completedMeetings || 0 },
    { label: "Pending action items", value: overview?.pendingActionItems || 0 },
    { label: "Transcripts", value: overview?.totalTranscripts || 0 },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-300">
              Dashboard
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white">
              Meeting operations overview
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/meetings/new" className="rounded-full bg-accent-500 px-5 py-3 text-sm font-semibold text-white">
              Create meeting
            </Link>
            <Link to="/action-items" className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200">
              Action board
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-[24px] border border-white/10 bg-slate-950/70 p-5 shadow-panel">
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className="mt-3 text-3xl font-bold text-white">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
          <h3 className="text-lg font-bold text-white">Meeting trend</h3>
          <div className="mt-5 space-y-4">
            {meetingTrend.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${statusColor[item.label] || "bg-accent-300"}`} />
                  <span className="text-sm text-slate-200">{item.label}</span>
                </div>
                <span className="text-sm font-bold text-white">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
          <h3 className="text-lg font-bold text-white">Sentiment chart</h3>
          <div className="mt-5">
            <BarList rows={sentimentRows} labelKey="label" valueKey="count" />
          </div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
          <h3 className="text-lg font-bold text-white">Top keywords</h3>
          <div className="mt-5">
            <BarList rows={keywordRows} labelKey="label" valueKey="count" />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Recent meetings</h2>
          <Link to="/meetings" className="text-sm font-semibold text-accent-300">
            View all
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {meetings.slice(0, 3).map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
