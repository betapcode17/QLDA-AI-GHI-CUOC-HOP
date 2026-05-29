#!/usr/bin/env python3
"""Clustering tuning script.

Approach:
- Use SimpleVADSpeakerDetector to obtain speech segments
- Compute lightweight embeddings per segment (MFCC mean)
- Run Agglomerative clustering with precomputed cosine distance and distance thresholds
- Compute DER against RTTM references

Usage:
  python scripts/cluster_tune.py --data-dir data/eval --out results.json

"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import numpy as np
import soundfile as sf
import librosa

from sklearn.metrics import pairwise_distances
from sklearn.cluster import AgglomerativeClustering

from pyannote.core import Annotation, Segment
from pyannote.metrics.diarization import DiarizationErrorRate
from pyannote.database.util import load_rttm

from app.services.speaker_vad import SimpleVADSpeakerDetector


def rttm_to_annotation(path: Path) -> Annotation:
    return load_rttm(str(path))[path.stem]


def segments_to_annotation(segments, labels):
    ann = Annotation()
    for seg, lbl in zip(segments, labels):
        ann[Segment(seg.start, seg.end)] = f"S{int(lbl):02d}"
    return ann


def extract_mfcc_embedding(wav_path: Path, start: float, end: float, sr: int = 16000, n_mfcc: int = 20):
    # read portion
    samples, file_sr = sf.read(str(wav_path), dtype='float32')
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    if file_sr != sr:
        samples = librosa.resample(samples, orig_sr=file_sr, target_sr=sr)

    s = int(start * sr)
    e = int(end * sr)
    seg = samples[s:e]
    if len(seg) < 256:
        # pad short
        seg = np.pad(seg, (0, max(0, 256 - len(seg))))

    mfcc = librosa.feature.mfcc(y=seg, sr=sr, n_mfcc=n_mfcc)
    emb = np.concatenate([mfcc.mean(axis=1), mfcc.std(axis=1)])
    return emb


def run_cluster_tune(data_dir: Path, out_path: Path):
    audio_dir = data_dir / 'audio'
    rttm_dir = data_dir / 'rttm'

    detector = SimpleVADSpeakerDetector()
    der_metric = DiarizationErrorRate()

    # thresholds correspond to cosine distance = 1 - similarity
    similarity_thresholds = [0.55, 0.60, 0.65, 0.70]
    distance_thresholds = [1.0 - s for s in similarity_thresholds]

    results = []

    for wav_path in sorted(audio_dir.glob('*.wav')):
        print('Processing', wav_path)
        rttm_path = rttm_dir / f"{wav_path.stem}.rttm"
        if not rttm_path.exists():
            print('  missing rttm, skipping')
            continue
        ref = rttm_to_annotation(rttm_path)

        vad_res = detector.detect_speakers(wav_path, num_speakers=2)
        segments = vad_res.segments
        if not segments:
            print('  no VAD segments, skipping')
            continue

        # compute embeddings
        embs = []
        for s in segments:
            emb = extract_mfcc_embedding(wav_path, s.start, s.end)
            embs.append(emb)
        embs = np.vstack(embs)

        # normalize
        norms = np.linalg.norm(embs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        embs = embs / norms

        # pairwise cosine distance
        D = pairwise_distances(embs, metric='cosine')

        for thr in distance_thresholds:
            if len(segments) < 2:
                labels = np.zeros(len(segments), dtype=int)
            else:
                try:
                    clustering = AgglomerativeClustering(n_clusters=None, affinity='precomputed', linkage='average', distance_threshold=thr)
                    labels = clustering.fit_predict(D)
                except TypeError:
                    # sklearn API differences: affinity renamed to metric
                    clustering = AgglomerativeClustering(n_clusters=None, metric='precomputed', linkage='average', distance_threshold=thr)
                    labels = clustering.fit_predict(D)

            pred_ann = segments_to_annotation(segments, labels)
            der = der_metric(ref, pred_ann)
            results.append({'file': wav_path.name, 'method': 'agglomerative', 'threshold': thr, 'der': float(der)})
            print(f"  thr={thr:.2f} -> DER={der:.3f}")

    out_path.write_text(json.dumps(results, indent=2))
    print('Saved cluster tuning results to', out_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', required=True)
    parser.add_argument('--out', default='cluster_tune_results.json')
    args = parser.parse_args()
    run_cluster_tune(Path(args.data_dir), Path(args.out))


if __name__ == '__main__':
    main()
