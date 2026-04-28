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
    STTHealthResponse,
    SummaryRequest,
    SummaryResponse,
    TranscribeWithSpeakersResponse,
    TranslateRequest,
    TranslateResponse,
    TranscriptionResponse,
)
from app.services.audio import normalize_audio, save_upload_bytes
from app.services.diarization import attach_speakers, diarization_service
from app.services.llm_service import llm_service
from app.services.model_status import get_model_statuses
from app.services.pipeline import format_merged_transcript, process_meeting_audio
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


# ============================================================================
# STARTUP: Preload all models into memory
# ============================================================================

@app.on_event("startup")
async def startup_preload_models():
    """Preload all models at startup for faster inference."""
    print("\n" + "=" * 80)
    print("🚀 STARTUP: Preloading models into RAM...")
    print("=" * 80)
    
    try:
        # 1. Preload STT (PhoWhisper)
        print("\n [1/5] Loading Speech-to-Text (PhoWhisper)...")
        await run_in_threadpool(stt_service._load)
        print("       ✅ STT model loaded successfully!")
        
    except Exception as e:
        print(f"       ❌ STT Error: {e}")
    
    try:
        # 2. Preload LLM (Ollama Qwen)
        print("\n🤖 [2/5] Loading LLM (Ollama Qwen2.5)...")
        result = await run_in_threadpool(llm_service.smoke_test)
        if result.error:
            print(f"       ⚠️  LLM Warning: {result.error}")
        else:
            print("       ✅ LLM (Ollama) ready!")
            
    except Exception as e:
        print(f"       ⚠️  LLM Error: {e}")
    
    try:
        # 3. Preload Translator (vi-en)
        print("\n🔄 [3/5] Loading Translation Models...")
        await run_in_threadpool(translation_service._load, "vi-en")
        print("       ✅ Translation VI→EN loaded!")
        
        await run_in_threadpool(translation_service._load, "en-vi")
        print("       ✅ Translation EN→VI loaded!")
        
    except Exception as e:
        print(f"       ❌ Translation Error: {e}")
    
    try:
        # 4. Preload Diarization (Speaker detection)
        print("\n👥 [4/5] Loading Diarization (Speaker Detection)...")
        await run_in_threadpool(diarization_service._load)
        print("       ✅ Diarization model loaded!")
        
    except Exception as e:
        print(f"       ⚠️  Diarization Error: {e}")
    
    try:
        # 5. Preload Summarization
        print("\n📝 [5/5] Loading Summarization Model...")
        await run_in_threadpool(summarization_service._load)
        print("       ✅ Summarization model loaded!")
        
    except Exception as e:
        print(f"       ⚠️  Summarization Error: {e}")
    
    print("\n" + "=" * 80)
    print("✨ All models preloaded in RAM. API ready for inference!")
    print("=" * 80 + "\n")


# ============================================================================


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


@app.get("/health/stt", response_model=STTHealthResponse)
async def stt_health() -> STTHealthResponse:
    ok, error, language, sample_text = await run_in_threadpool(stt_service.smoke_test)
    return STTHealthResponse(
        ok=ok,
        model_path=str(settings.stt_model_dir),
        compute_type=settings.stt_compute_type,
        language_detected=language,
        sample_text_transcribed=sample_text,
        error=error,
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


@app.post("/api/transcribe-with-speakers", response_model=TranscribeWithSpeakersResponse)
async def transcribe_with_speakers(
    file: Annotated[UploadFile, File(...)],
    language: Annotated[str, Query(description="Language hint for faster-whisper.")] = "vi",
) -> TranscribeWithSpeakersResponse:
    """Transcribe audio with speaker identification (diarization).
    
    If 2 or more speakers detected, output shows: SPEAKER_00: text, SPEAKER_01: text, etc.
    """
    try:
        print(f"\n{'='*80}")
        print(f"[API] /api/transcribe-with-speakers request")
        print(f"[API] File: {file.filename}, Language: {language}")
        print(f"{'='*80}")
        
        uploaded_path = await save_uploaded_audio(file)
        print(f"[API] Audio uploaded to: {uploaded_path}")
        
        normalized_path = await run_in_threadpool(normalize_audio, Path(uploaded_path))
        print(f"[API] Audio normalized")
        
        # Transcribe
        print(f"\n[API] STEP 1: Speech-to-Text (STT)")
        transcript = await run_in_threadpool(stt_service.transcribe, normalized_path, language)
        print(f"[API] STT completed - {len(transcript.text)} chars")
        warnings: list[str] = []
        num_speakers = 1
        
        # Diarize (speaker identification)
        print(f"\n[API] STEP 2: Speaker Detection (Diarization)")
        try:
            diarization = await run_in_threadpool(diarization_service.diarize, normalized_path)
            transcript_with_speakers = transcript.model_copy(
                update={"segments": attach_speakers(transcript.segments, diarization.segments)}
            )
            # Count unique speakers
            unique_speakers = set(seg.speaker for seg in transcript_with_speakers.segments if seg.speaker)
            num_speakers = len(unique_speakers)
            print(f"[API] Diarization detected {num_speakers} speakers")
        except Exception as e:
            print(f"[API] Diarization error: {e}")
            transcript_with_speakers = transcript
            warnings.append(f"Diarization failed: {str(e)}")
            num_speakers = 1
        
        # Format merged text with speakers
        print(f"\n[API] STEP 3: Formatting output")
        merged_text = format_merged_transcript(transcript_with_speakers.segments)
        
        print(f"\n[API] FINAL OUTPUT:")
        print(f"  Speakers: {num_speakers}")
        print(f"  Segments: {len(transcript_with_speakers.segments)}")
        print(f"  Text length: {len(merged_text)} chars")
        print(f"{'='*80}\n")
        
        return TranscribeWithSpeakersResponse(
            language=transcript.language,
            language_probability=transcript.language_probability,
            num_speakers=num_speakers,
            segments=transcript_with_speakers.segments,
            merged_text=merged_text,
            warnings=warnings,
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[API] ERROR: {exc}")
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
