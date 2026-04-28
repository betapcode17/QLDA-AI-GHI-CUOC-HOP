from __future__ import annotations

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

    return 0


if __name__ == "__main__":
    sys.exit(main())