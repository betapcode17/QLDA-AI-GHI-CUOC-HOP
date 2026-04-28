from __future__ import annotations

from pathlib import Path
from threading import Lock

import soundfile as sf
import torch

from app.config import settings
from app.schemas import TranscriptSegment, TranscriptionResponse
from app.services.text_quality import normalize_microphone_check_text


class STTService:
    def __init__(self) -> None:
        self._model = None
        self._processor = None
        self._lock = Lock()

    def _load(self):
        if self._model is not None:
            return self._model

        with self._lock:
            if self._model is None:
                from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

                model_dir = Path(settings.stt_model_dir)
                if not model_dir.exists():
                    raise FileNotFoundError(f"STT model directory is missing: {model_dir}")
                
                # Check for required model files
                if not (model_dir / "pytorch_model.bin").exists():
                    raise FileNotFoundError(
                        f"Model file not found in {model_dir}. "
                        "Expected 'pytorch_model.bin' (HuggingFace format)."
                    )
                
                print("⚙️  Loading PhoWhisper model...")
                
                # Load processor
                self._processor = AutoProcessor.from_pretrained(
                    str(model_dir),
                    local_files_only=True,
                )
                
                # Load model
                device = "cpu"  # Use CPU as configured
                self._model = AutoModelForSpeechSeq2Seq.from_pretrained(
                    str(model_dir),
                    local_files_only=True,
                    torch_dtype=torch.float32,  # Use float32 for CPU
                    device_map=device,
                )
                self._model.eval()
                
                print("✅ PhoWhisper model loaded successfully!")
                
        return self._model

    def transcribe(self, audio_path: Path, language: str | None = None) -> TranscriptionResponse:
        model = self._load()
        
        print(f"\n[STT] Transcribing: {audio_path.name}")
        
        # Load audio
        print(f"[STT] Loading audio...")
        audio, sr = sf.read(str(audio_path))
        duration = len(audio) / sr
        print(f"[STT] Audio loaded: {sr}Hz, duration={duration:.2f}s")
        
        # Resample if necessary (Whisper expects 16kHz)
        if sr != 16000:
            print(f"[STT] Resampling {sr}Hz → 16kHz...")
            from librosa import resample
            audio = resample(audio, orig_sr=sr, target_sr=16000)
            sr = 16000
        
        # Ensure mono
        if len(audio.shape) > 1:
            print(f"[STT] Converting {audio.shape[1]} channels → mono")
            audio = audio.mean(axis=1)
        
        # Process audio
        print(f"[STT] Processing audio with PhoWhisper...")
        inputs = self._processor(
            audio,
            sampling_rate=sr,
            return_tensors="pt",
        ) # type: ignore
        
        # Generate transcription
        print(f"[STT] Running inference...")
        with torch.no_grad():
            generated_ids = model.generate(
                inputs["input_features"],
                language=language or settings.default_language,
            )
        
        # Decode
        text = self._processor.batch_decode(generated_ids, skip_special_tokens=True)[0] # type: ignore
        
        print(f"[STT] Raw output: {text}")
        
        # Parse segments (simplified - PhoWhisper doesn't provide timing info by default)
        segments: list[TranscriptSegment] = []
        if text:
            cleaned_text = normalize_microphone_check_text(text)
            if cleaned_text:
                print(f"[STT] Cleaned text: {cleaned_text}")
                segments.append(
                    TranscriptSegment(
                        id=0,
                        start=0.0,
                        end=round(get_audio_duration(audio_path), 3),
                        text=cleaned_text,
                    )
                )
        
        print(f"[STT] Done! {len(cleaned_text if 'cleaned_text' in locals() else '')} chars transcribed\n")
        
        return TranscriptionResponse(
            language=language or settings.default_language,
            language_probability=None,
            segments=segments,
            text=text,
        )

    def smoke_test(self) -> tuple[bool, str | None, str | None, str | None]:
        """Test if STT model loads and works - returns (success, error, language, text)"""
        try:
            model = self._load()
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
