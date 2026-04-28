@echo off
REM =====================================================================
REM QLDA-AI-GHI-CUOC-HOP - Windows Startup Script
REM =====================================================================
REM This script starts the FastAPI server with preliminary checks

setlocal enabledelayedexpansion

cls
echo.
echo =====================================================================
echo   QLDA-AI-GHI-CUOC-HOP - AI Meeting Minutes Server
echo =====================================================================
echo.

REM Check if .venv exists
if not exist ".venv\Scripts\activate.bat" (
    echo ERROR: Virtual environment not found!
    echo.
    echo Create it with:
    echo   python -m venv .venv
    echo   .venv\Scripts\activate
    echo   pip install -r requirements.txt
    pause
    exit /b 1
)

REM Activate virtual environment
echo [1/3] Activating virtual environment...
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo ERROR: Failed to activate virtual environment
    pause
    exit /b 1
)
echo.

REM Check Ollama
echo [2/3] Checking Ollama service...
timeout /t 1 /nobreak >nul
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo.
    echo [WARNING] Ollama is not running!
    echo Please start Ollama:
    echo   - Windows: Open the Ollama application
    echo   - Or run: ollama serve
    echo.
    echo The server will start anyway, but LLM features will fail.
    echo.
    pause
) else (
    echo ✓ Ollama is running
    echo.
)

REM Start server
echo [3/3] Starting FastAPI Server...
echo.
echo Server will be available at:
echo   - Web UI: http://localhost:8000
echo   - API Docs: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server
echo.

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause
exit /b 0
