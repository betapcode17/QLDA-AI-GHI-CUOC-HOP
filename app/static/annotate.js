const state = {
  files: [],
  current: null,
  selectedSpeaker: "SPEAKER_00",
  isDragging: false,
  dragStart: null,
  dragEnd: null,
};

const els = {
  fileList: document.querySelector("#fileList"),
  currentTitle: document.querySelector("#currentTitle"),
  statusPill: document.querySelector("#statusPill"),
  audioPlayer: document.querySelector("#audioPlayer"),
  speakerButtons: document.querySelector("#speakerButtons"),
  addSpeakerBtn: document.querySelector("#addSpeakerBtn"),
  saveBtn: document.querySelector("#saveBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  exportAllBtn: document.querySelector("#exportAllBtn"),
  reloadBtn: document.querySelector("#reloadBtn"),
  timelineCanvas: document.querySelector("#timelineCanvas"),
  selectionText: document.querySelector("#selectionText"),
  durationText: document.querySelector("#durationText"),
  cursorText: document.querySelector("#cursorText"),
  segmentList: document.querySelector("#segmentList"),
  jsonPreview: document.querySelector("#jsonPreview"),
};

const ctx = els.timelineCanvas.getContext("2d");

function setStatus(text) {
  els.statusPill.textContent = text;
}

function formatTime(seconds) {
  const total = Math.max(0, seconds || 0);
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");
  const tenths = Math.floor((total % 1) * 10);
  return `${minutes}:${secs}.${tenths}`;
}

function getDuration() {
  return state.current?.duration || els.audioPlayer.duration || 0;
}

function timeFromEvent(event) {
  const rect = els.timelineCanvas.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  return (x / rect.width) * getDuration();
}

function normalizeSegments(segments) {
  return segments
    .map((segment) => ({
      start: Number(segment.start),
      end: Number(segment.end),
      speaker: String(segment.speaker || state.selectedSpeaker),
    }))
    .filter(
      (segment) =>
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.end > segment.start,
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function speakerPalette(index) {
  const colors = ["#0b6b5b", "#d65b3a", "#6c4bb8", "#2f6f91", "#8a5a17"];
  return colors[index % colors.length];
}

function renderSpeakerButtons() {
  const speakers = state.current?.speakers?.length
    ? state.current.speakers
    : ["SPEAKER_00", "SPEAKER_01"];
  els.speakerButtons.innerHTML = speakers
    .map(
      (speaker) => `
        <button class="speaker-chip ${speaker === state.selectedSpeaker ? "active" : ""}" data-speaker="${speaker}" type="button">
          ${speaker}
        </button>
      `,
    )
    .join("");
  els.speakerButtons.querySelectorAll(".speaker-chip").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSpeaker = button.dataset.speaker;
      renderSpeakerButtons();
      setStatus(`Selected ${state.selectedSpeaker}`);
    });
  });
}

function renderFileList() {
  els.fileList.innerHTML = state.files
    .map(
      (file) => `
        <button class="file-item ${state.current?.uri === file.uri ? "active" : ""}" data-uri="${file.uri}" type="button">
          <div class="title">${file.uri}</div>
          <div class="meta">${file.duration.toFixed(3)}s · ${file.annotated ? `${file.segments} segments` : "not annotated"}</div>
        </button>
      `,
    )
    .join("");
  els.fileList.querySelectorAll(".file-item").forEach((button) => {
    button.addEventListener("click", () => loadAnnotation(button.dataset.uri));
  });
}

