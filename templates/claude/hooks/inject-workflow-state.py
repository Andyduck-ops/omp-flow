#!/usr/bin/env python3
"""Claude Code ``UserPromptSubmit`` Hook wrapper (omp-flow adapter).

Event: ``UserPromptSubmit`` (single unmatched settings entry).

Injects the same documented workflow-state ``additionalContext`` as the session
bridge, but per turn: it re-runs the read-only Python control plane keyed by the
raw ``session_id`` (exported as ``OMP_FLOW_CONTEXT_ID`` to the child) and emits
exactly one Claude JSON object. Unlike ``session-start.py`` it does NOT touch
``CLAUDE_ENV_FILE`` -- that bridge is a one-time session bootstrap concern.

Any failure is fail-closed: it injects a visible STOP ``additionalContext`` (never
a permissive/empty context) plus a ``systemMessage`` and exits 0 when possible;
otherwise it writes stderr and exits non-zero.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

EVENT = "UserPromptSubmit"
STATE_MARKER = "<!-- omp-flow-workflow-state -->"
CORE_KIND = "claude-workflow-state"
CORE_TIMEOUT = 12  # settings.json allots 15s; keep headroom to serialize a decision.


def _utf8_streams() -> None:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
            except (ValueError, OSError):
                pass


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


class _Fatal(Exception):
    """A failure that must stop workflow delegation for this turn."""


def _stop_envelope(reason: str) -> dict:
    return {
        "hookSpecificOutput": {
            "hookEventName": EVENT,
            "additionalContext": (
                f"{STATE_MARKER}\n<workflow-state>\n"
                "STOP: omp-flow workflow-state injection failed; do not proceed with "
                "workflow delegation using stale or absent state.\n"
                f"Reason: {reason}\n"
                "</workflow-state>"
            ),
        },
        "systemMessage": f"omp-flow UserPromptSubmit hook failed: {reason}",
    }


def _project_root() -> Path:
    proj = os.environ.get("CLAUDE_PROJECT_DIR")
    if not proj or not proj.strip():
        raise _Fatal("CLAUDE_PROJECT_DIR is not set")
    root = Path(proj).resolve()
    script = root / ".omp-flow" / "scripts" / "omp_flow.py"
    if not script.is_file():
        raise _Fatal(f"managed omp-flow core not found at {script}")
    return root


def _session_id(payload: dict) -> str:
    sid = payload.get("session_id")
    if not isinstance(sid, str) or not sid.strip():
        raise _Fatal("payload requires a non-empty string session_id")
    return sid


def _workflow_state(root: Path, session_id: str) -> dict:
    script = root / ".omp-flow" / "scripts" / "omp_flow.py"
    env = dict(os.environ)
    env["OMP_FLOW_CONTEXT_ID"] = session_id
    try:
        proc = subprocess.run(
            [sys.executable, "-X", "utf8", str(script), "--cwd", str(root), "hook", CORE_KIND],
            input=json.dumps({"session_id": session_id, "event": EVENT}, ensure_ascii=False),
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=env,
            timeout=CORE_TIMEOUT,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise _Fatal(f"could not run the omp-flow core: {exc}") from exc
    if proc.returncode != 0:
        raise _Fatal((proc.stderr or "omp-flow core failed").strip())
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise _Fatal(f"omp-flow core returned invalid JSON: {exc}") from exc
    if not isinstance(result, dict) or "hookSpecificOutput" not in result:
        raise _Fatal("omp-flow core returned an unexpected envelope")
    return result


def main() -> int:
    _utf8_streams()
    try:
        raw = sys.stdin.read()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise _Fatal(f"invalid JSON payload on stdin: {exc}") from exc
        if not isinstance(payload, dict):
            raise _Fatal("payload must be a JSON object")
        session_id = _session_id(payload)
        root = _project_root()
        envelope = _workflow_state(root, session_id)
    except _Fatal as fatal:
        try:
            _emit(_stop_envelope(str(fatal)))
            return 0
        except OSError:
            print(f"[omp-flow inject-workflow-state] {fatal}", file=sys.stderr)
            return 1
    _emit(envelope)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
