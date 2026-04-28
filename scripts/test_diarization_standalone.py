#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Standalone test script for Diarization service
Directly tests the diarization without needing the full server
"""

import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

print("=" * 80)
print("[DIARIZATION SERVICE TEST]")
print("=" * 80)

# Test 1: Check if pyannote is installed
print("\n[1/4] Checking pyannote installation...")
try:
    import pyannote.audio
    print("[OK] pyannote.audio installed")
except ImportError as e:
    print(f"[ERROR] pyannote not installed: {e}")
    sys.exit(1)

# Test 2: Initialize config and diarization service
print("\n[2/4] Initializing diarization service...")
try:
    from app.services.diarization import diarization_service
    print("[OK] Diarization service imported")
except Exception as e:
    print(f"[ERROR] Failed to import: {e}")
    sys.exit(1)

# Test 3: Load model
print("\n[3/4] Loading diarization model...")
try:
    model = diarization_service._load()
    if model is None:
        print("[WARN] Model loaded as None (graceful fallback)")
        print("       Set HF_TOKEN environment variable to enable diarization")
    else:
        print("[OK] Model loaded successfully!")
        print(f"     Model type: {type(model)}")
except Exception as e:
    print(f"[ERROR] Failed to load model: {type(e).__name__}: {e}")
    print("\n[SOLUTION]:")
    print("  1. Get HuggingFace token: https://huggingface.co/settings/tokens")
    print("  2. Accept terms: https://huggingface.co/pyannote/speaker-diarization-3.1")
    print("  3. Set token: export HF_TOKEN=hf_xxxxx")
    print("  4. Or set environment variable in your shell:")
    print("     export HUGGINGFACE_TOKEN=hf_xxxxx")
    sys.exit(1)

# Test 4: Test with sample audio if available
print("\n[4/4] Looking for sample audio to test...")
sample_audios = [
    PROJECT_ROOT / "data" / "sample_audio.wav",
    PROJECT_ROOT / "scripts" / "test_audio.wav",
    Path("C:\\Users\\ADMIN\\sample_meeting.wav"),
]

test_audio = None
for audio_path in sample_audios:
    if audio_path.exists():
        test_audio = audio_path
        break

if test_audio:
    print(f"     Found: {test_audio}")
    try:
        from app.services.audio import normalize_audio
        
        # Normalize audio
        normalized = normalize_audio(test_audio)
        print(f"[OK] Audio normalized: {normalized}")
        
        # Test diarization
        print("     Running diarization inference...")
        result = diarization_service.diarize(Path(normalized))
        
        print(f"[OK] Diarization completed!")
        print(f"\n[RESULTS]:")
        print(f"     Number of speakers: {len(set(s.speaker for s in result.segments))}")
        print(f"     Number of segments: {len(result.segments)}")
        
        for i, seg in enumerate(result.segments, 1):
            print(f"     [{i}] {seg.speaker} [{seg.start}s-{seg.end}s]")
            
    except Exception as e:
        print(f"[ERROR] Diarization test failed: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
else:
    print("     [INFO] No sample audio found (this is OK)")
    print("     To test with audio, place a .wav file in data/ folder")

print("\n" + "=" * 80)
print("[TEST COMPLETE]")
print("=" * 80)
