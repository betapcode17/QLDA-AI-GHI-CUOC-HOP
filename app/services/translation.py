from __future__ import annotations

from pathlib import Path
from threading import Lock
from typing import Literal
import warnings
import torch

from app.config import settings


Direction = Literal["vi-en", "en-vi"]


class TranslationService:
    def __init__(self) -> None:
        self._models: dict[Direction, tuple[object, object]] = {}
        self._lock = Lock()

    def _model_dir(self, direction: Direction) -> Path:
        return settings.translation_vi_en_dir if direction == "vi-en" else settings.translation_en_vi_dir

    def _load(self, direction: Direction):
        if direction in self._models:
            return self._models[direction]

        with self._lock:
            if direction not in self._models:
                from transformers import AutoModelForSeq2SeqLM, AutoTokenizer # type: ignore

                model_dir = self._model_dir(direction)
                if not (model_dir / "config.json").exists():
                    raise FileNotFoundError(f"Translation model is missing: {model_dir}")
                with warnings.catch_warnings():
                    warnings.filterwarnings(
                        "ignore",
                        message="Recommended: pip install sacremoses.",
                        category=UserWarning,
                    )
                    tokenizer = AutoTokenizer.from_pretrained(str(model_dir), local_files_only=True)
                model = AutoModelForSeq2SeqLM.from_pretrained(str(model_dir), local_files_only=True)
                model.generation_config.max_length = None
                if hasattr(model.config, "max_length"):
                    model.config.max_length = None
                model.to(settings.model_device)
                model.eval()
                self._models[direction] = (tokenizer, model)
        return self._models[direction]

    def translate(self, text: str, direction: Direction, max_new_tokens: int = 256) -> str:
        tokenizer, model = self._load(direction)
        inputs = tokenizer(text, return_tensors="pt", truncation=True) # type: ignore
        inputs = {key: value.to(settings.model_device) for key, value in inputs.items()}
        with torch.no_grad():
            output_ids = model.generate(**inputs, max_new_tokens=max_new_tokens) # type: ignore
        return tokenizer.decode(output_ids[0].detach().cpu(), skip_special_tokens=True) # type: ignore


translation_service = TranslationService()
