#!/usr/bin/env python3
"""Evaluate diarization pipeline against RTTM references.

Usage:
  python scripts/eval_diarization.py --data-dir path/to/data

Expect directory structure:
  data/
    audio/xxx.wav
    rttm/xxx.rttm

Outputs a simple CSV summary and per-file visualization under ./.cache/diarization_eval
"""
from __future__ import annotations

import argparse
from pathlib import Path
import json
import matplotlib.pyplot as plt

from pyannote.core import Annotation, Segment
from pyannote.metrics.diarization import DiarizationErrorRate
from pyannote.database.util import load_rttm as load_rttm_file

from app.services.diarization import diarization_service
from app.services.audio import normalize_audio
from app.config import settings


def load_rttm(path: Path) -> Annotation:
    return load_rttm_file(str(path))[path.stem]


def prediction_to_annotation(segments):
    # segments: list of dict with start,end,speaker
    ann = Annotation()
    for seg in segments:
        ann[Segment(seg['start'], seg['end'])] = seg['speaker']
    return ann


def visualize_timeline(wav_path: Path, pred_ann: Annotation, ref_ann: Annotation, out_dir: Path):
    # simple visualization: create a timeline of predicted and reference speakers
    import soundfile as sf
    import numpy as np

    samples, sr = sf.read(str(wav_path), dtype='float32')
    dur = samples.shape[0] / sr

    fig, axes = plt.subplots(3, 1, figsize=(12, 4), sharex=True)
    times = np.linspace(0, dur, len(samples))
    axes[0].plot(times, samples, color='gray')
    axes[0].set_ylabel('Wave')

    def plot_annotation(ax, ann, title):
        for segment, track, label in ann.itertracks(yield_label=True):
            ax.broken_barh([(segment.start, segment.end - segment.start)], (0, 1), facecolors='tab:blue')
            ax.text((segment.start + segment.end) / 2, 0.5, str(label), ha='center', va='center')
        ax.set_yticks([])
        ax.set_title(title)

    plot_annotation(axes[1], ref_ann, 'Reference')
    plot_annotation(axes[2], pred_ann, 'Predicted')

    axes[-1].set_xlabel('Time (s)')
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{wav_path.stem}_timeline.png"
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)
    return out_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', required=True)
    parser.add_argument('--out', default='.cache/diarization_eval')
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    audio_dir = data_dir / 'audio'
    rttm_dir = data_dir / 'rttm'
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    der_metric = DiarizationErrorRate()

    results = []
    for wav_path in sorted(audio_dir.glob('*.wav')):
        rttm_path = rttm_dir / f"{wav_path.stem}.rttm"
        if not rttm_path.exists():
            print(f"Skipping {wav_path.name} - missing RTTM")
            continue

        ref_ann = load_rttm(rttm_path)

        # run pipeline
        pred = diarization_service.diarize(wav_path)
        segments = [{'start': s.start, 'end': s.end, 'speaker': s.speaker} for s in pred.segments]
        pred_ann = prediction_to_annotation(segments)

        der = der_metric(ref_ann, pred_ann)
        results.append({'file': wav_path.name, 'der': der, 'nref': len(ref_ann.labels())})

        # visualize
        visualize_timeline(wav_path, pred_ann, ref_ann, out_dir)

        print(f"{wav_path.name}: DER={der:.3f}")

    # save results
    (out_dir / 'summary.json').write_text(json.dumps(results, indent=2))
    print('Saved summary to', out_dir / 'summary.json')


if __name__ == '__main__':
    main()
