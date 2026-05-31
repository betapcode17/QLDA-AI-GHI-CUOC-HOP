from __future__ import annotations

import asyncio
import gc
import json
import os
import sys
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import torch
import logging

from app.config import PROJECT_ROOT, settings
from app.schemas import (
    AnnotationAudioItem,
    AnnotationDocument,
    DiarizationResponse,
    HealthResponse,
    LLMHealthResponse,
    LLMTestRequest,
    MeetingQARequest,
    MeetingQAResponse,
    MeetingRagIndexRequest,
    MeetingRagIndexResponse,
    MeetingRagQARequest,
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
from app.services.annotation import (
    audio_dir as annotation_audio_dir,
    export_all_rttm,
    export_rttm_from_payload,
    list_audio_items,
    save_template,
    template_for_audio,
)
from app.services.diarization import attach_speakers, diarization_service
from app.services.gpu_memory import release_cuda_memory
from app.services.llm_service import llm_service
from app.services.model_status import get_model_statuses
from app.services.pipeline import format_merged_transcript, process_meeting_audio
from app.services.stt import stt_service
from app.services.summarization import summarization_service
from app.services.translation import translation_service
from app.services.vector_store import COLLECTION_NAME, vector_store


def configure_console_encoding() -> None:
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace") # type: ignore
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")# type: ignore
    except Exception:
        pass


configure_console_encoding()

logger = logging.getLogger(__name__)


def cleanup_temporary_gpu_memory() -> None:
    release_cuda_memory()


def release_inference_models() -> None:
    stt_service.unload()
    diarization_service.unload()


app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=PROJECT_ROOT / "app" / "static"), name="static")


# ============================================================================
# STARTUP: Warm up core models when the API boots
# ============================================================================

@app.on_event("startup")
async def startup_preload_models():
    """Warm up the STT model on startup and preload diarization when allowed.

    STT is the core user-facing model, so loading it during startup avoids the
    first-request penalty. Diarization remains optional because it is the most
    memory-hungry part of the pipeline.
    """
    print("\n" + "=" * 80)
    print("STARTUP: Model warmup policy")
    print(f"[STARTUP][DEBUG] torch.cuda.is_available(): {torch.cuda.is_available()}")
    print(f"[STARTUP][DEBUG] torch.version.cuda: {getattr(getattr(torch, 'version', None), 'cuda', None)}")
    print(f"[STARTUP][DEBUG] torch build: {torch.__version__}")
    print(f"[STARTUP][DEBUG] STT resolved device: {settings.resolved_stt_device}")
    print(f"[STARTUP][DEBUG] STT compute type: {settings.resolved_stt_compute_type}")
    print(f"[STARTUP][DEBUG] diarization device: {settings.diarization_device}")
    if not torch.cuda.is_available():
        print("[STARTUP][WARN] PyTorch is CPU-only or CUDA is unavailable. STT will run on CPU.")
    print(f"[STARTUP][DEBUG] low_vram_mode: {settings.low_vram_mode}")
    print(f"[STARTUP][DEBUG] preload_models: {settings.preload_models}")
    print("=" * 80)

    stt_loaded = False
    try:
        print("\n [1/2] Loading Speech-to-Text (PhoWhisper)...")
        await run_in_threadpool(stt_service._load)
        print("       [OK] STT model loaded successfully!")
        stt_loaded = True
    except Exception as e:
        print(f"       [ERROR] STT Error: {e}")
        cleanup_temporary_gpu_memory()
        raise RuntimeError("Failed to preload the STT model during server startup.") from e

    if settings.preload_models and not settings.low_vram_mode:
        try:
            print("\n[2/2] Loading Diarization (Speaker Detection)...")
            await run_in_threadpool(diarization_service._load)
            print("       [OK] Diarization model loaded!")
        except Exception as e:
            print(f"       [WARN] Diarization Error: {e}")
    elif settings.low_vram_mode:
        print("[STARTUP] Skipping diarization preload because low_vram_mode is enabled.")
    else:
        print("[STARTUP] Skipping diarization preload because preload_models is disabled.")
    
    cleanup_temporary_gpu_memory()
    print("\n" + "=" * 80)
    if stt_loaded:
        print("STT warmup complete. API ready for inference!")
    print("=" * 80 + "\n")


@app.on_event("startup")
async def startup_create_locks():
    app.state.inference_lock = asyncio.Lock()


# ============================================================================


async def save_uploaded_audio(file: UploadFile) -> str:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    return str(save_upload_bytes(data, file.filename or "audio"))


