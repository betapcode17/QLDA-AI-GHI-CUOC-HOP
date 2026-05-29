# RTTM annotation workflow

Use this workflow to create benchmark-ready RTTM references from the audio files in `data/eval/audio`.

If the backend is running, you can also use the browser UI at:

```text
http://127.0.0.1:8000/annotate
```

## 1. Create template JSON files

```bash
PYTHONPATH=. .venv/Scripts/python.exe scripts/rttm_annotation_tool.py init --audio-dir data/eval/audio --out-dir data/annotations
```

This creates one JSON file per WAV with the duration and an empty `segments` list.

## 2. Label the timeline manually

Open each JSON file in `data/annotations/` and fill `segments` with items like:

```json
{
  "start": 0.0,
  "end": 3.2,
  "speaker": "SPEAKER_00"
}
```

Rules:

- `start` and `end` are seconds.
- `end` must be greater than `start`.
- Use consistent speaker names across the same file.

The browser annotator provides the same workflow with a draggable timeline, speaker chips, Save JSON, and Export RTTM buttons.

## 3. Export RTTM files

```bash
PYTHONPATH=. .venv/Scripts/python.exe scripts/rttm_annotation_tool.py export --input-dir data/annotations --out-dir data/eval/rttm
```

After export, run the benchmark again:

```bash
PYTHONPATH=. .venv/Scripts/python.exe scripts/eval_diarization.py --data-dir data/eval
PYTHONPATH=. .venv/Scripts/python.exe scripts/cluster_tune.py --data-dir data/eval --out data/eval/cluster_tune_results.json
```
