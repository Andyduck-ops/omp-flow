#!/usr/bin/env python3
"""Bridge Claude's native session identity and inject path-only orientation."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


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
        script = root / ".omp-flow" / "scripts" / "omp_flow.py"
        if not script.is_file():
            raise ValueError(f"runtime kernel not found: {script}")
        _bridge_session(session_id)
        environment = os.environ.copy()
        environment["OMP_FLOW_CONTEXT_ID"] = session_id
        completed = subprocess.run(
            [sys.executable, "-X", "utf8", str(script), "--cwd", str(root), "status"],
            cwd=root,
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        if completed.returncode != 0:
            raise ValueError(completed.stderr.strip() or "runtime status failed")
        orientation = completed.stdout.strip()
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