async def transcribe_audio_core(
    file: UploadFile,
    language: str,
    include_speakers: bool = False,
    expected_speakers: int | None = None,
) -> tuple[TranscriptionResponse, DiarizationResponse | None, int, int, list[str]]:
    warnings: list[str] = []
    try:
        uploaded_path = await save_uploaded_audio(file)
        normalized_path = await run_in_threadpool(normalize_audio, Path(uploaded_path))
        transcript = await run_in_threadpool(stt_service.transcribe, normalized_path, language)

        diarization: DiarizationResponse | None = None
        detected_speakers = 0
        num_speakers = 0
        if include_speakers:
            try:
                print(
                    f"[API][DEBUG] Speaker mode enabled | expected_speakers={expected_speakers or 'auto'} | "
                    f"stt_device={settings.resolved_stt_device} | diarization_device={settings.diarization_device}"
                )
                if settings.resolved_stt_device == "cuda" and settings.diarization_device == "cuda":
                    print("[API][DEBUG] Releasing STT GPU memory before diarization to maximize available VRAM.")
                    stt_service.unload()
                    cleanup_temporary_gpu_memory()

                diarization = await run_in_threadpool(diarization_service.diarize, normalized_path, expected_speakers)
                detected_speakers = len({segment.speaker for segment in diarization.segments if segment.speaker})
                transcript = transcript.model_copy(
                    update={"segments": attach_speakers(transcript.segments, diarization.segments)}
                )
                num_speakers = len({segment.speaker for segment in transcript.segments if segment.speaker})
                if detected_speakers and num_speakers != detected_speakers:
                    warnings.append(
                        f"Diarization detected {detected_speakers} speakers, but transcript assignment resolved to {num_speakers}."
                    )
                if num_speakers <= 1:
                    warnings.append(
                        "Khong tach duoc nhieu nguoi noi: diarization chi phat hien mot speaker."
                        if num_speakers == 1
                        else "Khong tach duoc nhieu nguoi noi: diarization khong phat hien speaker ro rang."
                    )
            except Exception as exc:
                warnings.append(f"Diarization failed: {exc}")
                detected_speakers = 0
                num_speakers = 0

        return transcript, diarization, detected_speakers, num_speakers, warnings
    finally:
        cleanup_temporary_gpu_memory()
        release_inference_models()


def to_http_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=500, detail=str(exc))


@app.get("/", include_in_schema=False)
def web_app() -> FileResponse:
    return FileResponse(PROJECT_ROOT / "app" / "static" / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(PROJECT_ROOT / "app" / "static" / "favicon.svg")


@app.get("/annotate", include_in_schema=False)
def annotate_page() -> FileResponse:
    return FileResponse(PROJECT_ROOT / "app" / "static" / "annotate.html")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", device=settings.model_device, models=get_model_statuses())


@app.get("/health/llm", response_model=LLMHealthResponse)
async def llm_health() -> LLMHealthResponse:
    logger.info("LLM health check requested | model=%s base_url=%s", llm_service.config.model, llm_service.config.base_url)
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
    logger.info("LLM debug test | model=%s base_url=%s transcript_len=%d", llm_service.config.model, llm_service.config.base_url, len(payload.transcript or ""))
    result = await run_in_threadpool(llm_service.smoke_test, payload.transcript)
    return LLMHealthResponse(
        ok=result.error is None,
        model=llm_service.config.model,
        base_url=llm_service.config.base_url,
        result=result,
        error=result.error,
    )


@app.post("/api/meeting-qa", response_model=MeetingQAResponse)
async def meeting_qa(payload: MeetingQARequest) -> MeetingQAResponse:
    try:
        logger.info(
            "Meeting QA request | model=%s base_url=%s question_len=%d transcript_len=%d",
            llm_service.config.model,
            llm_service.config.base_url,
            len(payload.question or ""),
            len(payload.transcript or ""),
        )
        answer = await run_in_threadpool(
            llm_service.answer_question,
            payload.transcript,
            payload.question,
        )
        return MeetingQAResponse(
            ok=True,
            model=llm_service.config.model,
            base_url=llm_service.config.base_url,
            question=payload.question,
            answer=answer,
        )
    except Exception as exc:
        logger.exception("Meeting QA failed")
        return MeetingQAResponse(
            ok=False,
            model=llm_service.config.model,
            base_url=llm_service.config.base_url,
            question=payload.question,
            error=str(exc),
        )


@app.post("/api/meeting-rag/index", response_model=MeetingRagIndexResponse)
async def meeting_rag_index(payload: MeetingRagIndexRequest) -> MeetingRagIndexResponse:
    try:
        count = await run_in_threadpool(
            vector_store.index_meeting,
            payload.meeting_id,
            payload.transcript,
        )
        return MeetingRagIndexResponse(
            ok=True,
            meeting_id=payload.meeting_id,
            chunks_indexed=count,
            collection=COLLECTION_NAME,
            embedding_model=settings.ollama_embed_model,
        )
    except Exception as exc:
        return MeetingRagIndexResponse(
            ok=False,
            meeting_id=payload.meeting_id,
            collection=COLLECTION_NAME,
            embedding_model=settings.ollama_embed_model,
            error=str(exc),
        )


@app.post("/api/meeting-rag/ask", response_model=MeetingQAResponse)
async def meeting_rag_ask(payload: MeetingRagQARequest) -> MeetingQAResponse:
    try:
        chunks = await run_in_threadpool(
            vector_store.query,
            payload.meeting_id,
            payload.question,
            payload.top_k,
        )
        if not chunks and payload.transcript:
            await run_in_threadpool(vector_store.index_meeting, payload.meeting_id, payload.transcript)
            chunks = await run_in_threadpool(
                vector_store.query,
                payload.meeting_id,
                payload.question,
                payload.top_k,
            )

        context = "\n\n".join(
            f"[Chunk {chunk.metadata.get('chunk_index')} | distance={chunk.distance}]\n{chunk.text}"
            for chunk in chunks
        )
        if not context.strip():
            context = payload.transcript or ""

        answer = await run_in_threadpool(
            llm_service.answer_question,
            context,
            payload.question,
        )
        return MeetingQAResponse(
            ok=True,
            model=llm_service.config.model,
            base_url=llm_service.config.base_url,
            question=payload.question,
            answer=answer,
            chunks=[
                {
                    "text": chunk.text,
                    "metadata": chunk.metadata,
                    "distance": chunk.distance,
                }
                for chunk in chunks
            ],
        )
    except Exception as exc:
        return MeetingQAResponse(
            ok=False,
            model=llm_service.config.model,
            base_url=llm_service.config.base_url,
            question=payload.question,
            error=str(exc),
        )


@app.get("/models/status")
def models_status():
    return {"models": get_model_statuses()}


@app.get("/api/annotations/audio-files", response_model=list[AnnotationAudioItem])
def annotation_audio_files() -> list[AnnotationAudioItem]:
    return [AnnotationAudioItem.model_validate(item) for item in list_audio_items()]


@app.get("/api/annotations/audio/{stem}", include_in_schema=False)
def annotation_audio(stem: str) -> FileResponse:
    audio_path = annotation_audio_dir() / f"{stem}.wav"
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail=f"Audio not found: {stem}")
    return FileResponse(audio_path)


