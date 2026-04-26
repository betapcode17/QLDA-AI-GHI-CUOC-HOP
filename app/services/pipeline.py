from __future__ import annotations

from pathlib import Path

from app.schemas import ProcessResponse
from app.services.audio import normalize_audio
from app.services.diarization import attach_speakers, diarization_service
from app.services.llm_service import llm_service
from app.services.stt import stt_service
from app.services.summarization import summarization_service
from app.services.text_quality import LOW_INFORMATION_SUMMARY, is_low_information_transcript
from app.services.translation import Direction, translation_service


def format_merged_transcript(segments) -> str:
    lines: list[str] = []
    for segment in segments:
        speaker = segment.speaker or "UNKNOWN_SPEAKER"
        lines.append(f"{speaker} [{segment.start:.2f}s-{segment.end:.2f}s]: {segment.text}")
    return "\n".join(lines)


def process_meeting_audio(
    input_audio_path: Path,
    language: str | None = "vi",
    include_diarization: bool = True,
    translate_to: Direction | None = None,
    include_summary: bool = True,
    include_llm: bool = True,
) -> ProcessResponse:
    warnings: list[str] = []
    normalized_audio = normalize_audio(input_audio_path)
    transcript = stt_service.transcribe(normalized_audio, language=language)
    low_information = is_low_information_transcript(transcript.text)

    diarization = None
    if include_diarization:
        try:
            diarization = diarization_service.diarize(normalized_audio)
            transcript = transcript.model_copy(
                update={"segments": attach_speakers(transcript.segments, diarization.segments)}
            )
        except Exception as exc:
            warnings.append(f"Diarization failed: {exc}")

    merged_transcript = format_merged_transcript(transcript.segments)
    translated_transcript = None
    if translate_to is not None and transcript.text.strip() and not low_information:
        try:
            translated_transcript = translation_service.translate(transcript.text, translate_to)
        except Exception as exc:
            warnings.append(f"Translation failed: {exc}")
    elif translate_to is not None and low_information:
        warnings.append("Translation skipped because the recording only contains a microphone check.")

    summary = None
    translated_summary = None
    if include_summary and transcript.text.strip():
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
        language_hint = (language or "").lower()
        llm_existing_summary = summary if language_hint.startswith("vi") else translated_summary or summary
        llm = llm_service.refine_meeting(
            merged_transcript=merged_transcript,
            existing_summary=llm_existing_summary,
            translated_transcript=None if language_hint.startswith("vi") else translated_transcript,
        )
        if llm.error:
            warnings.append(f"LLM refinement failed: {llm.error}")

    return ProcessResponse(
        transcript=transcript,
        diarization=diarization,
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
