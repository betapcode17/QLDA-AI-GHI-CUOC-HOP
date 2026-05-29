#!/usr/bin/env python3
"""Quick tuner for VAD and clustering parameters.

This script runs a grid search over simple VAD parameters and clustering thresholds
using the VAD fallback (SimpleVADSpeakerDetector) and the main pipeline, and
reports DER for each config (requires reference RTTM files as in eval script).

Usage:
  python scripts/diarization_tune.py --data-dir data/eval --out results.json

"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from itertools import product

from app.services.speaker_vad import SimpleVADSpeakerDetector
from app.services.diarization import diarization_service
from pyannote.metrics.diarization import DiarizationErrorRate
from pyannote.core import Annotation, Segment
from pyannote.database.util import load_rttm


def rttm_to_annotation(path: Path) -> Annotation:
    return load_rttm(str(path))[path.stem]


def vad_segments_to_annotation(segs):
    ann = Annotation()
    for s in segs:
        ann[Segment(s.start, s.end)] = s.speaker
    return ann


def run_grid(data_dir: Path, out_path: Path):
    audio_dir = data_dir / 'audio'
    rttm_dir = data_dir / 'rttm'

    # grid for VAD params
    silence_thresholds = [-50, -40, -35]
    min_silence_ms = [200, 300, 400]

    der_metric = DiarizationErrorRate()
    results = []

    for wav_path in sorted(audio_dir.glob('*.wav')):
        rttm_path = rttm_dir / f"{wav_path.stem}.rttm"
        if not rttm_path.exists():
            continue
        ref = rttm_to_annotation(rttm_path)

        # baseline: pipeline
        pred = diarization_service.diarize(wav_path)
        pred_ann = Annotation()
        for s in pred.segments:
            pred_ann[Segment(s.start, s.end)] = s.speaker
        der = der_metric(ref, pred_ann)
        results.append({'file': wav_path.name, 'method': 'pipeline', 'params': {}, 'der': der})

        # VAD grid
        for thr, ms in product(silence_thresholds, min_silence_ms):
            detector = SimpleVADSpeakerDetector(silence_threshold_db=thr, min_silence_duration_ms=ms)
            vad_res = detector.detect_speakers(wav_path, num_speakers=2)
            vad_ann = vad_segments_to_annotation(vad_res.segments)
            der_vad = der_metric(ref, vad_ann)
            results.append({'file': wav_path.name, 'method': 'vad', 'params': {'silence_db': thr, 'min_silence_ms': ms}, 'der': der_vad})

    out_path.write_text(json.dumps(results, indent=2))
    print('Saved tuning results to', out_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', required=True)
    parser.add_argument('--out', default='diarization_tune_results.json')
    args = parser.parse_args()
    run_grid(Path(args.data_dir), Path(args.out))


if __name__ == '__main__':
    main()
