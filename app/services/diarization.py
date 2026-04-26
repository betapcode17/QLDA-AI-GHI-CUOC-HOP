from __future__ import annotations

from pathlib import Path
from threading import Lock
import warnings

from app.config import settings
from app.schemas import DiarizationResponse, DiarizationSegment, TranscriptSegment
from app.services.audio import read_waveform_for_pyannote
from app.services.stt import get_audio_duration


class DiarizationService:
    def __init__(self) -> None:
        self._pipeline = None
        self._lock = Lock()

    def _load(self):
        if self._pipeline is not None:
            return self._pipeline

        with self._lock:
            if self._pipeline is None:
                import torch

                warnings.filterwarnings(
                    "ignore",
                    message=".*torchcodec is not installed correctly.*",
                    category=UserWarning,
                    module="pyannote.audio.core.io",
                )
                from pyannote.audio import Pipeline

                if not (settings.diarization_model_dir / "config.yaml").exists():
                    raise FileNotFoundError(f"Diarization model is missing: {settings.diarization_model_dir}")
                pipeline = Pipeline.from_pretrained(str(settings.diarization_model_dir))
                pipeline.to(torch.device("cpu"))
                self._pipeline = pipeline
        return self._pipeline

    def diarize(self, audio_path: Path) -> DiarizationResponse:
        if get_audio_duration(audio_path) < settings.min_diarization_duration_seconds:
            return DiarizationResponse(segments=[])

        pipeline = self._load()
        diarization_output = pipeline(read_waveform_for_pyannote(audio_path))
        diarization = extract_annotation(diarization_output)
        segments = [
            DiarizationSegment(
                start=round(float(turn.start), 3),
                end=round(float(turn.end), 3),
                speaker=str(speaker),
            )
            for turn, _, speaker in diarization.itertracks(yield_label=True)
        ]
        return DiarizationResponse(segments=segments)


def extract_annotation(diarization_output):
    if hasattr(diarization_output, "itertracks"):
        return diarization_output

    for attribute in ("exclusive_speaker_diarization", "speaker_diarization"):
        annotation = getattr(diarization_output, attribute, None)
        if annotation is not None and hasattr(annotation, "itertracks"):
            return annotation

    raise TypeError(f"Unsupported diarization output type: {type(diarization_output)!r}")


def attach_speakers(
    transcript_segments: list[TranscriptSegment],
    diarization_segments: list[DiarizationSegment],
) -> list[TranscriptSegment]:
    output: list[TranscriptSegment] = []
    for segment in transcript_segments:
        midpoint = (segment.start + segment.end) / 2
        speaker = None
        for diarization_segment in diarization_segments:
            if diarization_segment.start <= midpoint <= diarization_segment.end:
                speaker = diarization_segment.speaker
                break
        output.append(segment.model_copy(update={"speaker": speaker}))
    return output


diarization_service = DiarizationService()
