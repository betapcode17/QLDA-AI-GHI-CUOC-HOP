from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import chromadb


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    payload = json.loads(sys.stdin.read() or "{}")

    try:
      with chroma_lock():
          if action == "index":
              result = index_meeting(payload)
          elif action == "query":
              result = query_meeting(payload)
          else:
              raise ValueError(f"Unsupported action: {action}")
      write_json({"ok": True, **result})
      return 0
    except Exception as exc:
      write_json({"ok": False, "error": str(exc)})
      return 1


@contextmanager
def chroma_lock(timeout_seconds: float = 120.0):
    lock_dir = Path(os.environ.get("TEMP") or tempfile.gettempdir()) / "QLDA_AI_GHI_CUOC_HOP"
    lock_dir.mkdir(parents=True, exist_ok=True)
    lock_path = lock_dir / "chroma_worker.lock"
    lock_file = lock_path.open("a+b")
    start = time.time()

    try:
        if os.name == "nt":
            import msvcrt

            while True:
                try:
                    lock_file.seek(0)
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    if time.time() - start > timeout_seconds:
                        raise TimeoutError("Timed out waiting for Chroma worker lock.")
                    time.sleep(0.15)
            try:
                yield
            finally:
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            while True:
                try:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.time() - start > timeout_seconds:
                        raise TimeoutError("Timed out waiting for Chroma worker lock.")
                    time.sleep(0.15)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
    finally:
        lock_file.close()


def get_collection(payload: dict[str, Any]):
    db_dir = Path(os.environ.get("CHROMA_DB_DIR") or tempfile.gettempdir()) / "QLDA_AI_GHI_CUOC_HOP" / "chroma_worker"
    db_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(db_dir))
    return client.get_or_create_collection(payload.get("collection") or "meeting_transcript_chunks_v3")


def index_meeting(payload: dict[str, Any]) -> dict[str, Any]:
    meeting_id = str(payload["meeting_id"])
    transcript = str(payload["transcript"])
    chunks = chunk_transcript(transcript)
    collection = get_collection(payload)

    try:
        collection.delete(where={"meeting_id": meeting_id})
    except Exception:
        pass

    if not chunks:
        return {"meeting_id": meeting_id, "chunks_indexed": 0}

    ids = [f"{meeting_id}:{index}" for index in range(len(chunks))]
    metadatas = [
        {"meeting_id": meeting_id, "chunk_index": index, "char_count": len(chunk)}
        for index, chunk in enumerate(chunks)
    ]
    embeddings = [embed_text(payload, chunk) for chunk in chunks]
    collection.add(ids=ids, documents=chunks, metadatas=metadatas, embeddings=embeddings)
    return {"meeting_id": meeting_id, "chunks_indexed": len(chunks)}


def query_meeting(payload: dict[str, Any]) -> dict[str, Any]:
    collection = get_collection(payload)
    question_embedding = embed_text(payload, str(payload["question"]))
    result = collection.query(
        query_embeddings=[question_embedding],
        n_results=int(payload.get("top_k") or 5),
        where={"meeting_id": str(payload["meeting_id"])},
        include=["documents", "metadatas", "distances"],
    )
    documents = result.get("documents", [[]])[0] or []
    metadatas = result.get("metadatas", [[]])[0] or []
    distances = result.get("distances", [[]])[0] or []
    chunks = [
        {
            "text": document,
            "metadata": metadatas[index] if index < len(metadatas) else {},
            "distance": distances[index] if index < len(distances) else None,
        }
        for index, document in enumerate(documents)
    ]
    return {"chunks": chunks}


def chunk_transcript(transcript: str, max_chars: int = 1200, overlap_chars: int = 180) -> list[str]:
    lines = [line.strip() for line in transcript.splitlines() if line.strip()]
    if not lines:
        lines = [part.strip() for part in re.split(r"(?<=[.!?。！？])\s+", transcript) if part.strip()]

    chunks: list[str] = []
    current = ""
    for line in lines:
        candidate = f"{current}\n{line}".strip() if current else line
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(current.strip())
        overlap = current[-overlap_chars:].strip() if current else ""
        current = f"{overlap}\n{line}".strip() if overlap else line

    if current:
        chunks.append(current.strip())
    return chunks


def embed_text(payload: dict[str, Any], text: str) -> list[float]:
    try:
        body = post_json(
            f"{str(payload['base_url']).rstrip('/')}/api/embeddings",
            {"model": payload["embed_model"], "prompt": text},
            float(payload.get("timeout_seconds") or 120),
        )
        return [float(value) for value in body["embedding"]]
    except Exception:
        body = post_json(
            f"{str(payload['base_url']).rstrip('/')}/api/embed",
            {"model": payload["embed_model"], "input": text},
            float(payload.get("timeout_seconds") or 120),
        )
        return [float(value) for value in body["embeddings"][0]]


def post_json(url: str, payload: dict[str, Any], timeout_seconds: float) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(exc.read().decode("utf-8", errors="replace")) from exc


def write_json(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    raise SystemExit(main())
