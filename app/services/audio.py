from __future__ import annotations

import shutil
import subprocess
import uuid
import os
from pathlib import Path

import soundfile as sf

from app.config import PROJECT_ROOT, settings


def safe_upload_name(original_name: str) -> str:
    suffix = Path(original_name).suffix.lower() or ".audio"
    return f"{uuid.uuid4().hex}{suffix}"


def find_ffmpeg() -> str:
    configured = os.environ.get("FFMPEG_BINARY")
    if configured:
        try:
            if Path(configured).exists():
                return configured
        except OSError:
            return configured

    found = shutil.which("ffmpeg")
    if found:
        return found

    candidate_roots = [
        Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages",
        Path("C:/Users/Lenovo/AppData/Local/Microsoft/WinGet/Packages"),
    ]
    users_root = Path("C:/Users")
    if users_root.exists():
        candidate_roots.extend(
            user_dir / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
            for user_dir in users_root.iterdir()
            if user_dir.is_dir()
        )

    for winget_root in candidate_roots:
        if not winget_root.exists():
            continue
        matches = sorted(winget_root.glob("Gyan.FFmpeg*/**/bin/ffmpeg.exe"))
        if matches:
            return str(matches[-1])

    raise RuntimeError(
        "ffmpeg was not found on PATH. Install it or add the Gyan.FFmpeg bin folder to PATH."
    )


def save_upload_bytes(data: bytes, filename: str) -> Path:
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    output_path = settings.upload_dir / safe_upload_name(filename)
    output_path.write_bytes(data)
    return output_path


def normalize_audio(input_path: Path) -> Path:
    ffmpeg = find_ffmpeg()
    settings.processed_dir.mkdir(parents=True, exist_ok=True)
    output_path = settings.processed_dir / f"{input_path.stem}_16k_mono.wav"
    command = [
        ffmpeg,
        "-y",
        "-i",
        str(input_path),
        "-af",
        "highpass=f=80,lowpass=f=7800,afftdn,dynaudnorm=f=150:g=12",
        "-ac",
        "1",
        "-ar",
        str(settings.audio_sample_rate),
        "-vn",
        str(output_path),
    ]
    completed = subprocess.run(command, cwd=PROJECT_ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        raise RuntimeError(f"ffmpeg failed to normalize audio: {completed.stderr.strip()}")
    return output_path


def read_waveform_for_pyannote(audio_path: Path):
    import torch

    samples, sample_rate = sf.read(str(audio_path), dtype="float32", always_2d=True)
    mono = samples.mean(axis=1)
    waveform = torch.from_numpy(mono).unsqueeze(0)
    return {"waveform": waveform, "sample_rate": sample_rate}


def extract_segment_to_file(audio_path: Path, start: float, end: float, output_path: Path | None = None) -> Path:
    """Extract a time segment [start, end] (seconds) from `audio_path` into a 16k mono wav file.

    Uses ffmpeg for accurate segment trimming. Returns the path to the output wav file.
    """
    ffmpeg = find_ffmpeg()
    settings.processed_dir.mkdir(parents=True, exist_ok=True)
    if output_path is None:
        # name based on original + start-end
        output_path = settings.processed_dir / f"{audio_path.stem}_{int(start*1000)}_{int(end*1000)}_seg.wav"

    # build ffmpeg command: seek then copy segment
    command = [
        ffmpeg,
        "-y",
        "-i",
        str(audio_path),
        "-ss",
        str(start),
        "-to",
        str(end),
        "-ac",
        "1",
        "-ar",
        str(settings.audio_sample_rate),
        "-vn",
        str(output_path),
    ]
    # run
    completed = subprocess.run(command, cwd=PROJECT_ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        raise RuntimeError(f"ffmpeg failed to extract segment: {completed.stderr.strip()}")
    return output_path
