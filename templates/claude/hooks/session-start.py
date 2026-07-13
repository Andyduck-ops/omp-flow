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
   read-only Python control plane with ``OMP_FLOW_CONTEXT_ID=<raw session_id>``
   in the child environment;
5. emit exactly one Claude JSON object on stdout.

``SessionStart`` cannot block. Any bootstrap failure is fail-closed: it returns a
fatal ``additionalContext`` that tells omp-flow workflow delegation to STOP plus
a ``systemMessage`` and exits 0 while serialization is possible; if even that is
impossible it writes stderr and exits non-zero (visible on Claude >= 2.1.199).
"""
from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

EVENT = "SessionStart"
STATE_MARKER = "<!-- omp-flow-workflow-state -->"
CORE_KIND = "claude-workflow-state"
CORE_TIMEOUT = 25  # settings.json allots 30s; keep headroom to serialize a decision.


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
    ``CLAUDE_ENV_FILE`` so *later* Bash lifecycle calls MAY resolve the same session.

    This bridge is deliberately NON-fatal. Some Claude Code builds/platforms do not
    source ``CLAUDE_ENV_FILE`` into the Bash tool environment (observed: the Bash tool
    sees neither ``CLAUDE_ENV_FILE`` nor ``CLAUDE_PROJECT_DIR``), so the export never
    reaches Bash. Making a missing/unwritable env-file STOP the whole session would be
    disproportionate for a convenience channel — and the kernel forbids a global
    active-task fallback (session identity is per-session by law). When the bridge is
    unavailable, lifecycle Bash calls resolve identity explicitly via
    ``--task`` / ``OMP_FLOW_CONTEXT_ID`` instead. Workflow-state injection (the
    load-bearing SessionStart output) is unaffected. Returns a short status note for
    diagnostics, or ``None`` on success."""
    env_file = os.environ.get("CLAUDE_ENV_FILE")
    if not env_file or not env_file.strip():
        return "CLAUDE_ENV_FILE unset; pass identity explicitly to Bash lifecycle calls"
    try:
        # shlex.quote emits POSIX quoting, matching the Bash shell that sources
        # CLAUDE_ENV_FILE; the raw session id is never logged or used as a filename.
        with open(env_file, "a", encoding="utf-8") as handle:
            handle.write(f"export OMP_FLOW_CONTEXT_ID={shlex.quote(session_id)}\n")
    except OSError as exc:
        return f"could not write CLAUDE_ENV_FILE ({exc}); pass identity explicitly"
    return None


def _workflow_state(root: Path, session_id: str) -> dict:
    script = root / ".omp-flow" / "scripts" / "omp_flow.py"
    env = dict(os.environ)
    env["OMP_FLOW_CONTEXT_ID"] = session_id  # raw session id -> Python session identity.
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
