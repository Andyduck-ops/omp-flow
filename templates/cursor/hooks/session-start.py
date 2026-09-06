#!/usr/bin/env python3
"""Bridge Cursor conversation identity into omp-flow's explicit context."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
from typing import NoReturn


EVENT = "sessionStart"
MARKER = "<!-- omp-flow-runtime-orientation:v1 -->"
BOUNDARY = (
    "Task meaning lives in the linked Bundle; do not infer Task, Flow, approval, "
    "verdict, or progress from this mechanical orientation."
)
MAX_MAP_CHARS = 6000


def _contains(parent: Path, child: Path) -> bool:
    try:
        return os.path.commonpath([os.path.normcase(str(parent)), os.path.normcase(str(child))]) == os.path.normcase(str(parent))
    except ValueError:
        return False


class BridgeUnavailable(Exception):
    """Expected, sanitized Cursor session-bridge failure."""


def _read_payload() -> dict[str, object]:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeError, OSError) as exc:
        raise BridgeUnavailable("invalid hook input") from exc
    if not isinstance(payload, dict):
        raise BridgeUnavailable("invalid hook input")
    return payload


def _required_text(payload: dict[str, object], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str) or not value.strip():
        raise BridgeUnavailable(f"missing {name}")
    return value.strip()


def _conversation_id(payload: dict[str, object]) -> str:
    conversation_id = _required_text(payload, "conversation_id")
    if "session_id" in payload:
        session_id = payload.get("session_id")
        if (
            not isinstance(session_id, str)
            or not session_id.strip()
            or session_id.strip() != conversation_id
        ):
            raise BridgeUnavailable("conflicting session_id")
    return conversation_id


def _repository_root(payload: dict[str, object]) -> Path:
    roots = payload.get("workspace_roots")
    if not isinstance(roots, list) or not roots:
        raise BridgeUnavailable("missing workspace_roots")
    candidates: list[Path] = []
    for value in roots:
        if not isinstance(value, str) or not value.strip():
            raise BridgeUnavailable("invalid workspace_roots")
        try:
            candidate = Path(value).resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            raise BridgeUnavailable("invalid workspace_roots") from exc
        if not candidate.is_dir():
            raise BridgeUnavailable("invalid workspace_roots")
        candidates.append(candidate)

    try:
        cwd = Path.cwd().resolve(strict=True)
        result = subprocess.run(
            ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
            capture_output=True,
            check=False,
            timeout=5,
        )
        if result.returncode != 0:
            raise OSError("git root lookup failed")
        root_text = result.stdout.decode("utf-8", errors="strict").strip()
        root = Path(root_text).resolve(strict=True)
    except (OSError, subprocess.SubprocessError, UnicodeError) as exc:
        raise BridgeUnavailable("repository root unavailable") from exc
    if root not in candidates:
        raise BridgeUnavailable("workspace identity mismatch")
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


def _orientation(root: Path, conversation_id: str) -> str:
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


def _emit(value: dict[str, object]) -> NoReturn:
    sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    raise SystemExit(0)


def main() -> NoReturn:
    try:
        payload = _read_payload()
        if payload.get("hook_event_name") != EVENT:
            raise BridgeUnavailable("unexpected hook event")
        conversation_id = _conversation_id(payload)
        root = _repository_root(payload)
        environment = {
            "OMP_FLOW_CONTEXT_ID": conversation_id,
            "OMP_FLOW_HOST": "cursor",
        }
        try:
            context = _orientation(root, conversation_id)
        except BridgeUnavailable as exc:
            context = f"{MARKER}\nomp-flow orientation unavailable: {exc}.\n{BOUNDARY}"
        _emit({"env": environment, "additional_context": context})
    except BridgeUnavailable as exc:
        _emit(
            {
                "additional_context": (
                    f"omp-flow Cursor session bridge unavailable: {exc}. No task was selected; "
                    "use an explicit supported session context."
                )
            }
        )
    except Exception:
        _emit(
            {
                "additional_context": (
                    "omp-flow Cursor session bridge unavailable: unexpected handler failure. "
                    "No task was selected; use an explicit supported session context."
                )
            }
        )


if __name__ == "__main__":
    main()
