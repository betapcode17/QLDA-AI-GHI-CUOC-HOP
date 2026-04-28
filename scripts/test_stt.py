from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_DIR = PROJECT_ROOT / "models" / "stt" / "PhoWhisper-medium-ct2-int8"
SOURCE_MODEL_DIR = PROJECT_ROOT / "models" / "stt" / "PhoWhisper-medium"
REPO_ID = "vinai/PhoWhisper-medium"

LOCAL_CACHE_DIR = PROJECT_ROOT / ".cache"
LOCAL_TMP_DIR = LOCAL_CACHE_DIR / "tmp"
LOCAL_TMP_DIR.mkdir(exist_ok=True)
(LOCAL_CACHE_DIR / "matplotlib").mkdir(parents=True, exist_ok=True)
os.environ.setdefault("TMP", str(LOCAL_TMP_DIR))
os.environ.setdefault("TEMP", str(LOCAL_TMP_DIR))
os.environ.setdefault("MPLCONFIGDIR", str(LOCAL_CACHE_DIR / "matplotlib"))
os.environ.setdefault("HF_HOME", str(PROJECT_ROOT / ".hf"))


def model_dir_has_files(path: Path) -> bool:
    if not path.exists() or not path.is_dir():
        return False
    return (path / "model.bin").exists() and (path / "config.json").exists()


def print_missing_model(path: Path) -> None:
    print(f"CTranslate2 STT model is missing or incomplete: {path}")
    print("Activate the venv from Git Bash with:")
    print("  source .venv/Scripts/activate")
    print("Then download the source checkpoint with:")
    print(f"  hf download {REPO_ID} --local-dir models/stt/PhoWhisper-medium")
    print("Convert it for faster-whisper CPU int8 with:")
    print(
        "  ct2-transformers-converter --model models/stt/PhoWhisper-medium "
        "--output_dir models/stt/PhoWhisper-medium-ct2-int8 --quantization int8 "
        "--low_cpu_mem_usage --copy_files tokenizer.json preprocessor_config.json "
        "vocab.json merges.txt normalizer.json added_tokens.json special_tokens_map.json tokenizer_config.json"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke-test local PhoWhisper CT2 model with faster-whisper on CPU int8.")
    parser.add_argument("--audio", type=Path, help="Optional audio file to transcribe.")
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--language", default="vi", help="Language hint for transcription.")
    parser.add_argument("--cpu-threads", type=int, default=4)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    model_dir = args.model_dir.resolve()

    if not model_dir_has_files(model_dir):
        print_missing_model(model_dir)
        return 2

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        print("faster-whisper is not installed in the active environment.")
        print("Run: python -m pip install faster-whisper")
        print(f"Import error: {exc}")
        return 1

    try:
        model = WhisperModel(
            str(model_dir),
            device="cpu",
            compute_type="int8",
            cpu_threads=args.cpu_threads,
        )
    except Exception as exc:
        print("Failed to load the STT model with faster-whisper on CPU int8.")
        print(f"Source Transformers checkpoint folder: {SOURCE_MODEL_DIR}")
        print("The default test path must contain the converted CTranslate2 files.")
        print(f"Error: {exc}")
        return 1

    if args.audio is None:
        print("STT model loaded successfully on CPU with compute_type=int8.")
        print("Pass --audio path/to/file.wav to run a transcription smoke test.")
        return 0

    audio_path = args.audio.resolve()
    if not audio_path.exists():
        print(f"Audio file not found: {audio_path}")
        return 2

    segments, info = model.transcribe(str(audio_path), language=args.language, beam_size=5)
    print(f"Detected language: {info.language} ({info.language_probability:.2f})")
    for segment in segments:
        print(f"[{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text.strip()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
