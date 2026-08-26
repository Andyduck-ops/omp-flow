#!/usr/bin/env python3
"""Bridge Claude's native session identity and inject path-only orientation."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


MAX_INDEX_CHARS = 512


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
    # Claude sources this file as Bash. JSON quoting safely represents ordinary
    # session strings and prevents shell interpolation.
    quoted = json.dumps(session_id, ensure_ascii=True)
    with Path(destination).open("a", encoding="utf-8", newline="\n") as stream:
        stream.write(f"export OMP_FLOW_CONTEXT_ID={quoted}\n")


def _runtime_command(root: Path, arguments: list[str], session_id: str) -> str:
    script = root / ".omp-flow" / "scripts" / "omp_flow.py"
    if not script.is_file():
        raise ValueError(f"runtime kernel not found: {script}")
    environment = os.environ.copy()
    environment["OMP_FLOW_CONTEXT_ID"] = session_id
    completed = subprocess.run(
        [sys.executable, "-X", "utf8", str(script), "--cwd", str(root), *arguments],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    output = completed.stdout.strip()
    if completed.returncode != 0 or not output:
        raise ValueError("runtime command unavailable")
    return output


def _task_index(root: Path, session_id: str) -> tuple[str | None, str | None]:
    try:
        status_text = _runtime_command(
            root,
            ["status", "inspect", "--host", "claude", "--session", session_id, "--json"],
            session_id,
        )
        status = json.loads(status_text)
        if not isinstance(status, dict) or status.get("state") != "available":
            return None, "no validated active Task"
        snapshot = status.get("snapshot")
        if not isinstance(snapshot, dict):
            return None, "runtime status had no validated snapshot"
        scope = snapshot.get("scope")
        if not isinstance(scope, dict) or scope.get("repositoryRoot") != str(root):
            return None, "runtime status workspace mismatch"
        root_flow = snapshot.get("rootFlow")
        publication = root_flow.get("publication") if isinstance(root_flow, dict) else None
        root_task = publication.get("rootTask") if isinstance(publication, dict) else None
        task_id = root_task.get("taskId") if isinstance(root_task, dict) else None
        if not isinstance(task_id, str) or not task_id.strip() or len(task_id) > MAX_INDEX_CHARS:
            return None, "no validated active Task"
        task_text = _runtime_command(
            root,
            ["task", "show", task_id, "--workspace", str(root)],
            session_id,
        )
        task = json.loads(task_text)
        if not isinstance(task, dict) or task.get("taskId") != task_id:
            return None, "task show returned an invalid Task"
        index = task.get("index")
        if (
            not isinstance(index, str)
            or not index.strip()
            or len(index) > MAX_INDEX_CHARS
            or Path(index).is_absolute()
            or any(ord(char) < 0x20 for char in index)
        ):
            return None, "task show returned an invalid Bundle index"
        return index, None
    except (ValueError, json.JSONDecodeError, UnicodeError, OSError):
        return None, "Task index unavailable; run task show with an explicit Task/workspace"


def _orientation(root: Path, session_id: str) -> str:
    task_index, reason = _task_index(root, session_id)
    lines = [
        "<!-- omp-flow-runtime-orientation:v1 -->",
        "Wiki index: .omp-flow/wiki/index.md",
        "Workflow index: .omp-flow/workflow/index.md",
    ]
    if task_index is not None:
        lines.append(f"Task index: {task_index}")
    else:
        lines.append(f"Task index: unavailable ({reason or 'no validated active Task'})")
        lines.append("Use task show with an explicit Task/workspace; do not infer a Task or path.")
    lines.append(
        "Task meaning lives in the linked Bundle; do not infer Task, Flow, approval, "
        "verdict, or progress from this runtime orientation."
    )
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
                    "additionalContext": (
                        "<!-- omp-flow-runtime-orientation:v1 -->\n"
                        f"{orientation}\n"
                        "Task meaning lives in the linked Bundle; do not infer a lifecycle from runtime data."
                    ),
                }
            }
        )
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        _emit(_stop(str(exc)))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
