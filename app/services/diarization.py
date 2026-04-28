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
                import os

                warnings.filterwarnings(
                    "ignore",
                    message=".*torchcodec is not installed correctly.*",
                    category=UserWarning,
                    module="pyannote.audio.core.io",
                )
                from pyannote.audio import Pipeline

                print("📥 Loading Pyannote speaker-diarization from HuggingFace...")
                
                # Get token from environment
                hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
                
                if not hf_token:
                    print("   ⚠️  WARNING: HF_TOKEN not set!")
                    print("   Using fallback: Diarization will be skipped")
                    print("   To enable: set HF_TOKEN environment variable")
                    print("   Get token: https://huggingface.co/settings/tokens")
                    self._pipeline = None
                    return self._pipeline
                
                # Try loading with token (use 'token' parameter, not 'use_auth_token')
                try:
                    print("   Using HuggingFace token...")
                    pipeline = Pipeline.from_pretrained(
                        "pyannote/speaker-diarization-3.1",
                        token=hf_token
                    )
                    print("   ✅ Using speaker-diarization-3.1")
                except Exception as e1:
                    print(f"   ⚠️  3.1 failed: {type(e1).__name__}")
                    
                    # Fallback to 2.1 with @2022-12-19
                    try:
                        print("   Trying speaker-diarization 2.1...")
                        pipeline = Pipeline.from_pretrained(
                            "pyannote/speaker-diarization@2022-12-19",
                            token=hf_token,
                        )
                        print("   ✅ Using speaker-diarization 2.1")
                    except Exception as e2:
                        print(f"   ⚠️  2.1 failed: {type(e2).__name__}")
                        
                        # Last resort: use revision parameter
                        try:
                            print("   Trying speaker-diarization with revision...")
                            pipeline = Pipeline.from_pretrained(
                                "pyannote/speaker-diarization",
                                revision="2022-12-19",
                                token=hf_token,
                            )
                            print("   ✅ Using speaker-diarization (revision 2022-12-19)")
                        except Exception as e3:
                            print(f"   ⚠️  All fallbacks failed: {type(e3).__name__}")
                            print(f"   Error: {e3}")
                            print("   ⚠️  FALLBACK: Diarization disabled - server will skip speaker detection")
                            self._pipeline = None
                            return self._pipeline
                
                pipeline.to(torch.device("cpu")) # type: ignore
                self._pipeline = pipeline
                print("✅ Diarization pipeline loaded successfully!")
                
        return self._pipeline

    def diarize(self, audio_path: Path) -> DiarizationResponse:
        if get_audio_duration(audio_path) < settings.min_diarization_duration_seconds:
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
            diarization_output = pipeline(str(audio_path)) # type: ignore
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
