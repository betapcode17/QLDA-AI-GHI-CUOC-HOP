# 🚀 QLDA-AI-GHI-CUOC-HOP - Setup & Installation Guide

AI Meeting Minutes API - Hệ thống tự động ghi biên bản cuộc họp bằng AI

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Model Installation](#model-installation)
4. [Ollama Setup](#ollama-setup)
5. [Project Configuration](#project-configuration)
6. [Running the Server](#running-the-server)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **OS**: Windows 10+, macOS 10.14+, or Linux
- **RAM**: ≥ 8GB (16GB recommended)
- **Disk Space**: ≥ 30GB for models
- **Python**: 3.9+ (tested on 3.10, 3.11)

### Software Requirements

```bash
# Check Python version
python --version  # Should be 3.9 or higher

# Check Git
git --version

# For Linux/Mac: FFmpeg
sudo apt install ffmpeg  # Ubuntu/Debian
brew install ffmpeg     # macOS
```

---

## Environment Setup

### Step 1: Clone & Navigate

```bash
cd E:/HOCKI6/QLDA_CNTT/code/QLDA-AI-GHI-CUOC-HOP
```

### Step 2: Create Virtual Environment

```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# Linux/Mac
python3 -m venv .venv
source .venv/bin/activate
```

### Step 3: Install Python Dependencies

```bash
# Upgrade pip first
python -m pip install --upgrade pip

# Install all requirements
pip install -r requirements.txt

# Install additional dependencies for model conversion (if needed)
pip install ctranslate2
```

### Step 4: Configure Environment Variables (Optional)

```bash
# Copy .env.example to .env
cp .env.example .env

# Edit .env to customize paths/settings if needed
# (Use default values if unsure)
```

---

## Model Installation

### Overview

Your project uses 5 models:
| Model | Size | Path | Type |
|-------|------|------|------|
| **PhoWhisper** | ~400MB | `models/stt/` | STT (Speech-to-Text) |
| **Opus-MT** | ~800MB | `models/translation/` | Translation (Vi↔En) |
| **Pyannote** | ~200MB | Cache (auto-dl) | Diarization |
| **BART** | ~600MB | Cache (auto-dl) | Summarization |
| **Qwen2.5** | ~2GB | Ollama | LLM |

### Option A: Automatic Download (Recommended)

#### 1️⃣ Create Model Directories

```bash
# Windows
mkdir models\stt
mkdir models\translation
mkdir models\diarization
mkdir models\summarization

# Linux/Mac
mkdir -p models/{stt,translation,diarization,summarization}
```

#### 2️⃣ Download PhoWhisper STT Model

```bash
# Download source model (first time, ~400MB)
hf download vinai/PhoWhisper-medium --local-dir models/stt/PhoWhisper-medium

# Convert to CTranslate2 format (CPU-optimized int8)
ct2-transformers-converter \
  --model models/stt/PhoWhisper-medium \
  --output_dir models/stt/PhoWhisper-medium-ct2-int8 \
  --quantization int8 \
  --low_cpu_mem_usage \
  --copy_files tokenizer.json preprocessor_config.json vocab.json merges.txt \
                normalizer.json added_tokens.json special_tokens_map.json tokenizer_config.json
```

#### 3️⃣ Download Translation Models

```bash
# Vietnamese → English
hf download Helsinki-NLP/opus-mt-vi-en --local-dir models/translation/opus-mt-vi-en

# English → Vietnamese
hf download Helsinki-NLP/opus-mt-en-vi --local-dir models/translation/opus-mt-en-vi
```

#### 4️⃣ Other Models (Auto-downloaded on first use)

- **Pyannote Diarization**: Auto-downloaded on first request (~200MB)
- **BART Summarization**: Auto-downloaded on first request (~600MB)
- **Qwen2.5:3b**: Downloaded via Ollama (see next section)

### Option B: Manual / Custom Paths

If models are already downloaded elsewhere, set environment variables:

```bash
# Windows PowerShell
$env:STT_MODEL_DIR = "C:\models\PhoWhisper-medium-ct2-int8"
$env:TRANSLATION_VI_EN_DIR = "C:\models\opus-mt-vi-en"
$env:TRANSLATION_EN_VI_DIR = "C:\models\opus-mt-en-vi"

# Or add to .env file:
STT_MODEL_DIR=C:\models\PhoWhisper-medium-ct2-int8
TRANSLATION_VI_EN_DIR=C:\models\opus-mt-vi-en
TRANSLATION_EN_VI_DIR=C:\models\opus-mt-en-vi
```

---

## Ollama Setup

Ollama runs the Qwen2.5:3b LLM model locally.

### Step 1: Install Ollama

- **Download**: https://ollama.ai
- **Windows**: Run installer, Ollama starts automatically
- **Mac/Linux**: Follow installation on ollama.ai

### Step 2: Verify Ollama is Running

```bash
# Should return status
curl http://localhost:11434/api/tags

# Expected output: JSON with model list (initially empty)
```

### Step 3: Pull Qwen2.5:3b Model

```bash
ollama pull qwen2.5:3b

# This downloads ~2GB model
# Takes 5-10 minutes depending on internet
```

### Step 4: Verify Model is Loaded

```bash
curl http://localhost:11434/api/tags

# Should show: qwen2.5:3b in the response
```

### Alternative: Use Different Model

```bash
# If you prefer another model:
ollama pull llama2:7b          # Llama 2 (7B)
ollama pull neural-chat:7b     # Neural Chat (7B)
ollama pull mistral:7b         # Mistral (7B)

# Then set in .env or environment:
OLLAMA_MODEL=llama2:7b
```

---

## Project Configuration

### Verify Configuration

The project auto-configures using `app/config.py`:

```python
# Default model directories (relative to project root)
models/
├── stt/
│   └── PhoWhisper-medium-ct2-int8/
├── translation/
│   ├── opus-mt-vi-en/
│   └── opus-mt-en-vi/
├── diarization/          # Auto-cached from Hugging Face
├── summarization/        # Auto-cached from Hugging Face
└── ...
```

### Optional: Custom Configuration

Create `.env` file with custom paths:

```bash
# .env example
STT_MODEL_DIR=/mnt/models/PhoWhisper-medium-ct2-int8
TRANSLATION_VI_EN_DIR=/mnt/models/opus-mt-vi-en
OLLAMA_BASE_URL=http://192.168.1.100:11434
OLLAMA_MODEL=llama2:7b
```

---

## Running the Server

### Prerequisites Checklist

```bash
# ✅ Check all models exist
python scripts/test_stt.py
curl http://localhost:11434/api/tags

# ✅ Check dependencies
python -c "import faster_whisper; import transformers; import pyannote.audio"
```

### Start FastAPI Server

#### Method 1: Direct Command

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Method 2: Python Script (Recommended)

Create `run.py`:

```python
#!/usr/bin/env python3
import subprocess
import sys

if __name__ == "__main__":
    subprocess.run([
        sys.executable, "-m", "uvicorn",
        "app.main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", "8000"
    ])
```

Then run:

```bash
python run.py
```

#### Method 3: Batch Script (Windows)

Create `run.bat`:

```batch
@echo off
echo ===== Checking Ollama =====
curl http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Ollama not running! Start Ollama manually.
    pause
    exit /b 1
)
echo OK: Ollama is running

echo.
echo ===== Starting API Server =====
.venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
pause
```

Then run:

```bash
run.bat
```

### Expected Output

```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

### Access the Server

- **Web UI**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs (Swagger)
- **ReDoc**: http://localhost:8000/redoc

---

## Verification

### 1. Check Model Status

```bash
curl http://localhost:8000/models/status

# Response example:
{
  "models": [
    {"name": "stt_phowhisper_ct2_int8", "available": true, ...},
    {"name": "translation_vi_en", "available": true, ...},
    ...
  ]
}
```

### 2. Health Check

```bash
curl http://localhost:8000/health

# Response: {"status": "ok", "device": "cpu", "models": [...]}
```

### 3. LLM Connectivity Test

```bash
curl http://localhost:8000/health/llm

# Response: {"ok": true, "model": "qwen2.5:3b", ...}
```

### 4. Test Individual Models

#### Test STT

```python
python scripts/test_stt.py --audio path/to/audio.wav
```

#### Test LLM

```python
python scripts/test_ollama_llm.py
```

#### Test Translation

```python
python scripts/test_translate.py
```

### 5. Full API Test

```bash
# Upload audio file
curl -X POST http://localhost:8000/process \
  -F "file=@path/to/your/meeting.wav"

# Response will include:
# - Transcript (Vietnamese text)
# - Speakers (if diarization enabled)
# - Translation (to English if requested)
# - Summary (extracted key points)
# - LLM Analysis (decisions, action items, risks)
```

---

## Troubleshooting

### ❌ `ModuleNotFoundError: transformers`

**Solution**:

```bash
pip install -r requirements.txt
pip install --upgrade transformers
```

### ❌ `Cannot connect to Ollama at http://127.0.0.1:11434`

**Solution**:

```bash
# 1. Verify Ollama is running
curl http://localhost:11434/api/tags

# 2. If not running, start Ollama:
# - Windows: Open Ollama app
# - Linux/Mac: ollama serve

# 3. Check port isn't blocked:
# - Windows: netstat -ano | findstr 11434
# - Linux/Mac: lsof -i :11434
```

### ❌ `Model not found: qwen2.5:3b`

**Solution**:

```bash
# Pull the model
ollama pull qwen2.5:3b

# Verify
ollama list
```

### ❌ `STT model is missing: models/stt/...`

**Solution**:

```bash
# Download and convert model
hf download vinai/PhoWhisper-medium --local-dir models/stt/PhoWhisper-medium

ct2-transformers-converter \
  --model models/stt/PhoWhisper-medium \
  --output_dir models/stt/PhoWhisper-medium-ct2-int8 \
  --quantization int8 \
  --low_cpu_mem_usage \
  --copy_files tokenizer.json preprocessor_config.json vocab.json merges.txt normalizer.json added_tokens.json special_tokens_map.json tokenizer_config.json
```

### ❌ `CUDA out of memory`

**Solution**: Already optimized for CPU

```bash
# Ensure config uses CPU:
STT_COMPUTE_TYPE=int8  # Already default
OLLAMA_MODEL=qwen2.5:3b  # Use smaller model
```

### ❌ Slow Model Loading on First Run

**Expected**: First run takes time as models are loaded into memory (~2-3 minutes)
**Solution**: Be patient, or reduce model sizes in future runs

### ❌ Translation model missing

**Solution**:

```bash
hf download Helsinki-NLP/opus-mt-vi-en --local-dir models/translation/opus-mt-vi-en
hf download Helsinki-NLP/opus-mt-en-vi --local-dir models/translation/opus-mt-en-vi
```

---

## Performance Tips

### CPU Optimization

```python
# Already configured in config.py:
stt_compute_type = "int8"  # 32-bit → 8-bit quantization
stt_cpu_threads = 4        # Adjust based on your CPU cores
```

### GPU Acceleration (Optional - not configured by default)

If you have NVIDIA GPU:

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Update config.py: device="cuda"
```

### Disk Space Optimization

```bash
# Models can be moved to external drive/USB
# Set via environment variables:
STT_MODEL_DIR=/mnt/external_drive/models/PhoWhisper-medium-ct2-int8
```

---

## Architecture Overview

```
User Request (Audio file)
    ↓
FastAPI Server (app/main.py)
    ↓
process_meeting_audio() [pipeline.py]
    ├── STT: PhoWhisper (speech → text)
    ├── Diarization: Pyannote (speaker identification)
    ├── Translation: Opus-MT (Vietnamese ↔ English)
    ├── Summarization: BART (key points extraction)
    └── LLM: Qwen2.5 via Ollama (decisions, tasks, risks)
    ↓
JSON Response (transcript, speakers, summary, LLM analysis)
    ↓
Web UI / API Consumer
```

---

## Next Steps

1. ✅ Complete setup following this guide
2. 📝 Test API with `curl` or Postman
3. 🎨 Customize frontend (`app/static/`)
4. 🔄 Integrate with your application
5. 🚀 Deploy to production (see deployment docs)

---

## Support

- Check `.env.example` for configuration options
- Review `app/config.py` for defaults
- See test files in `scripts/` for usage examples
- Check `app/services/` for individual service documentation

---

**Last Updated**: 2026-04-28
**Version**: 0.1.0
