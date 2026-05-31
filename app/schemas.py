from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ModelStatus(BaseModel):
    name: str
    path: str
    available: bool
    detail: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
    device: str
    models: list[ModelStatus]


class TranscriptSegment(BaseModel):
    id: int
    start: float
    end: float
    text: str
    speaker: str | None = None


class DiarizationSegment(BaseModel):
    start: float
    end: float
    speaker: str


class TranscriptionResponse(BaseModel):
    language: str | None = None
    language_probability: float | None = None
    segments: list[TranscriptSegment]
    text: str
    num_speakers: int | None = None
    diarization: DiarizationResponse | None = None
    warnings: list[str] = Field(default_factory=list)


class DiarizationResponse(BaseModel):
    segments: list[DiarizationSegment]


class AnnotationSegment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    speaker: str = Field(min_length=1)


class AnnotationDocument(BaseModel):
    uri: str
    audio: str
    duration: float = Field(ge=0)
    sample_rate: int = Field(gt=0)
    speakers: list[str] = Field(default_factory=lambda: ["SPEAKER_00", "SPEAKER_01"])
    segments: list[AnnotationSegment] = Field(default_factory=list)


class AnnotationAudioItem(BaseModel):
    uri: str
    audio: str
    duration: float
    annotated: bool = False
    segments: int = 0


class TranscribeWithSpeakersResponse(BaseModel):
    """Transcription with speaker identification"""
    language: str | None = None
    language_probability: float | None = None
    detected_speakers: int = 0
    assigned_speakers: int = 0
    num_speakers: int
    segments: list[TranscriptSegment]
    merged_text: str
    warnings: list[str] = Field(default_factory=list)


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1)
    direction: Literal["vi-en", "en-vi"] = "vi-en"
    max_new_tokens: int = Field(default=256, ge=1, le=1024)


class TranslateResponse(BaseModel):
    direction: Literal["vi-en", "en-vi"]
    text: str
    translated_text: str


class SummaryRequest(BaseModel):
    text: str = Field(min_length=1)
    max_new_tokens: int = Field(default=160, ge=1, le=512)
    min_new_tokens: int = Field(default=24, ge=1, le=256)


class SummaryResponse(BaseModel):
    text: str
    summary: str


class ActionItem(BaseModel):
    task: str
    assignee: str | None = None
    deadline: str | None = None


class LLMRefinement(BaseModel):
    summary: str | None = None
    action_items: list[ActionItem] = Field(default_factory=list)
    meeting_minutes: str | None = None
    risks_or_blockers: list[str] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)
    raw_text: str | None = None
    parsed_json: bool = False
    error: str | None = None


class LLMTestRequest(BaseModel):
    transcript: str | None = None


class MeetingQARequest(BaseModel):
    transcript: str = Field(min_length=1)
    question: str = Field(min_length=1)


class MeetingQAResponse(BaseModel):
    ok: bool
    model: str
    base_url: str
    question: str
    answer: str | None = None
    chunks: list[dict] = Field(default_factory=list)
    error: str | None = None


class MeetingRagIndexRequest(BaseModel):
    meeting_id: str = Field(min_length=1)
    transcript: str = Field(min_length=1)


class MeetingRagIndexResponse(BaseModel):
    ok: bool
    meeting_id: str
    chunks_indexed: int = 0
    collection: str
    embedding_model: str
    error: str | None = None


class MeetingRagQARequest(BaseModel):
    meeting_id: str = Field(min_length=1)
    question: str = Field(min_length=1)
    transcript: str | None = None
    top_k: int = Field(default=5, ge=1, le=12)


class LLMHealthResponse(BaseModel):
    ok: bool
    model: str
    base_url: str
    result: LLMRefinement | None = None
    error: str | None = None


class STTHealthResponse(BaseModel):
    ok: bool
    model_path: str
    compute_type: str
    language_detected: str | None = None
    sample_text_transcribed: str | None = None
    error: str | None = None


class ProcessResponse(BaseModel):
    transcript: TranscriptionResponse
    diarization: DiarizationResponse | None = None
    expected_speakers: int | None = None
    detected_speakers: int = 0
    assigned_speakers: int = 0
    num_speakers: int = 0
    merged_transcript: str
    translated_transcript: str | None = None
    translated_text: str | None = None
    summary: str | None = None
    translated_summary: str | None = None
    llm: LLMRefinement | None = None
    llm_summary: str | None = None
    action_items: list[ActionItem] = Field(default_factory=list)
    meeting_minutes: str | None = None
    risks_or_blockers: list[str] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)
    normalized_audio_path: str
    warnings: list[str] = Field(default_factory=list)
