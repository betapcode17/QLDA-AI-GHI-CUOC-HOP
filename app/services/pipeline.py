from __future__ import annotations

from pathlib import Path

from app.config import settings
from app.schemas import ProcessResponse, TranscriptionResponse
from app.services.audio import normalize_audio, extract_segment_to_file
from app.services.diarization import diarization_service
from app.services.gpu_memory import log_cuda_memory, release_cuda_memory
from app.services.llm_service import llm_service
from app.services.stt import stt_service
from app.services.summarization import summarization_service
from app.services.text_quality import LOW_INFORMATION_SUMMARY, is_low_information_transcript
from app.services.translation import Direction, translation_service


def compact_diarization_segments(segments):
    if not segments:
        return []

    ordered = sorted(segments, key=lambda item: (float(item.start), float(item.end)))
    compacted = []
    for segment in ordered:
        duration = float(segment.end) - float(segment.start)
        if duration < settings.stt_min_segment_seconds:
            continue

        if compacted:
            previous = compacted[-1]
            gap = float(segment.start) - float(previous.end)
            if previous.speaker == segment.speaker and gap <= settings.diarization_merge_gap_seconds:
                compacted[-1] = previous.model_copy(update={"end": segment.end})
                continue

        compacted.append(segment)

    return compacted or ordered


def format_merged_transcript(segments) -> str:
    lines: list[str] = []
    for segment in segments:
        speaker = segment.speaker or "UNKNOWN_SPEAKER"
        lines.append(f"{speaker} [{segment.start:.2f}s-{segment.end:.2f}s]: {segment.text}")
    return "\n".join(lines)


def emit_stream_event(callback, event: str, data: dict) -> None:
    if callback is not None:
        callback(event, data)


