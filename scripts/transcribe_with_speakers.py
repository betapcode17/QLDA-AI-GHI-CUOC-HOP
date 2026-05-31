#!/usr/bin/env python3
"""Demo script: run diarization + per-segment STT and print merged transcript.

Usage:
  python scripts/transcribe_with_speakers.py --file path/to/audio.wav
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.services.pipeline import process_meeting_audio


def find_default_audio() -> Path | None:
    candidates = list(Path("data").rglob("*.wav"))
    if not candidates:
        return None
    # prefer files under data/eval/audio
    for c in candidates:
        if "eval" in str(c.parts) and "audio" in str(c.parts):
            return c
    return candidates[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", "-f", type=Path, help="Path to input audio (wav)")
    parser.add_argument("--no-diarize", action="store_true", help="Skip diarization and run whole-file STT")
    args = parser.parse_args()

    audio_path = args.file or find_default_audio()
    if audio_path is None:
        print("No audio file found under data/ — place a WAV file and retry.")
        sys.exit(2)

    if not audio_path.exists():
        print(f"Audio file not found: {audio_path}")
        sys.exit(2)

    print(f"Demo audio: {audio_path}")

    try:
        resp = process_meeting_audio(
            input_audio_path=audio_path,
            language="vi",
            include_diarization=not args.no_diarize,
            include_summary=False,
            include_llm=False,
        )
    except Exception as e:
        print(f"Error during processing: {e}")
        raise

    # Print summary of results
    print("\n=== MERGED TRANSCRIPT ===\n")
    print(resp.merged_transcript or "(empty)")

    print("\n=== SEGMENTS ===\n")
    for s in resp.transcript.segments:
        print(f"{s.id}: Speaker={s.speaker} [{s.start:.3f}-{s.end:.3f}] -> {s.text[:200]}")

    print("\n=== DIARIZATION ===\n")
    if resp.diarization and resp.diarization.segments:
        for d in resp.diarization.segments:
            print(f"{d.speaker}: {d.start:.3f}-{d.end:.3f}")
    else:
        print("No diarization segments")

    print("\nDone.")


if __name__ == "__main__":
    main()
