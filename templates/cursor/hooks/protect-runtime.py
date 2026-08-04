#!/usr/bin/env python3
"""Deny known Cursor write tools that target Python-owned runtime state."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
from typing import NoReturn


EVENT = "preToolUse"
WRITE_TOOLS = {"Write", "StrReplace", "Delete"}
RUNTIME_REASON = (
    "Runtime coordination is Python-owned. Use .omp-flow/scripts/omp_flow.py "
    "task/operation/flow-status commands instead of writing .omp-flow/.runtime directly."
)
UNVERIFIABLE_REASON = "Cannot safely verify the Cursor write path; the tool call was denied."


class UnverifiableWrite(Exception):
    """The handler cannot prove a known write target is safe."""


class RuntimeWrite(Exception):
    """A known Cursor write targets Python-owned runtime state."""


def _deny(reason: str) -> NoReturn:
    output = {
        "permission": "deny",
        "user_message": reason,
        "agent_message": reason,
    }
    sys.stdout.write(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")
    raise SystemExit(0)


def _allow() -> None:
    sys.stdout.write(json.dumps({"permission": "allow"}, separators=(",", ":")) + "\n")


def _read_payload() -> tuple[dict[str, object], str] | None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeError, OSError) as exc:
        raise UnverifiableWrite("invalid hook input") from exc
    if not isinstance(payload, dict):
        raise UnverifiableWrite("invalid hook input")
    if payload.get("hook_event_name") != EVENT:
        return None
    tool_name = payload.get("tool_name")
    if not isinstance(tool_name, str) or tool_name not in WRITE_TOOLS:
        return None
    return payload, tool_name


def _repository_root(payload: dict[str, object]) -> Path:
    roots = payload.get("workspace_roots")
    if not isinstance(roots, list) or not roots:
        raise UnverifiableWrite("missing workspace_roots")
    root_value = roots[0]
    if not isinstance(root_value, str) or not root_value.strip():
        raise UnverifiableWrite("invalid workspace root")
    try:
        workspace = Path(root_value).resolve(strict=True)
        result = subprocess.run(
            ["git", "-C", str(workspace), "rev-parse", "--show-toplevel"],
            capture_output=True,
            check=False,
            timeout=5,
        )
        if result.returncode != 0:
            raise OSError("git root lookup failed")
        root_text = result.stdout.decode("utf-8", errors="strict").strip()
        root = Path(root_text).resolve(strict=True)
    except (OSError, RuntimeError, subprocess.SubprocessError, UnicodeError) as exc:
        raise UnverifiableWrite("repository root unavailable") from exc
    if not root.is_dir():
        raise UnverifiableWrite("repository root unavailable")
    return root


def _target_path(payload: dict[str, object]) -> str:
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        raise UnverifiableWrite("missing tool_input")
    values = [
        value.strip()
        for key in ("file_path", "path")
        if isinstance((value := tool_input.get(key)), str) and value.strip()
    ]
    if len(values) != 1:
        raise UnverifiableWrite("missing or conflicting write path")
    return values[0]


def _resolve_target(root: Path, raw_path: str) -> Path:
    if "\x00" in raw_path:
        raise UnverifiableWrite("NUL in write path")
    portable = raw_path.replace("\\", "/")
    try:
        candidate = Path(portable)
        resolved = (
            candidate.resolve(strict=False)
            if candidate.is_absolute()
            else (root / candidate).resolve(strict=False)
        )
        resolved.relative_to(root)
    except (OSError, RuntimeError, ValueError) as exc:
        raise UnverifiableWrite("write path escapes repository root") from exc
    return resolved


def _targets_runtime(root: Path, target: Path) -> bool:
    relative = target.relative_to(root)
    lowered = tuple(part.casefold() for part in relative.parts)
    return lowered[:2] == (".omp-flow", ".runtime")


def main() -> None:
    try:
        parsed = _read_payload()
        if parsed is None:
            return
        payload, _ = parsed
        root = _repository_root(payload)
        target = _resolve_target(root, _target_path(payload))
        if _targets_runtime(root, target):
            raise RuntimeWrite
        _allow()
    except RuntimeWrite:
        _deny(RUNTIME_REASON)
    except UnverifiableWrite:
        _deny(UNVERIFIABLE_REASON)
    except Exception:
        _deny(UNVERIFIABLE_REASON)


if __name__ == "__main__":
    main()
