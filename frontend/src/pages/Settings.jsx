import { useEffect, useState } from 'react';
import { settingsService } from '../services/api';

function Settings() {
  const [form, setForm] = useState({
    workspaceName: '',
    apiBaseUrl: '',
    transcriptionModel: '',
    summaryMode: '',
    autoSave: false,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    settingsService.getSettings().then(setForm);
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setSaved(false);
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSaved(true);
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[0.82fr_1.18fr]">
      <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-8 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-300">
          Settings
        </p>
        <h2 className="mt-3 text-4xl font-bold text-white">Control local AI and recording defaults</h2>
        <p className="mt-4 text-base leading-7 text-slate-300">
          Configure your endpoint, model preferences, and workspace behavior for the desktop app.
        </p>
        <div className="mt-8 space-y-4 rounded-[28px] bg-white/5 p-6 text-white">
          <div>
            <p className="text-sm font-semibold">Recommended defaults</p>
            <p className="mt-2 text-sm text-white/75">Use a local API endpoint and keep auto-save enabled so transcripts remain available after each session.</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Dark-first interface</p>
            <p className="mt-2 text-sm text-white/75">The frontend now stays on a single dark theme to keep overlays, cards, and panels visually consistent.</p>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-8 shadow-panel">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-100">Workspace name</span>
              <input
                name="workspaceName"
                value={form.workspaceName}
                onChange={handleChange}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent-400 focus:ring-4 focus:ring-accent-500/20"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-100">API base URL</span>
              <input
                name="apiBaseUrl"
                value={form.apiBaseUrl}
                onChange={handleChange}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent-400 focus:ring-4 focus:ring-accent-500/20"
              />
            </label>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-100">Transcription model</span>
              <select
                name="transcriptionModel"
                value={form.transcriptionModel}
                onChange={handleChange}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent-400 focus:ring-4 focus:ring-accent-500/20"
              >
                <option>Parakeet</option>
                <option>Whisper</option>
                <option>Whisper Turbo</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-100">Summary mode</span>
              <select
                name="summaryMode"
                value={form.summaryMode}
                onChange={handleChange}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent-400 focus:ring-4 focus:ring-accent-500/20"
              >
                <option>Local Ollama</option>
                <option>OpenAI Compatible</option>
                <option>Claude</option>
                <option>Groq</option>
              </select>
            </label>
          </div>

          <div className="space-y-4 rounded-[28px] bg-white/5 p-5">
            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">Auto-save meetings</p>
                <p className="text-sm text-slate-400">Persist recordings and transcripts after capture ends.</p>
              </div>
              <input type="checkbox" name="autoSave" checked={form.autoSave} onChange={handleChange} className="h-5 w-5 rounded border-slate-300 text-accent-500 focus:ring-accent-500" />
            </label>
          </div>

          <button
            type="submit"
            className="rounded-full bg-accent-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-600"
          >
            Save settings
          </button>

          {saved && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-600">
              Settings saved locally.
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

export default Settings;
