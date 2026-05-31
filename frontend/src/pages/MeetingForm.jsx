import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { meetingService, userService } from "../services/api";

const emptyForm = {
  title: "",
  description: "",
  startTime: "",
  endTime: "",
  passcode: "",
  status: "Scheduled",
};

const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const toIsoOrNull = (value) => (value ? new Date(value).toISOString() : null);

function MeetingForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(emptyForm);
  const [users, setUsers] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [userRows, meeting] = await Promise.all([
          userService.getUsers({ limit: 100 }),
          isEdit ? meetingService.getMeetingById(id) : Promise.resolve(null),
        ]);
        setUsers(userRows);
        if (meeting) {
          setForm({
            title: meeting.title || "",
            description: meeting.description || "",
            startTime: toLocalInput(meeting.startTime || meeting.date),
            endTime: toLocalInput(meeting.endTime),
            passcode: meeting.passcode || "",
            status: meeting.status || "Scheduled",
          });
          setSelectedParticipants(
            (meeting.participants || []).map((item) => item.userId || item.user?.id).filter(Boolean),
          );
        }
      } catch (loadError) {
        setError(loadError.message || "Could not load meeting form.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isEdit]);

  const title = useMemo(() => (isEdit ? "Edit meeting" : "Create meeting"), [isEdit]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const toggleParticipant = (userId) => {
    setSelectedParticipants((current) =>
      current.includes(userId)
        ? current.filter((item) => item !== userId)
        : [...current, userId],
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        startTime: toIsoOrNull(form.startTime),
        endTime: toIsoOrNull(form.endTime),
        passcode: form.passcode || null,
        status: form.status,
      };
      const meeting = isEdit
        ? await meetingService.updateMeeting(id, payload)
        : await meetingService.createMeeting(payload);

      await Promise.all(
        selectedParticipants.map((userId, index) =>
          meetingService.addParticipant(meeting.id, {
            userId,
            meetingRole: index === 0 ? "Host" : "Participant",
          }),
        ),
      );
      navigate(`/meetings/${meeting.id}`);
    } catch (saveError) {
      setError(saveError.message || "Could not save meeting.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-[24px] bg-slate-950/70 p-6 text-slate-300">Loading meeting form...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-300">
              Meeting
            </p>
            <h2 className="mt-2 text-3xl font-bold text-white">{title}</h2>
          </div>
          <Link to="/meetings" className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200">
            Cancel
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-slate-200">Title</span>
              <input value={form.title} onChange={(event) => updateField("title", event.target.value)} required className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-accent-400" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-slate-200">Description</span>
              <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} rows="4" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-accent-400" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-200">Start time</span>
              <input type="datetime-local" value={form.startTime} onChange={(event) => updateField("startTime", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-accent-400" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-200">End time</span>
              <input type="datetime-local" value={form.endTime} onChange={(event) => updateField("endTime", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-accent-400" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-200">Passcode</span>
              <input value={form.passcode} onChange={(event) => updateField("passcode", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-accent-400" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-200">Status</span>
              <select value={form.status} onChange={(event) => updateField("status", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-accent-400">
                <option value="Scheduled">Scheduled</option>
                <option value="InProgress">InProgress</option>
                <option value="Completed">Completed</option>
                <option value="Archived">Archived</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
          <h3 className="text-lg font-bold text-white">Participants</h3>
          <div className="mt-4 space-y-3">
            {users.map((user) => (
              <label key={user.id} className="flex cursor-pointer items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold text-white">{user.fullName}</span>
                  <span className="text-xs text-slate-400">{user.role}</span>
                </span>
                <input
                  type="checkbox"
                  checked={selectedParticipants.includes(user.id)}
                  onChange={() => toggleParticipant(user.id)}
                  className="h-4 w-4 accent-blue-500"
                />
              </label>
            ))}
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <button type="submit" disabled={saving} className="rounded-full bg-accent-500 px-6 py-3 text-sm font-semibold text-white disabled:bg-slate-700">
        {saving ? "Saving..." : "Save meeting"}
      </button>
    </form>
  );
}

export default MeetingForm;
