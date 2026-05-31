import { useEffect, useMemo, useState } from "react";
import LoadingState from "../components/LoadingState";
import { meetingService } from "../services/api";

const columns = [
  { id: "Todo", label: "Todo" },
  { id: "InProgress", label: "In progress" },
  { id: "Done", label: "Done" },
];

const priorities = ["All", "Low", "Medium", "High", "Critical"];
const editablePriorities = ["Low", "Medium", "High", "Critical"];

const emptyDraft = {
  meetingId: "",
  taskContent: "",
  assigneeName: "",
  priority: "Medium",
  deadline: "",
};

const priorityClasses = {
  Low: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
  Medium: "border-sky-400/20 bg-sky-400/10 text-sky-100",
  High: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  Critical: "border-rose-400/20 bg-rose-400/10 text-rose-100",
};

const toDateInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
};

const toApiDeadline = (value) => (value ? new Date(`${value}T23:59:59`).toISOString() : undefined);

function ActionItems() {
  const [meetings, setMeetings] = useState([]);
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ meetingId: "All", assignee: "", priority: "All" });
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState("");
  const [dropTarget, setDropTarget] = useState("");
  const [creatingStatus, setCreatingStatus] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const meetingTitleById = useMemo(
    () => new Map(meetings.map((meeting) => [meeting.id, meeting.title])),
    [meetings],
  );

  const defaultMeetingId = useMemo(
    () => (filters.meetingId !== "All" ? filters.meetingId : meetings[0]?.id || ""),
    [filters.meetingId, meetings],
  );

  const load = async () => {
    setLoading(true);
    setError("");
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
    } catch (loadError) {
      setError(loadError.message || "Could not load action items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setDraft((current) => ({ ...current, meetingId: defaultMeetingId }));
  }, [defaultMeetingId]);

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

  const setItemFromResponse = (updated) => {
    setItems((current) =>
      current.map((row) =>
        row.id === updated.id
          ? { ...row, ...updated, meetingTitle: row.meetingTitle || meetingTitleById.get(row.meetingId) }
          : row,
      ),
    );
  };

  const updateStatus = async (item, status) => {
    if (item.status === status || saving) return;
    const previousStatus = item.status;
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, status } : row)));
    setSaving(true);
    setError("");
    try {
      const updated =
        status === "Done"
          ? await meetingService.completeActionItem(item.id)
          : await meetingService.updateActionItem(item.id, { status });
      setItemFromResponse(updated);
    } catch (updateError) {
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, status: previousStatus } : row)));
      setError(updateError.message || "Could not move task.");
    } finally {
      setSaving(false);
    }
  };

  const openCreate = (status) => {
    setCreatingStatus(status);
    setEditingId("");
    setDraft({
      ...emptyDraft,
      status,
      meetingId: defaultMeetingId,
      priority: filters.priority !== "All" ? filters.priority : "Medium",
    });
  };

  const createTask = async (event) => {
    event.preventDefault();
    if (!draft.meetingId || !draft.taskContent.trim()) return;
    setSaving(true);
    setError("");
    try {
      const created = await meetingService.createActionItem(draft.meetingId, {
        taskContent: draft.taskContent.trim(),
        assigneeName: draft.assigneeName.trim() || undefined,
        deadline: toApiDeadline(draft.deadline),
        priority: draft.priority,
        status: creatingStatus || "Todo",
      });
      setItems((current) => [
        { ...created, meetingTitle: meetingTitleById.get(created.meetingId) || meetingTitleById.get(draft.meetingId) },
        ...current,
      ]);
      setCreatingStatus("");
      setDraft({ ...emptyDraft, meetingId: defaultMeetingId });
    } catch (createError) {
      setError(createError.message || "Could not create task.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item) => {
    setCreatingStatus("");
    setEditingId(item.id);
    setEditDraft({
      meetingId: item.meetingId,
      taskContent: item.taskContent || "",
      assigneeName: item.assigneeName || "",
      priority: item.priority || "Medium",
      deadline: toDateInput(item.deadline),
    });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editingId || !editDraft.taskContent.trim()) return;
    setSaving(true);
    setError("");
    try {
      const updated = await meetingService.updateActionItem(editingId, {
        taskContent: editDraft.taskContent.trim(),
        assigneeName: editDraft.assigneeName.trim() || null,
        deadline: toApiDeadline(editDraft.deadline) || null,
        priority: editDraft.priority,
      });
      setItemFromResponse(updated);
      setEditingId("");
    } catch (editError) {
      setError(editError.message || "Could not update task.");
    } finally {
      setSaving(false);
    }
  };

  const onDragStart = (event, item) => {
    setDraggedId(item.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  };

  const onDrop = async (event, status) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain") || draggedId;
    const item = items.find((row) => row.id === itemId);
    setDropTarget("");
    setDraggedId("");
    if (item) await updateStatus(item, status);
  };

  const renderTaskForm = ({ mode, status }) => {
    const state = mode === "create" ? draft : editDraft;
    const setState = mode === "create" ? setDraft : setEditDraft;
    const submit = mode === "create" ? createTask : saveEdit;
    const cancel = () => (mode === "create" ? setCreatingStatus("") : setEditingId(""));

    return (
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-accent-400/20 bg-slate-900/90 p-4">
        {mode === "create" ? (
          <select
            value={state.meetingId}
            onChange={(event) => setState((current) => ({ ...current, meetingId: event.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-accent-400"
          >
            <option value="">Select meeting</option>
            {meetings.map((meeting) => (
              <option key={meeting.id} value={meeting.id}>
                {meeting.title}
              </option>
            ))}
          </select>
        ) : null}
        <textarea
          value={state.taskContent}
          onChange={(event) => setState((current) => ({ ...current, taskContent: event.target.value }))}
          placeholder="Task content"
          rows={3}
          className="w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-accent-400"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={state.assigneeName}
            onChange={(event) => setState((current) => ({ ...current, assigneeName: event.target.value }))}
            placeholder="Assignee"
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-accent-400"
          />
          <input
            type="date"
            value={state.deadline}
            onChange={(event) => setState((current) => ({ ...current, deadline: event.target.value }))}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-accent-400"
          />
        </div>
        <select
          value={state.priority}
          onChange={(event) => setState((current) => ({ ...current, priority: event.target.value }))}
          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-accent-400"
        >
          {editablePriorities.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !state.taskContent.trim() || (mode === "create" && !state.meetingId)}
            className="flex-1 rounded-xl bg-accent-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {saving ? "Saving..." : mode === "create" ? `Add to ${status}` : "Save"}
          </button>
          <button
            type="button"
            onClick={cancel}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  };

  if (loading) return <LoadingState cards={3} />;

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-300">
              Action items
            </p>
            <h2 className="mt-2 text-3xl font-bold text-white">Task board</h2>
          </div>
          <button
            type="button"
            onClick={() => openCreate("Todo")}
            className="rounded-full bg-accent-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-400"
          >
            Add task
          </button>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <select
            value={filters.meetingId}
            onChange={(event) => setFilters((current) => ({ ...current, meetingId: event.target.value }))}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="All">All meetings</option>
            {meetings.map((meeting) => (
              <option key={meeting.id} value={meeting.id}>
                {meeting.title}
              </option>
            ))}
          </select>
          <input
            value={filters.assignee}
            onChange={(event) => setFilters((current) => ({ ...current, assignee: event.target.value }))}
            placeholder="Filter by assignee"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
          />
          <select
            value={filters.priority}
            onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority === "All" ? "All priorities" : priority}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-3">
        {columns.map((column) => {
          const columnItems = filtered.filter((item) => item.status === column.id);
          const isDropTarget = dropTarget === column.id;
          return (
            <div
              key={column.id}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTarget(column.id);
              }}
              onDragLeave={() => setDropTarget("")}
              onDrop={(event) => onDrop(event, column.id)}
              className={`min-h-[480px] rounded-[24px] border p-4 shadow-panel transition ${
                isDropTarget
                  ? "border-accent-300 bg-accent-500/10"
                  : "border-white/10 bg-slate-950/70"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{column.label}</h3>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                  {columnItems.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => openCreate(column.id)}
                className="mt-4 w-full rounded-2xl border border-dashed border-white/15 px-4 py-3 text-left text-sm font-semibold text-slate-300 transition hover:border-accent-300 hover:bg-white/5 hover:text-white"
              >
                + Add task
              </button>

              <div className="mt-4 space-y-3">
                {creatingStatus === column.id ? renderTaskForm({ mode: "create", status: column.label }) : null}

                {columnItems.map((item) =>
                  editingId === item.id ? (
                    <div key={item.id}>{renderTaskForm({ mode: "edit", status: column.label })}</div>
                  ) : (
                    <article
                      key={item.id}
                      draggable
                      onDragStart={(event) => onDragStart(event, item)}
                      onDragEnd={() => {
                        setDraggedId("");
                        setDropTarget("");
                      }}
                      className={`cursor-grab rounded-2xl border border-white/10 bg-white/5 p-4 transition active:cursor-grabbing ${
                        draggedId === item.id ? "opacity-50" : "hover:-translate-y-0.5 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold leading-6 text-white">{item.taskContent}</p>
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-accent-300 hover:text-white"
                        >
                          Edit
                        </button>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-slate-400">{item.meetingTitle}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span className={`rounded-full border px-3 py-1 ${priorityClasses[item.priority] || priorityClasses.Medium}`}>
                          {item.priority}
                        </span>
                        <span className="rounded-full bg-white/5 px-3 py-1 text-slate-300">
                          {item.assigneeName || "Unassigned"}
                        </span>
                        {item.deadline ? (
                          <span className="rounded-full bg-white/5 px-3 py-1 text-slate-300">
                            Due {formatDate(item.deadline)}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ),
                )}

                {!columnItems.length && creatingStatus !== column.id ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
                    Drop tasks here
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

export default ActionItems;
