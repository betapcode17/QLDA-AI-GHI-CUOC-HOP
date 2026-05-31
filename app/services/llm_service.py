from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.config import settings
from app.schemas import ActionItem, LLMRefinement

logger = logging.getLogger(__name__)


DEFAULT_SAMPLE_TRANSCRIPT = (
    "SPEAKER_00 [0.00s-8.20s]: Hom nay chung ta hop ve tien do backend va giao dien. "
    "Anh Nam se hoan thanh API upload truoc thu Sau. "
    "SPEAKER_01 [8.30s-14.00s]: Chi Lan phu trach kiem thu va bao cao loi vao ngay mai. "
    "Quyet dinh: uu tien sua loi diarization truoc khi demo."
)


class OllamaError(RuntimeError):
    pass


@dataclass(frozen=True)
class OllamaConfig:
    base_url: str = settings.ollama_base_url
    model: str = settings.ollama_model
    timeout_seconds: float = settings.ollama_timeout_seconds
    retries: int = 2


class OllamaLLMService:
    def __init__(self, config: OllamaConfig | None = None) -> None:
        self.config = config or OllamaConfig()

    def refine_meeting(
        self,
        merged_transcript: str,
        existing_summary: str | None = None,
        translated_transcript: str | None = None,
    ) -> LLMRefinement:
        prompt = build_meeting_prompt(
            merged_transcript=merged_transcript,
            existing_summary=existing_summary,
            translated_transcript=translated_transcript,
        )
        logger.debug(
            "LLM refine_meeting called | model=%s base_url=%s transcript_len=%d existing_summary=%s",
            self.config.model,
            self.config.base_url,
            len(merged_transcript or ""),
            bool(existing_summary),
        )
        try:
            raw_text = self._generate(prompt)
            return parse_llm_refinement(raw_text)
        except Exception as exc:
            logger.exception("LLM refine_meeting failed")
            return LLMRefinement(raw_text=None, parsed_json=False, error=str(exc))

    def smoke_test(self, transcript: str | None = None) -> LLMRefinement:
        return self.refine_meeting(transcript or DEFAULT_SAMPLE_TRANSCRIPT)

    def answer_question(self, transcript: str, question: str) -> str:
        prompt = build_meeting_qa_prompt(transcript=transcript, question=question)
        logger.debug(
            "LLM answer_question called | model=%s base_url=%s transcript_len=%d question_len=%d",
            self.config.model,
            self.config.base_url,
            len(transcript or ""),
            len(question or ""),
        )
        return self._generate_with_options(prompt, json_format=False)

    def _generate(self, prompt: str) -> str:
        return self._generate_with_options(prompt, json_format=True)

    def _generate_with_options(self, prompt: str, json_format: bool) -> str:
        url = f"{self.config.base_url.rstrip('/')}/api/generate"
        payload = {
            "model": self.config.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_ctx": 4096,
            },
        }
        if json_format:
            payload["format"] = "json"
        data = json.dumps(payload).encode("utf-8")
        last_error: Exception | None = None
        # Log request metadata (avoid printing full prompt in case it's large)
        logger.debug(
            "LLM request prepared | url=%s model=%s json_format=%s prompt_chars=%d payload_bytes=%d",
            url,
            self.config.model,
            json_format,
            len(prompt or ""),
            len(data),
        )

        start = time.time()
        for attempt in range(self.config.retries + 1):
            request = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            logger.debug("LLM request attempt %d/%d to %s", attempt + 1, self.config.retries + 1, url)
            try:
                with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                    body = json.loads(response.read().decode("utf-8"))
                text = body.get("response")
                if not isinstance(text, str) or not text.strip():
                    raise OllamaError(f"Ollama returned an empty response for model {self.config.model}.")
                duration = time.time() - start
                logger.info(
                    "LLM response OK | model=%s time=%.2fs chars=%d",
                    self.config.model,
                    duration,
                    len(text or ""),
                )
                return text.strip()
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                logger.warning(
                    "LLM HTTPError attempt=%d model=%s code=%s detail=%s",
                    attempt + 1,
                    self.config.model,
                    getattr(exc, "code", None),
                    detail[:200],
                )
                last_error = OllamaError(
                    f"Ollama HTTP {exc.code}. Check that model '{self.config.model}' is available. {detail}"
                )
            except urllib.error.URLError as exc:
                logger.warning(
                    "LLM URLError attempt=%d model=%s error=%s",
                    attempt + 1,
                    self.config.model,
                    exc,
                )
                last_error = OllamaError(
                    f"Cannot connect to Ollama at {self.config.base_url}. Start Ollama and verify the endpoint. {exc}"
                )
            except TimeoutError as exc:
                logger.warning(
                    "LLM Timeout attempt=%d model=%s timeout=%ss",
                    attempt + 1,
                    self.config.model,
                    self.config.timeout_seconds,
                )
                last_error = OllamaError(
                    f"Ollama timed out after {self.config.timeout_seconds}s using model {self.config.model}."
                )
            except json.JSONDecodeError as exc:
                logger.warning("LLM invalid JSON envelope: %s", exc)
                last_error = OllamaError(f"Ollama returned invalid JSON envelope: {exc}")

            if attempt < self.config.retries:
                backoff = 0.75 * (attempt + 1)
                logger.debug("LLM backing off %.2fs before retry", backoff)
                time.sleep(backoff)

        logger.error("LLM requests exhausted for model=%s; raising last error", self.config.model)
        raise last_error or OllamaError("Unknown Ollama error.")


