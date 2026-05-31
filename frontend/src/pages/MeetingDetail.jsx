import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import LoadingState from "../components/LoadingState";
import { meetingService } from "../services/api";

const tabs = ["Transcript", "Speakers", "Summary", "Action Items", "Files", "Notes"];

function MeetingDetail() {
  const { id } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [related, setRelated] = useState({
    participants: [],
    speakers: [],
    transcripts: [],
    summaries: [],
    actionItems: [],
    files: [],
    notes: [],
  });
  const [activeTab, setActiveTab] = useState("Transcript");
  const [noteText, setNoteText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMeeting = async () => {
    setLoading(true);
    setError("");
    try {
      const [detail, participants, speakers, transcripts, summaries, actionItems, files, notes] =
        await Promise.all([
          meetingService.getMeetingById(id),
          meetingService.getParticipants(id),
          meetingService.getSpeakers(id),
          meetingService.getTranscripts(id),
          meetingService.getSummaries(id),
          meetingService.getActionItems(id),
          meetingService.getFiles(id),
          meetingService.getNotes(id),
        ]);
      setMeeting(detail);
      setRelated({ participants, speakers, transcripts, summaries, actionItems, files, notes });
    } catch (loadError) {
      setError(loadError.message || "Meeting could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeeting();
  }, [id]);

  const counts = useMemo(
    () => ({
      Transcript: related.transcripts.length,
      Speakers: related.speakers.length,
      Summary: related.summaries.length,
      "Action Items": related.actionItems.length,
      Files: related.files.length,
      Notes: related.notes.length,
    }),
    [related],
  );

  const handleAddNote = async (event) => {
    event.preventDefault();
    if (!noteText.trim()) return;
    await meetingService.addNote({ meetingId: id, noteContent: noteText.trim(), isBookmark: true });
    setNoteText("");
    const notes = await meetingService.getNotes(id);
    setRelated((current) => ({ ...current, notes }));
  };

  const handleExport = async (format) => {
    const blob = await meetingService.exportMeeting(id, format);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${meeting.title}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingState cards={2} />;

  if (error || !meeting) {
    return (
      <div className="rounded-[28px] border border-dashed border-white/10 bg-slate-950/70 px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-white">Meeting not found</h2>
        <p className="mt-3 text-sm text-slate-400">{error}</p>
        <Link to="/meetings" className="mt-6 inline-flex rounded-full bg-accent-500 px-5 py-3 text-sm font-semibold text-white">
          Back to meetings
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-300">
              Meeting detail
            </p>
            <h2 className="mt-2 text-3xl font-bold text-white">{meeting.title}</h2>
            <p className="mt-3 text-sm text-slate-300">
              {meeting.startTime || meeting.date ? new Date(meeting.startTime || meeting.date).toLocaleString() : "No schedule"} · {meeting.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to={`/meetings/${id}/edit`} className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200">
              Edit
            </Link>
            {["json", "docx", "pdf"].map((format) => (
              <button key={format} type="button" onClick={() => handleExport(format)} className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold uppercase text-slate-200">
                {format}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/70 p-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab ? "bg-accent-500 text-white" : "text-slate-300 hover:bg-white/5"
            }`}
          >
            {tab} <span className="ml-2 text-xs opacity-70">{counts[tab]}</span>
          </button>
        ))}
      </div>

      <section className="rounded-[24px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
        {activeTab === "Transcript" ? (
          <div className="space-y-4">
            {related.transcripts.map((item) => (
              <article key={item.id} className="rounded-2xl bg-white/5 p-4">
                <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.14em] text-slate-400">
                  <span>{item.speaker?.realName || item.speaker?.speakerLabel || "Speaker"}</span>
                  <span>{item.startTimestamp ?? "0"}s - {item.endTimestamp ?? "0"}s</span>
                  {item.sentimentLabel ? <span>{item.sentimentLabel}</span> : null}
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-100">{item.originalText}</p>
                {item.translatedText ? <p className="mt-2 text-sm leading-7 text-slate-400">{item.translatedText}</p> : null}
              </article>
            ))}
          </div>
        ) : null}

        {activeTab === "Speakers" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {related.speakers.map((speaker) => (
              <div key={speaker.id} className="rounded-2xl bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: speaker.colorHex || "#60a5fa" }} />
                  <p className="font-semibold text-white">{speaker.realName || speaker.speakerLabel}</p>
                </div>
                <p className="mt-2 text-sm text-slate-400">{speaker.speakerLabel}</p>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "Summary" ? (
          <div className="space-y-4">
            {related.summaries.map((summary) => (
              <article key={summary.id} className="rounded-2xl bg-white/5 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent-300">{summary.summaryType}</p>
                <p className="mt-3 text-sm leading-7 text-slate-100">{summary.content}</p>
              </article>
            ))}
          </div>
        ) : null}

        {activeTab === "Action Items" ? (
          <div className="grid gap-4 md:grid-cols-2">
            {related.actionItems.map((item) => (
              <div key={item.id} className="rounded-2xl bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-white">{item.taskContent}</p>
                  <span className="rounded-full bg-accent-500/15 px-3 py-1 text-xs font-semibold text-accent-100">{item.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{item.assigneeName || "Unassigned"} · {item.priority}</p>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "Files" ? (
          <div className="space-y-3">
            {related.files.map((file) => (
              <a key={file.id} href={`http://localhost:3001/files/${file.id}/download`} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="text-sm font-semibold text-white">{file.fileName || file.filePath}</span>
                <span className="text-xs text-slate-400">{file.fileType}</span>
              </a>
            ))}
          </div>
        ) : null}

        {activeTab === "Notes" ? (
          <div className="space-y-4">
            <form onSubmit={handleAddNote} className="flex flex-col gap-3 md:flex-row">
              <input value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Add note or bookmark" className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-accent-400" />
              <button type="submit" className="rounded-full bg-accent-500 px-5 py-3 text-sm font-semibold text-white">Add note</button>
            </form>
            {related.notes.map((note) => (
              <div key={note.id} className="rounded-2xl bg-white/5 p-4 text-sm leading-7 text-slate-100">
                {note.noteContent || "Bookmark"}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default MeetingDetail;
