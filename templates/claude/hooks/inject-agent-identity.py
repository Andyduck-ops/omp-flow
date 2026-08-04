#!/usr/bin/env python3
"""Inject native identity plus one revision-bound Flow Status binding request."""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import sys
import time
from pathlib import Path
from typing import Any

EVENT = "SubagentStart"
IDENTITY_MARKER = "<!-- omp-flow-claude-identity:v1 -->"
BINDING_MARKER = "<!-- omp-flow-claude-binding-request:v1 -->"
MAX_STATE = 192 * 1024
MAX_AGE_MS = 30_000
NONCE_AGE_MS = 60_000
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


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


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


def _key(session_id: str) -> str:
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()


def _observer_path(root: Path, session_id: str) -> Path:
    return (
        root
        / ".omp-flow"
        / ".runtime"
        / "flow-status"
        / "claude-observer"
        / f"{_key(session_id)}.json"
    )


def _auth_path(root: Path, session_id: str) -> Path:
    return (
        root
        / ".omp-flow"
        / ".runtime"
        / "flow-status"
        / "claude-auth"
        / f"{_key(session_id)}.json"
    )


def _load_observer(path: Path, session_id: str, now_ms: int) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size > MAX_STATE:
        raise Fatal("complete TaskList baseline is unavailable")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise Fatal("TaskList baseline is malformed") from exc
    if (
        not isinstance(value, dict)
        or value.get("version") != 1
        or value.get("sessionId") != session_id
        or not isinstance(value.get("tasks"), list)
        or not isinstance(value.get("adapterSequence"), int)
        or not isinstance(value.get("lastObservedAtUnixMs"), int)
        or now_ms - value["lastObservedAtUnixMs"] > MAX_AGE_MS
    ):
        raise Fatal("TaskList baseline is stale or malformed")
    active = [
        item
        for item in value["tasks"]
        if isinstance(item, dict) and item.get("state") == "active"
    ]
    if len(active) != 1 or not isinstance(active[0].get("taskId"), str):
        raise Fatal("exactly one current Task is required")
    return value


def _membership_revision(tasks: list[Any], sequence: int) -> str:
    pairs = sorted(
        (
            [item["taskId"], item["label"], item["state"]]
            for item in tasks
            if isinstance(item, dict)
        ),
        key=lambda item: item[0].encode("utf-8"),
    )
    encoded = json.dumps(
        [sequence, pairs], ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _load_auth(path: Path, root: Path, session_id: str) -> dict[str, Any]:
    if not path.is_file():
        return {
            "version": 1,
            "repositoryRoot": str(root),
            "sessionId": session_id,
            "bindings": {},
            "reservations": {},
        }
    if path.stat().st_size > MAX_STATE:
        raise Fatal("authorization state is oversized")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise Fatal("authorization state is malformed") from exc
    if (
        not isinstance(value, dict)
        or set(value)
        != {"version", "repositoryRoot", "sessionId", "bindings", "reservations"}
        or value["version"] != 1
        or value["repositoryRoot"] != str(root)
        or value["sessionId"] != session_id
        or not isinstance(value["bindings"], dict)
        or not isinstance(value["reservations"], dict)
    ):
        raise Fatal("authorization state is malformed")
    return value


def _write(path: Path, value: dict[str, Any]) -> None:
    encoded = (
        json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode("utf-8")
    if len(encoded) > MAX_STATE:
        raise Fatal("authorization state is oversized")
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


def _binding_envelope(agent_id: str, agent_type: str, binding: dict[str, Any]) -> dict[str, Any]:
    identity = {"agentId": agent_id, "agentType": agent_type}
    request = {
        "taskId": binding["taskId"],
        "owner": agent_id,
        "metadata": {
            "flowStatusBindingV1": {
                "version": 1,
                "taskSetRevision": binding["taskSetRevision"],
                "agentId": agent_id,
                "agentType": agent_type,
                "nonce": binding["nonce"],
            }
        },
    }
    context = "\n".join(
        (
            IDENTITY_MARKER,
            json.dumps(identity, ensure_ascii=False, separators=(",", ":")),
            BINDING_MARKER,
            json.dumps(request, ensure_ascii=False, separators=(",", ":")),
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
                "STOP: omp-flow could not inject a revision-bound native identity and "
                f"TaskUpdate binding request. Reason: {reason[:256]}"
            ),
        },
        "systemMessage": "omp-flow SubagentStart identity/binding unavailable",
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
        now_ms = _now_ms()
        observer = _load_observer(_observer_path(root, session_id), session_id, now_ms)
        current = next(item for item in observer["tasks"] if item["state"] == "active")
        membership = _membership_revision(
            observer["tasks"], observer["adapterSequence"]
        )
        auth_path = _auth_path(root, session_id)
        lock = auth_path.with_suffix(".lock")
        lock.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
        os.close(descriptor)
        try:
            auth = _load_auth(auth_path, root, session_id)
            auth["bindings"].pop(agent_id, None)
            for tool_use_id, reservation in list(auth["reservations"].items()):
                if isinstance(reservation, dict) and reservation.get("agentId") == agent_id:
                    auth["reservations"].pop(tool_use_id, None)
            binding = {
                "repositoryRoot": str(root),
                "sessionId": session_id,
                "taskSetId": hashlib.sha256(
                    f"claude:{session_id}".encode("utf-8")
                ).hexdigest(),
                "taskSetRevision": membership,
                "membershipRevision": membership,
                "taskId": current["taskId"],
                "agentId": agent_id,
                "agentType": agent_type,
                "nonce": secrets.token_urlsafe(24),
                "issuedAtUnixMs": now_ms,
                "expiresAtUnixMs": now_ms + NONCE_AGE_MS,
                "state": "pending",
                "progress": None,
            }
            auth["bindings"][agent_id] = binding
            _write(auth_path, auth)
        finally:
            lock.unlink(missing_ok=True)
        _emit(_binding_envelope(agent_id, agent_type, binding))
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
