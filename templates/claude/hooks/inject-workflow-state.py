#!/usr/bin/env python3
"""Claude Code ``UserPromptSubmit`` Hook wrapper (omp-flow adapter).

Event: ``UserPromptSubmit`` (single unmatched settings entry).

Injects the same documented workflow-state ``additionalContext`` as the session
bridge, but per turn: it calls the read-only Python control plane IN-PROCESS via
the shared ``_omp_core.run_core`` shim (task 07-22-dispatch-stutter, ADR-001
direction A') keyed by the raw ``session_id`` -- ``run_core`` exports
``OMP_FLOW_CONTEXT_ID=<raw session_id>`` inside this same interpreter, so no
second Python process is spawned -- and emits exactly one Claude JSON object.
Unlike ``session-start.py`` it does NOT touch ``CLAUDE_ENV_FILE`` -- that bridge
is a one-time session bootstrap concern.

Timeout (hazard H5): the former per-subprocess ``CORE_TIMEOUT`` is gone with the
subprocess itself; the ``.claude/settings.json`` ``UserPromptSubmit`` binding
(15s) bounds this whole hook -- Claude kills the hook process at that limit --
and the in-process core call is bounded read-only work.

Any failure is fail-closed: it injects a visible STOP ``additionalContext`` (never
a permissive/empty context) plus a ``systemMessage`` and exits 0 when possible;
otherwise it writes stderr and exits non-zero.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

EVENT = "UserPromptSubmit"
STATE_MARKER = "<!-- omp-flow-workflow-state -->"
CORE_KIND = "claude-workflow-state"


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
    """Resolve the workflow-state envelope in-process via ``_omp_core.run_core``.

    State-hook failure class (interface omp-core-shim-contract): BOTH
    ``CoreDenied`` (core validation/IO failure; ``reason`` byte-matches the old
    subprocess ``proc.stderr.strip()``) and ``CoreUnavailable`` (broken core
    install) map to ``_Fatal`` -> the visible STOP envelope at exit 0 -- never a
    silent empty or permissive context.
    """
    try:
        from _omp_core import CoreDenied, CoreUnavailable, run_core
    except ImportError as exc:  # missing shim = broken install: visible STOP.
        raise _Fatal(f"omp-flow core shim unavailable: {exc}") from exc
    try:
        result = run_core(
            root, CORE_KIND, {"session_id": session_id, "event": EVENT}, session_id
        )
    except CoreDenied as denied:
        raise _Fatal(denied.reason) from denied
    except CoreUnavailable as unavailable:
        raise _Fatal(str(unavailable)) from unavailable
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
