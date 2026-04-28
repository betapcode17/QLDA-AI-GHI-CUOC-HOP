# 🔌 API Reference - QLDA-AI-GHI-CUOC-HOP

## 📌 Overview

Khi chạy `python run.py`, server gọi tới 2 nhóm API:

1. **Pre-flight Check APIs** (từ run.py trước khi khởi động server)
2. **FastAPI Endpoints** (sau khi server khởi động)
3. **Internal Service Calls** (gọi từ services đến Ollama)

---

## 🧪 Part 1: Pre-flight Check APIs (run.py)

### 1.1 Check Ollama Status

```
GET http://localhost:11434/api/tags
```

**Purpose**: Kiểm tra Ollama có chạy không và models đã pull chưa

**Request**:

```bash
curl http://localhost:11434/api/tags
```

**Response** (Success):

```json
{
  "models": [
    {
      "name": "qwen2.5:3b:latest",
      "modified_at": "2024-04-28T10:30:00Z",
      "size": 2147483648
    }
  ]
}
```

**Response** (Failed - Ollama not running):

```
Connection refused / URLError
```

**Called by**: `run.py` → `check_ollama()`

**Exit behavior**:

- ✅ Model found → Continue to server startup
- ⚠️ Ollama running but model missing → Warn user, continue anyway
- ❌ Ollama not running → Error message, ask user to start Ollama

---

## 🚀 Part 2: FastAPI Server Endpoints

Server khởi động trên `http://localhost:8000` với các endpoints sau:

### 2.1 Health Check Endpoints

#### 2.1.1 General Health

```
GET http://localhost:8000/health
```

**Purpose**: Kiểm tra server + models status

**Response**:

```json
{
  "status": "ok",
  "device": "cpu",
  "models": [
    {
      "name": "stt_phowhisper_ct2_int8",
      "path": "E:/...models/stt/PhoWhisper-medium-ct2-int8",
      "available": true,
      "detail": null
    },
    {
      "name": "translation_vi_en",
      "path": "E:/...models/translation/opus-mt-vi-en",
      "available": true,
      "detail": null
    },
    ...
  ]
}
```

---

#### 2.1.2 LLM Health (Ollama Check)

```
GET http://localhost:8000/health/llm
```

**Purpose**: Test LLM connectivity & Ollama

**Internal calls**:

- Calls `llm_service.smoke_test()`
- Which calls: `POST http://localhost:11434/api/generate` (Ollama)

**Response**:

```json
{
  "ok": true,
  "model": "qwen2.5:3b",
  "base_url": "http://127.0.0.1:11434",
  "result": {
    "summary": "...",
    "tasks": [],
    "decisions": [],
    ...
  },
  "error": null
}
```

---

#### 2.1.3 Models Status

```
GET http://localhost:8000/models/status
```

**Purpose**: Danh sách tất cả models + status

**Response**:

```json
{
  "models": [
    {"name": "stt_phowhisper_ct2_int8", "available": true, ...},
    {"name": "diarization_pyannote", "available": true, ...},
    {"name": "translation_vi_en", "available": true, ...},
    {"name": "translation_en_vi", "available": true, ...},
    {"name": "summarization_bart", "available": true, ...}
  ]
}
```

---

### 2.2 Core Processing Endpoints

#### 2.2.1 Transcription (STT)

```
POST http://localhost:8000/api/transcribe
```

**Parameters**:

- `file` (required): Audio file (.wav, .mp3, etc.)
- `language` (optional): Language hint (default: "vi")

**Internal calls**:

1. Save uploaded file
2. Normalize audio (`audio_service.normalize_audio()`)
3. Call STT: `stt_service.transcribe()` → Uses **PhoWhisper model** locally

**Response**:

```json
{
  "language": "vi",
  "language_probability": 0.95,
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 2.5,
      "text": "Hôm nay chúng ta họp..."
    }
  ],
  "text": "Hôm nay chúng ta họp..."
}
```

**Example**:

```bash
curl -X POST http://localhost:8000/api/transcribe \
  -F "file=@meeting.wav" \
  -F "language=vi"
```

---

#### 2.2.2 Speaker Diarization

```
POST http://localhost:8000/api/diarize
```

**Parameters**:

- `file` (required): Audio file

**Internal calls**:

1. Save uploaded file
2. Normalize audio
3. Call: `diarization_service.diarize()` → Uses **Pyannote model**

**Response**:

```json
{
  "segments": [
    {
      "start": 0.0,
      "end": 5.2,
      "speaker": "SPEAKER_00"
    },
    {
      "start": 5.3,
      "end": 10.1,
      "speaker": "SPEAKER_01"
    }
  ]
}
```

---

#### 2.2.3 Full Processing Pipeline

```
POST http://localhost:8000/api/process
```

**Parameters**:

- `file` (required): Audio file
- `language` (optional): Language (default: "vi")
- `include_diarization` (optional): boolean (default: true)
- `translate_to` (optional): "vi-en" or "en-vi"
- `include_summary` (optional): boolean (default: true)
- `include_llm` (optional): boolean (default: true)

**Internal calls** (in sequence):

```
1. Save & normalize audio
2. STT: PhoWhisper → Vietnamese text
3. Diarization: Pyannote → Speaker labels
4. (Optional) Translation: Opus-MT → English text
5. (Optional) Summarization: BART → Summary
6. (Optional) LLM: Qwen via Ollama → Decisions, tasks, risks
```

**Response**:

