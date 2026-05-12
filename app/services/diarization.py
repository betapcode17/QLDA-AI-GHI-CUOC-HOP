from __future__ import annotations

from pathlib import Path
from threading import Lock
import warnings

from app.config import settings
from app.schemas import DiarizationResponse, DiarizationSegment, TranscriptSegment
from app.services.audio import read_waveform_for_pyannote
from app.services.stt import get_audio_duration # type: ignore


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
                import os

                warnings.filterwarnings(
                    "ignore",
                    message=".*torchcodec is not installed correctly.*",
                    category=UserWarning,
                    module="pyannote.audio.core.io",
                )
                from pyannote.audio import Pipeline
                try:
                    from torch.serialization import add_safe_globals, safe_globals
                    from pyannote.audio.core.task import Specifications

                    add_safe_globals([Specifications])
                except Exception:
                    pass

                local_model_dir = Path(settings.diarization_model_dir) # type: ignore
                if not local_model_dir.exists():
                    print(f"   [WARN] Local diarization bundle not found: {local_model_dir}")
                    self._pipeline = None
                    return self._pipeline

                print(f"[DIARIZATION] Loading Pyannote speaker-diarization from local bundle: {local_model_dir}")

                try:
                    original_torch_load = torch.load

                    def _torch_load_compat(*args, **kwargs):
                        if kwargs.get("weights_only") is None:
                            kwargs["weights_only"] = False
                        return original_torch_load(*args, **kwargs)

                    torch.load = _torch_load_compat  # type: ignore[assignment]
                    try:
                        with safe_globals([Specifications]):
                            pipeline = Pipeline.from_pretrained(str(local_model_dir))
                    finally:
                        torch.load = original_torch_load  # type: ignore[assignment]
                    print("   [OK] Loaded local speaker-diarization bundle")
                except Exception as local_error:
                    print(f"   [WARN] Local diarization load failed: {type(local_error).__name__}")
                    print(f"   Error: {local_error}")
                    print("   [WARN] Diarization disabled - server will skip speaker detection")
                    self._pipeline = None
                    return self._pipeline
                
                pipeline.to(torch.device(settings.diarization_device)) # type: ignore
                self._pipeline = pipeline
                print(f"[DIARIZATION] Pipeline loaded successfully on {settings.diarization_device}") # type: ignore
                
        return self._pipeline

    def diarize(self, audio_path: Path) -> DiarizationResponse:
        if get_audio_duration(audio_path) < settings.min_diarization_duration_seconds: # type: ignore
            return DiarizationResponse(segments=[])

        print(f"\n[DIARIZATION] Detecting speakers: {audio_path.name}")
        
        pipeline = self._load()
        
        # If diarization model is not available, try VAD-based fallback
        if pipeline is None:
            print(f"[DIARIZATION] Model unavailable - using VAD-based fallback")
            try:
                from app.services.speaker_vad import vad_detector
                result = vad_detector.detect_speakers(audio_path, num_speakers=2)
                num_speakers = len(set(seg.speaker for seg in result.segments))
                print(f"[DIARIZATION] VAD detected {num_speakers} speakers:")
                for seg in result.segments:
                    print(f"  {seg.speaker}: [{seg.start}s - {seg.end}s]")
                return result
            except Exception as e:
                print(f"[DIARIZATION] VAD fallback failed: {e}")
                return DiarizationResponse(segments=[])
        
        # Use real diarization model
        try:
            print(f"[DIARIZATION] Running Pyannote inference...")
            diarization_output = pipeline(read_waveform_for_pyannote(audio_path)) # type: ignore
            diarization = extract_annotation(diarization_output)
            segments = [
                DiarizationSegment(
                    start=round(float(turn.start), 3),
                    end=round(float(turn.end), 3),
                    speaker=str(speaker),
                )
                for turn, _, speaker in diarization.itertracks(yield_label=True)
            ]
            num_speakers = len(set(seg.speaker for seg in segments))
            print(f"[DIARIZATION] Pyannote detected {num_speakers} speakers:")
            for seg in segments:
                print(f"  {seg.speaker}: [{seg.start}s - {seg.end}s]")
            return DiarizationResponse(segments=segments)
        except Exception as e:
            print(f"[DIARIZATION] Inference failed: {e} - trying VAD fallback")
            try:
                from app.services.speaker_vad import vad_detector
                result = vad_detector.detect_speakers(audio_path, num_speakers=2)
                num_speakers = len(set(seg.speaker for seg in result.segments))
                print(f"[DIARIZATION] VAD fallback detected {num_speakers} speakers:")
                for seg in result.segments:
                    print(f"  {seg.speaker}: [{seg.start}s - {seg.end}s]")
                return result
            except Exception as vad_error:
                print(f"[DIARIZATION] All methods failed: {vad_error}")
                return DiarizationResponse(segments=[])
                print(f"   [ERROR] All speaker detection methods failed: {vad_error}")
                return DiarizationResponse(segments=[])


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
