#!/usr/bin/env python3
"""Inject native identity for the current harness session."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

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


class Fatal(ValueError):
    """Identity/binding cannot be established; the managed subagent must stop."""


def _emit(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def _text(value: Any, name: str, maximum: int = 256) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise Fatal(name)
    return value


def _root(payload: dict[str, Any]) -> Path:
    candidate = os.environ.get("CLAUDE_PROJECT_DIR", "").strip() or _text(
        payload.get("cwd"), "cwd", 4096
    )
    root = Path(candidate).resolve()
    if not (root / ".omp-flow").is_dir():
        raise Fatal("repository")
    return root


def _binding_envelope(agent_id: str, agent_type: str) -> dict[str, Any]:
    identity = {"agentId": agent_id, "agentType": agent_type}
    context = "\n".join(
        (
            IDENTITY_MARKER,
            json.dumps(identity, ensure_ascii=False, separators=(",", ":")),
        )
    )
    return {
        "hookSpecificOutput": {
            "hookEventName": EVENT,
            "additionalContext": context,
        }
    }


def _stop(reason: str) -> dict[str, Any]:
    return {
        "hookSpecificOutput": {
            "hookEventName": EVENT,
            "additionalContext": (
                f"STOP: omp-flow could not inject native identity. Reason: {reason[:256]}"
            ),
        },
            "systemMessage": "omp-flow SubagentStart identity unavailable",
    }


def main() -> int:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        raw = sys.stdin.buffer.read(256 * 1024 + 1)
        if len(raw) > 256 * 1024:
            raise Fatal("payload-too-large")
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise Fatal("payload")
        session_id = _text(payload.get("session_id"), "session_id")
        agent_id = _text(payload.get("agent_id"), "agent_id")
        agent_type = _text(payload.get("agent_type"), "agent_type")
        if agent_type not in MANAGED_NAMES:
            raise Fatal("unrecognized managed agent_type")
        root = _root(payload)
        _emit(_binding_envelope(agent_id, agent_type))
        return 0
    except Exception as exc:  # noqa: BLE001 - SubagentStart cannot block; injected STOP does.
        try:
            _emit(_stop(str(exc)))
            return 0
        except OSError:
            sys.stderr.write("omp-flow SubagentStart identity/binding unavailable\n")
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
