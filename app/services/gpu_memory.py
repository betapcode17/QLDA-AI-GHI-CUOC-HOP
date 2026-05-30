from __future__ import annotations

import gc


def cuda_memory_mb() -> tuple[int, int]:
    try:
        import torch

        if not torch.cuda.is_available():
            return 0, 0
        free_memory, total_memory = torch.cuda.mem_get_info()
        return int(free_memory // (1024 * 1024)), int(total_memory // (1024 * 1024))
    except Exception:
        return 0, 0


def log_cuda_memory(label: str) -> None:
    free_mb, total_mb = cuda_memory_mb()
    if total_mb:
        used_mb = total_mb - free_mb
        print(f"[GPU] {label}: used={used_mb}MB free={free_mb}MB total={total_mb}MB")


def release_cuda_memory(label: str | None = None) -> None:
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            try:
                torch.cuda.synchronize()
            except Exception:
                pass
            torch.cuda.empty_cache()
            try:
                torch.cuda.ipc_collect()
            except Exception:
                pass
    except Exception:
        pass
    if label:
        log_cuda_memory(label)
