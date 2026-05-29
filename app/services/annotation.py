from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import soundfile as sf

from app.config import DATA_DIR, PROJECT_ROOT, settings

ANNOTATION_DIR = DATA_DIR / "annotations"
ANNOTATED_RTTM_DIR = DATA_DIR / "eval" / "rttm_manual"
DEFAULT_SPEAKERS = ["SPEAKER_00", "SPEAKER_01"]


def audio_dir() -> Path:
    return DATA_DIR / "eval" / "audio"


def annotation_dir() -> Path:
    return ANNOTATION_DIR


def rttm_dir() -> Path:
    return ANNOTATED_RTTM_DIR


def duration_seconds(audio_path: Path) -> float:
    info = sf.info(str(audio_path))
    if not info.frames or not info.samplerate:
        return 0.0
    return float(info.frames) / float(info.samplerate)


def list_audio_items() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for wav_path in sorted(audio_dir().glob("*.wav")):
        annotation_path = annotation_dir() / f"{wav_path.stem}.json"
        items.append(
            {
                "uri": wav_path.stem,
                "audio": str(wav_path),
                "duration": round(duration_seconds(wav_path), 3),
                "annotated": annotation_path.exists(),
                "segments": _segment_count(annotation_path),
            }
        )
    return items


def _segment_count(annotation_path: Path) -> int:
    if not annotation_path.exists():
        return 0
    try:
        payload = json.loads(annotation_path.read_text(encoding="utf-8"))
        return len(payload.get("segments", []))
    except Exception:
        return 0


def template_for_audio(stem: str) -> dict[str, Any]:
    wav_path = audio_dir() / f"{stem}.wav"
    if not wav_path.exists():
        raise FileNotFoundError(f"Audio file not found: {wav_path}")

    annotation_path = annotation_dir() / f"{stem}.json"
    if annotation_path.exists():
        return json.loads(annotation_path.read_text(encoding="utf-8"))

    return {
        "uri": stem,
        "audio": str(wav_path),
        "duration": round(duration_seconds(wav_path), 3),
        "sample_rate": settings.audio_sample_rate,
        "speakers": DEFAULT_SPEAKERS,
        "segments": [],
    }


def save_template(stem: str, payload: dict[str, Any]) -> Path:
    annotation_dir().mkdir(parents=True, exist_ok=True)
    payload = dict(payload)
    payload["uri"] = stem
    payload.setdefault("speakers", DEFAULT_SPEAKERS)
    payload.setdefault("segments", [])
    output_path = annotation_dir() / f"{stem}.json"
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return output_path


def normalize_segments(raw_segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in raw_segments:
        start = float(item["start"])
        end = float(item["end"])
        speaker = str(item["speaker"])
        if end <= start:
            raise ValueError(f"Invalid segment: {start} -> {end}")
        normalized.append({"start": start, "end": end, "speaker": speaker})
    normalized.sort(key=lambda segment: (segment["start"], segment["end"]))
    return normalized


def export_rttm_from_payload(stem: str, payload: dict[str, Any]) -> Path:
    segments = normalize_segments(list(payload.get("segments", [])))
    rttm_dir().mkdir(parents=True, exist_ok=True)
    lines = []
    for segment in segments:
        duration = segment["end"] - segment["start"]
        lines.append(
            f"SPEAKER {stem} 1 {segment['start']:.3f} {duration:.3f} <NA> <NA> {segment['speaker']} <NA> <NA>"
        )
    output_path = rttm_dir() / f"{stem}.rttm"
    output_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return output_path


def export_rttm_from_annotation(stem: str) -> Path:
    payload = template_for_audio(stem)
    return export_rttm_from_payload(stem, payload)


def export_all_rttm() -> list[Path]:
    outputs: list[Path] = []
    for json_path in sorted(annotation_dir().glob("*.json")):
        payload = json.loads(json_path.read_text(encoding="utf-8"))
        outputs.append(export_rttm_from_payload(json_path.stem, payload))
    return outputs
