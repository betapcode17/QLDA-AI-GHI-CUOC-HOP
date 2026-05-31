from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass
from typing import Any

from app.config import settings


COLLECTION_NAME = "meeting_transcript_chunks_v3"


@dataclass(frozen=True)
class RetrievedChunk:
    text: str
    metadata: dict[str, Any]
    distance: float | None = None


class MeetingVectorStore:
    def index_meeting(self, meeting_id: str, transcript: str) -> int:
        result = run_chroma_worker(
            "index",
            {
                "meeting_id": meeting_id,
                "transcript": transcript,
                "collection": COLLECTION_NAME,
                "base_url": settings.ollama_base_url,
                "embed_model": settings.ollama_embed_model,
                "timeout_seconds": settings.ollama_timeout_seconds,
            },
        )
        return int(result.get("chunks_indexed") or 0)

    def query(self, meeting_id: str, question: str, top_k: int = 5) -> list[RetrievedChunk]:
        result = run_chroma_worker(
            "query",
            {
                "meeting_id": meeting_id,
                "question": question,
                "top_k": top_k,
                "collection": COLLECTION_NAME,
                "base_url": settings.ollama_base_url,
                "embed_model": settings.ollama_embed_model,
                "timeout_seconds": settings.ollama_timeout_seconds,
            },
        )
        return [
            RetrievedChunk(
                text=item.get("text", ""),
                metadata=item.get("metadata") or {},
                distance=item.get("distance"),
            )
            for item in result.get("chunks", [])
            if item.get("text")
        ]


def run_chroma_worker(action: str, payload: dict[str, Any]) -> dict[str, Any]:
    completed = subprocess.run(
        [sys.executable, "-B", "-m", "app.services.chroma_worker", action],
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        encoding="utf-8",
        capture_output=True,
        timeout=max(60, settings.ollama_timeout_seconds + 60),
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(f"Chroma worker failed: {detail}")

    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Chroma worker returned invalid JSON: {completed.stdout[:500]}") from exc

    if not result.get("ok"):
        raise RuntimeError(result.get("error") or "Chroma worker failed")
    return result


vector_store = MeetingVectorStore()
