from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = PROJECT_ROOT / "models"
CACHE_DIR = PROJECT_ROOT / ".cache"
TMP_DIR = CACHE_DIR / "tmp"
DATA_DIR = PROJECT_ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
PROCESSED_DIR = DATA_DIR / "processed"


def configure_local_environment() -> None:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / "matplotlib").mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    os.environ.setdefault("TMP", str(TMP_DIR))
    os.environ.setdefault("TEMP", str(TMP_DIR))
    os.environ.setdefault("MPLCONFIGDIR", str(CACHE_DIR / "matplotlib"))
    os.environ.setdefault("HF_HOME", str(PROJECT_ROOT / ".hf"))
    os.environ.setdefault("HF_HUB_CACHE", str(PROJECT_ROOT / ".hf" / "hub"))
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    os.environ.setdefault("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    os.environ.setdefault("OLLAMA_MODEL", "qwen2.5:3b")
    os.environ.setdefault("OLLAMA_TIMEOUT_SECONDS", "120")


@dataclass(frozen=True)
class Settings:
    app_name: str = "AI Meeting Minutes API"
    stt_model_dir: Path = MODEL_ROOT / "stt" / "PhoWhisper-medium-ct2-int8"
    diarization_model_dir: Path = MODEL_ROOT / "diarization" / "speaker-diarization-community-1"
    translation_vi_en_dir: Path = MODEL_ROOT / "translation" / "opus-mt-vi-en"
    translation_en_vi_dir: Path = MODEL_ROOT / "translation" / "opus-mt-en-vi"
    summarization_model_dir: Path = MODEL_ROOT / "summarization" / "bart-large-cnn"
    default_language: str = "vi"
    stt_compute_type: str = "int8"
    stt_cpu_threads: int = 4
    stt_initial_prompt: str = (
        "Biên bản cuộc họp tiếng Việt. Nội dung có thể gồm thảo luận, ý kiến, "
        "nhiệm vụ, kết luận, kiểm tra âm thanh, a lô, một hai."
    )
    stt_hotwords: str = (
        "a lô, một hai, kiểm tra âm thanh, họp dự án, nhiệm vụ, quyết định, "
        "kết luận, rủi ro, tiến độ"
    )
    stt_vad_min_duration_seconds: float = 8.0
    min_diarization_duration_seconds: float = 8.0
    audio_sample_rate: int = 16000
    upload_dir: Path = UPLOAD_DIR
    processed_dir: Path = PROCESSED_DIR
    ollama_base_url: str = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    ollama_model: str = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")
    ollama_timeout_seconds: float = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "120"))


configure_local_environment()
settings = Settings()
