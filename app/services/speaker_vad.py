"""
Simple Speaker Detection using Voice Activity Detection
Detects speaker changes based on silence/pause patterns
"""

import numpy as np
import librosa
from pathlib import Path
from app.schemas import DiarizationSegment, DiarizationResponse


class SimpleVADSpeakerDetector:
    """
    Detects potential speaker changes using:
    - Silence gaps (silence > threshold = potential speaker change)
    - Volume changes (sudden volume drop/increase = speaker change)
    """
    
    def __init__(
        self,
        sr: int = 16000,
        silence_threshold_db: float = -40,
        min_silence_duration_ms: float = 300,
        volume_change_threshold: float = 0.3,
    ):
        self.sr = sr
        self.silence_threshold_db = silence_threshold_db
        self.min_silence_duration_ms = min_silence_duration_ms
        self.volume_change_threshold = volume_change_threshold
        
    def detect_speakers(self, audio_path: Path, num_speakers: int = 2) -> DiarizationResponse:
        """
        Simple speaker detection using silence detection
        
        Args:
            audio_path: Path to audio file
            num_speakers: Expected number of speakers (default: 2)
        """
        try:
            # Load audio
            y, sr = librosa.load(str(audio_path), sr=self.sr, mono=True)
            
            # Convert to dB
            S = librosa.stft(y)
            S_db = librosa.power_to_db(np.abs(S) ** 2, ref=np.max)
            
            # Compute mean energy per frame
            energy = np.mean(S_db, axis=0)
            
            # Detect silence frames
            silence_mask = energy < self.silence_threshold_db
            
            # Convert frame indices to time
            times = librosa.frames_to_time(np.arange(len(energy)), sr=sr)
            
            # Find silence periods
            silent_frames = np.where(silence_mask)[0]
            if len(silent_frames) == 0:
                # No silence detected, treat as single speaker
                duration = librosa.get_duration(y=y, sr=sr)
                return DiarizationResponse(segments=[
                    DiarizationSegment(start=0.0, end=round(duration, 2), speaker="SPEAKER_00")
                ])
            
            # Find transitions (silence to speech or speech to silence)
            diffs = np.diff(silence_mask.astype(int))
            speech_starts = np.where(diffs == -1)[0]  # Silence to speech
            speech_ends = np.where(diffs == 1)[0]     # Speech to silence
            
            segments = []
            speaker_id = 0
            
            # Ensure we have matching starts and ends
            if len(speech_starts) == 0:
                duration = librosa.get_duration(y=y, sr=sr)
                return DiarizationResponse(segments=[
                    DiarizationSegment(start=0.0, end=round(duration, 2), speaker="SPEAKER_00")
                ])
            
            for i, start_idx in enumerate(speech_starts):
                start_time = times[start_idx]
                
                # Find corresponding end
                end_indices = speech_ends[speech_ends > start_idx]
                if len(end_indices) > 0:
                    end_time = times[end_indices[0]]
                else:
                    end_time = times[-1]
                
                # Skip very short segments (noise)
                if end_time - start_time > 0.5:
                    # Alternate speaker every segment (simple round-robin)
                    speaker = f"SPEAKER_{speaker_id % num_speakers:02d}"
                    segments.append(
                        DiarizationSegment(
                            start=round(float(start_time), 3),
                            end=round(float(end_time), 3),
                            speaker=speaker
                        )
                    )
                    speaker_id += 1
            
            return DiarizationResponse(segments=segments)
            
        except Exception as e:
            print(f"[ERROR] VAD speaker detection failed: {e}")
            return DiarizationResponse(segments=[])


# Singleton instance
vad_detector = SimpleVADSpeakerDetector()
