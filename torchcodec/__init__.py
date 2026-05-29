"""Local compatibility shim for torchcodec.

This repository only uses Pyannote with preloaded waveforms, so we do not
need torchcodec's native audio/video decoder bindings at runtime. The shim
provides the symbols that pyannote.audio imports while making the failure mode
explicit if any code tries to decode from a file path.
"""
from __future__ import annotations

from . import decoders, encoders, samplers, transforms
from .decoders import AudioDecoder, AudioStreamMetadata

__version__ = "0.0.0-local-shim"


class AudioSamples:
    def __init__(self, data, sample_rate: int):
        self.data = data
        self.sample_rate = sample_rate


__all__ = [
    "AudioDecoder",
    "AudioSamples",
    "AudioStreamMetadata",
    "decoders",
    "encoders",
    "samplers",
    "transforms",
]
