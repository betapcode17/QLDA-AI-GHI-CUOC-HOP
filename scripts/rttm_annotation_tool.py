#!/usr/bin/env python3
"""Create and export manual diarization annotations as RTTM.

Workflow:
1. Initialize JSON templates from audio files:
   python scripts/rttm_annotation_tool.py init --audio-dir data/eval/audio --out-dir data/annotations

2. Manually edit the JSON files and fill `segments` with timeline labels.

3. Export RTTM files for benchmark evaluation:
   python scripts/rttm_annotation_tool.py export --input-dir data/annotations --out-dir data/eval/rttm

JSON format:
{
  "uri": "Audio_test_1_16k_mono",
  "audio": "data/eval/audio/Audio_test_1_16k_mono.wav",
  "duration": 41.493,
  "sample_rate": 16000,
  "speakers": ["SPEAKER_00", "SPEAKER_01"],
  "segments": [
    {"start": 0.0, "end": 3.2, "speaker": "SPEAKER_00"}
  ]
}
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import soundfile as sf

from app.config import settings


@dataclass
class SegmentItem:
    start: float
    end: float
    speaker: str


def audio_duration(audio_path: Path) -> float:
    info = sf.info(str(audio_path))
    if not info.frames or not info.samplerate:
        return 0.0
    return float(info.frames) / float(info.samplerate)


def init_templates(audio_dir: Path, out_dir: Path, speakers: list[str]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for wav_path in sorted(audio_dir.glob("*.wav")):
        payload = {
            "uri": wav_path.stem,
            "audio": str(wav_path),
            "duration": round(audio_duration(wav_path), 3),
            "sample_rate": settings.audio_sample_rate,
            "speakers": speakers,
            "segments": [],
        }
        out_path = out_dir / f"{wav_path.stem}.json"
        out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Wrote template {out_path}")


def normalize_segments(raw_segments: list[dict[str, Any]]) -> list[SegmentItem]:
    normalized: list[SegmentItem] = []
    for item in raw_segments:
        start = float(item["start"])
        end = float(item["end"])
        speaker = str(item["speaker"])
        if end <= start:
            raise ValueError(f"Invalid segment: end must be greater than start ({start} -> {end})")
        normalized.append(SegmentItem(start=start, end=end, speaker=speaker))
    normalized.sort(key=lambda segment: (segment.start, segment.end))
    return normalized


def export_rttm(input_dir: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    json_paths = sorted(input_dir.glob("*.json"))
    if not json_paths:
        raise FileNotFoundError(f"No JSON annotations found in {input_dir}")

    for json_path in json_paths:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
        uri = str(payload.get("uri") or json_path.stem)
        segments = normalize_segments(payload.get("segments", []))

        rttm_lines = []
        for seg in segments:
            duration = seg.end - seg.start
            rttm_lines.append(
                f"SPEAKER {uri} 1 {seg.start:.3f} {duration:.3f} <NA> <NA> {seg.speaker} <NA> <NA>"
            )

        out_path = out_dir / f"{json_path.stem}.rttm"
        out_path.write_text("\n".join(rttm_lines) + ("\n" if rttm_lines else ""), encoding="utf-8")
        print(f"Wrote RTTM {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Manual RTTM annotation helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="Create JSON annotation templates from WAV files")
    init_parser.add_argument("--audio-dir", required=True, type=Path)
    init_parser.add_argument("--out-dir", required=True, type=Path)
    init_parser.add_argument("--speakers", nargs="+", default=["SPEAKER_00", "SPEAKER_01"])

    export_parser = subparsers.add_parser("export", help="Export RTTM files from JSON annotations")
    export_parser.add_argument("--input-dir", required=True, type=Path)
    export_parser.add_argument("--out-dir", required=True, type=Path)

    args = parser.parse_args()

    if args.command == "init":
        init_templates(args.audio_dir, args.out_dir, args.speakers)
    elif args.command == "export":
        export_rttm(args.input_dir, args.out_dir)


if __name__ == "__main__":
    main()
