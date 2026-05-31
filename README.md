# AI Meeting Minutes Backend

Local FastAPI backend for meeting-minutes processing with diarization, segment-level STT, translation, and summary.

## Run

From Git Bash:

```bash
cd /d/Code/code_QLDA
source .venv/Scripts/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Open:

```text
http://127.0.0.1:8000
http://127.0.0.1:8000/docs
```

The root page is the meeting recorder UI. It records microphone audio in the browser, sends the audio to FastAPI, and renders transcript, speaker segments, translation, and summary.

## Current Processing Flow

The upload flow now uses a single backend pipeline:

```text
Audio upload
  -> normalize to 16 kHz mono WAV
  -> diarization (Pyannote)
  -> speaker segment extraction
  -> STT for each segment (PhoWhisper)
  -> merge transcript with speaker labels
  -> optional translation / summary / LLM refinement
  -> return one response to the frontend
```

### How speaker separation works

1. The backend first runs diarization on the normalized audio.
2. Pyannote returns a list of time ranges such as `SPEAKER_00 [0.72s - 2.52s]`.
3. Each diarization range is treated as a speaker segment.
4. For every segment, the backend trims the corresponding audio slice into a temporary WAV file.
5. PhoWhisper transcribes each slice independently.
6. The transcript segments are then re-attached to the diarized speaker label.

If diarization is unavailable or fails, the backend can still fall back to a simpler VAD-based speaker detection path, but the preferred route is Pyannote.

### Audio enhancement before processing

Before diarization or STT starts, the backend now applies a light audio enhancement step during normalization:

- convert to mono
- resample to 16 kHz
- apply light high-pass and low-pass filtering
- reduce background noise
- normalize loudness dynamically

This helps recordings with mild noise, uneven volume, or low speech energy, especially for meeting audio captured from laptops or conference mics.

### Choosing the expected number of participants

The upload UI now lets the user choose the expected participant count before processing the file.

- `Auto detect` keeps the old behavior and lets the backend estimate the count.
- Selecting `2`, `3`, `4`, etc. tells the diarization pipeline to use that number as the expected speaker count.

When a meeting is usually known in advance to have 2-4 people, setting the count explicitly often improves clustering and reduces speaker-label drift.

### How transcript merging works

After per-segment STT finishes, the backend:

1. Offsets each segment timestamp back into the full audio timeline.
2. Assigns the speaker label from diarization to each transcript segment.
3. Merges adjacent segments when they belong to the same speaker and are close in time.
4. Builds a merged transcript in the form:

```text
SPEAKER_00 [00.00s-12.14s]: ...
SPEAKER_01 [12.15s-24.04s]: ...
```

5. Returns both the structured segments and the merged text to the frontend.

### Frontend behavior

The upload page now calls a single API:

- `POST /api/process`

That response contains:

- `transcript`: structured STT output with speaker labels
- `diarization`: raw diarization segments
- `merged_transcript`: ready-to-display speaker timeline text
- `detected_speakers`, `assigned_speakers`, `num_speakers`: speaker counts for the UI
- optional translation, summary, and LLM outputs

This keeps the frontend simple: it no longer runs STT and diarization as separate steps, and it no longer recomputes speaker assignment in the browser.

## Endpoints

- `GET /health` checks API and local model folders.
- `GET /models/status` lists local model availability.
- `POST /api/transcribe` uploads audio and returns STT segments.
- `POST /api/diarize` uploads audio and returns speaker segments.
- `POST /api/process` runs the full meeting pipeline: normalize, diarize, segment STT, merge, then optionally translate, summarize, and refine with LLM.
  - accepts `expected_speakers` to guide diarization when the number of participants is known.
- `POST /api/translate` translates text with local Helsinki-NLP models.
- `POST /api/summarize` summarizes text with local BART.

## UI Flow

- Open `http://127.0.0.1:8000`.
- Press `Record` and allow microphone access.
- Press `Stop`.
- Press `Process`.
- Review transcript, speakers, translation, and summary.

## Notes

- The pipeline can use GPU when available, but it will fall back to CPU when VRAM is low or the model is configured that way.
- The upload pipeline applies light audio enhancement during normalization to improve speech clarity before diarization and STT.
- STT uses `models/stt/PhoWhisper-medium-ct2-int8`.
- Diarization uses a local Pyannote bundle and preloads audio waveform to avoid direct `torchcodec` decoding on Windows.
- FFmpeg must be available on PATH, or set `FFMPEG_BINARY` to the full `ffmpeg.exe` path.
- The backend frees GPU memory between diarization and STT so the two models can share limited VRAM.
- LLM refinement uses local Ollama. Defaults:
  - `OLLAMA_BASE_URL=http://127.0.0.1:11434`
  - `OLLAMA_MODEL=qwen2.5:3b`
  - `OLLAMA_TIMEOUT_SECONDS=120`

## LLM Test

```bash
python scripts/test_ollama_llm.py
```

Debug endpoints:

```text
GET  /health/llm
POST /debug/llm-test
```
