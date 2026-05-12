#!/usr/bin/env python3
"""Diagnostic script to check model directory structure and compatibility."""

import sys
from pathlib import Path

# Check PhoWhisper model structure
model_path = Path(r"C:\Users\ADMIN\PhoWhisper-medium")

print("=" * 70)
print("🔍 PhoWhisper Model Diagnostic")
print("=" * 70)

if not model_path.exists():
    print(f"❌ Model directory NOT FOUND: {model_path}")
    sys.exit(1)

print(f"✅ Model directory found: {model_path}")
print(f"\n📂 Directory contents:")

# List all files in model directory
all_files = list(model_path.rglob("*"))
print(f"   Total items: {len(all_files)}")

# Group by type
dirs = [f for f in all_files if f.is_dir()]
files = [f for f in all_files if f.is_file()]

print(f"\n   Subdirectories ({len(dirs)}):")
for d in sorted(dirs)[:10]:  # Show first 10
    print(f"     - {d.relative_to(model_path)}")
if len(dirs) > 10:
    print(f"     ... and {len(dirs) - 10} more")

print(f"\n   Files ({len(files)}):")
for f in sorted(files)[:20]:  # Show first 20
    size_mb = f.stat().st_size / (1024 * 1024)
    print(f"     - {f.name:30} ({size_mb:.1f} MB)")
if len(files) > 20:
    print(f"     ... and {len(files) - 20} more")

# Check for key model files
print(f"\n📋 Key model files check:")
key_files = [
    "model.bin",
    "pytorch_model.bin",
    "config.json",
    "tokenizer.json",
    "preprocessor_config.json",
]

for fname in key_files:
    fpath = model_path / fname
    if fpath.exists():
        size_mb = fpath.stat().st_size / (1024 * 1024)
        print(f"   ✅ {fname:30} ({size_mb:.1f} MB)")
    else:
        print(f"   ❌ {fname:30} NOT FOUND")

# Try to understand the model structure
print(f"\n🔧 Model structure analysis:")

# Check if it's a HuggingFace model
hf_indicators = [
    "config.json",
    "tokenizer.json",
    "model.safetensors",
    "pytorch_model.bin",
]
hf_found = any((model_path / f).exists() for f in hf_indicators)
print(f"   HuggingFace format: {'✅ YES' if hf_found else '❌ NO'}")

# Check if it's CTranslate2 format (for faster-whisper)
ct2_indicators = [
    "model.bin",
    "model.safetensors",
    "tokenizer.json",
]
ct2_found = any((model_path / f).exists() for f in ct2_indicators)
print(f"   CTranslate2 format: {'✅ YES' if ct2_found else '❌ MAYBE'}")

# Try loading with faster_whisper to see actual error
print(f"\n⚙️  Attempting to load with faster_whisper...")
try:
    from faster_whisper import WhisperModel
    print(f"   faster_whisper version check: OK")
    
    try:
        model = WhisperModel(
            str(model_path),
            device="cpu",
            compute_type="int8",
            cpu_threads=4,
        )
        print(f"   ✅ Model loaded successfully!")
    except FileNotFoundError as e:
        print(f"   ❌ FileNotFoundError: {e}")
        print(f"\n      Possible solutions:")
        print(f"      1. Model needs to be converted to CTranslate2 format")
        print(f"      2. Download pre-converted model from HuggingFace")
        print(f"      3. Use original Whisper instead of faster-whisper")
    except Exception as e:
        print(f"   ❌ Error: {type(e).__name__}: {e}")
        
except ImportError:
    print(f"   ❌ faster_whisper not installed")

print("\n" + "=" * 70)
