#!/usr/bin/env python3
"""Run diarization pipeline on all WAVs and write predicted RTTM files.

Usage:
  python scripts/run_diarization.py --data-dir data/eval --out data/eval/pred_rttm

"""
from __future__ import annotations

import argparse
from pathlib import Path
from app.services.diarization import diarization_service


def write_rttm(file_id: str, segments: list[dict], out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w', encoding='utf8') as fh:
        for seg in segments:
            start = float(seg['start'])
            dur = float(seg['end']) - start
            speaker = seg.get('speaker', 'SPEAKER')
            # RTTM format: SPEAKER <file-id> <channel> <start> <duration> <ortho> <stype> <name> <conf>
            line = f"SPEAKER {file_id} 1 {start:.3f} {dur:.3f} <NA> <NA> {speaker} <NA>\n"
            fh.write(line)


def run(data_dir: Path, out_dir: Path):
    audio_dir = data_dir / 'audio'
    out_dir.mkdir(parents=True, exist_ok=True)

    for wav_path in sorted(audio_dir.glob('*.wav')):
        print('Diarizing', wav_path)
        pred = diarization_service.diarize(wav_path)
        # expected pred.segments with attributes start,end,speaker or dicts
        segments = []
        for s in getattr(pred, 'segments', []) or []:
            # support both objects and dict-like
            try:
                start = float(s.start)
                end = float(s.end)
                speaker = getattr(s, 'speaker', None) or (s.get('speaker') if isinstance(s, dict) else None)
            except Exception:
                # fallback dict access
                start = float(s['start'])
                end = float(s['end'])
                speaker = s.get('speaker')
            segments.append({'start': start, 'end': end, 'speaker': speaker or 'SPEAKER'})

        out_path = out_dir / f"{wav_path.stem}.rttm"
        write_rttm(wav_path.stem, segments, out_path)
        print('Wrote', out_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', required=True)
    parser.add_argument('--out', required=False, default='data/eval/pred_rttm')
    args = parser.parse_args()
    run(Path(args.data_dir), Path(args.out))


if __name__ == '__main__':
    main()
