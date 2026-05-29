#!/usr/bin/env python3
"""Prepare evaluation audio: convert to 16kHz mono WAV, apply highpass and loudness normalization.

Usage:
  python scripts/prepare_eval.py --source /path/to/raw_audio --out data/eval/audio

This will not create RTTM files. Place RTTM files (one per WAV) into data/eval/rttm/ manually.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
from app.services.audio import find_ffmpeg


def prepare_file(ffmpeg: str, src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    # ffmpeg filters: highpass to remove rumble and loudnorm for consistent loudness
    af = "highpass=f=80,aresample=16000,loudnorm=I=-16:TP=-1.5:LRA=11"
    cmd = [
        ffmpeg,
        '-y',
        '-i', str(src),
        '-ac', '1',
        '-ar', '16000',
        '-vn',
        '-af', af,
        str(dst),
    ]
    print('Running:', ' '.join(cmd))
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print('ffmpeg failed for', src, r.stderr)
        return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--out', default='data/eval/audio')
    args = parser.parse_args()

    src_dir = Path(args.source)
    out_dir = Path(args.out)

    ffmpeg = find_ffmpeg()

    count = 0
    for p in sorted(src_dir.rglob('*')):
        if p.is_file() and p.suffix.lower() in {'.wav', '.mp3', '.m4a', '.flac', '.ogg', '.webm'}:
            dst = out_dir / (p.stem + '_16k_mono.wav')
            ok = prepare_file(ffmpeg, p, dst)
            if ok:
                count += 1

    print(f'Processed {count} files into {out_dir}')


if __name__ == '__main__':
    main()
