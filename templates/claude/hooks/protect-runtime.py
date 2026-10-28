#!/usr/bin/env python3
"""Deny direct Claude Write/Edit mutations of ignored runtime coordination."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def _emit(value: dict) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False) + "\n")


def main() -> int:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        payload = json.loads(sys.stdin.read())
        if not isinstance(payload, dict):
            raise ValueError("payload must be an object")
        tool_name = payload.get("tool_name")
        if tool_name not in {"Write", "Edit", "MultiEdit"}:
            return 0
        tool_input = payload.get("tool_input")
        if not isinstance(tool_input, dict):
            raise ValueError("tool_input must be an object")
        raw_path = tool_input.get("file_path") or tool_input.get("path")
        if not isinstance(raw_path, str) or not raw_path.strip():
            raise ValueError("file_path must be a non-empty string")
        project = os.environ.get("CLAUDE_PROJECT_DIR", "").strip()
        if not project:
            cwd_val = payload.get("cwd")
            project = cwd_val.strip() if isinstance(cwd_val, str) else ""
        if not project:
            raise ValueError("CLAUDE_PROJECT_DIR or payload cwd is not set")
        root = Path(project).resolve()
        candidate = Path(raw_path)
        if not candidate.is_absolute():
            candidate = root / candidate
        resolved = candidate.resolve()
        runtime = (root / ".omp-flow" / ".runtime").resolve()
        config_file = (root / ".omp-flow" / "config.json").resolve()
        is_protected = os.path.normcase(str(resolved)) == os.path.normcase(str(config_file))
        if not is_protected:
            try:
                resolved.relative_to(runtime)
                is_protected = True
            except ValueError:
                is_protected = False
        if not is_protected:
            return 0
        _emit(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        "Runtime coordination is Python-owned. Use the managed omp_flow.py "
                        "task/operation commands instead of editing .omp-flow/.runtime directly."
                    ),
                }
            }
        )
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"[omp-flow protect-runtime] {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
