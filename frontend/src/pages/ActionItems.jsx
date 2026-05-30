import { useEffect, useMemo, useState } from "react";
import LoadingState from "../components/LoadingState";
import { meetingService } from "../services/api";

const columns = ["Todo", "InProgress", "Done"];
const priorities = ["All", "Low", "Medium", "High", "Critical"];

function ActionItems() {
  const [meetings, setMeetings] = useState([]);
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ meetingId: "All", assignee: "", priority: "All" });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const meetingRows = await meetingService.getMeetings();
      setMeetings(meetingRows);
      const actionRows = await Promise.all(
        meetingRows.map(async (meeting) => {
          const rows = await meetingService.getActionItems(meeting.id);
          return rows.map((item) => ({ ...item, meetingTitle: meeting.title }));
        }),
      );
      setItems(actionRows.flat());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const matchMeeting = filters.meetingId === "All" || item.meetingId === filters.meetingId;
        const matchAssignee =
          !filters.assignee.trim() ||
          (item.assigneeName || "").toLowerCase().includes(filters.assignee.toLowerCase().trim());
        const matchPriority = filters.priority === "All" || item.priority === filters.priority;
        return matchMeeting && matchAssignee && matchPriority;
      }),
    [items, filters],
  );

  const updateStatus = async (item, status) => {
    const updated = status === "Done"
      ? await meetingService.completeActionItem(item.id)
      : await meetingService.updateActionItem(item.id, { status });
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, ...updated } : row)));
  };

  if (loading) return <LoadingState cards={3} />;

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-300">
          Action items
        </p>
        <h2 className="mt-2 text-3xl font-bold text-white">Task board</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <select value={filters.meetingId} onChange={(event) => setFilters((current) => ({ ...current, meetingId: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none">
            <option value="All">All meetings</option>
            {meetings.map((meeting) => (
              <option key={meeting.id} value={meeting.id}>{meeting.title}</option>
            ))}
          </select>
          <input value={filters.assignee} onChange={(event) => setFilters((current) => ({ ...current, assignee: event.target.value }))} placeholder="Filter by assignee" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" />
          <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none">
            {priorities.map((priority) => (
              <option key={priority} value={priority}>{priority === "All" ? "All priorities" : priority}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {columns.map((status) => {
          const columnItems = filtered.filter((item) => item.status === status);
          return (
            <div key={status} className="rounded-[24px] border border-white/10 bg-slate-950/70 p-5 shadow-panel">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{status}</h3>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">{columnItems.length}</span>
              </div>
              <div className="mt-4 space-y-3">
                {columnItems.map((item) => (
                  <article key={item.id} className="rounded-2xl bg-white/5 p-4">
                    <p className="font-semibold leading-6 text-white">{item.taskContent}</p>
                    <p className="mt-2 text-sm text-slate-400">{item.meetingTitle}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-accent-500/15 px-3 py-1 text-accent-100">{item.priority}</span>
                      <span className="rounded-full bg-white/5 px-3 py-1 text-slate-300">{item.assigneeName || "Unassigned"}</span>
                    </div>
                    <div className="mt-4 flex gap-2">
                      {columns.filter((nextStatus) => nextStatus !== status).map((nextStatus) => (
                        <button key={nextStatus} type="button" onClick={() => updateStatus(item, nextStatus)} className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                          {nextStatus}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

export default ActionItems;
