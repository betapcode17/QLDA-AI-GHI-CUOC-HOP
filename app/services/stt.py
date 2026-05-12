from __future__ import annotations

import os
from pathlib import Path
from threading import Lock

import numpy as np
import soundfile as sf
import torch

from app.config import settings
from app.schemas import TranscriptSegment, TranscriptionResponse
from app.services.text_quality import normalize_microphone_check_text


def _safe_console_text(text: str) -> str:
    return text.encode("ascii", errors="replace").decode("ascii")


class STTService:
    def __init__(self) -> None:
        self._model = None
        self._processor = None
        self._lock = Lock()

    def _prepare_input_features(self, audio: np.ndarray, sr: int) -> torch.Tensor:
        feature_extractor = self._processor.feature_extractor # type: ignore
        extracted = feature_extractor(
            [audio.tolist()],
            sampling_rate=sr,
            return_tensors=None,
            padding="max_length",
        )
        return torch.tensor(
            extracted["input_features"][0].tolist(),
            dtype=torch.float32,
        ).unsqueeze(0).to(
            device=settings.resolved_stt_device,
            dtype=settings.stt_torch_dtype,
        )

    def _transcribe_audio_chunk(self, audio: np.ndarray, sr: int) -> str:
        input_features = self._prepare_input_features(audio, sr)
        with torch.no_grad():
            generated_ids = self._model.generate( # type: ignore
                input_features,
                max_new_tokens=settings.stt_max_new_tokens,
            )
        return self._processor.batch_decode(generated_ids, skip_special_tokens=True)[0] # type: ignore

    def _load(self):
        if self._model is not None:
            return self._model

        with self._lock:
            if self._model is None:
                from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor  # type: ignore

                model_dir = Path(settings.stt_model_dir)
                if not model_dir.exists():
                    raise FileNotFoundError(f"STT model directory is missing: {model_dir}")
                
                # Check for required model files
                if not (model_dir / "pytorch_model.bin").exists():
                    raise FileNotFoundError(
                        f"Model file not found in {model_dir}. "
                        "Expected 'pytorch_model.bin' (HuggingFace format)."
                    )
                
                print("[STT] Loading model...")

                cuda_available = torch.cuda.is_available()
                stt_device = settings.resolved_stt_device
                print(f"[STT] Device: {stt_device}, dtype: {settings.stt_torch_dtype}")
                
                # Load processor
                self._processor = AutoProcessor.from_pretrained(
                    str(model_dir),
                    local_files_only=True,
                )
                
                # Load model
                device = stt_device
                self._model = AutoModelForSpeechSeq2Seq.from_pretrained(
                    str(model_dir),
                    local_files_only=True,
                    torch_dtype=settings.stt_torch_dtype,
                )
                self._model.to(device)
                self._model.eval()

                model_device = next(self._model.parameters()).device
                print(f"[STT] Model on {model_device}")

                if device == "cpu":
                    cpu_threads = max(1, settings.stt_cpu_threads)
                    torch.set_num_threads(cpu_threads)
                    try:
                        torch.set_num_interop_threads(max(1, min(cpu_threads, 4)))
                    except RuntimeError:
                        pass
                    os.environ["OMP_NUM_THREADS"] = str(cpu_threads)
                    os.environ["MKL_NUM_THREADS"] = str(cpu_threads)
                    print(f"[STT] CPU mode ({cpu_threads} threads)")
                
                print("[STT] Model ready!")
                
        return self._model

    def transcribe(self, audio_path: Path, language: str | None = None) -> TranscriptionResponse:
        self._load()
        print(f"\n[STT] Transcribing: {audio_path.name}")
        print(f"[STT] Device: {settings.resolved_stt_device}")

        read_result = sf.read(str(audio_path))  # type: ignore[misc]
        audio = read_result[0]
        sr = read_result[1]
        duration = len(audio) / sr
        print(f"[STT] Audio: {sr}Hz, {duration:.2f}s")

        audio = audio.astype('float32')
        if sr != 16000:
            print(f"[STT] Resample {sr}->16kHz")
            from librosa import resample
            audio = resample(audio, orig_sr=sr, target_sr=16000)
            sr = 16000
        if len(audio.shape) > 1:
            print(f"[STT] Convert {audio.shape[1]} channels to mono")
            audio = audio.mean(axis=1)

        print(f"[STT] Shape: {audio.shape}, dtype: {audio.dtype}")
        print(f"[STT][DEBUG] Audio shape: {audio.shape}, dtype: {audio.dtype}")

        max_chunk_seconds = max(1, min(int(settings.stt_chunk_duration_seconds), 30))
        chunk_samples = max(1, int(sr * max_chunk_seconds))
        total_samples = int(audio.shape[0]) # type: ignore
        use_chunking = total_samples > chunk_samples

        chunk_texts: list[str] = []
        segments: list[TranscriptSegment] = []
        chunk_index = 0

        for start_sample in range(0, total_samples, chunk_samples):
            end_sample = min(start_sample + chunk_samples, total_samples)
            chunk_audio = audio[start_sample:end_sample]
            if chunk_audio.size == 0:
                continue

            chunk_start = round(start_sample / sr, 3)
            chunk_end = round(end_sample / sr, 3)
            print(f"[STT] Chunk {chunk_index + 1}: {chunk_start:.2f}s-{chunk_end:.2f}s")

            try:
                chunk_text = self._transcribe_audio_chunk(chunk_audio, sr)
            except Exception as e:
                print(f"[STT][ERROR] Generation failed: {e}")
                raise

            print(f"[STT] Output chunk {chunk_index + 1}: {_safe_console_text(chunk_text[:100])}...")
            if chunk_text.strip():
                cleaned_chunk_text = normalize_microphone_check_text(chunk_text)
                if cleaned_chunk_text:
                    print(f"[STT] Cleaned chunk {chunk_index + 1}: {len(cleaned_chunk_text)} chars")
                    segments.append(
                        TranscriptSegment(
                            id=chunk_index,
                            start=chunk_start,
                            end=chunk_end,
                            text=cleaned_chunk_text,
                        )
                    )
                chunk_texts.append(chunk_text.strip())

            chunk_index += 1

        text = " ".join(chunk_texts).strip()

        if not use_chunking and text:
            cleaned_text = normalize_microphone_check_text(text)
            if cleaned_text:
                print(f"[STT] Cleaned: {len(cleaned_text)} chars")
                segments = [
                    TranscriptSegment(
                        id=0,
                        start=0.0,
                        end=round(get_audio_duration(audio_path), 3),
                        text=cleaned_text,
                    )
                ]

        print(f"[STT] Done: {len(text)} chars\n")
        return TranscriptionResponse(language=language or settings.default_language, language_probability=None, segments=segments, text=text)

    def _transcribe_with_pipeline(self, audio, sr: int, language: str | None, audio_path: Path) -> TranscriptionResponse: # type: ignore
        """Deprecated - kept for backwards compatibility"""
        pass

    def _transcribe_single(self, audio, sr: int, language: str | None, audio_path: Path) -> TranscriptionResponse: # type: ignore
        """Deprecated - kept for backwards compatibility"""
        pass

    def _transcribe_chunked(self, audio, sr: int, language: str | None, audio_path: Path) -> TranscriptionResponse: # type: ignore
        """Deprecated - kept for backwards compatibility"""
        pass

    def smoke_test(self) -> tuple[bool, str | None, str | None, str | None]:
        """Test if STT model loads and works - returns (success, error, language, text)"""
        try:
            self._load()
            return (True, None, "vi", "PhoWhisper model loaded successfully")
        except FileNotFoundError as e:
            return (False, str(e), None, None)
        except Exception as e:
            return (False, str(e), None, None)


def get_audio_duration(audio_path: Path) -> float:
    try:
        info = sf.info(str(audio_path))
        if info.samplerate:
            return float(info.frames) / float(info.samplerate)
    except Exception:
        return 0.0
    return 0.0


def is_unreliable_segment(segment) -> bool:
    no_speech_prob = float(getattr(segment, "no_speech_prob", 0.0) or 0.0)
    avg_logprob = float(getattr(segment, "avg_logprob", 0.0) or 0.0)
    compression_ratio = float(getattr(segment, "compression_ratio", 0.0) or 0.0)
    return no_speech_prob > 0.85 and avg_logprob < -1.0 or compression_ratio > 3.2


stt_service = STTService()
