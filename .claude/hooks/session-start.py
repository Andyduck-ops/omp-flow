#!/usr/bin/env python3
"""Claude Code ``SessionStart`` Hook wrapper (omp-flow adapter).

Event: ``SessionStart`` (bound to the ``startup``/``resume``/``clear``/``compact``
matchers in ``.claude/settings.json``).

Responsibilities (claude-hook-contract "Session And Encoding" / design 7):

1. read one UTF-8 JSON object on stdin;
2. resolve the confined project root from ``CLAUDE_PROJECT_DIR`` and the managed
   ``.omp-flow/scripts/omp_flow.py`` core;
3. append ``export OMP_FLOW_CONTEXT_ID=<shlex-quoted raw session_id>`` to
   ``CLAUDE_ENV_FILE`` so *later* Claude Bash commands resolve the same session
   record (this bridge is NOT relied on to reach other Hooks);
4. inject documented workflow-state ``additionalContext`` by calling the
   read-only Python control plane IN-PROCESS via the shared
   ``_omp_core.run_core`` shim (task 07-22-dispatch-stutter, ADR-001 direction
   A'), which exports ``OMP_FLOW_CONTEXT_ID=<raw session_id>`` inside this same
   interpreter -- no second Python process is spawned;
5. emit exactly one Claude JSON object on stdout.

Timeout (hazard H5): the former per-subprocess ``CORE_TIMEOUT`` is gone with the
subprocess itself; the ``.claude/settings.json`` ``SessionStart`` binding (30s)
bounds this whole hook -- Claude kills the hook process at that limit -- and the
in-process core call is bounded read-only work.

``SessionStart`` cannot block. Any bootstrap failure is fail-closed: it returns a
fatal ``additionalContext`` that tells omp-flow workflow delegation to STOP plus
a ``systemMessage`` and exits 0 while serialization is possible; if even that is
impossible it writes stderr and exits non-zero (visible on Claude >= 2.1.199).
"""
from __future__ import annotations

import json
import os
import shlex
import sys
from pathlib import Path

EVENT = "SessionStart"
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
    """A bootstrap failure that must stop workflow delegation."""


def _stop_envelope(reason: str) -> dict:
    return {
        "hookSpecificOutput": {
            "hookEventName": EVENT,
            "additionalContext": (
                f"{STATE_MARKER}\n<workflow-state>\n"
                "STOP: omp-flow SessionStart bootstrap failed; omp-flow commands and "
                "workflow delegation must not proceed until this is repaired.\n"
                f"Reason: {reason}\n"
                "</workflow-state>"
            ),
        },
        "systemMessage": f"omp-flow SessionStart hook failed: {reason}",
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


def _bridge_env_file(session_id: str) -> str | None:
    """Best-effort bridge: append ``export OMP_FLOW_CONTEXT_ID=<id>`` to
    ``CLAUDE_ENV_FILE`` so later Claude Bash tool calls resolve the same session.

    Verified mechanism (Claude Code 2.1.211; finding rt2-identity-premise-shift, probes
    E1-E5): Claude persists this hook's ``CLAUDE_ENV_FILE`` as a per-session
    ``~/.claude/session-env/<session_id>/sessionstart-hook-*.sh`` and SOURCES it into
    every Bash tool shell, so ``OMP_FLOW_CONTEXT_ID`` reaches later Bash lifecycle calls
    and ``omp_flow.py status`` resolves the session-active task with no explicit
    ``--task``. Sub-agents inherit the parent's session id, so dispatched agents' Bash
    calls resolve the same active task. The Bash tool itself NOT seeing
    ``CLAUDE_ENV_FILE`` / ``CLAUDE_PROJECT_DIR`` in its own environment is NORMAL — those
    are hook-only variables, not evidence the bridge failed.

    Still deliberately NON-fatal: a missing/unwritable env file must never STOP the
    session (workflow-state injection, the load-bearing SessionStart output, is
    unaffected), and the kernel forbids a global active-task fallback (session identity
    is per-session by law). On any older/exotic build that does not source the file,
    lifecycle Bash calls resolve identity explicitly via ``--task`` /
    ``OMP_FLOW_CONTEXT_ID`` instead.

    Idempotent by design: SessionStart fires on startup/resume/clear/compact and the same
    env file is reused across firings, so an already-present export line is left as-is —
    exactly one ``OMP_FLOW_CONTEXT_ID`` line survives any number of firings.

    Contingency (recorded, NOT built here): if a future build stops sourcing the env
    file, the schema-valid fallback is a PreToolUse(Bash) command-prefix rewrite
    (``updatedInput.command`` prepending ``OMP_FLOW_CONTEXT_ID='<id>' ``; rt2 probe E7),
    at the cost of permission prefix-rule matching, visible-command distortion, and guard
    coordination. Revisit trigger (recorded only): 2.1.211 ships NO native PowerShell
    execution tool; if Anthropic lands one, the POSIX ``export`` file will not parse
    there. Returns a short diagnostics note, or ``None`` on success / idempotent skip."""
    env_file = os.environ.get("CLAUDE_ENV_FILE")
    if not env_file or not env_file.strip():
        return "CLAUDE_ENV_FILE unset; pass identity explicitly to Bash lifecycle calls"
    # shlex.quote emits POSIX quoting, matching the Bash shell that sources
    # CLAUDE_ENV_FILE; the raw session id is never logged or used as a filename.
    export_line = f"export OMP_FLOW_CONTEXT_ID={shlex.quote(session_id)}"
    try:
        with open(env_file, "r", encoding="utf-8") as handle:
            already_present = any(line.rstrip("\r\n") == export_line for line in handle)
    except FileNotFoundError:
        already_present = False
    except OSError as exc:
        return f"could not read CLAUDE_ENV_FILE ({exc}); pass identity explicitly"
    if already_present:
        return None
    try:
        with open(env_file, "a", encoding="utf-8") as handle:
            handle.write(export_line + "\n")
    except OSError as exc:
        return f"could not write CLAUDE_ENV_FILE ({exc}); pass identity explicitly"
    return None


def _workflow_state(root: Path, session_id: str) -> dict:
    """Resolve the workflow-state envelope in-process via ``_omp_core.run_core``.

    State-hook failure class (interface omp-core-shim-contract): BOTH
    ``CoreDenied`` (core validation/IO failure; ``reason`` byte-matches the old
    subprocess ``proc.stderr.strip()``) and ``CoreUnavailable`` (broken core
    install) map to ``_Fatal`` -> the visible STOP envelope at exit 0 -- never a
    silent empty or permissive context. The no-active-task session is NOT a
    failure (hazard H2): the core renders the ``no_task`` state block.
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
        _bridge_env_file(session_id)
        envelope = _workflow_state(root, session_id)
    except _Fatal as fatal:
        try:
            _emit(_stop_envelope(str(fatal)))
            return 0
        except OSError:
            print(f"[omp-flow session-start] {fatal}", file=sys.stderr)
            return 1
    _emit(envelope)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
