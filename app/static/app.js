const state = {
  mediaRecorder: null,
  audioChunks: [],
  audioBlob: null,
  audioUrl: null,
  audioContext: null,
  analyser: null,
  animationFrame: null,
  startedAt: null,
  timerInterval: null,
  latestResult: null,
};

const els = {
  body: document.body,
  modelStatus: document.querySelector("#modelStatus"),
  recordBtn: document.querySelector("#recordBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  processBtn: document.querySelector("#processBtn"),
  fileInput: document.querySelector("#fileInput"),
  playback: document.querySelector("#playback"),
  timer: document.querySelector("#timer"),
  waveform: document.querySelector("#waveform"),
  recordState: document.querySelector("#recordState"),
  pipeline: document.querySelector("#pipeline"),
  languageSelect: document.querySelector("#languageSelect"),
  translateSelect: document.querySelector("#translateSelect"),
  diarizationToggle: document.querySelector("#diarizationToggle"),
  summaryToggle: document.querySelector("#summaryToggle"),
  summaryOutput: document.querySelector("#summaryOutput"),
  warningOutput: document.querySelector("#warningOutput"),
  transcriptOutput: document.querySelector("#transcriptOutput"),
  speakerOutput: document.querySelector("#speakerOutput"),
  translationOutput: document.querySelector("#translationOutput"),
  copyBtn: document.querySelector("#copyBtn"),
};

const ctx = els.waveform.getContext("2d");

function setStatus(text, kind = "pending") {
  els.modelStatus.innerHTML = `<span class="dot ${kind}"></span><span>${text}</span>`;
}

function setRecordState(text) {
  els.recordState.textContent = text;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function startTimer() {
  state.startedAt = Date.now();
  state.timerInterval = window.setInterval(() => {
    els.timer.textContent = formatTime((Date.now() - state.startedAt) / 1000);
  }, 250);
}

function stopTimer() {
  window.clearInterval(state.timerInterval);
  state.timerInterval = null;
}

function setPipeline(activeStep, doneSteps = []) {
  [...els.pipeline.querySelectorAll("span")].forEach((item) => {
    const step = item.dataset.step;
    item.classList.toggle("active", step === activeStep);
    item.classList.toggle("done", doneSteps.includes(step));
  });
}

function drawIdleWave() {
  const { width, height } = els.waveform;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#0b6b5b";
  ctx.beginPath();
  for (let x = 0; x < width; x += 12) {
    const y = height / 2 + Math.sin(x / 42 + Date.now() / 900) * 20;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  state.animationFrame = requestAnimationFrame(drawIdleWave);
}

function drawLiveWave() {
  if (!state.analyser) return;
  const buffer = new Uint8Array(state.analyser.frequencyBinCount);
  state.analyser.getByteTimeDomainData(buffer);
  const { width, height } = els.waveform;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#d65b3a";
  ctx.beginPath();
  const slice = width / buffer.length;
  buffer.forEach((value, index) => {
    const x = index * slice;
    const y = (value / 255) * height;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  state.animationFrame = requestAnimationFrame(drawLiveWave);
}

function stopWave() {
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = null;
}

async function checkHealth() {
  try {
    const response = await fetch("/health");
    if (!response.ok) throw new Error("Health check failed");
    const data = await response.json();
    const ready = data.models.every((model) => model.available);
    setStatus(ready ? "5 models ready" : "Models incomplete", ready ? "ok" : "error");
  } catch (error) {
    setStatus("API offline", "error");
  }
}

function getSupportedMimeType() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/wav"];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.audioChunks = [];
  state.audioBlob = null;
  const mimeType = getSupportedMimeType();
  state.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  state.audioContext = new AudioContext();
  const source = state.audioContext.createMediaStreamSource(stream);
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 2048;
  source.connect(state.analyser);

  state.mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) state.audioChunks.push(event.data);
  };
  state.mediaRecorder.onstop = () => {
    const type = state.mediaRecorder.mimeType || "audio/webm";
    state.audioBlob = new Blob(state.audioChunks, { type });
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(state.audioBlob);
    els.playback.src = state.audioUrl;
    els.playback.hidden = false;
    els.processBtn.disabled = false;
    stream.getTracks().forEach((track) => track.stop());
    if (state.audioContext) state.audioContext.close();
    stopWave();
    drawIdleWave();
    stopTimer();
    setRecordState("Recorded");
    setPipeline(null, ["record"]);
  };

  stopWave();
  drawLiveWave();
  state.mediaRecorder.start();
  startTimer();
  els.recordBtn.disabled = true;
  els.stopBtn.disabled = false;
  els.processBtn.disabled = true;
  setRecordState("Recording");
  setPipeline("record");
}

function stopRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
  }
  els.recordBtn.disabled = false;
  els.stopBtn.disabled = true;
}

function useImportedFile(file) {
  state.audioBlob = file;
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = URL.createObjectURL(file);
  els.playback.src = state.audioUrl;
  els.playback.hidden = false;
  els.processBtn.disabled = false;
  els.timer.textContent = "00:00";
  setRecordState(file.name);
  setPipeline(null, ["record"]);
}

function extensionForBlob(blob) {
  if (blob.name) return blob.name;
  if (blob.type.includes("mp4")) return "recording.mp4";
  if (blob.type.includes("wav")) return "recording.wav";
  return "recording.webm";
}

