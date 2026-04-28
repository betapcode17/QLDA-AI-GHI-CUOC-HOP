#!/usr/bin/env python3
"""
Quick Start Script for QLDA-AI-GHI-CUOC-HOP

This script starts the FastAPI server after performing basic checks.

Usage:
    python run.py              # Start with checks
    python run.py --no-check   # Start without checks
    python run.py --port 8080  # Start on custom port
"""

import sys
import os
import subprocess
import urllib.request
import json
import time
import argparse
from pathlib import Path


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
    print(f"{Colors.GREEN}[OK]{Colors.END} {text}")


def print_warning(text: str):
    print(f"{Colors.YELLOW}[WARN]{Colors.END} {text}")


def print_error(text: str):
    print(f"{Colors.RED}[ERROR]{Colors.END} {text}")


def print_info(text: str):
    print(f"{Colors.BLUE}[INFO]{Colors.END} {text}")


def check_ollama():
    """Check if Ollama is running"""
    print_info("Checking Ollama connectivity...")
    try:
        with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=2) as response:
            data = json.loads(response.read().decode("utf-8"))
            models = [m.get("name", "") for m in data.get("models", [])]
            
            if models:
                print_success(f"Ollama is running")
                print_info(f"  Available models: {', '.join(models)}")
                
                # Check for required model
                required_model = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")
                if any(required_model in m for m in models):
                    print_success(f"Required model '{required_model}' is available")
                    return True
                else:
                    print_warning(f"Required model '{required_model}' not found")
                    print_info(f"  Run: ollama pull {required_model}")
                    return False
            else:
                print_warning("Ollama is running but no models available")
                return False
                
    except urllib.error.URLError:
        print_error("Cannot connect to Ollama")
        print_info("Make sure Ollama is running:")
        print_info("  - Windows: Start the Ollama app")
        print_info("  - Linux/Mac: Run 'ollama serve' in another terminal")
        return False
    except Exception as e:
        print_error(f"Error checking Ollama: {e}")
        return False


def check_models():
    """Check if local models are available"""
    print_info("Checking local models...")
    
    try:
        from app.config import settings
        
        models = {
            "STT (PhoWhisper)": settings.stt_model_dir,
            "Translation (Vi→En)": settings.translation_vi_en_dir,
            "Translation (En→Vi)": settings.translation_en_vi_dir,
        }
        
        all_ok = True
        for name, path in models.items():
            if path.exists():
                print_success(f"{name}: {path}")
            else:
                print_warning(f"{name}: Not found at {path}")
                all_ok = False
        
        return all_ok
    except Exception as e:
        print_warning(f"Could not check models: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Start QLDA-AI-GHI-CUOC-HOP FastAPI Server"
    )
    parser.add_argument("--no-check", action="store_true", help="Skip pre-flight checks")
    parser.add_argument("--port", type=int, default=8000, help="Port to run on (default: 8000)")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to (default: 0.0.0.0)")
    parser.add_argument("--reload", action="store_true", default=True, help="Auto-reload on code change")
    
    args = parser.parse_args()
    
    print_header("QLDA-AI-GHI-CUOC-HOP - Server Startup")
    print(f"Port: {args.port}")
    print(f"Host: {args.host}\n")
    
    # Pre-flight checks
    if not args.no_check:
        print_header("Pre-Flight Checks")
        
        checks = {
            "Ollama Service": check_ollama(),
            "Local Models": check_models(),
        }
        
        if not all(checks.values()):
            print_warning("Some checks failed. Starting anyway, but there may be runtime errors.")
            time.sleep(2)
        else:
            print_success("All checks passed!")
            time.sleep(1)
    
    # Start server
    print_header("Starting FastAPI Server")
    print_info(f"Open in browser: http://localhost:{args.port}")
    print_info(f"API Docs: http://localhost:{args.port}/docs")
    print_info(f"ReDoc: http://localhost:{args.port}/redoc\n")
    print(f"{Colors.BOLD}Press Ctrl+C to stop the server{Colors.END}\n")
    
    try:
        subprocess.run([
            sys.executable, "-m", "uvicorn",
            "app.main:app",
            "--reload" if args.reload else "",
            "--host", args.host,
            "--port", str(args.port),
        ], check=True)
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Server stopped by user{Colors.END}")
        return 0
    except subprocess.CalledProcessError as e:
        print_error(f"Server exited with error: {e}")
        return 1
    except FileNotFoundError:
        print_error("Uvicorn not found. Install with: pip install -r requirements.txt")
        return 1


if __name__ == "__main__":
    sys.exit(main())