def process_meeting_audio(
    input_audio_path: Path,
    language: str | None = "vi",
    include_diarization: bool = True,
    expected_speakers: int | None = None,
    translate_to: Direction | None = None,
    include_summary: bool = True,
    include_llm: bool = True,
    stream_callback=None,
) -> ProcessResponse:
    warnings: list[str] = []
    print(
        f"[PIPELINE] start | input={input_audio_path.name} | language={language} | "
        f"include_diarization={include_diarization} | expected_speakers={expected_speakers or 'auto'} | "
        f"translate_to={translate_to or 'none'} | include_summary={include_summary} | include_llm={include_llm}"
    )
    emit_stream_event(stream_callback, "status", {"stage": "normalizing", "message": "Normalizing audio"})
    normalized_audio = normalize_audio(input_audio_path)
    print(f"[PIPELINE] normalized_audio={normalized_audio.name}")
    log_cuda_memory("pipeline start")

    diarization = None
    transcript = None
    low_information = False

    # Run diarization first when requested so we can transcribe per-speaker segments.
    if include_diarization:
        try:
            print(f"[PIPELINE] running diarization | expected_speakers={expected_speakers or 'auto'}")
            emit_stream_event(stream_callback, "status", {"stage": "diarization", "message": "Detecting speakers"})
            stt_service.unload()
            release_cuda_memory("before diarization")
            diarization = diarization_service.diarize(normalized_audio, expected_speakers=expected_speakers)
            print(f"[PIPELINE] diarization segments={len(diarization.segments) if diarization else 0}")
            emit_stream_event(
                stream_callback,
                "diarization",
                {"segments": [segment.model_dump() for segment in diarization.segments] if diarization else []},
            )
        except Exception as exc:
            warnings.append(f"Diarization failed: {exc}")
            print(f"[PIPELINE][ERROR] diarization failed: {exc}")

    # If diarization produced segments, transcribe each segment separately.
    if diarization and diarization.segments:
        print("[PIPELINE] Transcribing per-diarization segments")
        diarization_segments = compact_diarization_segments(diarization.segments)
        if len(diarization_segments) != len(diarization.segments):
            print(
                f"[PIPELINE] compacted diarization segments {len(diarization.segments)} -> {len(diarization_segments)} "
                f"(min_segment={settings.stt_min_segment_seconds}s, merge_gap={settings.diarization_merge_gap_seconds}s)"
            )
        all_segments = []
        text_parts: list[str] = []
        next_id = 0
        temporary_segment_paths: list[Path] = []

        # Free diarization VRAM before loading STT model
        try:
            diarization_service.unload()
        except Exception:
            pass
        release_cuda_memory("before per-segment STT")

        try:
            for d in diarization_segments:
                try:
                    seg_path = extract_segment_to_file(Path(normalized_audio), float(d.start), float(d.end))
                    temporary_segment_paths.append(seg_path)
                except Exception as e:
                    warnings.append(f"Segment extraction failed for {d}: {e}")
                    print(f"[PIPELINE][WARN] segment extraction failed | speaker={d.speaker} | start={d.start} | end={d.end} | error={e}")
                    continue

                try:
                    print(f"[PIPELINE] STT segment | speaker={d.speaker} | start={d.start} | end={d.end} | file={seg_path.name}")
                    emit_stream_event(
                        stream_callback,
                        "status",
                        {
                            "stage": "stt",
                            "message": f"Transcribing {d.speaker}",
                            "speaker": d.speaker,
                            "start": d.start,
                            "end": d.end,
                        },
                    )
                    resp = stt_service.transcribe(seg_path, language=language)
                except Exception as e:
                    warnings.append(f"STT failed for segment {d}: {e}")
                    print(f"[PIPELINE][ERROR] STT failed | speaker={d.speaker} | error={e}")
                    continue

                # Offset returned transcript segments by segment start and attach speaker
                for s in resp.segments:
                    adjusted = s.model_copy(update={
                        "start": round(s.start + float(d.start), 3),
                        "end": round(s.end + float(d.start), 3),
                        "speaker": d.speaker,
                        "id": next_id,
                    })
                    all_segments.append(adjusted)
                    emit_stream_event(stream_callback, "transcript_segment", adjusted.model_dump())
                    next_id += 1

                if resp.text and resp.text.strip():
                    text_parts.append(resp.text.strip())
        finally:
            for seg_path in temporary_segment_paths:
                try:
                    seg_path.unlink(missing_ok=True)
                except Exception:
                    pass

        # Unload STT model to free VRAM after per-segment transcription
        try:
            stt_service.unload()
        except Exception:
            pass
        release_cuda_memory("after per-segment STT")

        merged_transcript = " \n".join(text_parts).strip()
        transcript = TranscriptionResponse(
            language=language or "vi",
            language_probability=None,
            segments=all_segments,
            text=merged_transcript or "",
            num_speakers=len({s.speaker for s in all_segments if s.speaker}),
            diarization=diarization,
            warnings=[],
        )
        low_information = is_low_information_transcript(transcript.text)
        print(f"[PIPELINE] per-segment transcript segments={len(transcript.segments)} | speakers={transcript.num_speakers}")
    else:
        # No diarization — single-file STT
        try:
            print("[PIPELINE] no diarization segments; running whole-file STT")
            emit_stream_event(stream_callback, "status", {"stage": "stt", "message": "Transcribing audio"})
            diarization_service.unload()
            release_cuda_memory("before whole-file STT")
            transcript = stt_service.transcribe(normalized_audio, language=language)
            for segment in transcript.segments:
                emit_stream_event(stream_callback, "transcript_segment", segment.model_dump())
            low_information = is_low_information_transcript(transcript.text)
        except Exception as e:
            warnings.append(f"STT failed: {e}")
            print(f"[PIPELINE][ERROR] whole-file STT failed: {e}")
            transcript = TranscriptionResponse(language=language or "vi", language_probability=None, segments=[], text="", warnings=[str(e)])

    if settings.low_vram_mode:
        stt_service.unload()
        release_cuda_memory("before post-STT NLP")

    merged_transcript = format_merged_transcript(transcript.segments)
    detected_speakers = len({segment.speaker for segment in diarization.segments if segment.speaker}) if diarization and diarization.segments else 0
    assigned_speakers = len({segment.speaker for segment in transcript.segments if segment.speaker})

    if expected_speakers is not None and expected_speakers > 0 and detected_speakers and detected_speakers != expected_speakers:
        warnings.append(
            f"Diarization expected about {expected_speakers} speakers, but detected {detected_speakers}."
        )
        print(
            f"[PIPELINE][WARN] expected_speakers mismatch | expected={expected_speakers} | detected={detected_speakers}"
        )
    translated_transcript = None
    if translate_to is not None and transcript.text.strip() and not low_information:
        emit_stream_event(stream_callback, "status", {"stage": "translation", "message": "Translating transcript"})
        try:
            translated_transcript = translation_service.translate(transcript.text, translate_to)
        except Exception as exc:
            warnings.append(f"Translation failed: {exc}")
    elif translate_to is not None and low_information:
        warnings.append("Translation skipped because the recording only contains a microphone check.")

    summary = None
    translated_summary = None
    if include_summary and transcript.text.strip():
        emit_stream_event(stream_callback, "status", {"stage": "summary", "message": "Generating summary"})
        try:
            language_hint = (language or "").lower()
            if low_information:
                summary = LOW_INFORMATION_SUMMARY
            elif language_hint.startswith("vi"):
                summary = summarization_service.summarize_extractive(merged_transcript or transcript.text)
            else:
                summary = summarization_service.summarize(transcript.text)
            if summary and not low_information and (translate_to == "en-vi" or (language_hint.startswith("vi") and translate_to is None)):
                translated_summary = translation_service.translate(summary, "en-vi")
        except Exception as exc:
            warnings.append(f"Summary failed: {exc}")

    llm = None
    if include_llm and merged_transcript.strip() and not low_information:
        emit_stream_event(stream_callback, "status", {"stage": "llm", "message": "Running LLM refinement"})
        language_hint = (language or "").lower()
        llm_existing_summary = summary if language_hint.startswith("vi") else translated_summary or summary
        llm = llm_service.refine_meeting(
            merged_transcript=merged_transcript,
            existing_summary=llm_existing_summary,
            translated_transcript=None if language_hint.startswith("vi") else translated_transcript,
        )
        if llm.error:
            warnings.append(f"LLM refinement failed: {llm.error}")
            print(f"[PIPELINE][WARN] LLM refinement failed: {llm.error}")

    print(
        f"[PIPELINE] done | detected_speakers={detected_speakers} | assigned_speakers={assigned_speakers} | "
        f"segments={len(transcript.segments)} | warnings={len(warnings)}"
    )
    if settings.low_vram_mode:
        stt_service.unload()
        diarization_service.unload()
        release_cuda_memory("pipeline done")

    response = ProcessResponse(
        transcript=transcript,
        diarization=diarization,
        detected_speakers=detected_speakers,
        assigned_speakers=assigned_speakers,
        num_speakers=assigned_speakers,
        expected_speakers=expected_speakers,
        merged_transcript=merged_transcript,
        translated_transcript=translated_transcript,
        translated_text=translated_transcript,
        summary=summary,
        translated_summary=translated_summary,
        llm=llm,
        llm_summary=llm.summary if llm else None,
        action_items=llm.action_items if llm else [],
        meeting_minutes=llm.meeting_minutes if llm else None,
        risks_or_blockers=llm.risks_or_blockers if llm else [],
        decisions=llm.decisions if llm else [],
        normalized_audio_path=str(normalized_audio),
        warnings=warnings,
    )
    emit_stream_event(stream_callback, "done", response.model_dump())
    return response
