from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
import torch

# Load .env file if it exists
try:
    from dotenv import load_dotenv # pyright: ignore[reportMissingImports]
    load_dotenv(override=True)
except ImportError:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if env_path.exists():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = PROJECT_ROOT / "models"
CACHE_DIR = PROJECT_ROOT / ".cache"
TMP_DIR = CACHE_DIR / "tmp"
DATA_DIR = PROJECT_ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
PROCESSED_DIR = DATA_DIR / "processed"
CHROMA_DIR = Path(os.environ.get("TEMP", str(CACHE_DIR))) / "QLDA_AI_GHI_CUOC_HOP" / "chroma_meetings"


def configure_local_environment() -> None:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / "matplotlib").mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)

    os.environ.setdefault("TMP", str(TMP_DIR))
    os.environ.setdefault("TEMP", str(TMP_DIR))
    os.environ.setdefault("MPLCONFIGDIR", str(CACHE_DIR / "matplotlib"))
    os.environ.setdefault("HF_HOME", str(PROJECT_ROOT / ".hf"))
    os.environ.setdefault("HF_HUB_CACHE", str(PROJECT_ROOT / ".hf" / "hub"))
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    
    # Ollama Configuration
    os.environ.setdefault("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    os.environ.setdefault("OLLAMA_MODEL", "qwen2.5:3b")
    os.environ.setdefault("OLLAMA_EMBED_MODEL", "nomic-embed-text")
    os.environ.setdefault("OLLAMA_TIMEOUT_SECONDS", "120")
    os.environ.setdefault("CHROMA_DB_DIR", str(CHROMA_DIR))
    
    # Model Paths - Support both project-local and custom paths
    os.environ.setdefault("STT_MODEL_DIR", r"C:\Users\ADMIN\PhoWhisper-medium")
    os.environ.setdefault("DIARIZATION_MODEL_DIR", str(PROJECT_ROOT / "diarization" / "speaker-diarization-community-1"))
    os.environ.setdefault("TRANSLATION_VI_EN_DIR", r"C:\Users\ADMIN\opus-mt-vi-en")
    os.environ.setdefault("TRANSLATION_EN_VI_DIR", r"C:\Users\ADMIN\opus-mt-en-vi")
    os.environ.setdefault("TRANSLATION_DEVICE", "cpu")
    os.environ.setdefault("SUMMARIZATION_MODEL_DIR", str(MODEL_ROOT / "summarization" / "bart-large-cnn"))
    
    # Transformers & HF Hub settings
    os.environ.setdefault("TRANSFORMERS_NO_TORCHCODEC", "1")
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    os.environ.setdefault("AI_LOW_VRAM_MODE", "1")
    os.environ.setdefault("PRELOAD_MODELS", "0")

    # Diarization defaults: on 4GB GPUs, run diarization and STT sequentially
    # and aggressively release whichever model just finished.
    os.environ.setdefault("DIARIZATION_DEVICE", "cuda")
    # GPU memory threshold for diarization. If free GPU memory is <= this value,
    # the code will prefer CPU to avoid CUDA OOM. Set to a sensible default
    # (e.g. 1500 MB) rather than 0 to prevent attempting GPU when memory is low.
    os.environ.setdefault("DIARIZATION_GPU_MEMORY_LIMIT_MB", "900")
    # Adaptive cutoff controls used by diarization.py to derive the effective
    # GPU threshold from the card size. The effective cutoff becomes the lower
    # of the configured limit and the adaptive value below.
    os.environ.setdefault("DIARIZATION_GPU_CUTOFF_RATIO", "0.20")
    os.environ.setdefault("DIARIZATION_GPU_CUTOFF_FLOOR_MB", "700")
    # PyTorch CUDA allocation configuration to reduce fragmentation OOMs.
    # Setting `max_split_size_mb` prevents very small allocations from fragmenting
    # the GPU heap; 64 is conservative for 4GB cards.
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "max_split_size_mb:64,garbage_collection_threshold:0.8")
    # Default max speakers to a reasonable upper bound (can be tuned per-run)
    os.environ.setdefault("DIARIZATION_MAX_SPEAKERS", "4")

    # Runtime device preferences
    os.environ.setdefault("MODEL_DEVICE", "auto")
    os.environ.setdefault("STT_DEVICE", "cuda")
    os.environ.setdefault("STT_COMPUTE_TYPE", "auto")
    os.environ.setdefault("STT_CPU_THREADS", str(min(8, os.cpu_count() or 4)))


