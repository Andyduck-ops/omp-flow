#!/usr/bin/env python3
"""Project Claude structured task hooks into the bounded Flow Status observation API."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

MAX_INPUT_BYTES = 256 * 1024
MAX_TASKS = 128
MAX_STATE_BYTES = 192 * 1024
MAX_AGE_MS = 30_000
FUTURE_TOLERANCE_MS = 2_000
MAX_RECENT_TOOL_USE_IDS = 128
MAX_ATTENTION_STARTS = 16
SOURCE_ID = "claude-task-list"
CAPABILITY = "claudeTaskListV1"
VALID_SESSION_STARTS = {"startup", "resume", "clear", "compact", "fork"}
STATE_MAP = {
    "completed": "completed",
    "in_progress": "active",
    "pending": "pending",
    "failed": "failed",
}


class ObservationError(ValueError):
    """A bounded hook payload cannot establish an authoritative observation."""


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


def _bounded_string(value: Any, name: str, maximum: int = 512) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ObservationError(f"{name} must be a non-empty string up to {maximum} characters")
    return value


def _read_payload() -> dict[str, Any]:
    raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(raw) > MAX_INPUT_BYTES:
        raise ObservationError("hook payload exceeds 256 KiB")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ObservationError("hook payload is not valid UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise ObservationError("hook payload must be an object")
    return value


def _root(payload: dict[str, Any]) -> Path:
    configured = os.environ.get("CLAUDE_PROJECT_DIR", "").strip()
    candidate = configured or _bounded_string(payload.get("cwd"), "cwd", 4096)
    root = Path(candidate).resolve()
    if not (root / ".omp-flow" / "scripts" / "omp_flow.py").is_file():
        raise ObservationError("omp-flow runtime kernel is unavailable")
    return root


def _state_path(root: Path, session_id: str) -> Path:
    key = hashlib.sha256(session_id.encode("utf-8")).hexdigest()
    return root / ".omp-flow" / ".runtime" / "flow-status" / "claude-observer" / f"{key}.json"


def _auth_path(root: Path, session_id: str) -> Path:
    key = hashlib.sha256(session_id.encode("utf-8")).hexdigest()
    return root / ".omp-flow" / ".runtime" / "flow-status" / "claude-auth" / f"{key}.json"


def _persisted_tasks_valid(value: Any) -> bool:
    if not isinstance(value, list) or len(value) > MAX_TASKS:
        return False
    seen: set[str] = set()
    for member in value:
        if (
            not isinstance(member, dict)
            or set(member) != {"taskId", "label", "state"}
            or not isinstance(member["taskId"], str)
            or not member["taskId"].strip()
            or len(member["taskId"]) > 256
            or not isinstance(member["label"], str)
            or not member["label"].strip()
            or len(member["label"]) > 512
            or member["state"] not in STATE_MAP.values()
            or member["taskId"] in seen
        ):
            return False
        seen.add(member["taskId"])
    return True


def _load_state(
    path: Path, session_id: str, now_ms: int
) -> tuple[dict[str, Any] | None, str | None]:
    try:
        if not path.is_file() or path.stat().st_size > MAX_STATE_BYTES:
            return None, "missing"
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None, "malformed"
    if (
        not isinstance(value, dict)
        or value.get("version") != 1
        or value.get("sessionId") != session_id
        or value.get("sessionStartKind") not in VALID_SESSION_STARTS
        or not isinstance(value.get("adapterSequence"), int)
        or value["adapterSequence"] < 1
        or not _persisted_tasks_valid(value.get("tasks"))
        or not isinstance(value.get("lastObservedAtUnixMs"), int)
        or value["lastObservedAtUnixMs"] < 0
        or not isinstance(value.get("recentToolUseIds"), list)
        or len(value["recentToolUseIds"]) > MAX_RECENT_TOOL_USE_IDS
        or any(
            not isinstance(tool_use_id, str) or not tool_use_id
            for tool_use_id in value["recentToolUseIds"]
        )
        or len(set(value["recentToolUseIds"])) != len(value["recentToolUseIds"])
        or not isinstance(value.get("attentionStarts", {}), dict)
        or len(value.get("attentionStarts", {})) > MAX_ATTENTION_STARTS
        or not isinstance(value.get("warnings", []), list)
        or len(value.get("warnings", [])) > MAX_ATTENTION_STARTS
    ):
        return None, "malformed"
    age_ms = now_ms - value["lastObservedAtUnixMs"]
    if age_ms > MAX_AGE_MS or age_ms < -FUTURE_TOLERANCE_MS:
        return value, "stale"
    return value, None


def _write_state(path: Path, state: dict[str, Any]) -> None:
    encoded = (json.dumps(state, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    if len(encoded) > MAX_STATE_BYTES:
        raise ObservationError("Claude task observation state exceeds its size limit")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f".{os.getpid()}.tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _load_auth(path: Path, root: Path, session_id: str) -> dict[str, Any] | None:
    try:
        if not path.is_file() or path.stat().st_size > MAX_STATE_BYTES:
            return None
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None
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
        return None
    return value


def _write_auth(path: Path, state: dict[str, Any]) -> None:
    encoded = (
        json.dumps(state, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode("utf-8")
    if len(encoded) > MAX_STATE_BYTES:
        raise ObservationError("Claude authorization state exceeds its size limit")
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


def _role(agent_type: str) -> str | None:
    return {
        "omp-flow-architect": "architect",
        "omp-flow-check": "reviewer",
        "omp-flow-implement": "executor",
        "omp-flow-qbd": "qbd-auditor",
        "omp-flow-research": "researcher",
    }.get(agent_type)


def _task(value: Any, index: int) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ObservationError(f"task {index} must be an object")
    task_id = _bounded_string(value.get("id"), f"task {index} id", 256)
    label = _bounded_string(value.get("subject"), f"task {index} subject")
    raw_state = value.get("status")
    if raw_state not in STATE_MAP:
        raise ObservationError(f"task {index} has unsupported status")
    return {"taskId": task_id, "label": label, "state": STATE_MAP[raw_state]}


def _normalise_tasks(values: Any) -> list[dict[str, str]]:
    if not isinstance(values, list) or not 1 <= len(values) <= MAX_TASKS:
        raise ObservationError("TaskList must contain 1..128 complete tasks")
    tasks = [_task(value, index) for index, value in enumerate(values)]
    if len({task["taskId"] for task in tasks}) != len(tasks):
        raise ObservationError("TaskList contains duplicate task IDs")
    return tasks


def _claude_version(payload: dict[str, Any]) -> str:
    value = payload.get("version")
    if not isinstance(value, str) or not value.strip():
        value = os.environ.get("CLAUDE_CODE_VERSION", "")
    return _bounded_string(value, "Claude Code version", 64)


def _revision(tasks: list[dict[str, str]], sequence: int) -> str:
    pairs = sorted(
        ([task["taskId"], task["label"], task["state"]] for task in tasks),
        key=lambda item: item[0].encode("utf-8"),
    )
    body = json.dumps([sequence, pairs], ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(body).hexdigest()


def _current_task(tasks: list[dict[str, str]]) -> str | None:
    active = [task["taskId"] for task in tasks if task["state"] == "active"]
    return active[0] if len(active) == 1 else None


def _unavailable(root: Path, session_id: str, reason: str, observed_at: int) -> dict[str, Any]:
    return {
        "version": 1,
        "taskSet": {
            "state": "unavailable",
            "capability": CAPABILITY,
            "reason": reason,
            "sourceId": SOURCE_ID,
            "repositoryRoot": str(root),
            "hostSessionId": session_id,
            "observedAtUnixMs": observed_at,
            "maxAgeMs": MAX_AGE_MS,
        },
        "assignment": None,
        "progress": None,
        "attention": [],
    }


def _available(
    root: Path,
    session_id: str,
    state: dict[str, Any],
    tool_use_id: str,
    claude_version: str,
    observed_at: int,
    auth: dict[str, Any] | None = None,
) -> dict[str, Any]:
    tasks = state["tasks"]
    sequence = state["adapterSequence"]
    revision = _revision(tasks, sequence)
    current_task_id = _current_task(tasks)
    task_set_id = hashlib.sha256(f"claude:{session_id}".encode("utf-8")).hexdigest()
    assignment = None
    progress = None
    if current_task_id is not None and auth is not None:
        candidates = [
            item
            for item in auth["bindings"].values()
            if isinstance(item, dict)
            and item.get("state") == "consumed"
            and item.get("taskId") == current_task_id
            and item.get("taskSetRevision") == revision
            and item.get("membershipRevision") == revision
            and item.get("expiresAtUnixMs", 0) > observed_at
            and _role(str(item.get("agentType"))) is not None
        ]
        if len(candidates) == 1:
            binding = candidates[0]
            binding_revision = hashlib.sha256(
                json.dumps(
                    [
                        binding["nonce"],
                        binding["agentId"],
                        binding["taskSetRevision"],
                    ],
                    separators=(",", ":"),
                ).encode("utf-8")
            ).hexdigest()
            assignment_id = f"claude-binding-{binding_revision}"
            assignment = {
                "sourceId": f"claude-assignment-{binding['agentId']}",
                "capability": "nativeAssignmentV1",
                "repositoryRoot": str(root),
                "hostSessionId": session_id,
                "taskSetId": task_set_id,
                "membershipRevision": revision,
                "taskId": current_task_id,
                "assignmentId": assignment_id,
                "nativeRole": _role(binding["agentType"]),
                "actorId": binding["agentId"],
                "operationReceipt": None,
                "nativeTargetId": binding["agentId"],
                "bindingRevision": binding_revision,
                "observedAtUnixMs": observed_at,
                "maxAgeMs": MAX_AGE_MS,
            }
            local_progress = binding.get("progress")
            if isinstance(local_progress, dict):
                progress = {
                    "sourceId": f"claude-progress-{binding['agentId']}",
                    "capability": "nativeTaskProgressV1",
                    "repositoryRoot": str(root),
                    "hostSessionId": session_id,
                    "taskSetId": task_set_id,
                    "membershipRevision": revision,
                    "taskId": current_task_id,
                    "assignmentId": assignment_id,
                    "label": local_progress["label"],
                    "unit": local_progress["unit"],
                    "current": local_progress["current"],
                    "total": local_progress["total"],
                    "unitSetRevision": local_progress["unitSetRevision"],
                    "sourceRevision": local_progress["sourceRevision"],
                    "observedAtUnixMs": observed_at,
                    "maxAgeMs": MAX_AGE_MS,
                }
    attention = []
    for event_id, start in list(state.get("attentionStarts", {}).items()):
        if (
            isinstance(start, dict)
            and start.get("kind") in {"question", "elicitation"}
            and isinstance(start.get("observedAtUnixMs"), int)
            and observed_at - start["observedAtUnixMs"] <= MAX_AGE_MS
        ):
            attention.append(
                {
                    "id": f"claude-attention-{event_id}",
                    "sourceId": SOURCE_ID,
                    "sourceRevision": revision,
                    "severity": "blocking",
                    "kind": start["kind"],
                    "reason": "structured input pending",
                    "count": 1,
                    "observedAtUnixMs": start["observedAtUnixMs"],
                    "maxAgeMs": MAX_AGE_MS,
                }
            )
    for warning in state.get("warnings", []):
        if (
            isinstance(warning, dict)
            and isinstance(warning.get("observedAtUnixMs"), int)
            and observed_at - warning["observedAtUnixMs"] <= MAX_AGE_MS
        ):
            attention.append(
                {
                    "id": warning["id"],
                    "sourceId": SOURCE_ID,
                    "sourceRevision": revision,
                    "severity": "warning",
                    "kind": warning["kind"],
                    "reason": warning["reason"],
                    "count": 1,
                    "observedAtUnixMs": warning["observedAtUnixMs"],
                    "maxAgeMs": MAX_AGE_MS,
                }
            )
    return {
        "version": 1,
        "taskSet": {
            "state": "available",
            "evidence": {
                "capability": CAPABILITY,
                "claudeCodeVersion": claude_version,
                "sessionStartKind": state["sessionStartKind"],
                "adapterSequence": sequence,
                "confirmedByToolUseId": tool_use_id,
            },
            "sourceId": SOURCE_ID,
            "repositoryRoot": str(root),
            "hostSessionId": session_id,
            "taskSetId": task_set_id,
            "membershipRevision": revision,
            "completeness": "complete",
            "observedAtUnixMs": observed_at,
            "maxAgeMs": MAX_AGE_MS,
            "members": tasks,
            "currentTaskId": current_task_id,
        },
        "assignment": assignment,
        "progress": progress,
        "attention": attention[:16],
    }


def _reconcile_managed_task_update(
    payload: dict[str, Any],
    auth_path: Path,
    root: Path,
    session_id: str,
    observed_at: int,
) -> bool:
    agent_type = payload.get("agent_type")
    if agent_type not in {
        "omp-flow-research",
        "omp-flow-architect",
        "omp-flow-qbd",
        "omp-flow-implement",
        "omp-flow-check",
    }:
        return False
    tool_use_id = _bounded_string(payload.get("tool_use_id"), "tool_use_id", 256)
    auth = _load_auth(auth_path, root, session_id)
    if auth is None:
        raise ObservationError("managed TaskUpdate has no authorization state")
    reservation = auth["reservations"].pop(tool_use_id, None)
    if (
        not isinstance(reservation, dict)
        or reservation.get("state") != "reserved"
        or reservation.get("agentId") != payload.get("agent_id")
        or reservation.get("agentType") != agent_type
        or reservation.get("toolInput") != payload.get("tool_input")
    ):
        raise ObservationError("managed TaskUpdate lacks exact reservation")
    response = payload.get("tool_response")
    expected_fields = (
        {"owner", "metadata"}
        if reservation["intent"] == "bind"
        else {"metadata"}
    )
    updated_fields = response.get("updatedFields") if isinstance(response, dict) else None
    success = (
        isinstance(response, dict)
        and response.get("success") is True
        and response.get("taskId") == reservation["taskId"]
        and isinstance(updated_fields, list)
        and set(updated_fields) == expected_fields
    )
    binding = auth["bindings"].get(reservation["agentId"])
    if not isinstance(binding, dict):
        raise ObservationError("managed binding disappeared")
    if not success:
        auth["bindings"].pop(reservation["agentId"], None)
        _write_auth(auth_path, auth)
        raise ObservationError("managed TaskUpdate result did not prove accepted fields")
    if reservation["intent"] == "bind":
        if binding.get("state") != "pending":
            raise ObservationError("managed binding was already consumed")
        binding["state"] = "consumed"
        binding["boundAtUnixMs"] = observed_at
    else:
        if binding.get("state") != "consumed":
            raise ObservationError("managed progress binding is unavailable")
        binding["progress"] = reservation["progress"]
        binding["progressObservedAtUnixMs"] = observed_at
    _write_auth(auth_path, auth)
    return True


def _apply_create(payload: dict[str, Any], tasks: list[dict[str, str]]) -> None:
    tool_input = payload.get("tool_input")
    response = payload.get("tool_response")
    if not isinstance(tool_input, dict) or not isinstance(response, dict):
        raise ObservationError("TaskCreate delta is partial")
    response_task = response.get("task")
    response_task = response_task if isinstance(response_task, dict) else response
    task_id = response_task.get("id", response_task.get("taskId"))
    task_id = _bounded_string(task_id, "TaskCreate response id", 256)
    if any(task["taskId"] == task_id for task in tasks):
        raise ObservationError("TaskCreate response duplicates a task ID")
    label = _bounded_string(tool_input.get("subject"), "TaskCreate subject")
    tasks.append({"taskId": task_id, "label": label, "state": "pending"})


def _apply_update(payload: dict[str, Any], tasks: list[dict[str, str]]) -> None:
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        raise ObservationError("TaskUpdate delta is partial")
    task_id = tool_input.get("taskId", tool_input.get("id"))
    task_id = _bounded_string(task_id, "TaskUpdate taskId", 256)
    task = next((item for item in tasks if item["taskId"] == task_id), None)
    if task is None:
        raise ObservationError("TaskUpdate does not match the complete baseline")
    if "status" in tool_input:
        status = tool_input["status"]
        if status == "deleted":
            tasks.remove(task)
            return
        if status not in STATE_MAP:
            raise ObservationError("TaskUpdate has unsupported status")
        task["state"] = STATE_MAP[status]
    if "subject" in tool_input:
        task["label"] = _bounded_string(tool_input["subject"], "TaskUpdate subject")
    if "status" not in tool_input and "subject" not in tool_input:
        raise ObservationError("TaskUpdate contains no display-relevant delta")


def _observe(root: Path, session_id: str, document: dict[str, Any]) -> None:
    script = root / ".omp-flow" / "scripts" / "omp_flow.py"
    completed = subprocess.run(
        [
            sys.executable,
            "-X",
            "utf8",
            str(script),
            "--cwd",
            str(root),
            "status",
            "observe",
            "--host",
            "claude",
            "--session",
            session_id,
        ],
        cwd=root,
        input=json.dumps(document, ensure_ascii=False),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=10,
        check=False,
    )
    if completed.returncode != 0:
        raise ObservationError(completed.stderr.strip() or completed.stdout.strip() or "status observe failed")


def main() -> int:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    root: Path | None = None
    session_id: str | None = None
    state_path: Path | None = None
    auth_path: Path | None = None
    try:
        payload = _read_payload()
        session_id = _bounded_string(payload.get("session_id"), "session_id", 256)
        root = _root(payload)
        state_path = _state_path(root, session_id)
        auth_path = _auth_path(root, session_id)
        observed_at = _now_ms()
        event = payload.get("hook_event_name")
        if event == "SessionStart":
            start_kind = payload.get("source")
            if start_kind not in VALID_SESSION_STARTS:
                raise ObservationError("unsupported SessionStart source")
            state_path.unlink(missing_ok=True)
            auth_path.unlink(missing_ok=True)
            _write_state(
                state_path,
                {
                    "version": 1,
                    "sessionId": session_id,
                    "sessionStartKind": start_kind,
                    "adapterSequence": 1,
                    "lastObservedAtUnixMs": observed_at,
                    "recentToolUseIds": [],
                    "attentionStarts": {},
                    "warnings": [],
                    "tasks": [],
                },
            )
            _observe(root, session_id, _unavailable(root, session_id, "incomplete", observed_at))
            return 0
        tool_name = payload.get("tool_name")
        state, state_reason = _load_state(state_path, session_id, observed_at)
        tasklist_can_recover = event == "PostToolUse" and tool_name == "TaskList"
        if state is None and not tasklist_can_recover:
            raise ObservationError(
                "Claude task baseline is unavailable"
                if state_reason != "stale"
                else "Claude task baseline is stale"
            )
        if state is not None:
            state.setdefault("attentionStarts", {})
            state.setdefault("warnings", [])
        if event == "PreToolUse" and tool_name in {"AskUserQuestion", "Elicitation"}:
            tool_use_id = _bounded_string(payload.get("tool_use_id"), "tool_use_id", 256)
            if tool_use_id in state["attentionStarts"]:
                raise ObservationError("attention start replay")
            state["attentionStarts"][tool_use_id] = {
                "kind": "question" if tool_name == "AskUserQuestion" else "elicitation",
                "observedAtUnixMs": observed_at,
            }
            state["lastObservedAtUnixMs"] = observed_at
            _write_state(state_path, state)
            _observe(
                root,
                session_id,
                _available(
                    root,
                    session_id,
                    state,
                    tool_use_id,
                    _claude_version(payload),
                    observed_at,
                    _load_auth(auth_path, root, session_id),
                ),
            )
            return 0
        if event in {"PostToolUse", "PostToolUseFailure"} and tool_name in {
            "AskUserQuestion",
            "Elicitation",
        }:
            tool_use_id = _bounded_string(payload.get("tool_use_id"), "tool_use_id", 256)
            state["attentionStarts"].pop(tool_use_id, None)
            if event == "PostToolUseFailure":
                state["warnings"] = [
                    *state["warnings"][-(MAX_ATTENTION_STARTS - 1) :],
                    {
                        "id": f"claude-failure-{tool_use_id}",
                        "kind": "failure",
                        "reason": "structured tool failure",
                        "observedAtUnixMs": observed_at,
                    },
                ]
            state["lastObservedAtUnixMs"] = observed_at
            _write_state(state_path, state)
            _observe(
                root,
                session_id,
                _available(
                    root,
                    session_id,
                    state,
                    tool_use_id,
                    _claude_version(payload),
                    observed_at,
                    _load_auth(auth_path, root, session_id),
                ),
            )
            return 0
        if event == "SubagentStop":
            agent_id = _bounded_string(payload.get("agent_id"), "agent_id", 256)
            auth = _load_auth(auth_path, root, session_id)
            if auth is not None:
                auth["bindings"].pop(agent_id, None)
                for reserved_id, reservation in list(auth["reservations"].items()):
                    if isinstance(reservation, dict) and reservation.get("agentId") == agent_id:
                        auth["reservations"].pop(reserved_id, None)
                _write_auth(auth_path, auth)
            state["lastObservedAtUnixMs"] = observed_at
            _write_state(state_path, state)
            _observe(
                root,
                session_id,
                _available(
                    root,
                    session_id,
                    state,
                    f"subagent-stop-{agent_id}",
                    _claude_version(payload),
                    observed_at,
                    auth,
                ),
            )
            return 0
        if event not in {"PostToolUse", "PostToolUseFailure"}:
            raise ObservationError("unsupported hook event")
        if tool_name not in {"TaskList", "TaskCreate", "TaskUpdate"}:
            raise ObservationError("unsupported task tool")
        tool_use_id = _bounded_string(payload.get("tool_use_id"), "tool_use_id", 256)
        if event == "PostToolUseFailure":
            if tool_name == "TaskUpdate" and auth_path is not None:
                auth = _load_auth(auth_path, root, session_id)
                if auth is not None:
                    reservation = auth["reservations"].pop(tool_use_id, None)
                    if isinstance(reservation, dict):
                        auth["bindings"].pop(reservation.get("agentId"), None)
                    _write_auth(auth_path, auth)
            state["warnings"] = [
                *state["warnings"][-(MAX_ATTENTION_STARTS - 1) :],
                {
                    "id": f"claude-denial-{tool_use_id}",
                    "kind": "denial",
                    "reason": "structured task mutation denied",
                    "observedAtUnixMs": observed_at,
                },
            ]
            state["lastObservedAtUnixMs"] = observed_at
            _write_state(state_path, state)
            _observe(
                root,
                session_id,
                _available(
                    root,
                    session_id,
                    state,
                    tool_use_id,
                    _claude_version(payload),
                    observed_at,
                    _load_auth(auth_path, root, session_id),
                ),
            )
            return 0
        if state is not None and tool_use_id in state["recentToolUseIds"]:
            raise ObservationError("task tool result was already observed")
        if tool_name == "TaskList":
            response = payload.get("tool_response")
            if not isinstance(response, dict):
                raise ObservationError("TaskList response is partial")
            tasks = _normalise_tasks(response.get("tasks"))
            if state is None:
                state = {
                    "version": 1,
                    "sessionId": session_id,
                    "sessionStartKind": "startup",
                    "adapterSequence": 1,
                    "lastObservedAtUnixMs": observed_at,
                    "recentToolUseIds": [],
                    "attentionStarts": {},
                    "warnings": [],
                    "tasks": [],
                }
            state["tasks"] = tasks
            state["adapterSequence"] += 1
            auth_path.unlink(missing_ok=True)
        else:
            if state is None or state_reason is not None or not state["tasks"]:
                reason = (
                    "stale"
                    if state_reason == "stale"
                    else "malformed"
                    if state_reason == "malformed"
                    else "incomplete"
                )
                if state_path is not None:
                    state_path.unlink(missing_ok=True)
                _observe(root, session_id, _unavailable(root, session_id, reason, observed_at))
                return 0
            if tool_name == "TaskCreate":
                _apply_create(payload, state["tasks"])
            else:
                managed = _reconcile_managed_task_update(
                    payload, auth_path, root, session_id, observed_at
                )
                if not managed:
                    tool_input = payload.get("tool_input")
                    if isinstance(tool_input, dict) and "owner" in tool_input:
                        auth_path.unlink(missing_ok=True)
                    else:
                        _apply_update(payload, state["tasks"])
            if len(state["tasks"]) > MAX_TASKS:
                raise ObservationError("Claude task set exceeds 128 members")
            if tool_name != "TaskUpdate" or not managed:
                state["adapterSequence"] += 1
        state["lastObservedAtUnixMs"] = observed_at
        state["recentToolUseIds"] = [
            *state["recentToolUseIds"][-(MAX_RECENT_TOOL_USE_IDS - 1) :],
            tool_use_id,
        ]
        _write_state(state_path, state)
        if not state["tasks"]:
            _observe(root, session_id, _unavailable(root, session_id, "incomplete", observed_at))
            return 0
        _observe(
            root,
            session_id,
            _available(
                root,
                session_id,
                state,
                tool_use_id,
                _claude_version(payload),
                observed_at,
                _load_auth(auth_path, root, session_id),
            ),
        )
        return 0
    except (OSError, ObservationError, subprocess.SubprocessError) as exc:
        # Observation hooks never block Claude. Once scope is known, invalid or partial
        # evidence revokes the prior baseline so it cannot remain falsely authoritative.
        if root is not None and session_id is not None:
            try:
                if state_path is not None:
                    state_path.unlink(missing_ok=True)
                if auth_path is not None:
                    auth_path.unlink(missing_ok=True)
                _observe(
                    root,
                    session_id,
                    _unavailable(root, session_id, "malformed", _now_ms()),
                )
            except (OSError, ObservationError, subprocess.SubprocessError):
                pass
        sys.stderr.write(f"omp-flow Flow Status observation unavailable: {str(exc)[:512]}\n")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
