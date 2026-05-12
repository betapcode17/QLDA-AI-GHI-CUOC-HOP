from __future__ import annotations

<<<<<<< HEAD
import argparse
import os
import sys
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOCAL_CACHE_DIR = PROJECT_ROOT / ".cache"
LOCAL_TMP_DIR = LOCAL_CACHE_DIR / "tmp"
LOCAL_TMP_DIR.mkdir(exist_ok=True)
LOCAL_CACHE_DIR.mkdir(exist_ok=True)
os.environ.setdefault("TMP", str(LOCAL_TMP_DIR))
os.environ.setdefault("TEMP", str(LOCAL_TMP_DIR))
os.environ.setdefault("HF_HOME", str(PROJECT_ROOT / ".hf"))

MODELS = {
    "vi-en": {
        "repo": "Helsinki-NLP/opus-mt-vi-en",
        "path": PROJECT_ROOT / "models" / "translation" / "opus-mt-vi-en",
        "sample": "Hom nay chung ta se tom tat noi dung cuoc hop.",
    },
    "en-vi": {
        "repo": "Helsinki-NLP/opus-mt-en-vi",
        "path": PROJECT_ROOT / "models" / "translation" / "opus-mt-en-vi",
        "sample": "Today we will summarize the meeting notes.",
    },
}


def model_dir_has_files(path: Path) -> bool:
    if not path.exists() or not path.is_dir():
        return False
    model_files = list(path.glob("*.bin")) + list(path.glob("*.safetensors"))
    return (path / "config.json").exists() and bool(model_files)


def print_missing_model(direction: str, path: Path, repo_id: str) -> None:
    print(f"Translation model {direction} is missing or incomplete: {path}")
    print("Activate the venv from Git Bash with:")
    print("  source .venv/Scripts/activate")
    print("Then download it with:")
    print(f"  hf download {repo_id} --local-dir models/translation/{path.name}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke-test local translation models on CPU.")
    parser.add_argument("--direction", choices=sorted(MODELS), default="vi-en")
    parser.add_argument("--text", help="Text to translate. Defaults to a short sample.")
    parser.add_argument("--max-new-tokens", type=int, default=128)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = MODELS[args.direction]
    model_dir = config["path"].resolve()
    repo_id = config["repo"]

    if not model_dir_has_files(model_dir):
        print_missing_model(args.direction, model_dir, repo_id)
        return 2

    try:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    except ImportError as exc:
        print("transformers or torch is not installed in the active environment.")
        print("Run: python -m pip install transformers torch sentencepiece")
        print(f"Import error: {exc}")
        return 1

    text = args.text or config["sample"]
    try:
        tokenizer = AutoTokenizer.from_pretrained(str(model_dir), local_files_only=True)
        model = AutoModelForSeq2SeqLM.from_pretrained(str(model_dir), local_files_only=True)
        model.to("cpu")
        model.eval()
        inputs = tokenizer(text, return_tensors="pt", truncation=True)
        with torch.no_grad():
            output_ids = model.generate(**inputs, max_new_tokens=args.max_new_tokens)
    except Exception as exc:
        print(f"Failed to run translation from local model {model_dir}.")
        print(f"Error: {exc}")
        return 1

    print(tokenizer.decode(output_ids[0], skip_special_tokens=True))
=======
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8") # type: ignore

MODEL_PATH = Path(r"C:\Users\ADMIN\opus-mt-vi-en")

# ===== TEXT TEST DÀI =====
TEXT = """
Hôm nay chúng ta sẽ họp về tiến độ dự án phần mềm quản lý cuộc họp AI.
Nhóm backend cần hoàn thành API upload file âm thanh và xử lý transcript.
Nhóm frontend sẽ xây dựng giao diện ReactJS hiển thị nội dung cuộc họp theo thời gian thực.

Ngoài ra, hệ thống cần tích hợp mô hình Whisper để chuyển giọng nói thành văn bản,
sau đó dùng model dịch để chuyển sang tiếng Anh nếu người dùng yêu cầu đa ngôn ngữ.

Chúng ta cũng sẽ sử dụng mô hình ngôn ngữ lớn như Qwen hoặc Llama chạy qua Ollama
để tóm tắt nội dung cuộc họp, trích xuất quyết định quan trọng và phân công nhiệm vụ.

Mục tiêu cuối cùng là xây dựng một hệ thống AI giúp tự động ghi biên bản cuộc họp,
giảm thời gian làm việc thủ công và tăng hiệu quả cho doanh nghiệp.
""".strip()


def main():
    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
    except ImportError:
        print("pip install transformers torch sentencepiece")
        return 1

    print("📦 Loading model...")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_PATH, local_files_only=True)

    model.to("cpu")
    model.eval()

    print("\n🚀 Start translating...\n")

    start = time.time()

    inputs = tokenizer(TEXT, return_tensors="pt", truncation=True)

    with torch.no_grad():
        outputs = model.generate(**inputs, max_new_tokens=300)

    end = time.time()

    result = tokenizer.decode(outputs[0], skip_special_tokens=True)

    print("===== VI TEXT =====")
    print(TEXT)

    print("\n===== EN RESULT =====")
    print(result)

    print("\n⚡ TIME:", round(end - start, 2), "seconds")

>>>>>>> dat/connect-model-to-service
    return 0


if __name__ == "__main__":
<<<<<<< HEAD
    sys.exit(main())
=======
    sys.exit(main())
>>>>>>> dat/connect-model-to-service
