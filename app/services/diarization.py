from __future__ import annotations

from pathlib import Path
from threading import Lock
import warnings

from app.config import settings
from app.schemas import DiarizationResponse, DiarizationSegment, TranscriptSegment
from app.services.audio import read_waveform_for_pyannote
from app.services.gpu_memory import log_cuda_memory, release_cuda_memory
from app.services.stt import get_audio_duration # type: ignore


class DiarizationService:
    def __init__(self) -> None:
        self._pipeline = None
        self._pipeline_device: str | None = None
        self._lock = Lock()

    def unload(self) -> None:
        if self._pipeline is not None:
            try:
                import torch

                self._pipeline.to(torch.device("cpu"))
            except Exception:
                pass
        del self._pipeline
        self._pipeline = None
        self._pipeline_device = None
        release_cuda_memory("after diarization unload")

    def _gpu_memory_mb(self) -> tuple[int, int]:
        try:
            import torch

            if not torch.cuda.is_available():
                return 0, 0

            free_memory, total_memory = torch.cuda.mem_get_info()
            return int(free_memory // (1024 * 1024)), int(total_memory // (1024 * 1024))

        except Exception:
            try:
                import torch

                if not torch.cuda.is_available():
                    return 0, 0
                properties = torch.cuda.get_device_properties(0)
                total_mb = int(properties.total_memory // (1024 * 1024))
                return total_mb, total_mb
            except Exception:
                return 0, 0

    def _resolve_device(self, audio_path: Path | None = None) -> str:
        preferred = settings.diarization_device
        if preferred == "cpu":
            return "cpu"

        free_memory_mb, total_memory_mb = self._gpu_memory_mb()
        gpu_memory_limit_mb = settings.diarization_gpu_memory_limit_mb
        if total_memory_mb:
            # Tune the cutoff to the actual card size. On small cards, use a more
            # conservative threshold so we do not keep trying GPU when VRAM is
            # already fragmented or nearly full.
            ratio = float(getattr(settings, "diarization_gpu_cutoff_ratio", 0.20))
            floor_mb = int(getattr(settings, "diarization_gpu_cutoff_floor_mb", 700))
            adaptive_limit_mb = max(floor_mb, int(total_memory_mb * ratio))
            gpu_memory_limit_mb = min(gpu_memory_limit_mb, adaptive_limit_mb)

        if free_memory_mb and free_memory_mb <= gpu_memory_limit_mb:
            return "cpu"

        if audio_path is not None:
            duration = get_audio_duration(audio_path)
            if duration >= settings.diarization_cpu_after_seconds and free_memory_mb == 0:
                return "cpu"

        return preferred if preferred == "cuda" else "cpu"

    def _diagnostic_gpu_limit_mb(self) -> tuple[int, int, int]:
        free_memory_mb, total_memory_mb = self._gpu_memory_mb()
        configured_limit_mb = settings.diarization_gpu_memory_limit_mb
        adaptive_limit_mb = configured_limit_mb

        if total_memory_mb:
            ratio = float(getattr(settings, "diarization_gpu_cutoff_ratio", 0.35))
            floor_mb = int(getattr(settings, "diarization_gpu_cutoff_floor_mb", 1200))
            adaptive_limit_mb = max(floor_mb, int(total_memory_mb * ratio))
            configured_limit_mb = min(configured_limit_mb, adaptive_limit_mb)

        return free_memory_mb, total_memory_mb, configured_limit_mb

    def _speaker_profile(self, audio_path: Path, expected_speakers: int | None = None) -> tuple[int, int, int]:
        if expected_speakers is not None and expected_speakers >= 1:
            target = expected_speakers
            lower_bound = max(1, expected_speakers)
            upper_bound = max(lower_bound, expected_speakers)
            return target, lower_bound, upper_bound

        duration = get_audio_duration(audio_path)  # type: ignore
        floor = max(1, settings.diarization_min_speakers)
        ceiling = max(floor, settings.diarization_max_speakers)

        if duration < settings.diarization_aggressive_split_after_seconds:
            target = floor
        elif duration < 30:
            target = min(floor + 1, ceiling)
        elif duration < 180:
            target = min(floor + 2, ceiling)
        else:
            target = ceiling

        lower_bound = max(floor, target - 1)
        upper_bound = min(ceiling, target + 1)
        return target, lower_bound, upper_bound

    def _apply_tuning(self, pipeline) -> None:
        segmentation = getattr(pipeline, "segmentation", None)
        if segmentation is not None and hasattr(segmentation, "min_duration_off"):
            segmentation.min_duration_off = settings.diarization_min_duration_off  # type: ignore[attr-defined]

        clustering = getattr(pipeline, "clustering", None)
        if clustering is not None:
            if hasattr(clustering, "threshold"):
                clustering.threshold = settings.diarization_cluster_threshold  # type: ignore[attr-defined]
            if hasattr(clustering, "Fa"):
                clustering.Fa = settings.diarization_cluster_fa  # type: ignore[attr-defined]
            if hasattr(clustering, "Fb"):
                clustering.Fb = settings.diarization_cluster_fb  # type: ignore[attr-defined]

    def _load(self, device_override: str | None = None):
        desired_device = device_override or settings.diarization_device
        if self._pipeline is not None and self._pipeline_device == desired_device:
            return self._pipeline

        with self._lock:
            if self._pipeline is not None and self._pipeline_device != desired_device:
                self.unload()

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
                log_cuda_memory("before diarization load")

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
                    self._apply_tuning(pipeline)
                    print("   [OK] Loaded local speaker-diarization bundle")
                except Exception as local_error:
                    print(f"   [WARN] Local diarization load failed: {type(local_error).__name__}")
                    print(f"   Error: {local_error}")
                    print("   [WARN] Diarization disabled - server will skip speaker detection")
                    self._pipeline = None
                    return self._pipeline
                
                pipeline.to(torch.device(desired_device)) # type: ignore
                self._pipeline = pipeline
                self._pipeline_device = desired_device
                print(f"[DIARIZATION] Pipeline loaded successfully on {desired_device}") # type: ignore
                log_cuda_memory("after diarization load")
                
        return self._pipeline

    def diarize(self, audio_path: Path, expected_speakers: int | None = None) -> DiarizationResponse:
        if get_audio_duration(audio_path) < settings.min_diarization_duration_seconds: # type: ignore
            return DiarizationResponse(segments=[])

        if (
            settings.skip_diarization_when_single_speaker
            and expected_speakers is not None
            and expected_speakers <= 1
        ):
            duration = get_audio_duration(audio_path)
            print(
                "[DIARIZATION] Skipping diarization because expected_speakers=1; "
                "assigning the whole file to SPEAKER_00."
            )
            return DiarizationResponse(
                segments=[
                    DiarizationSegment(
                        start=0.0,
                        end=round(float(duration), 3),
                        speaker="SPEAKER_00",
                    )
                ]
            )

        print(f"\n[DIARIZATION] Detecting speakers: {audio_path.name}")
        print(f"[DIARIZATION][DEBUG] expected_speakers={expected_speakers or 'auto'}")
        
        device = self._resolve_device(audio_path)
        free_memory_mb, total_memory_mb, effective_limit_mb = self._diagnostic_gpu_limit_mb()
        ratio = float(getattr(settings, "diarization_gpu_cutoff_ratio", 0.35))
        floor_mb = int(getattr(settings, "diarization_gpu_cutoff_floor_mb", 1200))
        duration = get_audio_duration(audio_path)
        print(
            f"[DIARIZATION][DEBUG] gpu_free={free_memory_mb}MB | gpu_total={total_memory_mb}MB | "
            f"configured_limit={settings.diarization_gpu_memory_limit_mb}MB | ratio={ratio:.2f} | floor={floor_mb}MB | "
            f"effective_limit={effective_limit_mb}MB | audio_duration={duration:.1f}s"
        )
        if device == "cpu" and settings.diarization_device == "cuda":
            reason = "GPU memory below effective limit"
            if free_memory_mb == 0:
                reason = "CUDA memory info unavailable"
            elif duration >= settings.diarization_cpu_after_seconds and free_memory_mb == 0:
                reason = f"audio length >= {settings.diarization_cpu_after_seconds}s and no GPU free memory"
            print(
                f"[DIARIZATION] Using CPU for this request ({reason}; free GPU memory {free_memory_mb}MB / {total_memory_mb}MB total, threshold {effective_limit_mb}MB)."
            )
        elif device == "cuda":
            print(f"[DIARIZATION] Using GPU for this request (free GPU memory {free_memory_mb}MB / {total_memory_mb}MB total).")

        pipeline = self._load(device)
        
        # If diarization model is not available, try VAD-based fallback
        if pipeline is None:
            print(f"[DIARIZATION] Model unavailable - using VAD-based fallback")
            try:
                from app.services.speaker_vad import vad_detector
                target_speakers, min_speakers, max_speakers = self._speaker_profile(audio_path, expected_speakers)
                print(
                    f"[DIARIZATION][DEBUG] VAD fallback profile | target={target_speakers} | min={min_speakers} | max={max_speakers}"
                )
                result = vad_detector.detect_speakers(audio_path, num_speakers=target_speakers)
                num_speakers = len(set(seg.speaker for seg in result.segments))
                print(f"[DIARIZATION] VAD detected {num_speakers} speakers (target {target_speakers}, range {min_speakers}-{max_speakers}):")
                for seg in result.segments:
                    print(f"  {seg.speaker}: [{seg.start}s - {seg.end}s]")
                return result
            except Exception as e:
                print(f"[DIARIZATION] VAD fallback failed: {e}")
                return DiarizationResponse(segments=[])
        
        # Use real diarization model
        try:
            print(f"[DIARIZATION] Running Pyannote inference...")
            target_speakers, min_speakers, max_speakers = self._speaker_profile(audio_path, expected_speakers)
            print(
                f"[DIARIZATION][DEBUG] Pyannote speaker profile | target={target_speakers} | min={min_speakers} | max={max_speakers}"
            )
            waveform = read_waveform_for_pyannote(audio_path)
            if expected_speakers is not None and expected_speakers >= 1:
                print(f"[DIARIZATION] Fast path: using fixed num_speakers={target_speakers}")
                diarization_output = pipeline(
                    waveform,  # type: ignore
                    num_speakers=target_speakers,
                )
            else:
                diarization_output = pipeline(
                    waveform,  # type: ignore
                    min_speakers=min_speakers,
                    max_speakers=max_speakers,
                )
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
            print(f"[DIARIZATION] Pyannote detected {num_speakers} speakers (target {target_speakers}, range {min_speakers}-{max_speakers}):")
            for seg in segments:
                print(f"  {seg.speaker}: [{seg.start}s - {seg.end}s]")
            print(f"[DIARIZATION][DEBUG] total_segments={len(segments)}")
            if settings.low_vram_mode:
                release_cuda_memory("after diarization inference")
            return DiarizationResponse(segments=segments)
        except Exception as e:
            print(f"[DIARIZATION] Inference failed: {e} - trying VAD fallback")
            try:
                from app.services.speaker_vad import vad_detector
                target_speakers, min_speakers, max_speakers = self._speaker_profile(audio_path, expected_speakers)
                result = vad_detector.detect_speakers(audio_path, num_speakers=target_speakers)
                num_speakers = len(set(seg.speaker for seg in result.segments))
                print(f"[DIARIZATION] VAD fallback detected {num_speakers} speakers (target {target_speakers}, range {min_speakers}-{max_speakers}):")
                for seg in result.segments:
                    print(f"  {seg.speaker}: [{seg.start}s - {seg.end}s]")
                return result
            except Exception as vad_error:
                print(f"[DIARIZATION] All methods failed: {vad_error}")
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
    # Assign speaker to each transcript segment by the diarization segment
    # that has the largest time overlap with the transcript segment. If no
    # overlap exists, fall back to the nearest diarization segment by
    # midpoint distance.
    output: list[TranscriptSegment] = []
    if not diarization_segments:
        return [segment.model_copy(update={"speaker": None}) for segment in transcript_segments]

    for segment in transcript_segments:
        best_speaker = None
        best_overlap = 0.0
        seg_start = segment.start
        seg_end = segment.end
        for d in diarization_segments:
            # compute overlap
            overlap_start = max(seg_start, d.start)
            overlap_end = min(seg_end, d.end)
            overlap = max(0.0, overlap_end - overlap_start)
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = d.speaker

        if best_speaker is None:
            # no overlap found — pick nearest diarization segment by midpoint distance
            midpoint = (seg_start + seg_end) / 2
            nearest = min(diarization_segments, key=lambda d: abs(((d.start + d.end) / 2) - midpoint))
            best_speaker = nearest.speaker

        output.append(segment.model_copy(update={"speaker": best_speaker}))

    return output


diarization_service = DiarizationService()
