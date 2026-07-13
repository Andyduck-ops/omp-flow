#!/usr/bin/env python3
"""Claude Code ``PreToolUse(Agent|Task)`` Hook wrapper (omp-flow adapter).

This is the fail-closed pre-spawn boundary (finding: SubagentStart/SessionStart
cannot block; ``PreToolUse(Agent)`` is where a malformed/stale workflow dispatch
is denied before a subagent is spawned).

Flow (design 8 / claude-hook-contract "Dispatch Input/Output"):

- recognize a workflow dispatch only when ``tool_name`` is exactly ``Agent`` or
  ``Task``, ``tool_input`` is an object, ``tool_input.subagent_type`` is exactly
  one of the five managed names, and the first non-blank ``prompt`` line is one
  compact ``{"ompFlowDispatch": {...}}`` object;
- an unknown NON-reserved native agent passes through UNCHANGED (the sole
  intentional no-op: no stdout, exit 0). An unknown ``omp-flow-*`` name denies;
- the descriptor ``role`` must exactly equal the agent's role in the fixed map;
- call the read-only Python control plane (``claude-dispatch-context`` for
  research/architect/implement/check, ``claude-qbd-report`` for QbD) with
  ``OMP_FLOW_CONTEXT_ID=<raw session_id>``. Python performs all remaining
  validation (version, keys, ids, active-task/session agreement, per-row freeze,
  prepared-gate/digest/report) and exits non-zero to deny;
- on success preserve the COMPLETE native ``tool_input`` and replace only
  ``prompt`` with the dispatch marker + the exact Python handoff, returning
  ``permissionDecision: "allow"`` + ``updatedInput``;
- every recognized malformed/stale request returns ``permissionDecision: "deny"``
  with a visible reason (exit 0); an environment failure before a decision is
  possible exits 2 so Claude blocks the tool.

There is no multi-platform output, chat reconstruction, or pull fallback.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

EVENT = "PreToolUse"
DISPATCH_MARKER = "<!-- omp-flow-claude-dispatch:v1 -->"
CORE_TIMEOUT = 25  # settings.json allots 30s.

# Fixed agent -> (Python role, core hook kind). The ONLY recognized reserved
# names; the descriptor role must equal the listed role exactly.
_AGENT_MAP = {
    "omp-flow-research": ("researcher", "claude-dispatch-context"),
    "omp-flow-architect": ("architect", "claude-dispatch-context"),
    "omp-flow-implement": ("executor", "claude-dispatch-context"),
    "omp-flow-check": ("reviewer", "claude-dispatch-context"),
    "omp-flow-qbd": ("qbd-auditor", "claude-qbd-report"),
}
# Cap on the passed-through Python handoff (matches the OMP process boundary /
# workflow.MAX_CONTEXT_BYTES; Python also bounds it, this is defense in depth).
_MAX_PROMPT_BYTES = 8 * 1024 * 1024


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


class _Deny(Exception):
    """A recognized validation failure -> JSON deny, exit 0."""


class _Internal(Exception):
    """An environment failure before a valid decision -> stderr, exit 2."""


def _deny_envelope(reason: str) -> dict:
    return {
        "hookSpecificOutput": {
            "hookEventName": EVENT,
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }


def _read_payload() -> dict:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise _Internal(f"invalid JSON payload on stdin: {exc}") from exc
    if not isinstance(payload, dict):
        raise _Internal("payload must be a JSON object")
    return payload


def _project_root() -> Path:
    proj = os.environ.get("CLAUDE_PROJECT_DIR")
    if not proj or not proj.strip():
        raise _Internal("CLAUDE_PROJECT_DIR is not set")
    root = Path(proj).resolve()
    script = root / ".omp-flow" / "scripts" / "omp_flow.py"
    if not script.is_file():
        raise _Internal(f"managed omp-flow core not found at {script}")
    return root


def _require_session(payload: dict) -> str:
    sid = payload.get("session_id")
    if not isinstance(sid, str) or not sid.strip():
        raise _Deny("dispatch payload requires a non-empty string session_id")
    return sid


def _split_descriptor(prompt: str) -> tuple[dict, str]:
    """Return ``(descriptor_object, assignment)``.

    ``descriptor_object`` is the exact ``{"ompFlowDispatch": {...}}`` parsed from
    the first non-blank prompt line; ``assignment`` is the bounded remaining
    objective text. No role/task/row/gate is inferred from that text.
    """
    if not isinstance(prompt, str):
        raise _Deny("dispatch prompt must be a string")
    lines = prompt.splitlines()
    idx = next((i for i, line in enumerate(lines) if line.strip()), None)
    if idx is None:
        raise _Deny("dispatch prompt has no descriptor line")
    first = lines[idx].strip()
    try:
        obj = json.loads(first)
    except json.JSONDecodeError as exc:
        raise _Deny(f"first prompt line is not a JSON dispatch descriptor: {exc}") from exc
    if not isinstance(obj, dict) or set(obj.keys()) != {"ompFlowDispatch"}:
        raise _Deny("first prompt line must be exactly one ompFlowDispatch object")
    if not isinstance(obj["ompFlowDispatch"], dict):
        raise _Deny("ompFlowDispatch must be an object")
    assignment = "\n".join(lines[idx + 1:]).strip()
    return obj, assignment


def _run_core(root: Path, kind: str, core_payload: dict, session_id: str) -> dict:
    script = root / ".omp-flow" / "scripts" / "omp_flow.py"
    env = dict(os.environ)
    env["OMP_FLOW_CONTEXT_ID"] = session_id
    try:
        proc = subprocess.run(
            [sys.executable, "-X", "utf8", str(script), "--cwd", str(root), "hook", kind],
            input=json.dumps(core_payload, ensure_ascii=False),
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=env,
            timeout=CORE_TIMEOUT,
        )
    except subprocess.TimeoutExpired as exc:
        raise _Deny(f"omp-flow core validation timed out: {exc}") from exc
    except OSError as exc:
        raise _Internal(f"could not run the omp-flow core: {exc}") from exc
    if proc.returncode != 0:
        raise _Deny((proc.stderr or "omp-flow core denied the dispatch").strip())
    if len(proc.stdout.encode("utf-8")) > _MAX_PROMPT_BYTES:
        raise _Deny("omp-flow core returned an oversized dispatch; denying")
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise _Deny(f"omp-flow core returned invalid JSON: {exc}") from exc
    if not isinstance(result, dict):
        raise _Deny("omp-flow core returned an unexpected result")
    return result


def _dispatch() -> int:
    payload = _read_payload()

    tool_name = payload.get("tool_name")
    if tool_name not in ("Agent", "Task"):
        raise _Internal(f"agent-context hook fired for unexpected tool_name {tool_name!r}")

    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        raise _Deny("tool_input must be an object")

    subagent = tool_input.get("subagent_type")
    if not isinstance(subagent, str) or subagent not in _AGENT_MAP:
        # Unknown reserved name denies; any other native agent is the sole no-op.
        if isinstance(subagent, str) and subagent.startswith("omp-flow-"):
            raise _Deny(f"Unknown reserved omp-flow agent: {subagent!r}")
        return 0  # unknown non-reserved native agent -> quiet pass-through, no output.

    expected_role, kind = _AGENT_MAP[subagent]
    session_id = _require_session(payload)
    descriptor_obj, assignment = _split_descriptor(tool_input.get("prompt"))

    role = descriptor_obj["ompFlowDispatch"].get("role")
    if role != expected_role:
        raise _Deny(
            f"descriptor role {role!r} does not match agent {subagent} (expected {expected_role!r})"
        )

    root = _project_root()
    if kind == "claude-qbd-report":
        core_payload = {"session_id": session_id, "descriptor": descriptor_obj}
    else:
        core_payload = {"session_id": session_id, "assignment": assignment, "descriptor": descriptor_obj}

    result = _run_core(root, kind, core_payload, session_id)
    prompt_out = result.get("prompt")
    if not isinstance(prompt_out, str) or not prompt_out.strip():
        raise _Deny("omp-flow core returned no dispatch prompt")

    updated = dict(tool_input)  # preserve EVERY native field except prompt.
    updated["prompt"] = f"{DISPATCH_MARKER}\n{prompt_out}"
    _emit(
        {
            "hookSpecificOutput": {
                "hookEventName": EVENT,
                "permissionDecision": "allow",
                "updatedInput": updated,
            }
        }
    )
    return 0


def main() -> int:
    _utf8_streams()
    try:
        return _dispatch()
    except _Deny as deny:
        _emit(_deny_envelope(str(deny)))
        return 0
    except _Internal as internal:
        print(f"[omp-flow inject-agent-context] {internal}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 - fail closed: block the spawn.
        print(f"[omp-flow inject-agent-context] unexpected: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
