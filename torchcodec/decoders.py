"""Compatibility layer for torchcodec.decoders."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AudioStreamMetadata:
    sample_rate: int = 16000
    duration_seconds_from_header: float = 0.0


class AudioDecoder:
    def __init__(self, *args, **kwargs):
        self.metadata = AudioStreamMetadata()

    def get_all_samples(self):
        raise RuntimeError(
            "torchcodec is unavailable in this environment; pass preloaded waveforms to pyannote.audio instead of file paths."
        )

    def get_samples_played_in_range(self, *args, **kwargs):
        raise RuntimeError(
            "torchcodec is unavailable in this environment; pass preloaded waveforms to pyannote.audio instead of file paths."
        )
