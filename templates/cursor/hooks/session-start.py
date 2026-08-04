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
MAX_STATUS_CHARS = 850


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


def _runtime_status(root: Path, conversation_id: str) -> str:
    runtime = root / ".omp-flow" / "scripts" / "omp_flow.py"
    if not runtime.is_file():
        raise BridgeUnavailable("omp-flow runtime unavailable")
    environment = os.environ.copy()
    environment["OMP_FLOW_CONTEXT_ID"] = conversation_id
    environment["OMP_FLOW_HOST"] = "cursor"
    try:
        result = subprocess.run(
            [sys.executable, "-X", "utf8", str(runtime), "--cwd", str(root), "status"],
            cwd=str(root),
            env=environment,
            capture_output=True,
            check=False,
            timeout=10,
        )
        stdout = result.stdout.decode("utf-8", errors="strict").strip()
    except (OSError, subprocess.SubprocessError, UnicodeError) as exc:
        raise BridgeUnavailable("runtime status unavailable") from exc
    if result.returncode != 0 or not stdout:
        raise BridgeUnavailable("runtime status unavailable")
    if len(stdout) > MAX_STATUS_CHARS:
        stdout = f"{stdout[: MAX_STATUS_CHARS - 1]}…"
    return stdout


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
            status = _runtime_status(root, conversation_id)
            context = f"{MARKER}\n{status}\n{BOUNDARY}"
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