@dataclass(frozen=True)
class Settings:
    app_name: str = "AI Meeting Minutes API"
    
    # Model directories with environment variable support
    stt_model_dir: Path = Path(os.environ.get("STT_MODEL_DIR", r"C:\Users\ADMIN\PhoWhisper-medium"))
    diarization_model_dir: Path = Path(os.environ.get("DIARIZATION_MODEL_DIR", str(PROJECT_ROOT / "diarization" / "speaker-diarization-community-1")))
    translation_vi_en_dir: Path = Path(os.environ.get("TRANSLATION_VI_EN_DIR", r"C:\Users\ADMIN\opus-mt-vi-en"))
    translation_en_vi_dir: Path = Path(os.environ.get("TRANSLATION_EN_VI_DIR", r"C:\Users\ADMIN\opus-mt-en-vi"))
    translation_device: str = os.environ.get("TRANSLATION_DEVICE", "cpu")
    summarization_model_dir: Path = Path(os.environ.get("SUMMARIZATION_MODEL_DIR", str(MODEL_ROOT / "summarization" / "bart-large-cnn")))
    
    # Language and STT settings
    default_language: str = "vi"
    stt_device: str = os.environ.get("STT_DEVICE", "cuda")
    stt_compute_type: str = os.environ.get("STT_COMPUTE_TYPE", "auto")
    stt_cpu_threads: int = max(1, int(os.environ.get("STT_CPU_THREADS", "4")))
    stt_initial_prompt: str = (
        "Biên bản cuộc họp tiếng Việt. Nội dung có thể gồm thảo luận, ý kiến, "
        "nhiệm vụ, kết luận, kiểm tra âm thanh, a lô, một hai."
    )
    stt_hotwords: str = (
        "a lô, một hai, kiểm tra âm thanh, họp dự án, nhiệm vụ, quyết định, "
        "kết luận, rủi ro, tiến độ"
    )
    stt_vad_min_duration_seconds: float = 8.0
    stt_max_new_tokens: int = int(os.environ.get("STT_MAX_NEW_TOKENS", "256"))
    stt_chunk_duration_seconds: int = int(os.environ.get("STT_CHUNK_DURATION", "15"))
    stt_min_segment_seconds: float = float(os.environ.get("STT_MIN_SEGMENT_SECONDS", "1.0"))
    low_vram_mode: bool = os.environ.get("AI_LOW_VRAM_MODE", "1").lower() in {"1", "true", "yes", "on"}
    preload_models: bool = os.environ.get("PRELOAD_MODELS", "0").lower() in {"1", "true", "yes", "on"}
    min_diarization_duration_seconds: float = 8.0
    skip_diarization_when_single_speaker: bool = os.environ.get(
        "SKIP_DIARIZATION_WHEN_SINGLE_SPEAKER",
        "1",
    ).lower() in {"1", "true", "yes", "on"}
    audio_sample_rate: int = 16000
    diarization_cluster_threshold: float = float(os.environ.get("DIARIZATION_CLUSTER_THRESHOLD", "0.48"))
    diarization_cluster_fa: float = float(os.environ.get("DIARIZATION_CLUSTER_FA", "0.07"))
    diarization_cluster_fb: float = float(os.environ.get("DIARIZATION_CLUSTER_FB", "0.8"))
    diarization_min_duration_off: float = float(os.environ.get("DIARIZATION_MIN_DURATION_OFF", "0.0"))
    diarization_merge_gap_seconds: float = float(os.environ.get("DIARIZATION_MERGE_GAP_SECONDS", "0.35"))
    diarization_min_speakers: int = max(1, int(os.environ.get("DIARIZATION_MIN_SPEAKERS", "1")))
    diarization_max_speakers: int = max(
        max(1, int(os.environ.get("DIARIZATION_MIN_SPEAKERS", "1"))),
        int(os.environ.get("DIARIZATION_MAX_SPEAKERS", "4")),
    )
    diarization_aggressive_split_after_seconds: float = float(
        os.environ.get("DIARIZATION_AGGRESSIVE_SPLIT_AFTER_SECONDS", "20")
    )
    diarization_cpu_after_seconds: float = float(
        os.environ.get("DIARIZATION_CPU_AFTER_SECONDS", "30")
    )
    diarization_gpu_memory_limit_mb: int = max(
        0,
        int(os.environ.get("DIARIZATION_GPU_MEMORY_LIMIT_MB", "1500")),
    )
    diarization_gpu_cutoff_ratio: float = float(os.environ.get("DIARIZATION_GPU_CUTOFF_RATIO", "0.30"))
    diarization_gpu_cutoff_floor_mb: int = max(
        0,
        int(os.environ.get("DIARIZATION_GPU_CUTOFF_FLOOR_MB", "1000")),
    )
    
    # Directories
    upload_dir: Path = UPLOAD_DIR
    processed_dir: Path = PROCESSED_DIR
    
    # Ollama LLM Configuration
    ollama_base_url: str = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    ollama_model: str = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")
    ollama_embed_model: str = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
    ollama_timeout_seconds: float = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "120"))
    chroma_db_dir: Path = Path(os.environ.get("CHROMA_DB_DIR", str(CHROMA_DIR)))
    
    # Ollama endpoints (for different API routes)
    @property
    def ollama_generate_url(self) -> str:
        """URL for Ollama /api/generate endpoint"""
        return f"{self.ollama_base_url.rstrip('/')}/api/generate"
    
    @property
    def ollama_chat_url(self) -> str:
        """URL for Ollama /api/chat endpoint"""
        return f"{self.ollama_base_url.rstrip('/')}/api/chat"

    @property
    def model_device(self) -> str:
        preferred = os.environ.get("MODEL_DEVICE", "auto").lower()
        if preferred in {"cuda", "gpu"} and torch.cuda.is_available():
            return "cuda"
        if preferred == "cpu":
            return "cpu"
        return "cuda" if torch.cuda.is_available() else "cpu"

    @property
    def diarization_device(self) -> str:
        preferred = os.environ.get("DIARIZATION_DEVICE", "cpu").lower()
        if preferred in {"cuda", "gpu"} and torch.cuda.is_available():
            return "cuda"
        if preferred == "auto":
            return "cuda" if torch.cuda.is_available() else "cpu"
        return "cpu"

    @property
    def is_gpu_enabled(self) -> bool:
        return self.model_device == "cuda"

    @property
    def resolved_stt_device(self) -> str:
        preferred = self.stt_device.lower()
        if preferred in {"cuda", "gpu"} and torch.cuda.is_available():
            return "cuda"
        return "cpu"

    @property
    def stt_torch_dtype(self):
        return torch.float16 if self.resolved_stt_device == "cuda" else torch.float32

    @property
    def resolved_stt_compute_type(self) -> str:
        requested = self.stt_compute_type.lower()
        if requested != "auto":
            return requested
        return "float16" if self.resolved_stt_device == "cuda" else "int8"


configure_local_environment()
settings = Settings()
