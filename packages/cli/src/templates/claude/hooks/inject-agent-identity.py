#!/usr/bin/env python3
"""Claude Code ``SubagentStart`` Hook wrapper (omp-flow adapter).

Event: ``SubagentStart`` (one exact matcher per managed frontmatter ``name``:
``omp-flow-research``/``-architect``/``-qbd``/``-implement``/``-check``).

This event cannot block (finding). Its ONLY job is to inject native identity so
each workflow agent can prove it was spawned as the exact expected type before it
acts. It validates ``session_id``, non-empty string ``agent_id``, and an
``agent_type`` exactly equal to one managed name, then emits, via documented
``hookSpecificOutput.additionalContext``:

    <!-- omp-flow-claude-identity:v1 -->
    {"agentId":"<native agent_id>","agentType":"<managed name>"}

It does NOT call Python, authorize spawn, or mutate any lifecycle/state. On any
failure it emits a STOP ``additionalContext`` that deliberately OMITS the identity
marker (so the agent's startup gate fires and it stops) plus a ``systemMessage``,
exiting 0 when serialization is possible; otherwise stderr + non-zero.
"""
from __future__ import annotations

import json
import sys

EVENT = "SubagentStart"
IDENTITY_MARKER = "<!-- omp-flow-claude-identity:v1 -->"
MANAGED_NAMES = frozenset(
    {
        "omp-flow-research",
        "omp-flow-architect",
        "omp-flow-qbd",
        "omp-flow-implement",
        "omp-flow-check",
    }
)


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
    """Identity could not be injected; the subagent must stop before acting."""


def _stop_envelope(reason: str) -> dict:
    # Intentionally NO identity marker: a missing marker is the agent's stop signal.
    return {
        "hookSpecificOutput": {
            "hookEventName": EVENT,
            "additionalContext": (
                "STOP: omp-flow could not inject a verified native identity for this "
                "subagent; it must not read, write, or run any tool.\n"
                f"Reason: {reason}"
            ),
        },
        "systemMessage": f"omp-flow SubagentStart hook failed: {reason}",
    }


def _identity_envelope(agent_id: str, agent_type: str) -> dict:
    identity = json.dumps(
        {"agentId": agent_id, "agentType": agent_type},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return {
        "hookSpecificOutput": {
            "hookEventName": EVENT,
            "additionalContext": f"{IDENTITY_MARKER}\n{identity}",
        }
    }


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

        sid = payload.get("session_id")
        if not isinstance(sid, str) or not sid.strip():
            raise _Fatal("payload requires a non-empty string session_id")

        agent_type = payload.get("agent_type")
        if not isinstance(agent_type, str) or agent_type not in MANAGED_NAMES:
            raise _Fatal(f"unrecognized SubagentStart agent_type: {agent_type!r}")

        agent_id = payload.get("agent_id")
        if not isinstance(agent_id, str) or not agent_id.strip():
            raise _Fatal("payload requires a non-empty string agent_id")

        envelope = _identity_envelope(agent_id, agent_type)
    except _Fatal as fatal:
        try:
            _emit(_stop_envelope(str(fatal)))
            return 0
        except OSError:
            print(f"[omp-flow inject-agent-identity] {fatal}", file=sys.stderr)
            return 1
    except Exception as exc:  # noqa: BLE001 - still cannot block; stop the subagent.
        try:
            _emit(_stop_envelope(f"unexpected: {exc}"))
            return 0
        except OSError:
            print(f"[omp-flow inject-agent-identity] unexpected: {exc}", file=sys.stderr)
            return 1
    _emit(envelope)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