@app.get("/api/annotations/{stem}", response_model=AnnotationDocument)
def get_annotation(stem: str) -> AnnotationDocument:
    return AnnotationDocument.model_validate(template_for_audio(stem))


@app.put("/api/annotations/{stem}", response_model=AnnotationDocument)
def put_annotation(stem: str, payload: AnnotationDocument) -> AnnotationDocument:
    saved_path = save_template(stem, payload.model_dump())
    return AnnotationDocument.model_validate_json(saved_path.read_text(encoding="utf-8"))


@app.post("/api/annotations/{stem}/export", response_model=dict)
def export_annotation(stem: str) -> dict:
    output_path = export_rttm_from_payload(stem, template_for_audio(stem))
    return {"ok": True, "rttm": str(output_path)}


@app.post("/api/annotations/export-all", response_model=dict)
def export_all_annotations() -> dict:
    outputs = export_all_rttm()
    return {"ok": True, "count": len(outputs), "outputs": [str(path) for path in outputs]}


@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: Annotated[UploadFile, File(...)],
    language: Annotated[str, Query(description="Language hint for faster-whisper.")] = "vi",
    include_speakers: Annotated[
        bool,
        Query(description="Attach diarization speaker labels to each transcript segment."),
    ] = False,
) -> TranscriptionResponse:
    transcript: TranscriptionResponse | None = None
    try:
        async with app.state.inference_lock:
            print(f"[API][DEBUG] /api/transcribe requested: file={file.filename}, language={language}")
            print(f"[API][DEBUG] STT resolved device: {settings.resolved_stt_device}")
            print(f"[API][DEBUG] STT compute type: {settings.resolved_stt_compute_type}")
            transcript, diarization, detected_speakers, num_speakers, warnings = await transcribe_audio_core(file, language, include_speakers)
        if include_speakers:
            return transcript.model_copy(
                update={
                    "detected_speakers": detected_speakers,
                    "assigned_speakers": num_speakers,
                    "num_speakers": num_speakers,
                    "diarization": diarization,
                    "warnings": warnings,
                }
            )
        return transcript
    except HTTPException:
        raise
    except Exception as exc:
        import traceback
        print(f"[API][ERROR] Transcription failed: {exc}")
        print(traceback.format_exc())
        raise to_http_error(exc) from exc
    finally:
        cleanup_temporary_gpu_memory()
        release_inference_models()


