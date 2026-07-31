#!/usr/bin/env python3
"""Fail-closed PreToolUse(TaskUpdate) authorization for managed omp-flow agents."""
from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

MAX_INPUT = 256 * 1024
MAX_STATE = 192 * 1024
MANAGED = frozenset(
    {
        "omp-flow-research",
        "omp-flow-architect",
        "omp-flow-qbd",
        "omp-flow-implement",
        "omp-flow-check",
    }
)


class Denied(ValueError):
    """The managed native mutation is outside the closed Flow Status contract."""


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


def _emit(decision: str, reason: str | None = None) -> None:
    output: dict[str, Any] = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
        }
    }
    if reason is not None:
        output["hookSpecificOutput"]["permissionDecisionReason"] = reason[:160]
    sys.stdout.write(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    sys.stdout.flush()


def _read_payload() -> dict[str, Any]:
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT:
        raise Denied("payload-too-large")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise Denied("malformed-input") from exc
    if not isinstance(value, dict):
        raise Denied("malformed-input")
    return value


def _text(value: Any, name: str, maximum: int = 256) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise Denied(name)
    return value


def _root(payload: dict[str, Any]) -> Path:
    candidate = os.environ.get("CLAUDE_PROJECT_DIR", "").strip() or _text(
        payload.get("cwd"), "repository", 4096
    )
    root = Path(candidate).resolve()
    if not (root / ".omp-flow").is_dir():
        raise Denied("repository")
    return root


def _state_path(root: Path, session_id: str) -> Path:
    key = hashlib.sha256(session_id.encode("utf-8")).hexdigest()
    override = os.environ.get("OMP_FLOW_GUARD_STATE_ROOT", "").strip()
    if override:
        state_root = Path(override).resolve()
    else:
        state_root = (
            root
            / ".omp-flow"
            / ".runtime"
            / "flow-status"
            / "claude-auth"
        )
    return state_root / f"{key}.json"


def _load(path: Path, session_id: str) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size > MAX_STATE:
        raise Denied("missing-authorization")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise Denied("authorization-state") from exc
    if (
        not isinstance(value, dict)
        or set(value) != {
            "version",
            "repositoryRoot",
            "sessionId",
            "bindings",
            "reservations",
        }
        or value["version"] != 1
        or value["sessionId"] != session_id
        or not isinstance(value["bindings"], dict)
        or not isinstance(value["reservations"], dict)
    ):
        raise Denied("authorization-state")
    return value


def _write(path: Path, value: dict[str, Any]) -> None:
    encoded = (
        json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode("utf-8")
    if len(encoded) > MAX_STATE:
        raise Denied("authorization-state")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f".{os.getpid()}.{time.time_ns()}.tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _lock_path(path: Path) -> Path:
    return path.with_suffix(".lock")


def _binding_object(binding: dict[str, Any]) -> dict[str, Any]:
    return {
        "version": 1,
        "taskSetRevision": binding["taskSetRevision"],
        "agentId": binding["agentId"],
        "agentType": binding["agentType"],
        "nonce": binding["nonce"],
    }


def _progress(value: Any, binding: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {
        "version",
        "label",
        "unit",
        "current",
        "total",
        "unitSetRevision",
        "sourceRevision",
    }:
        raise Denied("progress-shape")
    if value["version"] != 1:
        raise Denied("progress-version")
    label = _text(value["label"], "progress-label", 64)
    unit = _text(value["unit"], "progress-unit", 64)
    current = value["current"]
    total = value["total"]
    if (
        not isinstance(total, int)
        or isinstance(total, bool)
        or not 1 <= total <= 32
        or not isinstance(current, int)
        or isinstance(current, bool)
        or not 0 <= current <= total
    ):
        raise Denied("progress-range")
    unit_revision = _text(value["unitSetRevision"], "progress-unit-set", 128)
    source_revision = _text(value["sourceRevision"], "progress-source", 128)
    previous = binding.get("progress")
    if previous is not None:
        if (
            previous["label"] != label
            or previous["unit"] != unit
            or previous["total"] != total
            or previous["unitSetRevision"] != unit_revision
            or current <= previous["current"]
            or source_revision == previous["sourceRevision"]
        ):
            raise Denied("progress-transition")
    return {
        "version": 1,
        "label": label,
        "unit": unit,
        "current": current,
        "total": total,
        "unitSetRevision": unit_revision,
        "sourceRevision": source_revision,
    }


def _authorize(
    payload: dict[str, Any],
    state: dict[str, Any],
    now_ms: int,
) -> tuple[str, dict[str, Any]]:
    agent_id = _text(payload.get("agent_id"), "agent-id")
    agent_type = _text(payload.get("agent_type"), "agent-type")
    tool_use_id = _text(payload.get("tool_use_id"), "tool-use-id")
    if payload.get("tool_name") != "TaskUpdate":
        raise Denied("tool-name")
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        raise Denied("tool-input")
    if tool_use_id in state["reservations"]:
        raise Denied("tool-use-replay")
    binding = state["bindings"].get(agent_id)
    if (
        not isinstance(binding, dict)
        or binding.get("agentId") != agent_id
        or binding.get("agentType") != agent_type
        or binding.get("expiresAtUnixMs", 0) <= now_ms
    ):
        raise Denied("binding")
    expected = _binding_object(binding)
    task_id = binding["taskId"]
    intent: str
    progress: dict[str, Any] | None = None
    if set(tool_input) == {"taskId", "owner", "metadata"}:
        if binding.get("state") != "pending":
            raise Denied("binding-consumed")
        if tool_input["taskId"] != task_id or tool_input["owner"] != agent_id:
            raise Denied("binding-target")
        metadata = tool_input["metadata"]
        if (
            not isinstance(metadata, dict)
            or set(metadata) != {"flowStatusBindingV1"}
            or metadata["flowStatusBindingV1"] != expected
        ):
            raise Denied("binding-metadata")
        intent = "bind"
    elif set(tool_input) == {"taskId", "metadata"}:
        if binding.get("state") != "consumed" or tool_input["taskId"] != task_id:
            raise Denied("progress-binding")
        metadata = tool_input["metadata"]
        if (
            not isinstance(metadata, dict)
            or set(metadata) != {"flowStatusBindingV1", "flowStatusProgressV1"}
            or metadata["flowStatusBindingV1"] != expected
        ):
            raise Denied("progress-metadata")
        progress = _progress(metadata["flowStatusProgressV1"], binding)
        intent = "progress"
    else:
        raise Denied("mutation-shape")
    if any(
        isinstance(reservation, dict)
        and reservation.get("agentId") == agent_id
        and reservation.get("state") == "reserved"
        for reservation in state["reservations"].values()
    ):
        raise Denied("concurrent-reservation")
    reservation = {
        "state": "reserved",
        "intent": intent,
        "toolUseId": tool_use_id,
        "agentId": agent_id,
        "agentType": agent_type,
        "taskId": task_id,
        "toolInput": tool_input,
        "progress": progress,
        "reservedAtUnixMs": now_ms,
    }
    state["reservations"][tool_use_id] = reservation
    return tool_use_id, reservation


def _run(payload: dict[str, Any], now_ms: int | None = None) -> None:
    agent_type = payload.get("agent_type")
    if agent_type not in MANAGED:
        return
    session_id = _text(payload.get("session_id"), "session-id")
    root = _root(payload)
    state_path = _state_path(root, session_id)
    lock = _lock_path(state_path)
    lock.parent.mkdir(parents=True, exist_ok=True)
    descriptor: int | None = None
    try:
        descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
        os.close(descriptor)
        descriptor = None
        state = _load(state_path, session_id)
        if state["repositoryRoot"] != str(root):
            raise Denied("repository")
        _authorize(payload, state, _now_ms() if now_ms is None else now_ms)
        _write(state_path, state)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        lock.unlink(missing_ok=True)
    _emit("allow")


def _self_test() -> int:
    with tempfile.TemporaryDirectory(prefix="omp-flow-guard-") as directory:
        root = Path(directory).resolve()
        (root / ".omp-flow").mkdir()
        state_root = root / "state"
        os.environ["OMP_FLOW_GUARD_STATE_ROOT"] = str(state_root)
        os.environ["CLAUDE_PROJECT_DIR"] = str(root)
        session = "self-test-session"
        agent = "self-test-agent"
        binding = {
            "repositoryRoot": str(root),
            "sessionId": session,
            "taskSetId": "task-set",
            "taskSetRevision": "task-set-revision",
            "membershipRevision": "membership-revision",
            "taskId": "task-1",
            "agentId": agent,
            "agentType": "omp-flow-implement",
            "nonce": "nonce",
            "issuedAtUnixMs": 1_900_000_000_000,
            "expiresAtUnixMs": 1_900_000_060_000,
            "state": "pending",
            "progress": None,
        }
        state = {
            "version": 1,
            "repositoryRoot": str(root),
            "sessionId": session,
            "bindings": {agent: binding},
            "reservations": {},
        }
        path = _state_path(root, session)
        _write(path, state)
        payload = {
            "session_id": session,
            "agent_id": agent,
            "agent_type": "omp-flow-implement",
            "tool_use_id": "tool-bind",
            "tool_name": "TaskUpdate",
            "cwd": str(root),
            "tool_input": {
                "taskId": "task-1",
                "owner": agent,
                "metadata": {"flowStatusBindingV1": _binding_object(binding)},
            },
        }
        updated = _load(path, session)
        _authorize(payload, updated, 1_900_000_000_100)
        if updated["reservations"]["tool-bind"]["intent"] != "bind":
            return 2
        denied = dict(payload)
        denied["tool_use_id"] = "tool-denied"
        denied["tool_input"] = {**payload["tool_input"], "status": "completed"}
        try:
            _authorize(denied, updated, 1_900_000_000_200)
            return 2
        except Denied:
            pass
    sys.stdout.write('{"version":1,"guardConformant":true}\n')
    return 0


def main() -> int:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    if "--self-test" in sys.argv:
        return _self_test()
    payload: dict[str, Any] | None = None
    try:
        payload = _read_payload()
        _run(payload)
        return 0
    except Exception as exc:  # noqa: BLE001 - managed calls must fail closed.
        if payload is not None and payload.get("agent_type") not in MANAGED:
            return 0
        try:
            _emit("deny", str(exc) if isinstance(exc, Denied) else "internal-failure")
            return 0
        except Exception:  # noqa: BLE001 - stdout denial failed, exit 2 blocks.
            sys.stderr.write("omp-flow TaskUpdate authorization denied\n")
            return 2


if __name__ == "__main__":
    raise SystemExit(main())