function resizeCanvas() {
  const rect = els.timelineCanvas.parentElement.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  els.timelineCanvas.width = Math.max(900, Math.floor(rect.width * ratio));
  els.timelineCanvas.height = Math.max(260, Math.floor(360 * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawTimeline() {
  resizeCanvas();
  const width = els.timelineCanvas.getBoundingClientRect().width;
  const height = els.timelineCanvas.getBoundingClientRect().height;
  const duration = getDuration() || 1;
  const segments = normalizeSegments(state.current?.segments || []);
  const currentTime = els.audioPlayer.currentTime || 0;
  const paddingX = 20;
  const paddingY = 24;
  const laneTop = 74;
  const laneHeight = Math.max(90, height - 120);

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "rgba(24, 33, 28, 0.05)";
  ctx.fillRect(paddingX, laneTop, width - paddingX * 2, laneHeight);

  ctx.strokeStyle = "rgba(24, 33, 28, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i += 1) {
    const x = paddingX + ((width - paddingX * 2) / 10) * i;
    ctx.beginPath();
    ctx.moveTo(x, laneTop - 18);
    ctx.lineTo(x, laneTop + laneHeight + 14);
    ctx.stroke();
    ctx.fillStyle = "#66736d";
    ctx.font = "700 12px Consolas, monospace";
    ctx.fillText(formatTime((duration / 10) * i), x - 18, laneTop - 24);
  }

  segments.forEach((segment, index) => {
    const left = paddingX + (segment.start / duration) * (width - paddingX * 2);
    const right = paddingX + (segment.end / duration) * (width - paddingX * 2);
    const color = speakerPalette(index + segment.speaker.length);
    ctx.fillStyle = `${color}26`;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    roundRect(
      ctx,
      left,
      laneTop + 16 + (index % 2) * 18,
      right - left,
      42,
      12,
      true,
      true,
    );
    ctx.fillStyle = color;
    ctx.font = "800 13px Inter, sans-serif";
    const label = `${segment.speaker} · ${segment.start.toFixed(2)}-${segment.end.toFixed(2)}`;
    ctx.fillText(label, left + 12, laneTop + 42 + (index % 2) * 18);
  });

  if (state.isDragging && state.dragStart !== null && state.dragEnd !== null) {
    const left =
      paddingX +
      (Math.min(state.dragStart, state.dragEnd) / duration) *
        (width - paddingX * 2);
    const right =
      paddingX +
      (Math.max(state.dragStart, state.dragEnd) / duration) *
        (width - paddingX * 2);
    ctx.fillStyle = "rgba(11, 107, 91, 0.22)";
    ctx.strokeStyle = "rgba(11, 107, 91, 0.9)";
    roundRect(
      ctx,
      left,
      laneTop + laneHeight - 50,
      right - left,
      40,
      10,
      true,
      true,
    );
  }

  const playX = paddingX + (currentTime / duration) * (width - paddingX * 2);
  ctx.strokeStyle = "#d65b3a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(playX, 46);
  ctx.lineTo(playX, laneTop + laneHeight + 20);
  ctx.stroke();

  ctx.fillStyle = "#d65b3a";
  ctx.beginPath();
  ctx.arc(playX, 46, 6, 0, Math.PI * 2);
  ctx.fill();

  els.durationText.textContent = formatTime(duration);
  els.cursorText.textContent = formatTime(currentTime);
  if (state.isDragging && state.dragStart !== null && state.dragEnd !== null) {
    const start = Math.min(state.dragStart, state.dragEnd);
    const end = Math.max(state.dragStart, state.dragEnd);
    els.selectionText.textContent = `${state.selectedSpeaker}: ${formatTime(start)} → ${formatTime(end)}`;
  } else {
    els.selectionText.textContent = "Drag on the timeline to create a segment.";
  }
}

function roundRect(context, x, y, width, height, radius, fill, stroke) {
  const min = Math.min(width, height) / 2;
  const r = Math.min(radius, min);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
  if (fill) context.fill();
  if (stroke) context.stroke();
}

function renderSegments() {
  const segments = normalizeSegments(state.current?.segments || []);
  state.current.segments = segments;
  els.segmentList.innerHTML = segments.length
    ? segments
        .map(
          (segment, index) => `
            <div class="segment-row" data-index="${index}">
              <input type="number" step="0.01" min="0" class="segment-start" value="${segment.start.toFixed(2)}" />
              <input type="number" step="0.01" min="0" class="segment-end" value="${segment.end.toFixed(2)}" />
              <select class="segment-speaker">
                ${(state.current.speakers || [state.selectedSpeaker])
                  .map(
                    (speaker) =>
                      `<option value="${speaker}" ${speaker === segment.speaker ? "selected" : ""}>${speaker}</option>`,
                  )
                  .join("")}
              </select>
              <button class="delete-btn" type="button">Delete</button>
            </div>
          `,
        )
        .join("")
    : `<div class="note-box subtle">No segments yet. Drag across the timeline to create one.</div>`;

  els.segmentList.querySelectorAll(".segment-row").forEach((row) => {
    const index = Number(row.dataset.index);
    const startInput = row.querySelector(".segment-start");
    const endInput = row.querySelector(".segment-end");
    const speakerSelect = row.querySelector(".segment-speaker");
    const deleteBtn = row.querySelector(".delete-btn");

    startInput.addEventListener("change", () => {
      state.current.segments[index].start = Number(startInput.value);
      renderSegments();
      drawTimeline();
    });
    endInput.addEventListener("change", () => {
      state.current.segments[index].end = Number(endInput.value);
      renderSegments();
      drawTimeline();
    });
    speakerSelect.addEventListener("change", () => {
      state.current.segments[index].speaker = speakerSelect.value;
      renderSegments();
      drawTimeline();
    });
    deleteBtn.addEventListener("click", () => {
      state.current.segments.splice(index, 1);
      renderSegments();
      drawTimeline();
    });
  });
  updatePreview();
}

function updatePreview() {
  if (!state.current) {
    els.jsonPreview.textContent = "No annotation loaded.";
    return;
  }
  els.jsonPreview.textContent = JSON.stringify(state.current, null, 2);
}

async function loadFiles() {
  const response = await fetch("/api/annotations/audio-files");
  if (!response.ok) throw new Error("Unable to load audio list");
  state.files = await response.json();
  renderFileList();
  if (!state.current && state.files.length) {
    await loadAnnotation(state.files[0].uri);
  }
}

async function loadAnnotation(uri) {
  setStatus("Loading...");
  const response = await fetch(`/api/annotations/${encodeURIComponent(uri)}`);
  if (!response.ok) throw new Error(`Unable to load ${uri}`);
  state.current = await response.json();
  state.selectedSpeaker = state.current.speakers?.[0] || "SPEAKER_00";
  els.currentTitle.textContent = state.current.uri;
  els.audioPlayer.src = `/api/annotations/audio/${encodeURIComponent(uri)}`;
  els.audioPlayer.load();
  renderSpeakerButtons();
  renderFileList();
  renderSegments();
  setStatus(`Loaded ${uri}`);
  drawTimeline();
}

async function saveAnnotation() {
  if (!state.current) return;
  state.current.segments = normalizeSegments(state.current.segments);
  const response = await fetch(
    `/api/annotations/${encodeURIComponent(state.current.uri)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.current),
    },
  );
  if (!response.ok) throw new Error("Failed to save annotation");
  state.current = await response.json();
  await loadFiles();
  renderSegments();
  setStatus("Saved JSON");
}

async function exportCurrent() {
  if (!state.current) return;
  await saveAnnotation();
  const response = await fetch(
    `/api/annotations/${encodeURIComponent(state.current.uri)}/export`,
    {
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("Failed to export RTTM");
  const data = await response.json();
  setStatus(`Exported ${data.rttm}`);
}

async function exportAll() {
  await saveAnnotation().catch(() => {});
  const response = await fetch("/api/annotations/export-all", {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to export all RTTM files");
  const data = await response.json();
  setStatus(`Exported ${data.count} RTTM files`);
}

function addSpeaker() {
  if (!state.current) return;
  const speakers = new Set(state.current.speakers || []);
  let index = speakers.size;
  let next = `SPEAKER_${String(index).padStart(2, "0")}`;
  while (speakers.has(next)) {
    index += 1;
    next = `SPEAKER_${String(index).padStart(2, "0")}`;
  }
  speakers.add(next);
  state.current.speakers = [...speakers];
  state.selectedSpeaker = next;
  renderSpeakerButtons();
  renderSegments();
  setStatus(`Added ${next}`);
}

function attachEvents() {
  els.reloadBtn.addEventListener("click", loadFiles);
  els.saveBtn.addEventListener("click", () =>
    saveAnnotation().catch((error) => setStatus(error.message)),
  );
  els.exportBtn.addEventListener("click", () =>
    exportCurrent().catch((error) => setStatus(error.message)),
  );
  els.exportAllBtn.addEventListener("click", () =>
    exportAll().catch((error) => setStatus(error.message)),
  );
  els.addSpeakerBtn.addEventListener("click", addSpeaker);

  els.audioPlayer.addEventListener("timeupdate", () => drawTimeline());
  els.audioPlayer.addEventListener("loadedmetadata", () => {
    if (state.current) {
      state.current.duration = Number.isFinite(els.audioPlayer.duration)
        ? els.audioPlayer.duration
        : state.current.duration;
      renderSegments();
      drawTimeline();
    }
  });

  els.timelineCanvas.addEventListener("pointerdown", (event) => {
    if (!state.current) return;
    els.timelineCanvas.setPointerCapture(event.pointerId);
    state.isDragging = true;
    state.dragStart = timeFromEvent(event);
    state.dragEnd = state.dragStart;
    drawTimeline();
  });

  els.timelineCanvas.addEventListener("pointermove", (event) => {
    if (!state.isDragging) return;
    state.dragEnd = timeFromEvent(event);
    drawTimeline();
  });

  els.timelineCanvas.addEventListener("pointerup", async (event) => {
    if (!state.isDragging) return;
    state.dragEnd = timeFromEvent(event);
    const start = Math.min(state.dragStart, state.dragEnd);
    const end = Math.max(state.dragStart, state.dragEnd);
    state.isDragging = false;
    if (end - start >= 0.1) {
      state.current.segments.push({
        start,
        end,
        speaker: state.selectedSpeaker,
      });
      state.current.segments = normalizeSegments(state.current.segments);
      renderSegments();
      setStatus(`Added ${state.selectedSpeaker}`);
    }
    drawTimeline();
  });
}

window.addEventListener("resize", () => drawTimeline());

attachEvents();
loadFiles().catch((error) => {
  setStatus(error.message);
  els.fileList.innerHTML = `<div class="note-box subtle">${error.message}</div>`;
});