async function processAudio() {
  if (!state.audioBlob) return;
  els.body.classList.add("is-busy");
  els.processBtn.disabled = true;
  els.recordBtn.disabled = true;
  setRecordState("Processing");
  setPipeline("upload", ["record"]);

  const formData = new FormData();
  formData.append("file", state.audioBlob, extensionForBlob(state.audioBlob));

  const params = new URLSearchParams({
    language: els.languageSelect.value,
    include_diarization: els.diarizationToggle.checked ? "true" : "false",
    include_summary: els.summaryToggle.checked ? "true" : "false",
  });
  if (els.translateSelect.value) params.set("translate_to", els.translateSelect.value);
  params.set("include_llm", "true");

  try {
    setPipeline("stt", ["record", "upload"]);
    const response = await fetch(`/api/process?${params.toString()}`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Request failed: ${response.status}`);
    }
    setPipeline("summary", ["record", "upload", "stt", "diarize"]);
    const result = await response.json();
    state.latestResult = result;
    renderResult(result);
    els.copyBtn.disabled = false;
    setRecordState("Complete");
    setPipeline(null, ["record", "upload", "stt", "diarize", "summary"]);
  } catch (error) {
    setRecordState(error.message);
    setPipeline(null, []);
  } finally {
    els.body.classList.remove("is-busy");
    els.processBtn.disabled = false;
    els.recordBtn.disabled = false;
  }
}

function renderResult(result) {
  renderWarnings(result.warnings || []);
  els.summaryOutput.textContent =
    result.meeting_minutes ||
    result.llm_summary ||
    result.translated_summary ||
    result.summary ||
    "No summary returned.";
  els.translationOutput.innerHTML = renderTranslationAndActions(result);
  renderTranscript(result.transcript?.segments || []);
  renderSpeakers(result.diarization?.segments || []);
}

function renderTranslationAndActions(result) {
  const parts = [];
  const translation = result.translated_transcript || result.translated_text;
  if (translation) {
    parts.push(`<div>${escapeHtml(translation)}</div>`);
  }
  if (result.action_items?.length) {
    const rows = result.action_items
      .map((item) => {
        const meta = [item.assignee, item.deadline].filter(Boolean).join(" · ");
        return `<div class="speaker-row"><span>${escapeHtml(item.task)}</span><span class="segment-time">${escapeHtml(meta || "no owner/date")}</span></div>`;
      })
      .join("");
    parts.push(`<div class="action-list">${rows}</div>`);
  }
  if (result.decisions?.length) {
    parts.push(`<div>${result.decisions.map((item) => `Decision: ${escapeHtml(item)}`).join("<br>")}</div>`);
  }
  return parts.join("") || "No translation or action items yet.";
}

function renderWarnings(warnings) {
  if (!warnings.length) {
    els.warningOutput.hidden = true;
    els.warningOutput.textContent = "";
    return;
  }
  els.warningOutput.hidden = false;
  els.warningOutput.textContent = warnings.join(" · ");
}

function renderTranscript(segments) {
  if (!segments.length) {
    els.transcriptOutput.textContent = "No transcript returned.";
    return;
  }
  els.transcriptOutput.innerHTML = segments
    .map(
      (segment) => `
      <div class="segment">
        <div>
          <div class="segment-time">${segment.start.toFixed(1)}-${segment.end.toFixed(1)}s</div>
          <div class="speaker-chip">${segment.speaker || "SPEAKER"}</div>
        </div>
        <div>${escapeHtml(segment.text)}</div>
      </div>
    `,
    )
    .join("");
}

function renderSpeakers(segments) {
  if (!segments.length) {
    els.speakerOutput.textContent = "No speaker segments returned.";
    return;
  }
  els.speakerOutput.innerHTML = segments
    .map(
      (segment) => `
      <div class="speaker-row">
        <span class="speaker-chip">${escapeHtml(segment.speaker)}</span>
        <span class="segment-time">${segment.start.toFixed(1)}-${segment.end.toFixed(1)}s</span>
      </div>
    `,
    )
    .join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

async function copyResult() {
  if (!state.latestResult) return;
  const transcript = state.latestResult.transcript?.segments
    ?.map((segment) => `${segment.speaker || "SPEAKER"} [${segment.start}-${segment.end}s]: ${segment.text}`)
    .join("\n");
  const text = [
    "SUMMARY",
    state.latestResult.meeting_minutes ||
      state.latestResult.llm_summary ||
      state.latestResult.translated_summary ||
      state.latestResult.summary ||
      "",
    "",
    "TRANSLATION",
    state.latestResult.translated_transcript || state.latestResult.translated_text || "",
    "",
    "TRANSCRIPT",
    transcript || "",
  ].join("\n");
  await navigator.clipboard.writeText(text);
  setRecordState("Copied");
}

els.recordBtn.addEventListener("click", () => {
  startRecording().catch((error) => setRecordState(error.message));
});
els.stopBtn.addEventListener("click", stopRecording);
els.processBtn.addEventListener("click", processAudio);
els.fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) useImportedFile(file);
});
els.copyBtn.addEventListener("click", copyResult);

drawIdleWave();
checkHealth();
