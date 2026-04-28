#!/usr/bin/env python3
"""
Setup Validation Script for QLDA-AI-GHI-CUOC-HOP

This script checks if all dependencies, models, and services are properly
configured before starting the server.

Usage:
    python setup_check.py
    python setup_check.py --verbose
"""

import sys
import os
from pathlib import Path
from typing import Tuple, List
import importlib.util

# Add app to path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))


class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    END = '\033[0m'
    BOLD = '\033[1m'


def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'=' * 60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'  ' + text:^60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'=' * 60}{Colors.END}\n")


def print_success(text: str):
    print(f"{Colors.GREEN}✓{Colors.END} {text}")


def print_warning(text: str):
    print(f"{Colors.YELLOW}⚠{Colors.END} {text}")


def print_error(text: str):
    print(f"{Colors.RED}✗{Colors.END} {text}")


def check_python_version() -> bool:
    """Check if Python version is 3.9+"""
    version = sys.version_info
    if version.major >= 3 and version.minor >= 9:
        print_success(f"Python {version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print_error(f"Python {version.major}.{version.minor} (requires 3.9+)")
        return False


def check_package(package_name: str, import_name: str = None) -> bool:
    """Check if a package is installed"""
    if import_name is None:
        import_name = package_name
    
    try:
        importlib.import_module(import_name)
        print_success(f"{package_name}")
        return True
    except ImportError:
        print_error(f"{package_name} not installed")
        return False


def check_dependencies() -> bool:
    """Check all required Python dependencies"""
    print_header("Checking Dependencies")
    
    required_packages = [
        ("FastAPI", "fastapi"),
        ("Uvicorn", "uvicorn"),
        ("Pydantic", "pydantic"),
        ("Requests", "requests"),
        ("NumPy", "numpy"),
        ("Librosa", "librosa"),
        ("SoundFile", "soundfile"),
        ("Sounddevice", "sounddevice"),
        ("Transformers", "transformers"),
        ("Torch", "torch"),
        ("Sentencepiece", "sentencepiece"),
        ("Faster-Whisper", "faster_whisper"),
        ("Pyannote.Audio", "pyannote.audio"),
        ("Hugging Face Hub", "huggingface_hub"),
    ]
    
    all_ok = True
    for display_name, import_name in required_packages:
        if not check_package(display_name, import_name):
            all_ok = False
    
    return all_ok


def check_model_file(path: Path) -> bool:
    """Check if model directory has required files"""
    if not path.exists():
        return False
    
    markers = (
        "model.bin",
        "config.json",
        "config.yaml",
        "pytorch_model.bin",
        "model.safetensors",
        "diarization.yaml",
    )
    return any((path / marker).exists() for marker in markers)


def check_models() -> bool:
    """Check if all models are present"""
    print_header("Checking Models")
    
    from app.config import settings
    
    models = {
        "STT (PhoWhisper)": settings.stt_model_dir,
        "Diarization (Pyannote)": settings.diarization_model_dir,
        "Translation (Vi→En)": settings.translation_vi_en_dir,
        "Translation (En→Vi)": settings.translation_en_vi_dir,
        "Summarization (BART)": settings.summarization_model_dir,
    }
    
    all_ok = True
    for name, path in models.items():
        if check_model_file(path):
            print_success(f"{name}: {path}")
        else:
            print_warning(f"{name}: {path} (missing - will auto-download on first use)")
    
    return all_ok


def check_ollama() -> Tuple[bool, str]:
    """Check if Ollama is running and has required model"""
    print_header("Checking Ollama")
    
    try:
        import urllib.request
        import json
        
        url = "http://localhost:11434/api/tags"
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                data = json.loads(response.read().decode("utf-8"))
                models = [m.get("name", "") for m in data.get("models", [])]
                
                if models:
                    print_success(f"Ollama is running at http://localhost:11434")
                    print_success(f"Available models: {', '.join(models)}")
                    
                    from app.config import settings
                    required_model = settings.ollama_model
                    
                    model_found = any(required_model in m for m in models)
                    if model_found:
                        print_success(f"Required model '{required_model}' is available")
                        return True, "OK"
                    else:
                        print_warning(f"Required model '{required_model}' not found")
                        print_warning(f"  Run: ollama pull {required_model}")
                        return False, "Model not pulled"
                else:
                    print_warning("Ollama is running but no models are pulled")
                    return False, "No models"
                    
        except urllib.error.URLError:
            print_error("Cannot connect to Ollama at http://localhost:11434")
            print("  Make sure Ollama is running:")
            print("  - Windows: Start Ollama application")
            print("  - Linux/Mac: Run 'ollama serve' in terminal")
            return False, "Connection failed"
            
    except Exception as e:
        print_error(f"Error checking Ollama: {e}")
        return False, str(e)


def check_directories() -> bool:
    """Check if required directories exist"""
    print_header("Checking Directories")
    
    from app.config import settings
    
    dirs = {
        "Upload": settings.upload_dir,
        "Processed": settings.processed_dir,
        "Cache": Path(settings.ollama_base_url).parent / ".cache",
    }
    
    all_ok = True
    for name, path in dirs.items():
        if path.exists():
            print_success(f"{name}: {path}")
        else:
            print_warning(f"{name}: {path} (will be created)")
    
    return all_ok


def check_environment() -> bool:
    """Check environment variables"""
    print_header("Checking Environment Variables")
    
    env_vars = {
        "OLLAMA_BASE_URL": "http://127.0.0.1:11434",
        "OLLAMA_MODEL": "qwen2.5:3b",
        "OLLAMA_TIMEOUT_SECONDS": "120",
        "TOKENIZERS_PARALLELISM": "false",
    }
    
    for var, default in env_vars.items():
        value = os.environ.get(var, default)
        status = "custom" if os.environ.get(var) else "default"
        print_success(f"{var} = {value} [{status}]")
    
    return True


def main():
    print(f"\n{Colors.BOLD}{Colors.BLUE}QLDA-AI-GHI-CUOC-HOP Setup Validation{Colors.END}")
    print(f"{Colors.BLUE}Version 0.1.0{Colors.END}\n")
    
    results = {
        "Python Version": check_python_version(),
        "Dependencies": check_dependencies(),
        "Models": check_models(),
        "Directories": check_directories(),
        "Environment": check_environment(),
    }
    
    ollama_ok, ollama_msg = check_ollama()
    results["Ollama"] = ollama_ok
    
    # Summary
    print_header("Summary")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for check_name, result in results.items():
        status = f"{Colors.GREEN}PASS{Colors.END}" if result else f"{Colors.YELLOW}WARN{Colors.END}"
        print(f"  {status} {check_name}")
    
    print(f"\nPassed: {passed}/{total}")
    
    # Recommendations
    if not ollama_ok:
        print(f"\n{Colors.YELLOW}⚠ Ollama is not properly set up.{Colors.END}")
        print("Before running the server, ensure Ollama is running:")
        print("  1. Download from https://ollama.ai")
        print("  2. Start the Ollama application")
        print(f"  3. Pull the required model: ollama pull qwen2.5:3b")
        print("  4. Verify with: curl http://localhost:11434/api/tags")
    
    if passed == total:
        print(f"\n{Colors.GREEN}{Colors.BOLD}✓ All checks passed! You can start the server.{Colors.END}")
        print(f"  Run: {Colors.BOLD}uvicorn app.main:app --reload --host 0.0.0.0 --port 8000{Colors.END}")
        return 0
    else:
        print(f"\n{Colors.YELLOW}⚠ Some checks didn't pass. See warnings above.{Colors.END}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
