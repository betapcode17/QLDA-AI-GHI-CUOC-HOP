# AI Meeting Minutes Backend

Local FastAPI backend for CPU-based meeting-minutes processing.

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

## Endpoints

- `GET /health` checks API and local model folders.
- `GET /models/status` lists local model availability.
- `POST /api/transcribe` uploads audio and returns STT segments.
- `POST /api/diarize` uploads audio and returns speaker segments.
- `POST /api/process` runs the meeting pipeline.
- `POST /api/translate` translates text with local Helsinki-NLP models.
- `POST /api/summarize` summarizes text with local BART.

## UI Flow

- Open `http://127.0.0.1:8000`.
- Press `Record` and allow microphone access.
- Press `Stop`.
- Press `Process`.
- Review transcript, speakers, translation, and summary.

## Notes

- Inference is configured for CPU.
- STT uses `models/stt/PhoWhisper-medium-ct2-int8`.
- Diarization uses local pyannote and preloads audio waveform to avoid direct `torchcodec` decoding on Windows.
- FFmpeg must be available on PATH, or set `FFMPEG_BINARY` to the full `ffmpeg.exe` path.
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