@app.post("/api/transcribe-with-speakers", response_model=TranscribeWithSpeakersResponse)
async def transcribe_with_speakers(
    file: Annotated[UploadFile, File(...)],
    language: Annotated[str, Query(description="Language hint for faster-whisper.")] = "vi",
    expected_speakers: Annotated[
        int | None,
        Query(description="Expected number of participants in the meeting."),
    ] = None,
) -> TranscribeWithSpeakersResponse:
    """Transcribe audio with speaker identification (diarization).
    
    If 2 or more speakers detected, output shows: SPEAKER_00: text, SPEAKER_01: text, etc.
    """
    try:
        async with app.state.inference_lock:
            print(f"\n{'='*80}")
            print(f"[API] /api/transcribe-with-speakers request")
            print(f"[API] File: {file.filename}, Language: {language}")
            print(f"[API][DEBUG] expected_speakers: {expected_speakers or 'auto'}")
            print(f"[API][DEBUG] STT resolved device: {settings.resolved_stt_device}")
            print(f"[API][DEBUG] STT compute type: {settings.resolved_stt_compute_type}")
            print(f"{'='*80}")
            
            transcript, diarization, detected_speakers, num_speakers, warnings = await transcribe_audio_core(
                file,
                language,
                True,
                expected_speakers,
            )
        print(f"[API] STT completed - {len(transcript.text)} chars")
        transcript_with_speakers = transcript

        print(f"\n[API] STEP 3: Formatting output")
        merged_text = format_merged_transcript(transcript_with_speakers.segments)
        
        print(f"\n[API] FINAL OUTPUT:")
        print(f"  Detected speakers: {detected_speakers}")
        print(f"  Assigned speakers: {num_speakers}")
        print(f"  Segments: {len(transcript_with_speakers.segments)}")
        print(f"  Text length: {len(merged_text)} chars")
        print(f"{'='*80}\n")
        
        return TranscribeWithSpeakersResponse(
            language=transcript.language,
            language_probability=transcript.language_probability,
            detected_speakers=detected_speakers,
            assigned_speakers=num_speakers,
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
    finally:
        cleanup_temporary_gpu_memory()


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
    finally:
        cleanup_temporary_gpu_memory()
        release_inference_models()


@app.post("/api/process", response_model=ProcessResponse)
async def process_audio(
    file: Annotated[UploadFile, File(...)],
    language: str = "vi",
    include_diarization: bool = True,
    expected_speakers: int | None = None,
    translate_to: Literal["vi-en", "en-vi"] | None = None,
    include_summary: bool = True,
    include_llm: bool = True,
) -> ProcessResponse:
    try:
        print(
            f"[API] /api/process request | file={file.filename} | language={language} | "
            f"include_diarization={include_diarization} | expected_speakers={expected_speakers or 'auto'} | "
            f"translate_to={translate_to or 'none'} | include_summary={include_summary} | include_llm={include_llm}"
        )
        uploaded_path = await save_uploaded_audio(file)
        return await run_in_threadpool(
            process_meeting_audio,
            Path(uploaded_path),
            language,
            include_diarization,
            expected_speakers,
            translate_to,
            include_summary,
            include_llm,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise to_http_error(exc) from exc
    finally:
        cleanup_temporary_gpu_memory()
        release_inference_models()


def sse_message(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@app.post("/api/process-stream")
async def process_audio_stream(
    file: Annotated[UploadFile, File(...)],
    language: str = "vi",
    include_diarization: bool = True,
    expected_speakers: int | None = None,
    translate_to: Literal["vi-en", "en-vi"] | None = None,
    include_summary: bool = False,
    include_llm: bool = False,
):
    async def event_generator():
        queue: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def emit(event: str, data: dict) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, (event, data))

        try:
            yield sse_message("status", {"stage": "upload", "message": "Saving uploaded audio"})
            uploaded_path = await save_uploaded_audio(file)

            async with app.state.inference_lock:
                task = asyncio.create_task(
                    run_in_threadpool(
                        process_meeting_audio,
                        Path(uploaded_path),
                        language,
                        include_diarization,
                        expected_speakers,
                        translate_to,
                        include_summary,
                        include_llm,
                        emit,
                    )
                )

                while True:
                    if task.done() and queue.empty():
                        break
                    try:
                        event, data = await asyncio.wait_for(queue.get(), timeout=0.25)
                        yield sse_message(event, data)
                    except asyncio.TimeoutError:
                        continue

                await task
        except Exception as exc:
            yield sse_message("error", {"message": str(exc)})
        finally:
            cleanup_temporary_gpu_memory()
            release_inference_models()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
    finally:
        cleanup_temporary_gpu_memory()
        release_inference_models()


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
    finally:
        cleanup_temporary_gpu_memory()
        release_inference_models()
