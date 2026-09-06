#!/usr/bin/env python3
"""Return bounded mechanical omp-flow orientation for Snow onSessionStart."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
from typing import NoReturn


MARKER = "<!-- omp-flow-runtime-orientation:v1 -->"
BOUNDARY = (
    "Task meaning lives in the linked Bundle; do not infer Task, Flow, approval, "
    "verdict, or progress from this runtime orientation."
)
MAX_MAP_CHARS = 6000
FOREIGN_CONTEXT_ENV_KEYS = (
    "CODEX_THREAD_ID",
    "CODEX_SESSION_ID",
    "OMP_SESSION_ID",
    "PI_SESSION_ID",
)


class OrientationUnavailable(Exception):
    """Expected, sanitized orientation failure."""


def _contains(parent: Path, child: Path) -> bool:
    parent_text = os.path.normcase(str(parent))
    child_text = os.path.normcase(str(child))
    try:
        return os.path.commonpath([parent_text, child_text]) == parent_text
    except ValueError:
        return False


def _read_payload() -> dict[str, object]:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeError, OSError) as exc:
        raise OrientationUnavailable("invalid hook input") from exc
    if not isinstance(payload, dict):
        raise OrientationUnavailable("invalid hook input")
    return payload


def _required_text(payload: dict[str, object], *names: str) -> str:
    values = [payload.get(name) for name in names]
    present = [value.strip() for value in values if isinstance(value, str) and value.strip()]
    if not present:
        raise OrientationUnavailable(f"missing {names[0]}")
    if any(value != present[0] for value in present[1:]):
        raise OrientationUnavailable(f"conflicting {names[0]}")
    return present[0]


def _repository_root(cwd_text: str) -> Path:
    try:
        cwd = Path(cwd_text).resolve(strict=True)
        if not cwd.is_dir():
            raise OSError("cwd is not a directory")
        result = subprocess.run(
            ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
            capture_output=True,
            check=False,
            timeout=5,
        )
        if result.returncode != 0:
            raise OSError("git root lookup failed")
        root_text = result.stdout.decode("utf-8", errors="strict").strip()
        if not root_text:
            raise OSError("git returned an empty root")
        root = Path(root_text).resolve(strict=True)
    except (OSError, subprocess.SubprocessError, UnicodeError) as exc:
        raise OrientationUnavailable("repository root unavailable") from exc
    if not root.is_dir() or not _contains(root, cwd):
        raise OrientationUnavailable("repository root unavailable")
    return root


def _read_map(root: Path, relative: str) -> tuple[str | None, str | None]:
    path = (root / relative).resolve()
    if not _contains(root, path) or path.suffix.lower() != ".md":
        return None, "map path is outside repository"
    try:
        with path.open("rb") as stream:
            raw = stream.read(MAX_MAP_CHARS * 4 + 1)
        if len(raw) > MAX_MAP_CHARS * 4:
            return None, f"map exceeds {MAX_MAP_CHARS} characters"
        text = raw.decode("utf-8", errors="strict")
    except (OSError, UnicodeError):
        return None, "map unavailable"
    if len(text) > MAX_MAP_CHARS:
        return None, f"map exceeds {MAX_MAP_CHARS} characters"
    return text, None


def _orientation(root: Path, session_id: str) -> str:
    task_index = ".omp-flow/tasks/index.md"
    wiki_text, wiki_reason = _read_map(root, ".omp-flow/wiki/index.md")
    task_text, task_reason = _read_map(root, task_index)
    lines = [
        MARKER,
        "Read the Task and Wiki maps carefully before acting. Follow only links useful to this request; maps are navigation, not workflow state.",
        "Wiki index: .omp-flow/wiki/index.md",
    ]
    if task_text is not None:
        lines.append(f"Task index: {task_index}")
    else:
        lines.append(f"Task index: unavailable ({task_reason or 'Task map unavailable'})")
        lines.append("Use an explicit Task/workspace or WorkScope to open a Bundle; do not infer a Task or path.")
    if wiki_text is not None:
        lines.extend(["--- Wiki map ---", wiki_text, "--- End Wiki map ---"])
    else:
        lines.append(f"Wiki map content: unavailable ({wiki_reason})")
    if task_text is not None:
        lines.extend(["--- Task map ---", task_text, "--- End Task map ---"])
    else:
        lines.append(f"Task map content: unavailable ({task_reason or 'Task map unavailable'})")
    lines.append(BOUNDARY)
    return "\n".join(lines)


def _emit(additional_context: str) -> NoReturn:
    sys.stdout.write(
        json.dumps(
            {"additionalContext": additional_context},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n"
    )
    raise SystemExit(0)


def main() -> NoReturn:
    try:
        payload = _read_payload()
        messages = payload.get("messages")
        message_count = payload.get("messageCount")
        is_resume = payload.get("isResume")
        if not isinstance(messages, list):
            raise OrientationUnavailable("missing messages")
        if (
            not isinstance(message_count, int)
            or isinstance(message_count, bool)
            or message_count < 0
        ):
            raise OrientationUnavailable("invalid messageCount")
        if not isinstance(is_resume, bool):
            raise OrientationUnavailable("invalid isResume")
        session_id = _required_text(payload, "sessionId", "session_id")
        cwd_text = _required_text(payload, "cwd")
        root = _repository_root(cwd_text)
        _emit(_orientation(root, session_id))
    except OrientationUnavailable as exc:
        message = (
            f"omp-flow orientation unavailable: {exc}. Read the Task and Wiki maps directly "
            "omp_flow.py CLI; do not infer workflow state."
        )
        print(f"omp-flow onSessionStart: {exc}", file=sys.stderr)
        _emit(message)
    except Exception:
        message = (
            "omp-flow orientation unavailable: unexpected handler failure. Read the Task and Wiki maps or "
            "the explicit omp_flow.py CLI; do not infer workflow state."
        )
        print("omp-flow onSessionStart: unexpected handler failure", file=sys.stderr)
        _emit(message)


if __name__ == "__main__":
    main()
