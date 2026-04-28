import os
import sounddevice as sd
from scipy.io.wavfile import write
import soundfile as sf
from transformers import pipeline

# =========================
# TẮT TORCHCODEC (QUAN TRỌNG)
# =========================
os.environ["TRANSFORMERS_NO_TORCHCODEC"] = "1"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# =========================
# CONFIG
# =========================
SAMPLE_RATE = 16000
DURATION = 5  # giây ghi âm
AUDIO_FILE = "record.wav"
OUTPUT_TXT = "result.txt"

# =========================
# GHI ÂM
# =========================
print("🎤 Đang ghi âm... nói vào micro")

recording = sd.rec(
    int(DURATION * SAMPLE_RATE),
    samplerate=SAMPLE_RATE,
    channels=1,
    dtype="int16"
)

sd.wait()

write(AUDIO_FILE, SAMPLE_RATE, recording)
print("✅ Đã ghi âm xong:", AUDIO_FILE)

# =========================
# LOAD MODEL PhoWhisper
# =========================
print("🤖 Đang load model PhoWhisper...")

pipe = pipeline(
    "automatic-speech-recognition",
    model="C:/Users/ADMIN/PhoWhisper-medium"
)

# =========================
# TRANSCRIBE (FIX QUAN TRỌNG)
# =========================
print("🧠 Đang xử lý audio...")

audio, sr = sf.read(AUDIO_FILE)

result = pipe({
    "array": audio,
    "sampling_rate": sr
})

text = result["text"] # type: ignore

# =========================
# OUTPUT
# =========================
print("\n===== KẾT QUẢ =====")
print(text)

with open(OUTPUT_TXT, "w", encoding="utf-8") as f:
    f.write(text)

print("\n💾 Đã lưu vào:", OUTPUT_TXT)