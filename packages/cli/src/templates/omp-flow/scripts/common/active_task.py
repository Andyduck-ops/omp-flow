from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .io import WorkflowError, atomic_write_json, read_json
from .paths import flow_dir, task_dir


SESSION_KEYS = ("session_id", "sessionId", "thread_id", "threadId", "conversation_id", "conversationId")
ENV_KEYS = (
    ("codex", "CODEX_THREAD_ID"),
    ("codex", "CODEX_SESSION_ID"),
    ("omp", "OMP_SESSION_ID"),
    ("pi", "PI_SESSION_ID"),
)


@dataclass(frozen=True)
class ActiveTask:
    task_id: str | None
    source: str
    context_key: str | None = None
    stale: bool = False


def _clean_label(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9_-]+", "-", value.lower()).strip("-")
    return cleaned[:16] or "session"


def _context_key(platform: str, value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:20]
    return f"{_clean_label(platform)}-{digest}"


def resolve_context_key(payload: dict[str, Any] | None = None) -> str | None:
    override = os.environ.get("OMP_FLOW_CONTEXT_ID", "").strip()
    if override:
        return _context_key("explicit", override)

    data = payload or {}
    detected_platform = "codex" if os.environ.get("CODEX_THREAD_ID") or os.environ.get("CODEX_SESSION_ID") else "session"
    platform = str(data.get("platform") or data.get("source") or detected_platform)
    for key in SESSION_KEYS:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return _context_key(platform, value.strip())

    for env_platform, env_name in ENV_KEYS:
        value = os.environ.get(env_name, "").strip()
        if value:
            return _context_key(env_platform, value)
    return None


def _session_path(repo: Path, context_key: str) -> Path:
    return flow_dir(repo) / ".runtime" / "sessions" / f"{context_key}.json"


def resolve_active_task(
    repo: Path,
    payload: dict[str, Any] | None = None,
) -> ActiveTask:
    key = resolve_context_key(payload)
    if key:
        value = read_json(_session_path(repo, key), required=False)
        task_id = value.get("current_task")
        if isinstance(task_id, str) and task_id.strip():
            cleaned = task_id.strip()
            stale = not (flow_dir(repo) / "tasks" / cleaned).is_dir()
            return ActiveTask(cleaned, "session", key, stale)

    return ActiveTask(None, "none", key)


def set_active_task(repo: Path, task_id: str, payload: dict[str, Any] | None = None) -> ActiveTask:
    task_dir(repo, task_id)
    key = resolve_context_key(payload)
    if not key:
        raise WorkflowError(
            "No session identity. Set OMP_FLOW_CONTEXT_ID or run inside a supported Harness session."
        )
    atomic_write_json(
        _session_path(repo, key),
        {
            "current_task": task_id,
            "context_key": key,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return ActiveTask(task_id, "session", key)


def clear_active_task(repo: Path, payload: dict[str, Any] | None = None) -> ActiveTask:
    current = resolve_active_task(repo, payload)
    if current.context_key:
        path = _session_path(repo, current.context_key)
        if path.is_file():
            path.unlink()
    return current


def clear_task_sessions(repo: Path, task_id: str) -> int:
    sessions = flow_dir(repo) / ".runtime" / "sessions"
    if not sessions.is_dir():
        return 0
    removed = 0
    for path in sessions.glob("*.json"):
        value = read_json(path, required=False)
        if value.get("current_task") == task_id:
            path.unlink()
            removed += 1
    return removed