```json
{
  "transcript": {
    "language": "vi",
    "segments": [...],
    "text": "..."
  },
  "diarization": {
    "segments": [...]
  },
  "merged_transcript": "SPEAKER_00 [0.0s-5.0s]: ...\nSPEAKER_01 [5.1s-10.0s]: ...",
  "translated_transcript": "...",
  "summary": "Key points from meeting...",
  "llm_summary": "...",
  "action_items": [...],
  "decisions": [...],
  "risks_or_blockers": [...],
  "warnings": []
}
```

**Example**:

```bash
curl -X POST http://localhost:8000/api/process \
  -F "file=@meeting.wav" \
  -F "language=vi" \
  -F "translate_to=vi-en" \
  -F "include_llm=true"
```

---

### 2.3 Debug Endpoints

#### 2.3.1 Debug LLM Test

```
POST http://localhost:8000/debug/llm-test
```

**Purpose**: Test LLM với custom transcript

**Request body**:

```json
{
  "transcript": "SPEAKER_00 [0.0s-10.0s]: Custom meeting notes..."
}
```

**Internal calls**:

- Calls: `llm_service.smoke_test(transcript)`
- Which calls: `POST http://localhost:11434/api/generate` (Ollama)

**Response**: (Same as `/health/llm`)

---

### 2.4 Frontend Endpoints

#### 2.4.1 Web UI

```
GET http://localhost:8000/
```

Serves `app/static/index.html`

#### 2.4.2 Static Files

```
GET http://localhost:8000/static/{filename}
```

Serves CSS, JS, etc. from `app/static/`

---

## 🔗 Part 3: Internal Service-to-External API Calls

### 3.1 LLM Service → Ollama

```
POST http://localhost:11434/api/generate
```

**Called by**: `llm_service.OllamaLLMService._generate()`

**Request**:

```json
{
  "model": "qwen2.5:3b",
  "prompt": "You are an assistant...\n\n{meeting_transcript}",
  "stream": false,
  "format": "json",
  "options": {
    "temperature": 0.1,
    "num_ctx": 4096
  }
}
```

**Response**:

```json
{
  "response": "{\"summary\": \"...\", \"tasks\": [], ...}"
}
```

**Retry logic**: 2 attempts with exponential backoff

---

### 3.2 Translation Service → Local Models

```
(Internal - no HTTP call)
```

Uses local **Opus-MT** models loaded in memory:

- `models/translation/opus-mt-vi-en` → Vietnamese to English
- `models/translation/opus-mt-en-vi` → English to Vietnamese

---

## 📊 Complete Request Flow Diagram

```
Client Request
    ↓
FastAPI (localhost:8000)
    ├─── POST /api/process
    │    ├─→ Save audio file
    │    ├─→ Normalize audio
    │    ├─→ STT Service (PhoWhisper - LOCAL)
    │    ├─→ Diarization Service (Pyannote - LOCAL/CACHE)
    │    ├─→ Translation Service (Opus-MT - LOCAL)
    │    ├─→ Summarization Service (BART - CACHE)
    │    └─→ LLM Service (Qwen via Ollama)
    │         └─→ POST http://localhost:11434/api/generate
    │              └─→ Ollama returns result
    └─── Return JSON response
         ↓
    Client receives result
```

---

## 🔍 API Call Summary Table

| API                                   | Method | Called By   | Purpose                   | External?            |
| ------------------------------------- | ------ | ----------- | ------------------------- | -------------------- |
| `/health`                             | GET    | Client      | Server health check       | No                   |
| `/health/llm`                         | GET    | Client      | LLM connectivity test     | Yes (Ollama)         |
| `/models/status`                      | GET    | Client      | Models available?         | No                   |
| `/api/transcribe`                     | POST   | Client      | Speech → Text             | No (Local)           |
| `/api/diarize`                        | POST   | Client      | Speaker identification    | No (Local/Cache)     |
| `/api/process`                        | POST   | Client      | Full pipeline             | Yes (Ollama for LLM) |
| `/debug/llm-test`                     | POST   | Client      | Test LLM with custom text | Yes (Ollama)         |
| `http://localhost:11434/api/tags`     | GET    | run.py      | Check Ollama models       | External             |
| `http://localhost:11434/api/generate` | POST   | llm_service | Generate LLM response     | External             |

---

## ⚙️ Configuration

### Environment Variables Used

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434        # Ollama endpoint
OLLAMA_MODEL=qwen2.5:3b                       # Model to use
OLLAMA_TIMEOUT_SECONDS=120                    # Request timeout
STT_COMPUTE_TYPE=int8                         # STT optimization
STT_CPU_THREADS=4                             # CPU threads
DEFAULT_LANGUAGE=vi                           # Default language
```

---

## 🧪 Testing All APIs

### 1. Check Server Health

```bash
curl http://localhost:8000/health
```

### 2. Check LLM

```bash
curl http://localhost:8000/health/llm
```

### 3. Test STT

```bash
curl -X POST http://localhost:8000/api/transcribe \
  -F "file=@test_audio.wav"
```

### 4. Test Full Pipeline

```bash
curl -X POST http://localhost:8000/api/process \
  -F "file=@meeting.wav" \
  -F "language=vi" \
  -F "include_llm=true"
```

### 5. View API Docs

```
Browser: http://localhost:8000/docs (Swagger UI)
Browser: http://localhost:8000/redoc (ReDoc)
```

---

## 📝 Notes

- **Local services** (STT, Translation, etc.) run on CPU in-process
- **Ollama** is external but local (localhost:11434)
- **All requests** are async (non-blocking)
- **CORS enabled** for all origins
- **Error handling** includes retry logic for Ollama failures

---

**Last Updated**: 2026-04-28
