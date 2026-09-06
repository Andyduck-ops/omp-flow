#!/usr/bin/env python3
"""Bridge Claude's native session identity and inject authored navigation maps."""
from __future__ import annotations

import json
import os
import shlex
import sys
from pathlib import Path


MAX_MAP_CHARS = 6000


def _contains(parent: Path, child: Path) -> bool:
    try:
        return os.path.commonpath([os.path.normcase(str(parent)), os.path.normcase(str(child))]) == os.path.normcase(str(parent))
    except ValueError:
        return False


def _emit(value: dict) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False) + "\n")


def _stop(reason: str) -> dict:
    return {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": f"STOP: omp-flow session orientation failed.\nReason: {reason}",
        },
        "systemMessage": f"omp-flow SessionStart failed: {reason}",
    }


def _bridge_session(session_id: str) -> None:
    destination = os.environ.get("CLAUDE_ENV_FILE", "").strip()
    if not destination:
        return
    # Claude sources this file as Bash; preserve identity without shell expansion.
    quoted = shlex.quote(session_id)
    with Path(destination).open("a", encoding="utf-8", newline="\n") as stream:
        stream.write(f"export OMP_FLOW_CONTEXT_ID={quoted}\n")


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
    workflow_text, workflow_reason = _read_map(root, ".omp-flow/workflow/index.md")
    lines = [
        "<!-- omp-flow-runtime-orientation:v1 -->",
        "Read the Task, Wiki, and Workflow maps carefully. Follow useful links relative to each index; maps are navigation, not workflow state.",
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
    lines.append(
        "Task meaning lives in the linked Bundle; do not infer Task, Flow, approval, "
        "verdict, or progress from this runtime orientation."
    )
    lines.append("Workflow index: .omp-flow/workflow/index.md")
    if workflow_text is not None:
        lines.extend(["--- Workflow map ---", workflow_text, "--- End Workflow map ---"])
    else:
        lines.append(f"Workflow map content: unavailable ({workflow_reason})")
    return "\n".join(lines)


def main() -> int:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        payload = json.loads(sys.stdin.read())
        if not isinstance(payload, dict):
            raise ValueError("payload must be an object")
        session_id = payload.get("session_id")
        if not isinstance(session_id, str) or not session_id.strip():
            raise ValueError("payload requires a non-empty session_id")
        project = os.environ.get("CLAUDE_PROJECT_DIR", "").strip()
        if not project:
            raise ValueError("CLAUDE_PROJECT_DIR is not set")
        root = Path(project).resolve()
        _bridge_session(session_id)
        orientation = _orientation(root, session_id)
        _emit(
            {
                "hookSpecificOutput": {
                    "hookEventName": "SessionStart",
                    "additionalContext": orientation,
                }
            }
        )
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        _emit(_stop(str(exc)))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
