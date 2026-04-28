from __future__ import annotations

from pathlib import Path

from app.config import settings
from app.schemas import ModelStatus


def has_any_model_file(path: Path) -> bool:
    if not path.exists() or not path.is_dir():
        return False
    markers = (
        "model.bin",
        "config.json",
        "config.yaml",
        "pytorch_model.bin",
        "model.safetensors",
        "diarization.yaml",
    )
    return any((path / marker).exists() for marker in markers)


def get_model_statuses() -> list[ModelStatus]:
    model_paths = {
        "stt_phowhisper_ct2_int8": settings.stt_model_dir,
        "diarization_pyannote": settings.diarization_model_dir,
        "translation_vi_en": settings.translation_vi_en_dir,
        "translation_en_vi": settings.translation_en_vi_dir,
        "summarization_bart": settings.summarization_model_dir,
    }
    return [
        ModelStatus(
            name=name,
            path=str(path),
            available=has_any_model_file(path),
            detail=None if has_any_model_file(path) else "missing or incomplete local model folder",
        )
        for name, path in model_paths.items()
    ]