def build_meeting_qa_prompt(transcript: str, question: str) -> str:
    return "\n\n".join(
        [
            "Bạn là trợ lý AI hỏi đáp biên bản họp.",
            "Chỉ trả lời dựa trên các đoạn transcript được cung cấp. Không dùng kiến thức ngoài transcript.",
            "Nếu các đoạn transcript không chứa câu trả lời trực tiếp, hãy trả lời đúng câu: \"Không đủ thông tin trong transcript.\"",
            "Không suy đoán tên người, deadline, quyết định, số liệu, hay nguyên nhân nếu transcript không nói rõ.",
            "Trả lời bằng tiếng Việt, ngắn gọn, có thể liệt kê bullet nếu cần.",
            "Các đoạn transcript liên quan:",
            transcript.strip(),
            "Câu hỏi:",
            question.strip(),
            "Câu trả lời:",
        ]
    )


def build_meeting_prompt(
    merged_transcript: str,
    existing_summary: str | None = None,
    translated_transcript: str | None = None,
) -> str:
    context_blocks = [
        "You are an assistant that writes professional Vietnamese meeting minutes.",
        "Use only the provided transcript. Do not invent facts.",
        "Ignore garbled speech-recognition fragments that do not change the meeting meaning.",
        "If the transcript is only a microphone test such as 'a lô' or 'một hai', say there is not enough meeting content.",
        "If assignee, deadline, risks, blockers, or decisions are missing, use null or an empty list.",
        "Return strict JSON only. No markdown. No explanation outside JSON.",
        "All string values in the JSON must be written in Vietnamese.",
        "Do not translate the final JSON into English.",
        "The JSON shape must be exactly:",
        json.dumps(
            {
                "summary": "...",
                "action_items": [{"task": "...", "assignee": None, "deadline": None}],
                "meeting_minutes": "...",
                "risks_or_blockers": [],
                "decisions": [],
            },
            ensure_ascii=False,
        ),
        "Write summary, action item task names, decisions, risks, and meeting_minutes in Vietnamese, concise, factual, and professional.",
        "Transcript:",
        merged_transcript.strip() or "(empty)",
    ]
    if translated_transcript:
        context_blocks.extend(["Translated transcript if helpful:", translated_transcript.strip()])
    if existing_summary:
        context_blocks.extend(["Existing extractive summary if helpful:", existing_summary.strip()])
    return "\n\n".join(context_blocks)


def parse_llm_refinement(raw_text: str) -> LLMRefinement:
    raw_text = raw_text.strip()
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError:
        data = extract_json_object(raw_text)
        if data is None:
            return LLMRefinement(
                summary=raw_text,
                meeting_minutes=raw_text,
                raw_text=raw_text,
                parsed_json=False,
            )

    try:
        return normalize_refinement_dict(data, raw_text)
    except (TypeError, ValidationError, ValueError):
        return LLMRefinement(
            summary=raw_text,
            meeting_minutes=raw_text,
            raw_text=raw_text,
            parsed_json=False,
        )


def extract_json_object(text: str) -> dict[str, Any] | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        value = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def normalize_refinement_dict(data: dict[str, Any], raw_text: str) -> LLMRefinement:
    action_items = []
    for item in data.get("action_items") or []:
        if not isinstance(item, dict):
            continue
        task = item.get("task")
        if not task:
            continue
        action_items.append(
            ActionItem(
                task=str(task),
                assignee=string_or_none(item.get("assignee")),
                deadline=string_or_none(item.get("deadline")),
            )
        )

    return LLMRefinement(
        summary=string_or_none(data.get("summary")),
        action_items=action_items,
        meeting_minutes=string_or_none(data.get("meeting_minutes")),
        risks_or_blockers=string_list(data.get("risks_or_blockers")),
        decisions=string_list(data.get("decisions")),
        raw_text=raw_text,
        parsed_json=True,
    )


def string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"null", "none", "n/a"}:
        return None
    return text


def string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


llm_service = OllamaLLMService()
