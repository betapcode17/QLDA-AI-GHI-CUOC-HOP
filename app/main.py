from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import PROJECT_ROOT, settings
from app.schemas import (
    DiarizationResponse,
    HealthResponse,
    LLMHealthResponse,
    LLMTestRequest,
    ProcessResponse,
    SummaryRequest,
    SummaryResponse,
    TranslateRequest,
    TranslateResponse,
    TranscriptionResponse,
)
from app.services.audio import normalize_audio, save_upload_bytes
from app.services.diarization import diarization_service
from app.services.llm_service import llm_service
from app.services.model_status import get_model_statuses
from app.services.pipeline import process_meeting_audio
from app.services.stt import stt_service
from app.services.summarization import summarization_service
from app.services.translation import translation_service


app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=PROJECT_ROOT / "app" / "static"), name="static")


async def save_uploaded_audio(file: UploadFile) -> str:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    return str(save_upload_bytes(data, file.filename or "audio"))


def to_http_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=500, detail=str(exc))


@app.get("/", include_in_schema=False)
def web_app() -> FileResponse:
    return FileResponse(PROJECT_ROOT / "app" / "static" / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(PROJECT_ROOT / "app" / "static" / "favicon.svg")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", device="cpu", models=get_model_statuses())


@app.get("/health/llm", response_model=LLMHealthResponse)
async def llm_health() -> LLMHealthResponse:
    result = await run_in_threadpool(llm_service.smoke_test)
    return LLMHealthResponse(
        ok=result.error is None,
        model=llm_service.config.model,
        base_url=llm_service.config.base_url,
        result=result,
        error=result.error,
    )


@app.post("/debug/llm-test", response_model=LLMHealthResponse)
async def debug_llm_test(payload: LLMTestRequest) -> LLMHealthResponse:
    result = await run_in_threadpool(llm_service.smoke_test, payload.transcript)
    return LLMHealthResponse(
        ok=result.error is None,
        model=llm_service.config.model,
        base_url=llm_service.config.base_url,
        result=result,
        error=result.error,
    )


@app.get("/models/status")
def models_status():
    return {"models": get_model_statuses()}


@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: Annotated[UploadFile, File(...)],
    language: Annotated[str, Query(description="Language hint for faster-whisper.")] = "vi",
) -> TranscriptionResponse:
    try:
        uploaded_path = await save_uploaded_audio(file)
        normalized_path = await run_in_threadpool(normalize_audio, Path(uploaded_path))
        return await run_in_threadpool(stt_service.transcribe, normalized_path, language)
    except HTTPException:
        raise
    except Exception as exc:
        raise to_http_error(exc) from exc


@app.post("/api/diarize", response_model=DiarizationResponse)
async def diarize_audio(file: Annotated[UploadFile, File(...)]) -> DiarizationResponse:
    try:
        uploaded_path = await save_uploaded_audio(file)
        normalized_path = await run_in_threadpool(normalize_audio, Path(uploaded_path))
        return await run_in_threadpool(diarization_service.diarize, normalized_path)
    except HTTPException:
        raise
    except Exception as exc:
        raise to_http_error(exc) from exc


@app.post("/api/process", response_model=ProcessResponse)
async def process_audio(
    file: Annotated[UploadFile, File(...)],
    language: str = "vi",
    include_diarization: bool = True,
    translate_to: Literal["vi-en", "en-vi"] | None = None,
    include_summary: bool = True,
    include_llm: bool = True,
) -> ProcessResponse:
    try:
        uploaded_path = await save_uploaded_audio(file)
        return await run_in_threadpool(
            process_meeting_audio,
            Path(uploaded_path),
            language,
            include_diarization,
            translate_to,
            include_summary,
            include_llm,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise to_http_error(exc) from exc


@app.post("/api/translate", response_model=TranslateResponse)
async def translate_text(payload: TranslateRequest) -> TranslateResponse:
    try:
        translated = await run_in_threadpool(
            translation_service.translate,
            payload.text,
            payload.direction,
            payload.max_new_tokens,
        )
        return TranslateResponse(direction=payload.direction, text=payload.text, translated_text=translated)
    except Exception as exc:
        raise to_http_error(exc) from exc


@app.post("/api/summarize", response_model=SummaryResponse)
async def summarize_text(payload: SummaryRequest) -> SummaryResponse:
    try:
        summary = await run_in_threadpool(
            summarization_service.summarize,
            payload.text,
            payload.max_new_tokens,
            payload.min_new_tokens,
        )
        return SummaryResponse(text=payload.text, summary=summary)
    except Exception as exc:
        raise to_http_error(exc) from exc
