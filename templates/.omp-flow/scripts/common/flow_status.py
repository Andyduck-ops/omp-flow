from __future__ import annotations

import hashlib
import itertools
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Iterable
from uuid import uuid4

from .io import WorkflowError, atomic_write_json
from .paths import flow_dir

MAX_OBSERVATION_BYTES = 256 * 1024
MAX_SNAPSHOT_BYTES = 64 * 1024
MAX_CACHE_ENTRIES = 8
MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000
MAX_SAFE_INTEGER = 9_007_199_254_740_991
MAX_COUNT = 1_000_000
MAX_SOURCES = 8
MAX_ATTENTION = 16
FUTURE_TOLERANCE_MS = 2_000
HOSTS = {"claude", "codex", "oh-my-pi"}
CAPABILITIES = {"claudeTaskListV1", "ompTaskBatchV1"}
UNAVAILABLE_REASONS = {
    "unsupported",
    "incomplete",
    "stale",
    "malformed",
    "disconnected",
}
ROLE_POSITIONS = {
    "executor": "Implement",
    "reviewer": "Review",
    "researcher": "Research",
    "architect": "Design",
    "qbd-auditor": "QbD",
    "planner": "Plan",
    "explore": None,
    "oracle": None,
    "orchestrator": None,
}
SEVERITIES = {"blocking", "warning", "info"}
ATTENTION_KINDS = {
    "userInput",
    "approval",
    "failure",
    "disconnected",
    "stale",
    "unbound",
}
SOURCE_KINDS = {
    "hostTaskSet",
    "nativeAssignment",
    "nativeProgress",
    "portableRuntime",
}
SOURCE_STATES = {"connected", "disconnected", "unsupported", "malformed"}


class FlowStatusError(WorkflowError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _now_ms() -> int:
    return int(time.time() * 1000)


def _json_size(value: Any) -> int:
    return len(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )


def _object(
    value: Any,
    *,
    name: str,
    required: Iterable[str],
    optional: Iterable[str] = (),
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WorkflowError(f"{name} must be an object")
    required_set = set(required)
    allowed = required_set | set(optional)
    missing = sorted(required_set - set(value))
    unknown = sorted(set(value) - allowed)
    if missing:
        raise WorkflowError(f"{name} is missing fields: {', '.join(missing)}")
    if unknown:
        raise WorkflowError(f"{name} has unknown fields: {', '.join(unknown)}")
    return value


def _string(
    value: Any,
    *,
    name: str,
    maximum: int = 256,
    nullable: bool = False,
    empty: bool = False,
) -> str | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str):
        raise WorkflowError(f"{name} must be a string")
    if (not empty and not value) or len(value) > maximum:
        raise WorkflowError(f"{name} must contain 1..{maximum} characters")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise WorkflowError(f"{name} contains control characters")
    return value


def _integer(
    value: Any,
    *,
    name: str,
    minimum: int = 0,
    maximum: int = MAX_SAFE_INTEGER,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise WorkflowError(f"{name} must be an integer")
    if value < minimum or value > maximum:
        raise WorkflowError(f"{name} must be in {minimum}..{maximum}")
    return value


def _max_age(value: Any, *, name: str) -> int:
    return _integer(value, name=name, minimum=1_000, maximum=30_000)


def _timestamp(value: Any, *, name: str) -> int:
    return _integer(value, name=name)


def _canonical_repo(value: Any, *, name: str) -> str:
    raw = _string(value, name=name, maximum=4096)
    assert isinstance(raw, str)
    return str(Path(raw).resolve())


def _freshness(observed_at: int, max_age: int, now_ms: int) -> tuple[bool, str]:
    age = now_ms - observed_at
    if age < 0:
        return False, "clock-uncertain"
    if age > max_age:
        return False, "stale"
    return True, "fresh"


def membership_digest(members: list[dict[str, Any]]) -> str:
    pairs = sorted(
        ((str(member["taskId"]), str(member["state"])) for member in members),
        key=lambda item: item[0].encode("utf-8"),
    )
    encoded = json.dumps(
        [[task_id, state] for task_id, state in pairs],
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _validate_evidence(capability: str, value: Any) -> None:
    if capability == "claudeTaskListV1":
        evidence = _object(
            value,
            name="taskSet.evidence",
            required={
                "capability",
                "claudeCodeVersion",
                "sessionStartKind",
                "adapterSequence",
                "confirmedByToolUseId",
            },
        )
        if evidence["capability"] != capability:
            raise WorkflowError("taskSet evidence capability mismatch")
        version = _string(
            evidence["claudeCodeVersion"],
            name="taskSet.evidence.claudeCodeVersion",
            maximum=64,
        )
        assert isinstance(version, str)
        try:
            core = version.split("-", 1)[0].split("+", 1)[0]
            parsed = tuple(int(part) for part in core.split("."))
        except ValueError as exc:
            raise WorkflowError("Invalid Claude Code version") from exc
        if len(parsed) != 3 or parsed < (2, 1, 142):
            raise WorkflowError("claudeTaskListV1 requires Claude Code 2.1.142+")
        if evidence["sessionStartKind"] not in {
            "startup",
            "resume",
            "clear",
            "compact",
            "fork",
        }:
            raise WorkflowError("Invalid Claude session start kind")
        _integer(
            evidence["adapterSequence"],
            name="taskSet.evidence.adapterSequence",
            minimum=1,
        )
        _string(
            evidence["confirmedByToolUseId"],
            name="taskSet.evidence.confirmedByToolUseId",
        )
        return
    evidence = _object(
        value,
        name="taskSet.evidence",
        required={
            "capability",
            "piVersion",
            "upstreamRevision",
            "toolCallId",
            "adapterSequence",
        },
    )
    if evidence["capability"] != capability:
        raise WorkflowError("taskSet evidence capability mismatch")
    if evidence["piVersion"] != "17.2.1":
        raise WorkflowError("ompTaskBatchV1 requires Oh My Pi 17.2.1")
    if evidence["upstreamRevision"] != "7a2ced50bea8b97dbab7d9bd579329c4ea704de0":
        raise WorkflowError("ompTaskBatchV1 upstream revision mismatch")
    _string(evidence["toolCallId"], name="taskSet.evidence.toolCallId")
    _integer(
        evidence["adapterSequence"],
        name="taskSet.evidence.adapterSequence",
        minimum=1,
    )


def _validate_task_set(
    value: Any, *, host: str, now_ms: int
) -> tuple[dict[str, Any], dict[str, Any], dict[str, dict[str, Any]]]:
    common = {
        "state",
        "sourceId",
        "repositoryRoot",
        "hostSessionId",
        "observedAtUnixMs",
        "maxAgeMs",
    }
    if not isinstance(value, dict) or value.get("state") not in {"available", "unavailable"}:
        raise WorkflowError("taskSet.state must be available or unavailable")
    if value["state"] == "unavailable":
        observation = _object(
            value,
            name="taskSet",
            required=common | {"capability", "reason"},
        )
        capability = observation["capability"]
        if capability not in CAPABILITIES:
            raise WorkflowError("Unsupported taskSet capability")
        _validate_host_capability(host, capability)
        reason = observation["reason"]
        if reason not in UNAVAILABLE_REASONS:
            raise WorkflowError("Invalid unavailable reason")
        source_id = _string(observation["sourceId"], name="taskSet.sourceId")
        repository = _canonical_repo(
            observation["repositoryRoot"], name="taskSet.repositoryRoot"
        )
        session_id = _string(
            observation["hostSessionId"], name="taskSet.hostSessionId"
        )
        observed_at = _timestamp(
            observation["observedAtUnixMs"], name="taskSet.observedAtUnixMs"
        )
        max_age = _max_age(observation["maxAgeMs"], name="taskSet.maxAgeMs")
        revision = hashlib.sha256(
            json.dumps(
                [capability, source_id, reason, observed_at],
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        state = {
            "unsupported": "unsupported",
            "malformed": "malformed",
            "disconnected": "disconnected",
        }.get(reason, "connected")
        source = {
            "sourceId": source_id,
            "kind": "hostTaskSet",
            "state": state,
            "revision": revision,
            "observedAtUnixMs": observed_at,
            "maxAgeMs": max_age,
        }
        return (
            {
                "state": "unavailable",
                "capability": capability,
                "sourceId": source_id,
                "reason": reason,
            },
            source,
            {
                "_scope": {
                    "repositoryRoot": repository,
                    "host": host,
                    "hostSessionId": session_id,
                }
            },
        )

    observation = _object(
        value,
        name="taskSet",
        required=common
        | {
            "evidence",
            "taskSetId",
            "membershipRevision",
            "completeness",
            "members",
            "currentTaskId",
        },
    )
    evidence = observation["evidence"]
    if not isinstance(evidence, dict):
        raise WorkflowError("taskSet.evidence must be an object")
    capability = evidence.get("capability")
    if capability not in CAPABILITIES:
        raise WorkflowError("Unsupported taskSet evidence capability")
    _validate_host_capability(host, capability)
    _validate_evidence(capability, evidence)
    if observation["completeness"] != "complete":
        raise WorkflowError("Available taskSet must be complete")
    source_id = _string(observation["sourceId"], name="taskSet.sourceId")
    repository = _canonical_repo(
        observation["repositoryRoot"], name="taskSet.repositoryRoot"
    )
    session_id = _string(observation["hostSessionId"], name="taskSet.hostSessionId")
    task_set_id = _string(observation["taskSetId"], name="taskSet.taskSetId")
    revision = _string(
        observation["membershipRevision"], name="taskSet.membershipRevision"
    )
    observed_at = _timestamp(
        observation["observedAtUnixMs"], name="taskSet.observedAtUnixMs"
    )
    max_age = _max_age(observation["maxAgeMs"], name="taskSet.maxAgeMs")
    members_value = observation["members"]
    if not isinstance(members_value, list) or not 1 <= len(members_value) <= 128:
        raise WorkflowError("taskSet.members must contain 1..128 members")
    members: dict[str, dict[str, Any]] = {}
    normalized_members: list[dict[str, Any]] = []
    counts = {"completed": 0, "active": 0, "pending": 0, "failed": 0}
    for index, item in enumerate(members_value):
        member = _object(
            item,
            name=f"taskSet.members[{index}]",
            required={"taskId", "label", "state"},
        )
        task_id = _string(member["taskId"], name=f"taskSet.members[{index}].taskId")
        label = _string(
            member["label"], name=f"taskSet.members[{index}].label", maximum=512
        )
        state = member["state"]
        if state not in counts:
            raise WorkflowError(f"Invalid task member state: {state}")
        assert isinstance(task_id, str) and isinstance(label, str)
        if task_id in members:
            raise WorkflowError(f"Duplicate task member: {task_id}")
        normalized = {"taskId": task_id, "label": label, "state": state}
        members[task_id] = normalized
        normalized_members.append(normalized)
        counts[state] += 1
    current_task_id = observation["currentTaskId"]
    if current_task_id is not None:
        current_task_id = _string(current_task_id, name="taskSet.currentTaskId")
        if current_task_id not in members:
            raise WorkflowError("Current task is not a member of the task set")
    fresh, freshness = _freshness(observed_at, max_age, now_ms)
    source = {
        "sourceId": source_id,
        "kind": "hostTaskSet",
        "state": "connected",
        "revision": revision,
        "observedAtUnixMs": observed_at,
        "maxAgeMs": max_age,
    }
    metadata: dict[str, Any] = {
        "_scope": {
            "repositoryRoot": repository,
            "host": host,
            "hostSessionId": session_id,
            "taskSetId": task_set_id,
            "taskSetRevision": revision,
        },
        "_members": members,
        "_currentTaskId": current_task_id,
    }
    if not fresh:
        metadata["_freshness"] = freshness
        return (
            {
                "state": "unavailable",
                "capability": capability,
                "sourceId": source_id,
                "reason": "stale",
            },
            source,
            metadata,
        )
    return (
        {
            "state": "available",
            "capability": capability,
            "sourceId": source_id,
            "membershipRevision": revision,
            "membershipDigest": membership_digest(normalized_members),
            "total": len(normalized_members),
            **counts,
        },
        source,
        metadata,
    )


def _validate_host_capability(host: str, capability: str) -> None:
    expected = {
        "claudeTaskListV1": "claude",
        "ompTaskBatchV1": "oh-my-pi",
    }[capability]
    if host != expected:
        raise WorkflowError(
            f"{capability} cannot validate a {host} task-set observation"
        )


def _validate_assignment(
    value: Any,
    *,
    scope: dict[str, Any],
    current_task_id: str,
    now_ms: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    item = _object(
        value,
        name="assignment",
        required={
            "sourceId",
            "capability",
            "repositoryRoot",
            "hostSessionId",
            "taskSetId",
            "membershipRevision",
            "taskId",
            "assignmentId",
            "nativeRole",
            "actorId",
            "operationReceipt",
            "nativeTargetId",
            "bindingRevision",
            "observedAtUnixMs",
            "maxAgeMs",
        },
    )
    if item["capability"] != "nativeAssignmentV1":
        raise WorkflowError("Unsupported assignment capability")
    _assert_binding(item, scope=scope, current_task_id=current_task_id, name="assignment")
    role = item["nativeRole"]
    if role not in ROLE_POSITIONS:
        raise WorkflowError(f"Unknown assignment role: {role}")
    observed_at = _timestamp(
        item["observedAtUnixMs"], name="assignment.observedAtUnixMs"
    )
    max_age = _max_age(item["maxAgeMs"], name="assignment.maxAgeMs")
    fresh, reason = _freshness(observed_at, max_age, now_ms)
    if not fresh:
        raise WorkflowError(f"Assignment observation is {reason}")
    source_id = _string(item["sourceId"], name="assignment.sourceId")
    revision = _string(item["bindingRevision"], name="assignment.bindingRevision")
    assignment_id = _string(item["assignmentId"], name="assignment.assignmentId")
    source = {
        "sourceId": source_id,
        "kind": "nativeAssignment",
        "state": "connected",
        "revision": revision,
        "observedAtUnixMs": observed_at,
        "maxAgeMs": max_age,
    }
    assignment = {
        "sourceId": source_id,
        "assignmentId": assignment_id,
        "actorId": _string(
            item["actorId"], name="assignment.actorId", nullable=True
        ),
        "operationReceipt": _string(
            item["operationReceipt"],
            name="assignment.operationReceipt",
            nullable=True,
        ),
        "nativeTargetId": _string(
            item["nativeTargetId"], name="assignment.nativeTargetId", nullable=True
        ),
        "bindingRevision": revision,
        "role": role,
        "methodologyPosition": ROLE_POSITIONS[role],
    }
    return assignment, source


def _assert_binding(
    item: dict[str, Any],
    *,
    scope: dict[str, Any],
    current_task_id: str,
    name: str,
) -> None:
    repository = _canonical_repo(item["repositoryRoot"], name=f"{name}.repositoryRoot")
    if repository != scope["repositoryRoot"]:
        raise WorkflowError(f"{name} repository binding mismatch")
    expected = {
        "hostSessionId": scope["hostSessionId"],
        "taskSetId": scope["taskSetId"],
        "membershipRevision": scope["taskSetRevision"],
        "taskId": current_task_id,
    }
    for field, value in expected.items():
        if item[field] != value:
            raise WorkflowError(f"{name} {field} binding mismatch")


def _validate_progress(
    value: Any,
    *,
    scope: dict[str, Any],
    current_task_id: str,
    assignment_id: str | None,
    now_ms: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    item = _object(
        value,
        name="progress",
        required={
            "sourceId",
            "capability",
            "repositoryRoot",
            "hostSessionId",
            "taskSetId",
            "membershipRevision",
            "taskId",
            "assignmentId",
            "label",
            "unit",
            "current",
            "total",
            "unitSetRevision",
            "sourceRevision",
            "observedAtUnixMs",
            "maxAgeMs",
        },
    )
    if item["capability"] != "nativeTaskProgressV1":
        raise WorkflowError("Unsupported progress capability")
    _assert_binding(item, scope=scope, current_task_id=current_task_id, name="progress")
    if item["assignmentId"] != assignment_id:
        raise WorkflowError("progress assignment binding mismatch")
    current = _integer(item["current"], name="progress.current", maximum=MAX_COUNT)
    total = _integer(
        item["total"], name="progress.total", minimum=1, maximum=MAX_COUNT
    )
    if current > total:
        raise WorkflowError("progress.current cannot exceed progress.total")
    observed_at = _timestamp(
        item["observedAtUnixMs"], name="progress.observedAtUnixMs"
    )
    max_age = _max_age(item["maxAgeMs"], name="progress.maxAgeMs")
    fresh, reason = _freshness(observed_at, max_age, now_ms)
    if not fresh:
        raise WorkflowError(f"Progress observation is {reason}")
    source_id = _string(item["sourceId"], name="progress.sourceId")
    source_revision = _string(
        item["sourceRevision"], name="progress.sourceRevision"
    )
    progress = {
        "label": _string(item["label"], name="progress.label", maximum=128),
        "current": current,
        "total": total,
        "unit": _string(item["unit"], name="progress.unit", maximum=64),
        "unitSetRevision": _string(
            item["unitSetRevision"], name="progress.unitSetRevision"
        ),
        "sourceId": source_id,
        "sourceRevision": source_revision,
    }
    source = {
        "sourceId": source_id,
        "kind": "nativeProgress",
        "state": "connected",
        "revision": source_revision,
        "observedAtUnixMs": observed_at,
        "maxAgeMs": max_age,
    }
    return progress, source


def _validate_attention(
    values: Any,
    *,
    sources: dict[str, dict[str, Any]],
    now_ms: int,
) -> list[dict[str, Any]]:
    if values is None:
        return []
    if not isinstance(values, list) or len(values) > MAX_ATTENTION:
        raise WorkflowError(f"attention must contain at most {MAX_ATTENTION} entries")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, value in enumerate(values):
        item = _object(
            value,
            name=f"attention[{index}]",
            required={
                "id",
                "sourceId",
                "sourceRevision",
                "severity",
                "kind",
                "reason",
                "count",
                "observedAtUnixMs",
                "maxAgeMs",
            },
        )
        attention_id = _string(item["id"], name=f"attention[{index}].id")
        if attention_id in seen:
            raise WorkflowError(f"Duplicate attention id: {attention_id}")
        seen.add(str(attention_id))
        source_id = _string(
            item["sourceId"], name=f"attention[{index}].sourceId"
        )
        source = sources.get(str(source_id))
        if source is None or item["sourceRevision"] != source["revision"]:
            raise WorkflowError("attention source binding mismatch")
        if item["severity"] not in SEVERITIES:
            raise WorkflowError("Invalid attention severity")
        if item["kind"] not in ATTENTION_KINDS:
            raise WorkflowError("Invalid attention kind")
        observed_at = _timestamp(
            item["observedAtUnixMs"], name=f"attention[{index}].observedAtUnixMs"
        )
        max_age = _max_age(item["maxAgeMs"], name=f"attention[{index}].maxAgeMs")
        fresh, _ = _freshness(observed_at, max_age, now_ms)
        if not fresh:
            continue
        result.append(
            {
                "id": attention_id,
                "sourceId": source_id,
                "sourceRevision": item["sourceRevision"],
                "severity": item["severity"],
                "kind": item["kind"],
                "reason": _string(
                    item["reason"],
                    name=f"attention[{index}].reason",
                    maximum=512,
                ),
                "count": _integer(
                    item["count"],
                    name=f"attention[{index}].count",
                    minimum=1,
                    maximum=MAX_COUNT,
                ),
                "observedAtUnixMs": observed_at,
                "maxAgeMs": max_age,
            }
        )
    order = {"blocking": 0, "warning": 1, "info": 2}
    result.sort(key=lambda item: (order[item["severity"]], str(item["id"]).encode("utf-8")))
    return result


def build_snapshot(
    host: str,
    task_set: dict[str, Any],
    *,
    assignment: dict[str, Any] | None = None,
    progress: dict[str, Any] | None = None,
    attention: list[dict[str, Any]] | None = None,
    generated_at_unix_ms: int | None = None,
) -> dict[str, Any]:
    if host not in HOSTS:
        raise WorkflowError(f"Unsupported host: {host}")
    if _json_size(task_set) > MAX_OBSERVATION_BYTES:
        raise WorkflowError("Source observation exceeds 256 KiB")
    now_ms = (
        _now_ms()
        if generated_at_unix_ms is None
        else _timestamp(generated_at_unix_ms, name="generatedAtUnixMs")
    )
    task_state, task_source, metadata = _validate_task_set(
        task_set, host=host, now_ms=now_ms
    )
    scope = metadata["_scope"]
    sources = [task_source]
    current: dict[str, Any] | None = None
    if task_state["state"] == "available" and metadata["_currentTaskId"] is not None:
        task_id = metadata["_currentTaskId"]
        member = metadata["_members"][task_id]
        current = {
            "sourceId": task_state["sourceId"],
            "taskId": task_id,
            "label": member["label"],
            "membershipRevision": task_state["membershipRevision"],
            "assignment": None,
            "progress": None,
        }
        assignment_id = None
        if assignment is not None:
            normalized_assignment, assignment_source = _validate_assignment(
                assignment,
                scope=scope,
                current_task_id=task_id,
                now_ms=now_ms,
            )
            current["assignment"] = normalized_assignment
            assignment_id = normalized_assignment["assignmentId"]
            sources.append(assignment_source)
        if progress is not None:
            normalized_progress, progress_source = _validate_progress(
                progress,
                scope=scope,
                current_task_id=task_id,
                assignment_id=assignment_id,
                now_ms=now_ms,
            )
            current["progress"] = normalized_progress
            sources.append(progress_source)
    elif assignment is not None or progress is not None:
        raise WorkflowError("Assignment/progress requires a fresh current task")
    source_map = {str(source["sourceId"]): source for source in sources}
    if len(source_map) != len(sources):
        raise WorkflowError("Snapshot source IDs must be unique")
    normalized_attention = _validate_attention(
        attention, sources=source_map, now_ms=now_ms
    )
    if task_state["state"] == "unavailable":
        scope = {
            "repositoryRoot": scope["repositoryRoot"],
            "host": host,
            "hostSessionId": scope["hostSessionId"],
            "taskSetId": None,
            "taskSetRevision": None,
        }
        current = None
    snapshot = {
        "version": 1,
        "generatedAtUnixMs": now_ms,
        "maxAgeMs": task_source["maxAgeMs"],
        "scope": scope,
        "sources": sources,
        "taskSet": task_state,
        "currentTask": current,
        "attention": normalized_attention,
    }
    if _json_size(snapshot) > MAX_SNAPSHOT_BYTES:
        raise WorkflowError("Flow Status snapshot exceeds 64 KiB")
    validate_snapshot(snapshot)
    return snapshot


def validate_snapshot(value: Any) -> dict[str, Any]:
    if _json_size(value) > MAX_SNAPSHOT_BYTES:
        raise WorkflowError("Flow Status snapshot exceeds 64 KiB")
    snapshot = _object(
        value,
        name="snapshot",
        required={
            "version",
            "generatedAtUnixMs",
            "maxAgeMs",
            "scope",
            "sources",
            "taskSet",
            "currentTask",
            "attention",
        },
    )
    if snapshot["version"] != 1:
        raise WorkflowError("Unsupported Flow Status snapshot version")
    _timestamp(snapshot["generatedAtUnixMs"], name="snapshot.generatedAtUnixMs")
    _max_age(snapshot["maxAgeMs"], name="snapshot.maxAgeMs")
    scope = _object(
        snapshot["scope"],
        name="snapshot.scope",
        required={
            "repositoryRoot",
            "host",
            "hostSessionId",
            "taskSetId",
            "taskSetRevision",
        },
    )
    _canonical_repo(scope["repositoryRoot"], name="snapshot.scope.repositoryRoot")
    if scope["host"] not in HOSTS:
        raise WorkflowError("Invalid snapshot host")
    _string(
        scope["hostSessionId"], name="snapshot.scope.hostSessionId", nullable=True
    )
    _string(scope["taskSetId"], name="snapshot.scope.taskSetId", nullable=True)
    _string(
        scope["taskSetRevision"],
        name="snapshot.scope.taskSetRevision",
        nullable=True,
    )
    sources_value = snapshot["sources"]
    if not isinstance(sources_value, list) or not 1 <= len(sources_value) <= MAX_SOURCES:
        raise WorkflowError("snapshot.sources must contain 1..8 entries")
    sources: dict[str, dict[str, Any]] = {}
    for index, value_source in enumerate(sources_value):
        source = _object(
            value_source,
            name=f"snapshot.sources[{index}]",
            required={
                "sourceId",
                "kind",
                "state",
                "revision",
                "observedAtUnixMs",
                "maxAgeMs",
            },
        )
        source_id = _string(
            source["sourceId"], name=f"snapshot.sources[{index}].sourceId"
        )
        if source_id in sources:
            raise WorkflowError(f"Duplicate snapshot source: {source_id}")
        if source["kind"] not in SOURCE_KINDS or source["state"] not in SOURCE_STATES:
            raise WorkflowError("Invalid snapshot source kind/state")
        _string(source["revision"], name=f"snapshot.sources[{index}].revision")
        _timestamp(
            source["observedAtUnixMs"],
            name=f"snapshot.sources[{index}].observedAtUnixMs",
        )
        _max_age(source["maxAgeMs"], name=f"snapshot.sources[{index}].maxAgeMs")
        sources[str(source_id)] = source
    task_state = snapshot["taskSet"]
    if not isinstance(task_state, dict) or task_state.get("state") not in {
        "available",
        "unavailable",
    }:
        raise WorkflowError("Invalid snapshot taskSet state")
    if task_state["state"] == "available":
        task = _object(
            task_state,
            name="snapshot.taskSet",
            required={
                "state",
                "capability",
                "sourceId",
                "membershipRevision",
                "membershipDigest",
                "total",
                "completed",
                "active",
                "pending",
                "failed",
            },
        )
        if task["capability"] not in CAPABILITIES:
            raise WorkflowError("Invalid snapshot taskSet capability")
        _validate_host_capability(scope["host"], task["capability"])
        source = sources.get(str(task["sourceId"]))
        if (
            source is None
            or source["kind"] != "hostTaskSet"
            or source["state"] != "connected"
        ):
            raise WorkflowError("snapshot.taskSet source binding mismatch")
        revision = _string(
            task["membershipRevision"], name="snapshot.taskSet.membershipRevision"
        )
        if revision != source["revision"] or revision != scope["taskSetRevision"]:
            raise WorkflowError("snapshot membership revision mismatch")
        digest = _string(
            task["membershipDigest"],
            name="snapshot.taskSet.membershipDigest",
            maximum=64,
        )
        if (
            not isinstance(digest, str)
            or len(digest) != 64
            or any(char not in "0123456789abcdef" for char in digest)
        ):
            raise WorkflowError("Invalid snapshot membership digest")
        counts = {
            key: _integer(task[key], name=f"snapshot.taskSet.{key}", maximum=MAX_COUNT)
            for key in ("completed", "active", "pending", "failed")
        }
        total = _integer(
            task["total"],
            name="snapshot.taskSet.total",
            minimum=1,
            maximum=MAX_COUNT,
        )
        if sum(counts.values()) != total:
            raise WorkflowError("snapshot task counts do not sum to total")
        if scope["taskSetId"] is None:
            raise WorkflowError("Available snapshot requires taskSetId")
    else:
        task = _object(
            task_state,
            name="snapshot.taskSet",
            required={"state", "capability", "sourceId", "reason"},
        )
        if task["capability"] not in CAPABILITIES or task["reason"] not in UNAVAILABLE_REASONS:
            raise WorkflowError("Invalid unavailable snapshot taskSet")
        _validate_host_capability(scope["host"], task["capability"])
        unavailable_source = sources.get(str(task["sourceId"]))
        expected_source_state = {
            "unsupported": "unsupported",
            "malformed": "malformed",
            "disconnected": "disconnected",
        }.get(task["reason"], "connected")
        if (
            unavailable_source is None
            or unavailable_source["kind"] != "hostTaskSet"
            or unavailable_source["state"] != expected_source_state
        ):
            raise WorkflowError("Unavailable snapshot source binding mismatch")
        if (
            scope["taskSetId"] is not None
            or scope["taskSetRevision"] is not None
            or snapshot["currentTask"] is not None
        ):
            raise WorkflowError("Unavailable snapshot cannot retain task binding")
    current = snapshot["currentTask"]
    if current is not None:
        item = _object(
            current,
            name="snapshot.currentTask",
            required={
                "sourceId",
                "taskId",
                "label",
                "membershipRevision",
                "assignment",
                "progress",
            },
        )
        if task_state["state"] != "available":
            raise WorkflowError("Current task requires available taskSet")
        if (
            item["sourceId"] != task_state["sourceId"]
            or item["membershipRevision"] != task_state["membershipRevision"]
        ):
            raise WorkflowError("Current task membership binding mismatch")
        _string(item["taskId"], name="snapshot.currentTask.taskId")
        _string(item["label"], name="snapshot.currentTask.label", maximum=512)
        assignment_id = None
        if item["assignment"] is not None:
            assignment_item = _object(
                item["assignment"],
                name="snapshot.currentTask.assignment",
                required={
                    "sourceId",
                    "assignmentId",
                    "actorId",
                    "operationReceipt",
                    "nativeTargetId",
                    "bindingRevision",
                    "role",
                    "methodologyPosition",
                },
            )
            source = sources.get(str(assignment_item["sourceId"]))
            if (
                source is None
                or source["kind"] != "nativeAssignment"
                or source["state"] != "connected"
                or source["revision"] != assignment_item["bindingRevision"]
            ):
                raise WorkflowError("Snapshot assignment source binding mismatch")
            role = assignment_item["role"]
            if role not in ROLE_POSITIONS or assignment_item["methodologyPosition"] != ROLE_POSITIONS[role]:
                raise WorkflowError("Snapshot assignment role/position mismatch")
            assignment_id = _string(
                assignment_item["assignmentId"],
                name="snapshot.currentTask.assignment.assignmentId",
            )
            for field in ("actorId", "operationReceipt", "nativeTargetId"):
                _string(
                    assignment_item[field],
                    name=f"snapshot.currentTask.assignment.{field}",
                    nullable=True,
                )
        if item["progress"] is not None:
            progress_item = _object(
                item["progress"],
                name="snapshot.currentTask.progress",
                required={
                    "label",
                    "current",
                    "total",
                    "unit",
                    "unitSetRevision",
                    "sourceId",
                    "sourceRevision",
                },
            )
            source = sources.get(str(progress_item["sourceId"]))
            if (
                source is None
                or source["kind"] != "nativeProgress"
                or source["state"] != "connected"
                or source["revision"] != progress_item["sourceRevision"]
            ):
                raise WorkflowError("Snapshot progress source binding mismatch")
            progress_current = _integer(
                progress_item["current"],
                name="snapshot.currentTask.progress.current",
                maximum=MAX_COUNT,
            )
            progress_total = _integer(
                progress_item["total"],
                name="snapshot.currentTask.progress.total",
                minimum=1,
                maximum=MAX_COUNT,
            )
            if progress_current > progress_total:
                raise WorkflowError("Snapshot progress exceeds total")
            _string(
                progress_item["label"],
                name="snapshot.currentTask.progress.label",
                maximum=128,
            )
            _string(
                progress_item["unit"],
                name="snapshot.currentTask.progress.unit",
                maximum=64,
            )
            _string(
                progress_item["unitSetRevision"],
                name="snapshot.currentTask.progress.unitSetRevision",
            )
            if assignment_id is None and item["assignment"] is not None:
                raise WorkflowError("Invalid snapshot progress assignment")
    _validate_attention(snapshot["attention"], sources=sources, now_ms=snapshot["generatedAtUnixMs"])
    return snapshot


def _cache_root(repo: Path) -> Path:
    return flow_dir(repo.resolve()) / ".runtime" / "flow-status"


def _scope_key(repository_root: str, host: str, host_session_id: str | None) -> str:
    encoded = json.dumps(
        [repository_root, host, host_session_id],
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def write_cached_snapshot(
    repo: Path,
    snapshot: dict[str, Any],
    *,
    cached_at_unix_ms: int | None = None,
) -> Path:
    validate_snapshot(snapshot)
    canonical_repo = str(repo.resolve())
    if snapshot["scope"]["repositoryRoot"] != canonical_repo:
        raise WorkflowError("Snapshot repository scope mismatch")
    cached_at = _now_ms() if cached_at_unix_ms is None else _timestamp(
        cached_at_unix_ms, name="cachedAtUnixMs"
    )
    root = _cache_root(repo)
    root.mkdir(parents=True, exist_ok=True)
    key = _scope_key(
        canonical_repo,
        snapshot["scope"]["host"],
        snapshot["scope"]["hostSessionId"],
    )
    target = root / f"{key}.json"
    atomic_write_json(
        target,
        {
            "version": 1,
            "cachedAtUnixMs": cached_at,
            "snapshot": snapshot,
        },
    )
    _evict_cache(root, now_ms=cached_at)
    return target


def observe_and_cache(
    repo: Path,
    host: str,
    host_session_id: str,
    request: dict[str, Any],
) -> dict[str, Any]:
    if _json_size(request) > MAX_OBSERVATION_BYTES:
        raise FlowStatusError("too-large", "Flow Status observation exceeds 256 KiB")
    document = _object(
        request,
        name="observation",
        required={"version", "taskSet", "assignment", "progress", "attention"},
    )
    if document["version"] != 1:
        raise FlowStatusError("unsupported-version", "Unsupported observation version")
    session_id = _string(
        host_session_id, name="host session", maximum=256
    )
    assert isinstance(session_id, str)
    try:
        snapshot = build_snapshot(
            host,
            document["taskSet"],
            assignment=document["assignment"],
            progress=document["progress"],
            attention=document["attention"],
        )
    except WorkflowError as exc:
        raise FlowStatusError("malformed", str(exc)) from exc
    if snapshot["scope"]["hostSessionId"] != session_id:
        raise FlowStatusError(
            "scope-mismatch", "Observation host session does not match --session"
        )
    try:
        cache_path = write_cached_snapshot(repo, snapshot)
    except WorkflowError as exc:
        code = "scope-mismatch" if "scope mismatch" in str(exc).lower() else "malformed"
        raise FlowStatusError(code, str(exc)) from exc
    return {
        "version": 1,
        "state": "stored",
        "scope": snapshot["scope"],
        "cacheKey": cache_path.stem,
        "snapshot": snapshot,
    }


def _read_cache_entry(path: Path) -> tuple[int, dict[str, Any]]:
    try:
        if path.stat().st_size > MAX_SNAPSHOT_BYTES + 4_096:
            raise WorkflowError("Flow Status cache entry exceeds size limit")
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise WorkflowError(f"Corrupt Flow Status cache entry: {path.name}") from exc
    entry = _object(
        value,
        name="cache",
        required={"version", "cachedAtUnixMs", "snapshot"},
    )
    if entry["version"] != 1:
        raise WorkflowError("Unsupported Flow Status cache version")
    cached_at = _timestamp(entry["cachedAtUnixMs"], name="cache.cachedAtUnixMs")
    snapshot = validate_snapshot(entry["snapshot"])
    return cached_at, snapshot


def _evict_cache(root: Path, *, now_ms: int) -> None:
    entries: list[tuple[int, Path]] = []
    for path in sorted(root.glob("*.json")):
        try:
            cached_at, _ = _read_cache_entry(path)
        except WorkflowError:
            path.unlink(missing_ok=True)
            continue
        if now_ms - cached_at > MAX_CACHE_AGE_MS or cached_at > now_ms + FUTURE_TOLERANCE_MS:
            path.unlink(missing_ok=True)
            continue
        entries.append((cached_at, path))
    for _, path in sorted(entries, key=lambda item: (item[0], item[1].name))[
        : max(0, len(entries) - MAX_CACHE_ENTRIES)
    ]:
        path.unlink(missing_ok=True)


def inspect_cached_snapshot(
    repo: Path,
    *,
    host: str | None = None,
    host_session_id: str | None = None,
    now_ms: int | None = None,
) -> dict[str, Any]:
    canonical_repo = str(repo.resolve())
    if host is not None and host not in HOSTS:
        raise WorkflowError(f"Unsupported host: {host}")
    current_time = _now_ms() if now_ms is None else _timestamp(now_ms, name="nowMs")
    root = _cache_root(repo)
    if not root.is_dir():
        raise FlowStatusError("missing", "Flow Status is unavailable: no cached snapshot")
    paths = list(itertools.islice(root.glob("*.json"), MAX_CACHE_ENTRIES + 1))
    if len(paths) > MAX_CACHE_ENTRIES:
        raise FlowStatusError(
            "over-limit", "Flow Status cache exceeds the eight-entry limit"
        )
    matches: list[tuple[int, dict[str, Any]]] = []
    errors = 0
    for path in sorted(paths):
        try:
            cached_at, snapshot = _read_cache_entry(path)
        except WorkflowError:
            errors += 1
            continue
        scope = snapshot["scope"]
        if scope["repositoryRoot"] != canonical_repo:
            continue
        if host is not None and scope["host"] != host:
            continue
        if host_session_id is not None and scope["hostSessionId"] != host_session_id:
            continue
        if current_time - cached_at > MAX_CACHE_AGE_MS:
            continue
        matches.append((cached_at, snapshot))
    if not matches:
        if errors:
            raise FlowStatusError(
                "corrupt", "Flow Status is unavailable: cache entries are corrupt"
            )
        raise FlowStatusError(
            "scope-mismatch", "Flow Status is unavailable for the requested scope"
        )
    if len(matches) != 1:
        raise FlowStatusError(
            "ambiguous",
            "Flow Status scope is ambiguous; specify an exact --host and --session",
        )
    _, stored_snapshot = matches[0]
    snapshot = json.loads(json.dumps(stored_snapshot, ensure_ascii=False))
    generated = snapshot["generatedAtUnixMs"]
    age = current_time - generated
    if age < 0:
        freshness = "clock-uncertain"
    elif age > snapshot["maxAgeMs"]:
        freshness = "stale"
    else:
        freshness = "fresh"
    degraded: list[str] = []
    source_freshness: dict[str, str] = {}
    for source in snapshot["sources"]:
        _, source_state = _freshness(
            source["observedAtUnixMs"], source["maxAgeMs"], current_time
        )
        source_freshness[source["sourceId"]] = source_state
    task_source_state = source_freshness.get(
        snapshot["taskSet"]["sourceId"], "stale"
    )
    if freshness == "fresh" and task_source_state != "fresh":
        freshness = task_source_state
    if freshness != "fresh":
        capability = snapshot["taskSet"]["capability"]
        source_id = snapshot["taskSet"]["sourceId"]
        snapshot["taskSet"] = {
            "state": "unavailable",
            "capability": capability,
            "sourceId": source_id,
            "reason": "stale",
        }
        snapshot["scope"]["taskSetId"] = None
        snapshot["scope"]["taskSetRevision"] = None
        snapshot["currentTask"] = None
        snapshot["attention"] = []
        degraded.append(f"task-set:{freshness}")
    else:
        current = snapshot["currentTask"]
        if current is not None and current["assignment"] is not None:
            assignment_source = current["assignment"]["sourceId"]
            assignment_state = source_freshness.get(assignment_source, "stale")
            if assignment_state != "fresh":
                current["assignment"] = None
                current["progress"] = None
                degraded.append(f"assignment:{assignment_state}")
        if current is not None and current["progress"] is not None:
            progress_source = current["progress"]["sourceId"]
            progress_state = source_freshness.get(progress_source, "stale")
            if progress_state != "fresh":
                current["progress"] = None
                degraded.append(f"progress:{progress_state}")
        retained_attention = []
        for item in snapshot["attention"]:
            fresh, item_state = _freshness(
                item["observedAtUnixMs"], item["maxAgeMs"], current_time
            )
            source_state = source_freshness.get(item["sourceId"], "stale")
            if fresh and source_state == "fresh":
                retained_attention.append(item)
            else:
                degraded.append(
                    f"attention:{item['id']}:{item_state if not fresh else source_state}"
                )
        snapshot["attention"] = retained_attention
    validate_snapshot(snapshot)
    task_available = snapshot["taskSet"]["state"] == "available"
    inspection_state = (
        "available" if freshness == "fresh" and task_available else "unavailable"
    )
    reason = None
    if freshness != "fresh":
        reason = freshness
    elif not task_available:
        reason = snapshot["taskSet"]["reason"]
    return {
        "version": 1,
        "state": inspection_state,
        "freshness": freshness,
        "ageMs": age if age >= 0 else None,
        "reason": reason,
        "degraded": degraded,
        "snapshot": snapshot,
    }


def format_inspection(value: dict[str, Any]) -> str:
    snapshot = value["snapshot"]
    scope = snapshot["scope"]
    task_set = snapshot["taskSet"]
    lines = [
        f"Flow Status: {value['state']} ({value['freshness']})",
        f"Scope: {scope['host']} · {scope['repositoryRoot']}",
    ]
    if scope["hostSessionId"] is not None:
        lines.append(f"Session: {scope['hostSessionId']}")
    if task_set["state"] == "available":
        lines.append(
            "Tasks: "
            f"{task_set['completed']}/{task_set['total']} complete · "
            f"{task_set['active']} active · {task_set['pending']} pending · "
            f"{task_set['failed']} failed"
        )
        lines.append(
            f"Membership: {task_set['membershipRevision']} · {task_set['membershipDigest']}"
        )
    else:
        lines.append(
            f"Tasks: unavailable ({task_set['reason']}) · {task_set['capability']}"
        )
    current = snapshot["currentTask"]
    if current is not None:
        lines.append(f"Current: {current['label']} [{current['taskId']}]")
        assignment = current["assignment"]
        if assignment is not None:
            position = assignment["methodologyPosition"]
            suffix = f" · {position}" if position is not None else ""
            lines.append(
                f"Assignment: {assignment['role']}{suffix} · {assignment['assignmentId']}"
            )
        progress = current["progress"]
        if progress is not None:
            lines.append(
                f"Progress: {progress['label']} {progress['current']}/{progress['total']} "
                f"{progress['unit']} · {progress['sourceRevision']}"
            )
    for item in snapshot["attention"]:
        lines.append(
            f"Attention: {item['severity']} · {item['kind']} · {item['reason']} "
            f"(x{item['count']})"
        )
    if value["freshness"] != "fresh":
        lines.append("Degraded: cached facts are not current and must not authorize control.")
    return "\n".join(lines)


def inspection_error_response(exc: BaseException) -> dict[str, Any]:
    code = exc.code if isinstance(exc, FlowStatusError) else "malformed"
    message = str(exc)
    if len(message) > 512:
        message = message[:509] + "..."
    return {
        "version": 1,
        "state": "unavailable",
        "freshness": "unknown",
        "ageMs": None,
        "reason": code,
        "degraded": [],
        "snapshot": None,
        "error": {
            "code": code,
            "message": message,
        },
    }


# Flow Status v2 cutover -----------------------------------------------------
#
# The v1 source validator above remains the native-activity authority.  The
# definitions below replace only cache assembly/inspection and add the explicit
# root Task/Flow publication receiver.  They deliberately do not read authored
# Markdown, Bundle directories, Git, operation receipts, handoffs, or reviews.

V2_REVISION = re.compile(r"^[A-Za-z0-9._:-]{16,128}$")
V2_HEX64 = re.compile(r"^[0-9a-f]{64}$")
V2_POSITIONS = (
    "explore",
    "design",
    "qbd-1",
    "decompose",
    "qbd-2",
    "execute",
    "integrate",
    "wiki",
    "finish",
)
V2_MOVEMENTS = {"initial", "same", "forward", "backtrack", "resume", "reopen"}
V2_MEASURE_OWNER = {
    "explore": "explore-local",
    "design": "design-local",
    "qbd-1": "audit-local",
    "decompose": "work-map-local",
    "qbd-2": "audit-local",
    "execute": "accepted-work",
    "integrate": "integration-checks",
    "wiki": "wiki-harvest",
    "finish": "finish-checks",
}
V2_ROOT_UNAVAILABLE = {
    "unsupported",
    "missing",
    "expired",
    "malformed",
    "scope-mismatch",
    "selection-mismatch",
    "session-replaced",
    "disconnected",
    "cleared",
}
V2_CLEAR_REASON = {
    "selection-changed": "selection-mismatch",
    "task-cleared": "selection-mismatch",
    "archived": "selection-mismatch",
    "session-ended": "session-replaced",
    "disconnected": "disconnected",
    "publisher-shutdown": "disconnected",
    "user-requested": "cleared",
    "removed": "cleared",
}


def _v2_exact(value: Any, name: str, keys: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise FlowStatusError("malformed", f"{name} must contain only its closed members")
    return value


def _v2_revision(value: Any, name: str) -> str:
    if not isinstance(value, str) or not V2_REVISION.fullmatch(value):
        raise FlowStatusError("malformed", f"{name} is not a valid revision")
    return value


def _v2_id(value: Any, name: str) -> str:
    return _string(value, name=name, maximum=128)  # type: ignore[return-value]


def _v2_integer(value: Any, name: str, minimum: int, maximum: int) -> int:
    return _integer(value, name=name, minimum=minimum, maximum=maximum)


def _v2_nullable_text(value: Any, name: str, maximum: int) -> str | None:
    if value is None:
        return None
    return _string(value, name=name, maximum=maximum)  # type: ignore[return-value]


def _v2_canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _v2_digest(value: Any) -> str:
    return hashlib.sha256(_v2_canonical_json(value).encode("utf-8")).hexdigest()


def _v2_scope(value: Any, *, name: str = "scope") -> dict[str, Any]:
    scope = _v2_exact(
        value,
        name,
        {"repositoryRoot", "host", "hostSessionId"},
    )
    repository_root = _canonical_repo(
        scope["repositoryRoot"], name=f"{name}.repositoryRoot"
    )
    host = _string(scope["host"], name=f"{name}.host")
    if host not in HOSTS:
        raise FlowStatusError("host-mismatch", f"{name}.host is unsupported")
    session = _v2_id(scope["hostSessionId"], f"{name}.hostSessionId")
    return {
        "repositoryRoot": repository_root,
        "host": host,
        "hostSessionId": session,
    }


def _v2_root_task(value: Any) -> dict[str, Any]:
    task = _v2_exact(
        value,
        "rootTask",
        {"taskId", "title", "selectionRevision"},
    )
    return {
        "taskId": _v2_id(task["taskId"], "rootTask.taskId"),
        "title": _v2_nullable_text(task["title"], "rootTask.title", 96),
        "selectionRevision": _v2_revision(
            task["selectionRevision"], "rootTask.selectionRevision"
        ),
    }


def _v2_audit(value: Any, name: str) -> dict[str, Any]:
    audit = _v2_exact(
        value,
        name,
        {"auditId", "attempt", "verdict", "calibration", "sourceRevision"},
    )
    verdict = _string(audit["verdict"], name=f"{name}.verdict")
    calibration = _string(audit["calibration"], name=f"{name}.calibration")
    if verdict not in {"pending", "fail", "needs-evidence", "pass"}:
        raise FlowStatusError("invalid-relation", f"{name}.verdict is invalid")
    if calibration not in {"not-requested", "awaiting", "approved", "rejected"}:
        raise FlowStatusError("invalid-relation", f"{name}.calibration is invalid")
    if calibration == "approved" and verdict != "pass":
        raise FlowStatusError(
            "invalid-relation", f"{name} approved calibration requires pass"
        )
    return {
        "auditId": _v2_id(audit["auditId"], f"{name}.auditId"),
        "attempt": _v2_integer(audit["attempt"], f"{name}.attempt", 1, 99),
        "verdict": verdict,
        "calibration": calibration,
        "sourceRevision": _v2_revision(
            audit["sourceRevision"], f"{name}.sourceRevision"
        ),
    }


def _v2_measure(value: Any, position: str) -> dict[str, Any] | None:
    if value is None:
        return None
    measure = _v2_exact(
        value,
        "orientation.measure",
        {
            "owner",
            "label",
            "current",
            "total",
            "unit",
            "unitSetRevision",
            "sourceRevision",
        },
    )
    owner = _string(measure["owner"], name="orientation.measure.owner")
    if owner != V2_MEASURE_OWNER[position]:
        raise FlowStatusError(
            "invalid-relation", "Measure owner does not match Flow position"
        )
    total = _v2_integer(measure["total"], "orientation.measure.total", 1, 64)
    current = _v2_integer(
        measure["current"], "orientation.measure.current", 0, total
    )
    return {
        "owner": owner,
        "label": _string(
            measure["label"], name="orientation.measure.label", maximum=32
        ),
        "current": current,
        "total": total,
        "unit": _string(
            measure["unit"], name="orientation.measure.unit", maximum=24
        ),
        "unitSetRevision": _v2_revision(
            measure["unitSetRevision"], "orientation.measure.unitSetRevision"
        ),
        "sourceRevision": _v2_revision(
            measure["sourceRevision"], "orientation.measure.sourceRevision"
        ),
    }


def _v2_catalog_entry(value: Any, index: int) -> dict[str, Any]:
    name = f"workSetBaseline.works[{index}]"
    item = _v2_exact(
        value,
        name,
        {
            "workId",
            "title",
            "currentWorkRevision",
            "currentHandoff",
            "currentIndependentReview",
        },
    )
    result: dict[str, Any] = {
        "workId": _v2_id(item["workId"], f"{name}.workId"),
        "title": _v2_nullable_text(item["title"], f"{name}.title", 96),
        "currentWorkRevision": _v2_revision(
            item["currentWorkRevision"], f"{name}.currentWorkRevision"
        ),
        "currentHandoff": None,
        "currentIndependentReview": None,
    }
    if item["currentHandoff"] is not None:
        handoff = _v2_exact(
            item["currentHandoff"],
            f"{name}.currentHandoff",
            {"workRevision", "handoffRevision", "implementerActorId"},
        )
        result["currentHandoff"] = {
            "workRevision": _v2_revision(
                handoff["workRevision"], f"{name}.currentHandoff.workRevision"
            ),
            "handoffRevision": _v2_revision(
                handoff["handoffRevision"],
                f"{name}.currentHandoff.handoffRevision",
            ),
            "implementerActorId": _v2_id(
                handoff["implementerActorId"],
                f"{name}.currentHandoff.implementerActorId",
            ),
        }
        if result["currentHandoff"]["workRevision"] != result["currentWorkRevision"]:
            raise FlowStatusError(
                "invalid-relation", f"{name} handoff is for a stale Work revision"
            )
    if item["currentIndependentReview"] is not None:
        if result["currentHandoff"] is None:
            raise FlowStatusError(
                "invalid-relation", f"{name} review requires current handoff"
            )
        review = _v2_exact(
            item["currentIndependentReview"],
            f"{name}.currentIndependentReview",
            {
                "workRevision",
                "handoffRevision",
                "reviewId",
                "reviewRevision",
                "reviewerActorId",
                "reviewRound",
                "independence",
                "result",
            },
        )
        review_result = _string(
            review["result"], name=f"{name}.currentIndependentReview.result"
        )
        if review_result not in {"pending", "changes-requested", "accepted"}:
            raise FlowStatusError(
                "invalid-relation", f"{name} review result is invalid"
            )
        if review["independence"] != "different-actor":
            raise FlowStatusError(
                "invalid-relation", f"{name} review is not independent"
            )
        result["currentIndependentReview"] = {
            "workRevision": _v2_revision(
                review["workRevision"],
                f"{name}.currentIndependentReview.workRevision",
            ),
            "handoffRevision": _v2_revision(
                review["handoffRevision"],
                f"{name}.currentIndependentReview.handoffRevision",
            ),
            "reviewId": _v2_id(
                review["reviewId"], f"{name}.currentIndependentReview.reviewId"
            ),
            "reviewRevision": _v2_revision(
                review["reviewRevision"],
                f"{name}.currentIndependentReview.reviewRevision",
            ),
            "reviewerActorId": _v2_id(
                review["reviewerActorId"],
                f"{name}.currentIndependentReview.reviewerActorId",
            ),
            "reviewRound": _v2_integer(
                review["reviewRound"],
                f"{name}.currentIndependentReview.reviewRound",
                1,
                99,
            ),
            "independence": "different-actor",
            "result": review_result,
        }
        handoff = result["currentHandoff"]
        current_review = result["currentIndependentReview"]
        if (
            current_review["workRevision"] != handoff["workRevision"]
            or current_review["handoffRevision"] != handoff["handoffRevision"]
            or current_review["reviewerActorId"] == handoff["implementerActorId"]
        ):
            raise FlowStatusError(
                "invalid-relation",
                f"{name} review does not match the current independent handoff",
            )
    return result


def _v2_work_baseline(value: Any) -> dict[str, Any]:
    baseline = _object(
        value,
        name="workSetBaseline",
        required={"state"},
        optional={
            "reason",
            "workSetRevision",
            "catalogRevision",
            "workTotal",
            "currentExecution",
            "works",
        },
    )
    if baseline["state"] == "unavailable":
        unavailable = _v2_exact(value, "workSetBaseline", {"state", "reason"})
        if unavailable["reason"] not in {
            "not-authored",
            "not-required",
            "not-supplied",
        }:
            raise FlowStatusError(
                "invalid-relation", "Invalid unavailable Work-set reason"
            )
        return {"state": "unavailable", "reason": unavailable["reason"]}
    available = _v2_exact(
        value,
        "workSetBaseline",
        {
            "state",
            "workSetRevision",
            "catalogRevision",
            "workTotal",
            "currentExecution",
            "works",
        },
    )
    if available["state"] != "available":
        raise FlowStatusError("malformed", "Invalid Work-set state")
    works_raw = available["works"]
    if not isinstance(works_raw, list) or len(works_raw) > 64:
        raise FlowStatusError("malformed", "Work catalog must be a bounded array")
    works = [_v2_catalog_entry(item, index) for index, item in enumerate(works_raw)]
    total = _v2_integer(available["workTotal"], "workSetBaseline.workTotal", 0, 64)
    if total != len(works):
        raise FlowStatusError("invalid-relation", "Work total does not match catalog")
    work_ids = [item["workId"] for item in works]
    if len(work_ids) != len(set(work_ids)):
        raise FlowStatusError("invalid-relation", "Work catalog contains duplicate IDs")
    current: dict[str, Any] | None = None
    if available["currentExecution"] is not None:
        raw_current = _v2_exact(
            available["currentExecution"],
            "workSetBaseline.currentExecution",
            {"workId", "focus", "reworkRound"},
        )
        focus = _string(
            raw_current["focus"], name="workSetBaseline.currentExecution.focus"
        )
        if focus not in {"implement", "review", "rework", "accepted"}:
            raise FlowStatusError("invalid-relation", "Invalid current Work focus")
        current = {
            "workId": _v2_id(
                raw_current["workId"], "workSetBaseline.currentExecution.workId"
            ),
            "focus": focus,
            "reworkRound": _v2_integer(
                raw_current["reworkRound"],
                "workSetBaseline.currentExecution.reworkRound",
                0,
                99,
            ),
        }
        if current["workId"] not in set(work_ids):
            raise FlowStatusError(
                "invalid-relation", "Current Work is outside the complete catalog"
            )
    all_accepted = all(
        item["currentIndependentReview"] is not None
        and item["currentIndependentReview"]["result"] == "accepted"
        for item in works
    )
    if (current is None) != all_accepted:
        raise FlowStatusError(
            "invalid-relation",
            "Current Work must be null exactly when the catalog is fully accepted",
        )
    return {
        "state": "available",
        "workSetRevision": _v2_revision(
            available["workSetRevision"], "workSetBaseline.workSetRevision"
        ),
        "catalogRevision": _v2_revision(
            available["catalogRevision"], "workSetBaseline.catalogRevision"
        ),
        "workTotal": total,
        "currentExecution": current,
        "works": works,
    }


def _v2_expected_acceptance(baseline: dict[str, Any]) -> list[dict[str, Any]]:
    accepted: list[dict[str, Any]] = []
    if baseline["state"] != "available":
        return accepted
    for item in baseline["works"]:
        handoff = item["currentHandoff"]
        review = item["currentIndependentReview"]
        if handoff is None or review is None or review["result"] != "accepted":
            continue
        accepted.append(
            {
                "workSetRevision": baseline["workSetRevision"],
                "workId": item["workId"],
                "workRevision": item["currentWorkRevision"],
                "handoffRevision": handoff["handoffRevision"],
                "implementerActorId": handoff["implementerActorId"],
                "reviewId": review["reviewId"],
                "reviewRevision": review["reviewRevision"],
                "reviewerActorId": review["reviewerActorId"],
                "reviewRound": review["reviewRound"],
                "independence": "different-actor",
                "result": "accepted",
            }
        )
    return sorted(accepted, key=lambda item: item["workId"])


def _v2_acceptance(value: Any, baseline: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) > 64:
        raise FlowStatusError("malformed", "Execute acceptance must be a bounded array")
    accepted: list[dict[str, Any]] = []
    for index, raw in enumerate(value):
        name = f"executeAcceptance[{index}]"
        item = _v2_exact(
            raw,
            name,
            {
                "workSetRevision",
                "workId",
                "workRevision",
                "handoffRevision",
                "implementerActorId",
                "reviewId",
                "reviewRevision",
                "reviewerActorId",
                "reviewRound",
                "independence",
                "result",
            },
        )
        accepted.append(
            {
                "workSetRevision": _v2_revision(
                    item["workSetRevision"], f"{name}.workSetRevision"
                ),
                "workId": _v2_id(item["workId"], f"{name}.workId"),
                "workRevision": _v2_revision(
                    item["workRevision"], f"{name}.workRevision"
                ),
                "handoffRevision": _v2_revision(
                    item["handoffRevision"], f"{name}.handoffRevision"
                ),
                "implementerActorId": _v2_id(
                    item["implementerActorId"], f"{name}.implementerActorId"
                ),
                "reviewId": _v2_id(item["reviewId"], f"{name}.reviewId"),
                "reviewRevision": _v2_revision(
                    item["reviewRevision"], f"{name}.reviewRevision"
                ),
                "reviewerActorId": _v2_id(
                    item["reviewerActorId"], f"{name}.reviewerActorId"
                ),
                "reviewRound": _v2_integer(
                    item["reviewRound"], f"{name}.reviewRound", 1, 99
                ),
                "independence": item["independence"],
                "result": item["result"],
            }
        )
    if accepted != sorted(accepted, key=lambda item: item["workId"]):
        raise FlowStatusError(
            "invalid-relation", "Acceptance attestations must be Work-ID sorted"
        )
    if len({item["workId"] for item in accepted}) != len(accepted):
        raise FlowStatusError(
            "invalid-relation", "Acceptance contains duplicate Work IDs"
        )
    if accepted != _v2_expected_acceptance(baseline):
        raise FlowStatusError(
            "invalid-relation",
            "Acceptance does not exactly match the complete current Work catalog",
        )
    return accepted


def _v2_execute_current(
    value: Any,
    baseline: dict[str, Any],
    accepted: list[dict[str, Any]],
) -> dict[str, Any] | None:
    expected = baseline["currentExecution"]
    if value is None:
        if expected is not None:
            raise FlowStatusError(
                "invalid-relation", "Execute current Work unexpectedly missing"
            )
        return None
    if expected is None:
        raise FlowStatusError(
            "invalid-relation", "Execute current Work must be null when all accepted"
        )
    current = _v2_exact(
        value,
        "orientation.detail.currentWork",
        {
            "workId",
            "title",
            "workRevision",
            "focus",
            "reviewRound",
            "reworkRound",
            "reviewVerdict",
            "handoffRevision",
        },
    )
    work = next(
        item for item in baseline["works"] if item["workId"] == expected["workId"]
    )
    handoff = work["currentHandoff"]
    review = work["currentIndependentReview"]
    normalized = {
        "workId": _v2_id(current["workId"], "orientation.detail.currentWork.workId"),
        "title": _v2_nullable_text(
            current["title"], "orientation.detail.currentWork.title", 96
        ),
        "workRevision": _v2_revision(
            current["workRevision"], "orientation.detail.currentWork.workRevision"
        ),
        "focus": _string(
            current["focus"], name="orientation.detail.currentWork.focus"
        ),
        "reviewRound": _v2_integer(
            current["reviewRound"],
            "orientation.detail.currentWork.reviewRound",
            0,
            99,
        ),
        "reworkRound": _v2_integer(
            current["reworkRound"],
            "orientation.detail.currentWork.reworkRound",
            0,
            99,
        ),
        "reviewVerdict": _string(
            current["reviewVerdict"],
            name="orientation.detail.currentWork.reviewVerdict",
        ),
        "handoffRevision": (
            None
            if current["handoffRevision"] is None
            else _v2_revision(
                current["handoffRevision"],
                "orientation.detail.currentWork.handoffRevision",
            )
        ),
    }
    if (
        normalized["workId"] != work["workId"]
        or normalized["title"] != work["title"]
        or normalized["workRevision"] != work["currentWorkRevision"]
        or normalized["focus"] != expected["focus"]
        or normalized["reworkRound"] != expected["reworkRound"]
        or normalized["handoffRevision"]
        != (None if handoff is None else handoff["handoffRevision"])
    ):
        raise FlowStatusError(
            "invalid-relation", "Current Work does not match the complete catalog"
        )
    focus = normalized["focus"]
    if focus == "implement":
        legal = (
            normalized["reviewRound"] == 0
            and normalized["reworkRound"] == 0
            and normalized["reviewVerdict"] == "none"
            and handoff is None
            and review is None
        )
    elif focus == "review":
        legal = (
            handoff is not None
            and review is not None
            and review["result"] == "pending"
            and normalized["reviewRound"] == review["reviewRound"]
            and normalized["reviewVerdict"] == "pending"
        )
    elif focus == "rework":
        legal = (
            handoff is not None
            and review is not None
            and review["result"] == "changes-requested"
            and normalized["reviewRound"] == review["reviewRound"]
            and normalized["reworkRound"] >= 1
            and normalized["reviewVerdict"] == "changes-requested"
        )
    elif focus == "accepted":
        legal = (
            handoff is not None
            and review is not None
            and review["result"] == "accepted"
            and normalized["reviewRound"] == review["reviewRound"]
            and normalized["reviewVerdict"] == "accepted"
            and any(item["workId"] == work["workId"] for item in accepted)
        )
    else:
        legal = False
    if not legal:
        raise FlowStatusError(
            "invalid-relation", "Current Work focus/review combination is invalid"
        )
    return normalized


def _v2_detail(
    value: Any,
    position: str,
    baseline: dict[str, Any],
    acceptance_raw: Any,
) -> tuple[dict[str, Any], list[dict[str, Any]] | None]:
    if not isinstance(value, dict) or value.get("kind") != position:
        raise FlowStatusError(
            "invalid-relation", "Flow detail kind does not match position"
        )
    if position == "explore":
        item = _v2_exact(
            value, "orientation.detail", {"kind", "mode", "round", "focus", "reframe"}
        )
        if item["mode"] not in {"brainstorm", "research"} or item["reframe"] not in {
            "none",
            "evidence",
            "synthesis",
            "audit",
            "review",
            "implementation",
        }:
            raise FlowStatusError("invalid-relation", "Invalid Explore detail")
        return {
            "kind": position,
            "mode": item["mode"],
            "round": _v2_integer(item["round"], "orientation.detail.round", 1, 99),
            "focus": _v2_nullable_text(
                item["focus"], "orientation.detail.focus", 160
            ),
            "reframe": item["reframe"],
        }, None
    if position == "design":
        item = _v2_exact(
            value, "orientation.detail", {"kind", "focus", "detail"}
        )
        if item["focus"] not in {"prd", "design", "decision", "interface"}:
            raise FlowStatusError("invalid-relation", "Invalid Design focus")
        return {
            "kind": position,
            "focus": item["focus"],
            "detail": _v2_nullable_text(
                item["detail"], "orientation.detail.detail", 160
            ),
        }, None
    if position in {"qbd-1", "qbd-2"}:
        item = _v2_exact(
            value,
            "orientation.detail",
            {
                "kind",
                "auditId",
                "attempt",
                "verdict",
                "calibration",
                "sourceRevision",
            },
        )
        audit = _v2_audit(
            {key: item[key] for key in item if key != "kind"},
            "orientation.detail",
        )
        return {"kind": position, **audit}, None
    if position == "decompose":
        item = _v2_exact(
            value,
            "orientation.detail",
            {"kind", "workSetRevision", "workTotal", "focus"},
        )
        detail = {
            "kind": position,
            "workSetRevision": _v2_revision(
                item["workSetRevision"], "orientation.detail.workSetRevision"
            ),
            "workTotal": _v2_integer(
                item["workTotal"], "orientation.detail.workTotal", 0, 64
            ),
            "focus": _v2_nullable_text(
                item["focus"], "orientation.detail.focus", 160
            ),
        }
        if detail["workTotal"] > 0 and (
            baseline["state"] != "available"
            or baseline["workSetRevision"] != detail["workSetRevision"]
            or baseline["workTotal"] != detail["workTotal"]
        ):
            raise FlowStatusError(
                "invalid-relation", "Decompose detail conflicts with Work catalog"
            )
        return detail, None
    if position == "execute":
        if baseline["state"] != "available":
            raise FlowStatusError(
                "invalid-relation", "Execute requires a complete Work catalog"
            )
        item = _v2_exact(
            value,
            "orientation.detail",
            {
                "kind",
                "workSetRevision",
                "workTotal",
                "workCatalogRevision",
                "workCatalogDigest",
                "acceptedWork",
                "acceptanceSetRevision",
                "acceptanceDigest",
                "currentWork",
            },
        )
        accepted = _v2_acceptance(acceptance_raw, baseline)
        expected_catalog = sorted(baseline["works"], key=lambda entry: entry["workId"])
        expected_catalog_digest = _v2_digest(expected_catalog)
        expected_acceptance_digest = _v2_digest(accepted)
        detail = {
            "kind": position,
            "workSetRevision": _v2_revision(
                item["workSetRevision"], "orientation.detail.workSetRevision"
            ),
            "workTotal": _v2_integer(
                item["workTotal"], "orientation.detail.workTotal", 0, 64
            ),
            "workCatalogRevision": _v2_revision(
                item["workCatalogRevision"],
                "orientation.detail.workCatalogRevision",
            ),
            "workCatalogDigest": item["workCatalogDigest"],
            "acceptedWork": _v2_integer(
                item["acceptedWork"], "orientation.detail.acceptedWork", 0, 64
            ),
            "acceptanceSetRevision": _v2_revision(
                item["acceptanceSetRevision"],
                "orientation.detail.acceptanceSetRevision",
            ),
            "acceptanceDigest": item["acceptanceDigest"],
            "currentWork": None,
        }
        if (
            not isinstance(detail["workCatalogDigest"], str)
            or not V2_HEX64.fullmatch(detail["workCatalogDigest"])
            or not isinstance(detail["acceptanceDigest"], str)
            or not V2_HEX64.fullmatch(detail["acceptanceDigest"])
            or detail["workSetRevision"] != baseline["workSetRevision"]
            or detail["workTotal"] != baseline["workTotal"]
            or detail["workCatalogRevision"] != baseline["catalogRevision"]
            or detail["workCatalogDigest"] != expected_catalog_digest
            or detail["acceptedWork"] != len(accepted)
            or detail["acceptanceDigest"] != expected_acceptance_digest
        ):
            raise FlowStatusError(
                "invalid-relation",
                "Execute aggregate does not match the complete Work catalog",
            )
        detail["currentWork"] = _v2_execute_current(
            item["currentWork"], baseline, accepted
        )
        return detail, accepted
    if position == "integrate":
        item = _v2_exact(
            value, "orientation.detail", {"kind", "focus", "detail"}
        )
        if item["focus"] not in {"checks", "package", "cutover"}:
            raise FlowStatusError("invalid-relation", "Invalid Integrate focus")
        return {
            "kind": position,
            "focus": item["focus"],
            "detail": _v2_nullable_text(
                item["detail"], "orientation.detail.detail", 160
            ),
        }, None
    if position == "wiki":
        item = _v2_exact(
            value, "orientation.detail", {"kind", "focus", "detail"}
        )
        if item["focus"] not in {"harvest", "curate", "link"}:
            raise FlowStatusError("invalid-relation", "Invalid Wiki focus")
        return {
            "kind": position,
            "focus": item["focus"],
            "detail": _v2_nullable_text(
                item["detail"], "orientation.detail.detail", 160
            ),
        }, None
    item = _v2_exact(
        value,
        "orientation.detail",
        {"kind", "focus", "completionAudit", "detail"},
    )
    if item["focus"] not in {"completion-audit", "checks", "commit", "archive"}:
        raise FlowStatusError("invalid-relation", "Invalid Finish focus")
    if item["focus"] == "completion-audit":
        if item["completionAudit"] is None:
            raise FlowStatusError(
                "invalid-relation", "Finish completion audit is required"
            )
        completion_audit = _v2_audit(
            item["completionAudit"], "orientation.detail.completionAudit"
        )
    else:
        if item["completionAudit"] is not None:
            raise FlowStatusError(
                "invalid-relation", "Finish completion audit is not allowed"
            )
        completion_audit = None
    return {
        "kind": position,
        "focus": item["focus"],
        "completionAudit": completion_audit,
        "detail": _v2_nullable_text(
            item["detail"], "orientation.detail.detail", 160
        ),
    }, None


def _v2_wave(value: Any, position: str, detail: dict[str, Any]) -> dict[str, Any] | None:
    if value is None:
        return None
    if position not in {"decompose", "execute", "integrate"}:
        raise FlowStatusError(
            "invalid-relation", "Wave is unavailable for this Flow position"
        )
    wave = _v2_exact(
        value,
        "drilldown.wave",
        {
            "waveId",
            "title",
            "revision",
            "workSetRevision",
            "ordinal",
            "total",
            "focusWorkIds",
        },
    )
    total = _v2_integer(wave["total"], "drilldown.wave.total", 1, 64)
    focus = wave["focusWorkIds"]
    if (
        not isinstance(focus, list)
        or len(focus) > 64
        or any(not isinstance(item, str) or not item for item in focus)
        or len(focus) != len(set(focus))
    ):
        raise FlowStatusError("malformed", "Invalid Wave focus Work IDs")
    result = {
        "waveId": _v2_id(wave["waveId"], "drilldown.wave.waveId"),
        "title": _v2_nullable_text(wave["title"], "drilldown.wave.title", 96),
        "revision": _v2_revision(wave["revision"], "drilldown.wave.revision"),
        "workSetRevision": _v2_revision(
            wave["workSetRevision"], "drilldown.wave.workSetRevision"
        ),
        "ordinal": _v2_integer(
            wave["ordinal"], "drilldown.wave.ordinal", 1, total
        ),
        "total": total,
        "focusWorkIds": [_v2_id(item, "drilldown.wave.focusWorkIds") for item in focus],
    }
    if (
        "workSetRevision" in detail
        and result["workSetRevision"] != detail["workSetRevision"]
    ):
        raise FlowStatusError(
            "invalid-relation", "Wave Work-set revision does not match detail"
        )
    return result


def validate_root_flow_publish_request_v2(
    value: Any,
    *,
    repo: Path,
    host: str,
    host_session_id: str,
    actor_id: str,
    now_ms: int | None = None,
) -> tuple[dict[str, Any], str]:
    if _json_size(value) > MAX_OBSERVATION_BYTES:
        raise FlowStatusError("too-large", "Root Flow request exceeds 256 KiB")
    request = _v2_exact(
        value,
        "publish",
        {
            "version",
            "capability",
            "requestId",
            "expectedPreviousPublicationRevision",
            "scope",
            "rootTask",
            "orientation",
            "workSetBaseline",
            "executeAcceptance",
            "drilldown",
            "publisher",
            "semanticObservedAtUnixMs",
            "lease",
        },
    )
    if request["version"] != 2:
        raise FlowStatusError("unsupported-version", "Unsupported publish version")
    if request["capability"] != "orchestratorFlowPublicationV2":
        raise FlowStatusError("malformed", "Unsupported publication capability")
    scope = _v2_scope(request["scope"])
    canonical_repo = str(repo.resolve())
    if scope["repositoryRoot"] != canonical_repo:
        raise FlowStatusError("repository-mismatch", "Repository scope mismatch")
    if host not in HOSTS or scope["host"] != host:
        raise FlowStatusError("host-mismatch", "Host scope mismatch")
    if scope["hostSessionId"] != host_session_id:
        raise FlowStatusError("session-mismatch", "Session scope mismatch")
    root_task = _v2_root_task(request["rootTask"])
    publisher = _v2_exact(
        request["publisher"],
        "publisher",
        {"publisherId", "actorId", "sourceRevision", "publicationRevision"},
    )
    normalized_publisher = {
        "publisherId": _v2_id(publisher["publisherId"], "publisher.publisherId"),
        "actorId": _v2_id(publisher["actorId"], "publisher.actorId"),
        "sourceRevision": _v2_revision(
            publisher["sourceRevision"], "publisher.sourceRevision"
        ),
        "publicationRevision": _v2_revision(
            publisher["publicationRevision"], "publisher.publicationRevision"
        ),
    }
    if normalized_publisher["actorId"] != actor_id:
        raise FlowStatusError("actor-mismatch", "Publisher actor mismatch")
    observed_at = _timestamp(
        request["semanticObservedAtUnixMs"], name="semanticObservedAtUnixMs"
    )
    current_time = _now_ms() if now_ms is None else _timestamp(now_ms, name="nowMs")
    if observed_at > current_time + 30_000:
        raise FlowStatusError("future", "Semantic observation is too far in the future")
    orientation = _v2_exact(
        request["orientation"],
        "orientation",
        {
            "position",
            "movement",
            "fromPosition",
            "resumeFrom",
            "detail",
            "measure",
        },
    )
    position = orientation["position"]
    movement = orientation["movement"]
    if position not in V2_POSITIONS or movement not in V2_MOVEMENTS:
        raise FlowStatusError("invalid-relation", "Invalid Flow orientation")
    if orientation["fromPosition"] is not None and orientation["fromPosition"] not in V2_POSITIONS:
        raise FlowStatusError("invalid-relation", "Invalid prior Flow position")
    resume_from = orientation["resumeFrom"]
    if resume_from is not None:
        resume_from = _v2_exact(
            resume_from,
            "orientation.resumeFrom",
            {"hostSessionId", "publicationRevision", "position"},
        )
        resume_from = {
            "hostSessionId": _v2_id(
                resume_from["hostSessionId"], "orientation.resumeFrom.hostSessionId"
            ),
            "publicationRevision": _v2_revision(
                resume_from["publicationRevision"],
                "orientation.resumeFrom.publicationRevision",
            ),
            "position": resume_from["position"],
        }
        if resume_from["position"] not in V2_POSITIONS:
            raise FlowStatusError("invalid-relation", "Invalid resume position")
    baseline = _v2_work_baseline(request["workSetBaseline"])
    detail, accepted = _v2_detail(
        orientation["detail"], position, baseline, request["executeAcceptance"]
    )
    if position == "execute" and accepted is None:
        raise FlowStatusError("invalid-relation", "Execute acceptance is required")
    if position != "execute" and request["executeAcceptance"] is not None:
        raise FlowStatusError(
            "invalid-relation", "Acceptance is available only for Execute"
        )
    measure = _v2_measure(orientation["measure"], position)
    if measure is not None and measure["owner"] == "accepted-work":
        if (
            detail["kind"] != "execute"
            or measure["current"] != detail["acceptedWork"]
            or measure["total"] != detail["workTotal"]
            or measure["unitSetRevision"] != detail["workSetRevision"]
            or measure["sourceRevision"] != detail["acceptanceSetRevision"]
        ):
            raise FlowStatusError(
                "invalid-relation", "Accepted Work measure conflicts with Execute"
            )
    drilldown = _v2_exact(request["drilldown"], "drilldown", {"wave"})
    wave = _v2_wave(drilldown["wave"], position, detail)
    lease = _v2_exact(
        request["lease"],
        "lease",
        {
            "leaseId",
            "leaseRevision",
            "ownerActorId",
            "selectionRevision",
            "issuedAtUnixMs",
            "expiresAtUnixMs",
            "durationMs",
        },
    )
    duration = _v2_integer(lease["durationMs"], "lease.durationMs", 600_000, 900_000)
    issued = _timestamp(lease["issuedAtUnixMs"], name="lease.issuedAtUnixMs")
    expires = _timestamp(lease["expiresAtUnixMs"], name="lease.expiresAtUnixMs")
    normalized_lease = {
        "leaseId": _v2_revision(lease["leaseId"], "lease.leaseId"),
        "leaseRevision": _v2_revision(
            lease["leaseRevision"], "lease.leaseRevision"
        ),
        "ownerActorId": _v2_id(lease["ownerActorId"], "lease.ownerActorId"),
        "selectionRevision": _v2_revision(
            lease["selectionRevision"], "lease.selectionRevision"
        ),
        "issuedAtUnixMs": issued,
        "expiresAtUnixMs": expires,
        "durationMs": duration,
    }
    if (
        normalized_lease["ownerActorId"] != normalized_publisher["actorId"]
        or normalized_lease["selectionRevision"] != root_task["selectionRevision"]
        or issued != observed_at
        or expires != issued + duration
        or expires <= current_time
    ):
        raise FlowStatusError("invalid-relation", "Invalid publication lease relation")
    expected_previous = request["expectedPreviousPublicationRevision"]
    if expected_previous is not None:
        expected_previous = _v2_revision(
            expected_previous, "expectedPreviousPublicationRevision"
        )
    request_id = _v2_revision(request["requestId"], "requestId")
    normalized = {
        "version": 2,
        "capability": "orchestratorFlowPublicationV2",
        "requestId": request_id,
        "expectedPreviousPublicationRevision": expected_previous,
        "scope": scope,
        "rootTask": root_task,
        "orientation": {
            "position": position,
            "movement": movement,
            "fromPosition": orientation["fromPosition"],
            "resumeFrom": resume_from,
            "detail": detail,
            "measure": measure,
        },
        "workSetBaseline": baseline,
        "executeAcceptance": accepted,
        "drilldown": {"wave": wave},
        "publisher": normalized_publisher,
        "semanticObservedAtUnixMs": observed_at,
        "lease": normalized_lease,
    }
    return normalized, _v2_digest(normalized)


def _v2_publication_from_request(
    request: dict[str, Any], request_digest: str
) -> dict[str, Any]:
    return {
        "version": 2,
        "capability": request["capability"],
        "requestId": request["requestId"],
        "requestDigest": request_digest,
        "scope": request["scope"],
        "rootTask": request["rootTask"],
        "orientation": request["orientation"],
        "drilldown": request["drilldown"],
        "publisher": request["publisher"],
        "semanticObservedAtUnixMs": request["semanticObservedAtUnixMs"],
        "lease": request["lease"],
    }


def _v2_snapshot_revision(prefix: str = "snapshot") -> str:
    return f"{prefix}-{uuid4().hex}"


def _v2_renew_snapshot_revision(request: dict[str, Any]) -> str:
    # The enclosing snapshot revision is the only field, besides the lease, that renewal is
    # allowed to change. Content-addressing it binds an idempotent retry to the complete closed
    # request (including its predecessor CAS) without retaining a renewal-history ledger.
    return f"renew-{_v2_digest(request)}"


def _v2_unavailable(reason: str) -> dict[str, Any]:
    if reason not in V2_ROOT_UNAVAILABLE:
        raise FlowStatusError("malformed", "Invalid root Flow unavailable reason")
    return {"state": "unavailable", "reason": reason}


def _v2_validate_publication(value: Any) -> dict[str, Any]:
    publication = _v2_exact(
        value,
        "snapshot.rootFlow.publication",
        {
            "version",
            "capability",
            "requestId",
            "requestDigest",
            "scope",
            "rootTask",
            "orientation",
            "drilldown",
            "publisher",
            "semanticObservedAtUnixMs",
            "lease",
        },
    )
    if publication["version"] != 2 or publication["capability"] != "orchestratorFlowPublicationV2":
        raise FlowStatusError("malformed", "Invalid stored publication version")
    if (
        not isinstance(publication["requestDigest"], str)
        or not V2_HEX64.fullmatch(publication["requestDigest"])
    ):
        raise FlowStatusError("malformed", "Invalid stored request digest")
    _v2_revision(publication["requestId"], "publication.requestId")
    _v2_scope(publication["scope"], name="publication.scope")
    _v2_root_task(publication["rootTask"])
    # Stored publication has already discarded the request-only Work catalog.  Validate its
    # closed orientation and lease shape without attempting to recreate those assertions.
    orientation = _v2_exact(
        publication["orientation"],
        "publication.orientation",
        {
            "position",
            "movement",
            "fromPosition",
            "resumeFrom",
            "detail",
            "measure",
        },
    )
    if orientation["position"] not in V2_POSITIONS or orientation["movement"] not in V2_MOVEMENTS:
        raise FlowStatusError("malformed", "Invalid stored Flow orientation")
    if not isinstance(orientation["detail"], dict) or orientation["detail"].get("kind") != orientation["position"]:
        raise FlowStatusError("malformed", "Invalid stored Flow detail")
    _v2_measure(orientation["measure"], orientation["position"])
    _v2_exact(publication["drilldown"], "publication.drilldown", {"wave"})
    publisher = _v2_exact(
        publication["publisher"],
        "publication.publisher",
        {"publisherId", "actorId", "sourceRevision", "publicationRevision"},
    )
    _v2_id(publisher["publisherId"], "publication.publisher.publisherId")
    _v2_id(publisher["actorId"], "publication.publisher.actorId")
    _v2_revision(
        publisher["sourceRevision"], "publication.publisher.sourceRevision"
    )
    _v2_revision(
        publisher["publicationRevision"],
        "publication.publisher.publicationRevision",
    )
    _timestamp(
        publication["semanticObservedAtUnixMs"],
        name="publication.semanticObservedAtUnixMs",
    )
    lease = _v2_exact(
        publication["lease"],
        "publication.lease",
        {
            "leaseId",
            "leaseRevision",
            "ownerActorId",
            "selectionRevision",
            "issuedAtUnixMs",
            "expiresAtUnixMs",
            "durationMs",
        },
    )
    duration = _v2_integer(
        lease["durationMs"], "publication.lease.durationMs", 600_000, 900_000
    )
    issued = _timestamp(
        lease["issuedAtUnixMs"], name="publication.lease.issuedAtUnixMs"
    )
    expires = _timestamp(
        lease["expiresAtUnixMs"], name="publication.lease.expiresAtUnixMs"
    )
    if expires != issued + duration:
        raise FlowStatusError("malformed", "Stored lease relation is invalid")
    return publication


def validate_snapshot_v2(value: Any) -> dict[str, Any]:
    snapshot = _v2_exact(
        value,
        "snapshot",
        {
            "version",
            "snapshotRevision",
            "generatedAtUnixMs",
            "scope",
            "rootFlow",
            "nativeActivity",
        },
    )
    if snapshot["version"] != 2:
        raise FlowStatusError("unsupported-version", "Unsupported snapshot version")
    _v2_revision(snapshot["snapshotRevision"], "snapshot.snapshotRevision")
    _timestamp(snapshot["generatedAtUnixMs"], name="snapshot.generatedAtUnixMs")
    scope = _v2_scope(snapshot["scope"], name="snapshot.scope")
    root = _object(
        snapshot["rootFlow"],
        name="snapshot.rootFlow",
        required={"state"},
        optional={"publication", "reason"},
    )
    if root["state"] == "available":
        available = _v2_exact(
            root, "snapshot.rootFlow", {"state", "publication"}
        )
        publication = _v2_validate_publication(available["publication"])
        if publication["scope"] != scope:
            raise FlowStatusError("malformed", "Root publication scope mismatch")
    elif root["state"] == "unavailable":
        unavailable = _v2_exact(
            root, "snapshot.rootFlow", {"state", "reason"}
        )
        if unavailable["reason"] not in V2_ROOT_UNAVAILABLE:
            raise FlowStatusError("malformed", "Invalid root unavailable reason")
    else:
        raise FlowStatusError("malformed", "Invalid root state")
    native = snapshot["nativeActivity"]
    if native is not None:
        native = validate_snapshot(native)
        native_scope = native["scope"]
        if (
            native_scope["repositoryRoot"] != scope["repositoryRoot"]
            or native_scope["host"] != scope["host"]
            or native_scope["hostSessionId"] != scope["hostSessionId"]
        ):
            raise FlowStatusError("malformed", "Native activity scope mismatch")
    if _json_size(snapshot) > MAX_SNAPSHOT_BYTES:
        raise FlowStatusError("too-large", "Snapshot exceeds 64 KiB")
    return snapshot


def _v2_cache_lock(repo: Path, scope_key: str) -> Path:
    return flow_dir(repo.resolve()) / ".runtime" / "locks" / f"flow-status-{scope_key}.lock"


def _v2_acquire_lock(repo: Path, scope_key: str) -> Path:
    lock = _v2_cache_lock(repo, scope_key)
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
    except FileExistsError as exc:
        raise FlowStatusError("compare-failed", "Flow Status scope is being updated") from exc
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as stream:
        stream.write(scope_key + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    return lock


def _v2_cache_path(
    repo: Path, repository_root: str, host: str, host_session_id: str
) -> tuple[str, Path]:
    key = _scope_key(repository_root, host, host_session_id)
    return key, _cache_root(repo) / f"{key}.json"


def _v2_read_cache_entry(path: Path) -> tuple[int, dict[str, Any]]:
    try:
        stat = path.stat()
        if not path.is_file() or stat.st_size > MAX_SNAPSHOT_BYTES + 4_096:
            raise FlowStatusError("malformed", "Invalid Flow Status cache file")
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise FlowStatusError("malformed", "Corrupt Flow Status cache entry") from exc
    entry = _v2_exact(
        value,
        "cache",
        {"version", "cachedAtUnixMs", "snapshot"},
    )
    if entry["version"] != 2:
        raise FlowStatusError(
            "unsupported-version", "Version-1 cache is invalid after v2 cutover"
        )
    cached_at = _timestamp(entry["cachedAtUnixMs"], name="cache.cachedAtUnixMs")
    return cached_at, validate_snapshot_v2(entry["snapshot"])


def _v2_current_envelope(path: Path) -> tuple[int, dict[str, Any]] | None:
    if not path.is_file():
        return None
    return _v2_read_cache_entry(path)


def _v2_write_snapshot(
    repo: Path, snapshot: dict[str, Any], *, cached_at_unix_ms: int
) -> Path:
    validate_snapshot_v2(snapshot)
    scope = snapshot["scope"]
    key, target = _v2_cache_path(
        repo,
        scope["repositoryRoot"],
        scope["host"],
        scope["hostSessionId"],
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(
        target,
        {
            "version": 2,
            "cachedAtUnixMs": cached_at_unix_ms,
            "snapshot": snapshot,
        },
    )
    _v2_evict_cache(target.parent, now_ms=cached_at_unix_ms)
    if target.stem != key:
        raise FlowStatusError("io-failure", "Cache key mismatch")
    return target


def _v2_fresh_native(
    native: dict[str, Any] | None, *, now_ms: int
) -> dict[str, Any] | None:
    if native is None:
        return None
    try:
        validated = validate_snapshot(native)
    except WorkflowError:
        return None
    age = now_ms - validated["generatedAtUnixMs"]
    if age < -FUTURE_TOLERANCE_MS or age > validated["maxAgeMs"]:
        return None
    for source in validated["sources"]:
        source_age = now_ms - source["observedAtUnixMs"]
        if source_age < -FUTURE_TOLERANCE_MS or source_age > source["maxAgeMs"]:
            return None
    return validated


def _v2_live_publication(
    root_flow: dict[str, Any], *, now_ms: int
) -> dict[str, Any] | None:
    if root_flow.get("state") != "available":
        return None
    publication = root_flow.get("publication")
    try:
        publication = _v2_validate_publication(publication)
    except WorkflowError:
        return None
    if publication["lease"]["expiresAtUnixMs"] <= now_ms:
        return None
    return publication


def _v2_movement_relation(
    request: dict[str, Any], current: dict[str, Any] | None
) -> None:
    movement = request["orientation"]["movement"]
    expected = request["expectedPreviousPublicationRevision"]
    from_position = request["orientation"]["fromPosition"]
    resume = request["orientation"]["resumeFrom"]
    if movement == "initial":
        if current is not None or expected is not None or from_position is not None or resume is not None:
            raise FlowStatusError("compare-failed", "Initial publication requires empty scope")
        return
    if movement == "resume":
        if (
            current is not None
            or expected is not None
            or from_position != request["orientation"]["position"]
            or resume is None
            or resume["hostSessionId"] == request["scope"]["hostSessionId"]
            or resume["position"] != request["orientation"]["position"]
        ):
            raise FlowStatusError("invalid-relation", "Invalid resume relationship")
        return
    if current is None:
        raise FlowStatusError("not-published", "No current publication for movement")
    if expected != current["publisher"]["publicationRevision"]:
        raise FlowStatusError("compare-failed", "Publication CAS failed")
    if from_position != current["orientation"]["position"] or resume is not None:
        raise FlowStatusError("invalid-relation", "Movement source does not match current position")
    old_index = V2_POSITIONS.index(from_position)
    new_index = V2_POSITIONS.index(request["orientation"]["position"])
    if (
        (movement == "same" and old_index != new_index)
        or (movement == "forward" and old_index >= new_index)
        or (movement == "backtrack" and old_index <= new_index)
        or (movement == "reopen" and old_index < new_index)
    ):
        raise FlowStatusError("invalid-relation", "Invalid reversible Flow movement")
    if any(
        request["publisher"][key] == current["publisher"][key]
        for key in ("sourceRevision", "publicationRevision")
    ) or request["requestId"] == current["requestId"]:
        raise FlowStatusError("replay", "Publication revisions must be fresh")


def _v2_selected_task(repo: Path, host_session_id: str) -> str | None:
    from .active_task import resolve_active_task

    active = resolve_active_task(
        repo,
        {"platform": "explicit", "session_id": host_session_id},
    )
    if active.stale:
        return None
    return active.task_id


def publish_root_flow_v2(
    repo: Path,
    host: str,
    host_session_id: str,
    actor_id: str,
    request_value: dict[str, Any],
    *,
    now_ms: int | None = None,
) -> dict[str, Any]:
    current_time = _now_ms() if now_ms is None else _timestamp(now_ms, name="nowMs")
    request, digest = validate_root_flow_publish_request_v2(
        request_value,
        repo=repo,
        host=host,
        host_session_id=host_session_id,
        actor_id=actor_id,
        now_ms=current_time,
    )
    selected_task = _v2_selected_task(repo, host_session_id)
    if selected_task != request["rootTask"]["taskId"]:
        raise FlowStatusError("selection-mismatch", "Selected root task does not match publication")
    key, target = _v2_cache_path(
        repo, str(repo.resolve()), host, host_session_id
    )
    lock = _v2_acquire_lock(repo, key)
    try:
        current_entry = _v2_current_envelope(target)
        current_snapshot = None if current_entry is None else current_entry[1]
        current_publication = (
            None
            if current_snapshot is None
            else _v2_live_publication(current_snapshot["rootFlow"], now_ms=current_time)
        )
        if current_publication is not None and current_publication["requestId"] == request["requestId"]:
            if current_publication["requestDigest"] != digest:
                raise FlowStatusError("conflict", "Request ID was reused with different content")
            return _v2_command_success(
                "publish",
                "unchanged",
                request["requestId"],
                request["scope"],
                request["rootTask"]["taskId"],
                current_publication,
                current_snapshot,
                key,
            )
        _v2_movement_relation(request, current_publication)
        publication = _v2_publication_from_request(request, digest)
        native = (
            None
            if current_snapshot is None
            else _v2_fresh_native(
                current_snapshot["nativeActivity"], now_ms=current_time
            )
        )
        snapshot = {
            "version": 2,
            "snapshotRevision": _v2_snapshot_revision(),
            "generatedAtUnixMs": current_time,
            "scope": request["scope"],
            "rootFlow": {"state": "available", "publication": publication},
            "nativeActivity": native,
        }
        _v2_write_snapshot(repo, snapshot, cached_at_unix_ms=current_time)
        return _v2_command_success(
            "publish",
            "written",
            request["requestId"],
            request["scope"],
            request["rootTask"]["taskId"],
            publication,
            snapshot,
            key,
        )
    finally:
        lock.unlink(missing_ok=True)


def _v2_renew_input(
    value: Any,
    *,
    repo: Path,
    host: str,
    host_session_id: str,
    actor_id: str,
    now_ms: int,
) -> dict[str, Any]:
    request = _v2_exact(
        value,
        "renew",
        {
            "version",
            "capability",
            "requestId",
            "scope",
            "rootTaskId",
            "expectedSelectionRevision",
            "publisherActorId",
            "expectedPublicationRevision",
            "expectedSourceRevision",
            "expectedLeaseId",
            "expectedLeaseRevision",
            "renewedLeaseRevision",
            "renewedAtUnixMs",
            "durationMs",
            "semanticAssertion",
        },
    )
    if request["version"] != 2:
        raise FlowStatusError("unsupported-version", "Unsupported renew version")
    if request["capability"] != "rootFlowLeaseRenewV2":
        raise FlowStatusError("malformed", "Invalid renew capability")
    scope = _v2_scope(request["scope"])
    if scope["repositoryRoot"] != str(repo.resolve()):
        raise FlowStatusError("repository-mismatch", "Repository scope mismatch")
    if scope["host"] != host:
        raise FlowStatusError("host-mismatch", "Host scope mismatch")
    if scope["hostSessionId"] != host_session_id:
        raise FlowStatusError("session-mismatch", "Session scope mismatch")
    if request["publisherActorId"] != actor_id:
        raise FlowStatusError("actor-mismatch", "Publisher actor mismatch")
    if request["semanticAssertion"] != "unchanged":
        raise FlowStatusError("invalid-relation", "Renew must assert unchanged semantics")
    renewed_at = _timestamp(request["renewedAtUnixMs"], name="renew.renewedAtUnixMs")
    if renewed_at > now_ms + 30_000:
        raise FlowStatusError("future", "Renewal is too far in the future")
    duration = _v2_integer(request["durationMs"], "renew.durationMs", 600_000, 900_000)
    return {
        **request,
        "requestId": _v2_revision(request["requestId"], "renew.requestId"),
        "scope": scope,
        "rootTaskId": _v2_id(request["rootTaskId"], "renew.rootTaskId"),
        "expectedSelectionRevision": _v2_revision(
            request["expectedSelectionRevision"],
            "renew.expectedSelectionRevision",
        ),
        "publisherActorId": _v2_id(
            request["publisherActorId"], "renew.publisherActorId"
        ),
        "expectedPublicationRevision": _v2_revision(
            request["expectedPublicationRevision"],
            "renew.expectedPublicationRevision",
        ),
        "expectedSourceRevision": _v2_revision(
            request["expectedSourceRevision"], "renew.expectedSourceRevision"
        ),
        "expectedLeaseId": _v2_revision(
            request["expectedLeaseId"], "renew.expectedLeaseId"
        ),
        "expectedLeaseRevision": _v2_revision(
            request["expectedLeaseRevision"], "renew.expectedLeaseRevision"
        ),
        "renewedLeaseRevision": _v2_revision(
            request["renewedLeaseRevision"], "renew.renewedLeaseRevision"
        ),
        "renewedAtUnixMs": renewed_at,
        "durationMs": duration,
    }


def renew_root_flow_v2(
    repo: Path,
    host: str,
    host_session_id: str,
    actor_id: str,
    request_value: dict[str, Any],
    *,
    now_ms: int | None = None,
) -> dict[str, Any]:
    current_time = _now_ms() if now_ms is None else _timestamp(now_ms, name="nowMs")
    request = _v2_renew_input(
        request_value,
        repo=repo,
        host=host,
        host_session_id=host_session_id,
        actor_id=actor_id,
        now_ms=current_time,
    )
    key, target = _v2_cache_path(
        repo, request["scope"]["repositoryRoot"], host, host_session_id
    )
    lock = _v2_acquire_lock(repo, key)
    try:
        current_entry = _v2_current_envelope(target)
        if current_entry is None:
            raise FlowStatusError("not-published", "No publication to renew")
        snapshot = current_entry[1]
        publication = _v2_live_publication(snapshot["rootFlow"], now_ms=current_time)
        if publication is None:
            raise FlowStatusError("expired", "Publication lease is absent or expired")
        lease = publication["lease"]
        if (
            request["rootTaskId"] != publication["rootTask"]["taskId"]
            or request["expectedSelectionRevision"]
            != publication["rootTask"]["selectionRevision"]
            or request["publisherActorId"] != publication["publisher"]["actorId"]
            or request["expectedPublicationRevision"]
            != publication["publisher"]["publicationRevision"]
            or request["expectedSourceRevision"]
            != publication["publisher"]["sourceRevision"]
            or request["expectedLeaseId"] != lease["leaseId"]
        ):
            raise FlowStatusError("compare-failed", "Renewal CAS failed")
        if request["renewedLeaseRevision"] == lease["leaseRevision"]:
            if snapshot["snapshotRevision"] == _v2_renew_snapshot_revision(request):
                return _v2_command_success(
                    "renew",
                    "unchanged",
                    request["requestId"],
                    request["scope"],
                    request["rootTaskId"],
                    publication,
                    snapshot,
                    key,
                )
            raise FlowStatusError("replay", "Renewed lease revision was reused")
        if request["expectedLeaseRevision"] != lease["leaseRevision"]:
            raise FlowStatusError("compare-failed", "Lease revision CAS failed")
        publication = json.loads(json.dumps(publication, ensure_ascii=False))
        publication["lease"] = {
            **lease,
            "leaseRevision": request["renewedLeaseRevision"],
            "issuedAtUnixMs": request["renewedAtUnixMs"],
            "expiresAtUnixMs": request["renewedAtUnixMs"] + request["durationMs"],
            "durationMs": request["durationMs"],
        }
        next_snapshot = {
            **snapshot,
            "snapshotRevision": _v2_renew_snapshot_revision(request),
            "generatedAtUnixMs": current_time,
            "rootFlow": {"state": "available", "publication": publication},
            "nativeActivity": _v2_fresh_native(
                snapshot["nativeActivity"], now_ms=current_time
            ),
        }
        _v2_write_snapshot(repo, next_snapshot, cached_at_unix_ms=current_time)
        return _v2_command_success(
            "renew",
            "written",
            request["requestId"],
            request["scope"],
            request["rootTaskId"],
            publication,
            next_snapshot,
            key,
        )
    finally:
        lock.unlink(missing_ok=True)


def _v2_clear_input(
    value: Any,
    *,
    repo: Path,
    host: str,
    host_session_id: str,
    actor_id: str,
    now_ms: int,
) -> dict[str, Any]:
    request = _v2_exact(
        value,
        "clear",
        {
            "version",
            "capability",
            "requestId",
            "scope",
            "rootTaskId",
            "publisherActorId",
            "expectedPublicationRevision",
            "expectedLeaseId",
            "selectionRevision",
            "reason",
            "clearedAtUnixMs",
        },
    )
    if request["version"] != 2:
        raise FlowStatusError("unsupported-version", "Unsupported clear version")
    if request["capability"] != "rootFlowClearV2":
        raise FlowStatusError("malformed", "Invalid clear capability")
    scope = _v2_scope(request["scope"])
    if scope["repositoryRoot"] != str(repo.resolve()):
        raise FlowStatusError("repository-mismatch", "Repository scope mismatch")
    if scope["host"] != host:
        raise FlowStatusError("host-mismatch", "Host scope mismatch")
    if scope["hostSessionId"] != host_session_id:
        raise FlowStatusError("session-mismatch", "Session scope mismatch")
    if request["publisherActorId"] != actor_id:
        raise FlowStatusError("actor-mismatch", "Publisher actor mismatch")
    if request["reason"] not in V2_CLEAR_REASON:
        raise FlowStatusError("invalid-relation", "Invalid clear reason")
    cleared_at = _timestamp(request["clearedAtUnixMs"], name="clear.clearedAtUnixMs")
    if cleared_at > now_ms + 30_000:
        raise FlowStatusError("future", "Clear is too far in the future")
    return {
        **request,
        "requestId": _v2_revision(request["requestId"], "clear.requestId"),
        "scope": scope,
        "rootTaskId": _v2_id(request["rootTaskId"], "clear.rootTaskId"),
        "publisherActorId": _v2_id(
            request["publisherActorId"], "clear.publisherActorId"
        ),
        "expectedPublicationRevision": (
            None
            if request["expectedPublicationRevision"] is None
            else _v2_revision(
                request["expectedPublicationRevision"],
                "clear.expectedPublicationRevision",
            )
        ),
        "expectedLeaseId": (
            None
            if request["expectedLeaseId"] is None
            else _v2_revision(request["expectedLeaseId"], "clear.expectedLeaseId")
        ),
        "selectionRevision": _v2_revision(
            request["selectionRevision"], "clear.selectionRevision"
        ),
        "clearedAtUnixMs": cleared_at,
    }


def clear_root_flow_v2(
    repo: Path,
    host: str,
    host_session_id: str,
    actor_id: str,
    request_value: dict[str, Any],
    *,
    now_ms: int | None = None,
) -> dict[str, Any]:
    current_time = _now_ms() if now_ms is None else _timestamp(now_ms, name="nowMs")
    request = _v2_clear_input(
        request_value,
        repo=repo,
        host=host,
        host_session_id=host_session_id,
        actor_id=actor_id,
        now_ms=current_time,
    )
    key, target = _v2_cache_path(
        repo, request["scope"]["repositoryRoot"], host, host_session_id
    )
    lock = _v2_acquire_lock(repo, key)
    try:
        current_entry = _v2_current_envelope(target)
        if current_entry is None:
            return _v2_command_success(
                "clear",
                "already-clear",
                request["requestId"],
                request["scope"],
                request["rootTaskId"],
                None,
                None,
                None,
            )
        snapshot = current_entry[1]
        publication = (
            snapshot["rootFlow"].get("publication")
            if snapshot["rootFlow"]["state"] == "available"
            else None
        )
        if publication is None:
            return _v2_command_success(
                "clear",
                "already-clear",
                request["requestId"],
                request["scope"],
                request["rootTaskId"],
                None,
                snapshot,
                key,
            )
        if (
            request["rootTaskId"] != publication["rootTask"]["taskId"]
            or request["publisherActorId"] != publication["publisher"]["actorId"]
            or request["selectionRevision"]
            != publication["rootTask"]["selectionRevision"]
            or request["expectedPublicationRevision"]
            != publication["publisher"]["publicationRevision"]
            or request["expectedLeaseId"] != publication["lease"]["leaseId"]
        ):
            raise FlowStatusError("compare-failed", "Clear CAS failed")
        next_snapshot = {
            **snapshot,
            "snapshotRevision": _v2_snapshot_revision(),
            "generatedAtUnixMs": current_time,
            "rootFlow": _v2_unavailable(V2_CLEAR_REASON[request["reason"]]),
            "nativeActivity": _v2_fresh_native(
                snapshot["nativeActivity"], now_ms=current_time
            ),
        }
        _v2_write_snapshot(repo, next_snapshot, cached_at_unix_ms=current_time)
        return _v2_command_success(
            "clear",
            "cleared",
            request["requestId"],
            request["scope"],
            request["rootTaskId"],
            None,
            next_snapshot,
            key,
        )
    finally:
        lock.unlink(missing_ok=True)


def _v2_command_success(
    command: str,
    state: str,
    request_id: str,
    scope: dict[str, Any],
    root_task_id: str,
    publication: dict[str, Any] | None,
    snapshot: dict[str, Any] | None,
    cache_key: str | None,
) -> dict[str, Any]:
    return {
        "version": 2,
        "command": command,
        "state": state,
        "requestId": request_id,
        "scope": scope,
        "rootTaskId": root_task_id,
        "publicationRevision": (
            None if publication is None else publication["publisher"]["publicationRevision"]
        ),
        "sourceRevision": (
            None if publication is None else publication["publisher"]["sourceRevision"]
        ),
        "leaseId": None if publication is None else publication["lease"]["leaseId"],
        "leaseRevision": (
            None if publication is None else publication["lease"]["leaseRevision"]
        ),
        "snapshotRevision": (
            None if snapshot is None else snapshot["snapshotRevision"]
        ),
        "cacheKey": cache_key,
    }


def flow_status_command_failure_v2(
    command: str, exc: BaseException, request_id: str | None = None
) -> dict[str, Any]:
    code = (
        exc.code
        if isinstance(exc, FlowStatusError)
        else "malformed"
        if isinstance(exc, (WorkflowError, ValueError, json.JSONDecodeError))
        else "io-failure"
    )
    if code not in {
        "malformed",
        "too-large",
        "unsupported-version",
        "invalid-relation",
        "repository-mismatch",
        "selection-mismatch",
        "host-mismatch",
        "session-mismatch",
        "actor-mismatch",
        "stale",
        "expired",
        "future",
        "compare-failed",
        "replay",
        "conflict",
        "not-published",
        "io-failure",
    }:
        code = "malformed"
    return {
        "version": 2,
        "command": command,
        "state": "error",
        "requestId": request_id,
        "code": code,
        "retryable": code in {"compare-failed", "conflict", "io-failure"},
    }


def write_cached_snapshot(
    repo: Path,
    snapshot: dict[str, Any],
    *,
    cached_at_unix_ms: int | None = None,
) -> Path:
    """Compatibility-free v2 writer used by tests and the v2 assembler.

    A v1 native snapshot is accepted as live source material and immediately wrapped in the
    sole v2 envelope; no version-1 cache envelope is written.
    """

    current_time = _now_ms() if cached_at_unix_ms is None else _timestamp(
        cached_at_unix_ms, name="cachedAtUnixMs"
    )
    if snapshot.get("version") == 1:
        native = validate_snapshot(snapshot)
        scope = {
            "repositoryRoot": native["scope"]["repositoryRoot"],
            "host": native["scope"]["host"],
            "hostSessionId": native["scope"]["hostSessionId"],
        }
        if scope["hostSessionId"] is None:
            raise FlowStatusError(
                "scope-mismatch", "v2 cache requires an exact host session"
            )
        wrapped = {
            "version": 2,
            "snapshotRevision": _v2_snapshot_revision(),
            "generatedAtUnixMs": current_time,
            "scope": scope,
            "rootFlow": _v2_unavailable("missing"),
            "nativeActivity": native,
        }
        return _v2_write_snapshot(repo, wrapped, cached_at_unix_ms=current_time)
    return _v2_write_snapshot(repo, snapshot, cached_at_unix_ms=current_time)


def observe_and_cache(
    repo: Path,
    host: str,
    host_session_id: str,
    request: dict[str, Any],
) -> dict[str, Any]:
    if _json_size(request) > MAX_OBSERVATION_BYTES:
        raise FlowStatusError("too-large", "Flow Status observation exceeds 256 KiB")
    document = _object(
        request,
        name="observation",
        required={"version", "taskSet", "assignment", "progress", "attention"},
    )
    if document["version"] != 1:
        raise FlowStatusError("unsupported-version", "Unsupported observation version")
    session_id = _v2_id(host_session_id, "host session")
    try:
        native = build_snapshot(
            host,
            document["taskSet"],
            assignment=document["assignment"],
            progress=document["progress"],
            attention=document["attention"],
        )
    except WorkflowError as exc:
        raise FlowStatusError("malformed", str(exc)) from exc
    if native["scope"]["hostSessionId"] != session_id:
        raise FlowStatusError(
            "scope-mismatch", "Observation host session does not match --session"
        )
    scope = {
        "repositoryRoot": str(repo.resolve()),
        "host": host,
        "hostSessionId": session_id,
    }
    key, target = _v2_cache_path(repo, scope["repositoryRoot"], host, session_id)
    lock = _v2_acquire_lock(repo, key)
    current_time = _now_ms()
    try:
        current = _v2_current_envelope(target)
        current_snapshot = None if current is None else current[1]
        root_flow = (
            _v2_unavailable("missing")
            if current_snapshot is None
            else current_snapshot["rootFlow"]
        )
        if (
            root_flow["state"] == "available"
            and _v2_live_publication(root_flow, now_ms=current_time) is None
        ):
            root_flow = _v2_unavailable("expired")
        snapshot = {
            "version": 2,
            "snapshotRevision": _v2_snapshot_revision(),
            "generatedAtUnixMs": current_time,
            "scope": scope,
            "rootFlow": root_flow,
            "nativeActivity": native,
        }
        cache_path = _v2_write_snapshot(
            repo, snapshot, cached_at_unix_ms=current_time
        )
    finally:
        lock.unlink(missing_ok=True)
    return {
        "version": 2,
        "state": "stored",
        "scope": scope,
        "cacheKey": cache_path.stem,
        "snapshot": snapshot,
    }


def _v2_evict_cache(root: Path, *, now_ms: int) -> None:
    entries: list[tuple[int, Path]] = []
    for path in sorted(root.glob("*.json")):
        try:
            cached_at, _ = _v2_read_cache_entry(path)
        except WorkflowError:
            path.unlink(missing_ok=True)
            continue
        if now_ms - cached_at > MAX_CACHE_AGE_MS or cached_at > now_ms + FUTURE_TOLERANCE_MS:
            path.unlink(missing_ok=True)
            continue
        entries.append((cached_at, path))
    for _, path in sorted(entries, key=lambda item: (item[0], item[1].name))[
        : max(0, len(entries) - MAX_CACHE_ENTRIES)
    ]:
        path.unlink(missing_ok=True)


def inspect_cached_snapshot(
    repo: Path,
    *,
    host: str | None = None,
    host_session_id: str | None = None,
    now_ms: int | None = None,
) -> dict[str, Any]:
    canonical_repo = str(repo.resolve())
    if host is not None and host not in HOSTS:
        raise FlowStatusError("host-mismatch", "Unsupported host")
    current_time = _now_ms() if now_ms is None else _timestamp(now_ms, name="nowMs")
    root = _cache_root(repo)
    if not root.is_dir():
        raise FlowStatusError("missing", "Flow Status is unavailable")
    paths = list(itertools.islice(root.glob("*.json"), MAX_CACHE_ENTRIES + 1))
    if len(paths) > MAX_CACHE_ENTRIES:
        raise FlowStatusError("malformed", "Flow Status cache exceeds eight scopes")
    matches: list[dict[str, Any]] = []
    corrupt = 0
    for cache_path in sorted(paths):
        try:
            cached_at, snapshot = _v2_read_cache_entry(cache_path)
        except WorkflowError:
            corrupt += 1
            continue
        scope = snapshot["scope"]
        if scope["repositoryRoot"] != canonical_repo:
            continue
        if host is not None and scope["host"] != host:
            continue
        if host_session_id is not None and scope["hostSessionId"] != host_session_id:
            continue
        if current_time - cached_at > MAX_CACHE_AGE_MS:
            continue
        matches.append(snapshot)
    if not matches:
        raise FlowStatusError(
            "malformed" if corrupt else "scope-mismatch",
            "No valid Flow Status scope matches",
        )
    if len(matches) != 1:
        raise FlowStatusError(
            "conflict", "Flow Status scope is ambiguous; specify host and session"
        )
    snapshot = json.loads(json.dumps(matches[0], ensure_ascii=False))
    degraded: list[str] = []
    root_flow = snapshot["rootFlow"]
    if root_flow["state"] == "available":
        publication = root_flow["publication"]
        if publication["lease"]["expiresAtUnixMs"] <= current_time:
            snapshot["rootFlow"] = _v2_unavailable("expired")
            degraded.append("root-flow:expired")
    native = _v2_fresh_native(snapshot["nativeActivity"], now_ms=current_time)
    if snapshot["nativeActivity"] is not None and native is None:
        degraded.append("native-activity:stale")
    snapshot["nativeActivity"] = native
    root_available = snapshot["rootFlow"]["state"] == "available"
    return {
        "version": 2,
        "state": "available" if root_available else "unavailable",
        "freshness": "fresh" if root_available else "unavailable",
        "ageMs": max(0, current_time - snapshot["generatedAtUnixMs"]),
        "reason": None if root_available else snapshot["rootFlow"]["reason"],
        "degraded": degraded,
        "snapshot": snapshot,
    }


def format_inspection(value: dict[str, Any]) -> str:
    snapshot = value["snapshot"]
    scope = snapshot["scope"]
    lines = [
        f"Flow Status: {value['state']} ({value['freshness']})",
        f"Scope: {scope['host']} · {scope['repositoryRoot']}",
        f"Session: {scope['hostSessionId']}",
    ]
    root = snapshot["rootFlow"]
    if root["state"] == "available":
        publication = root["publication"]
        task = publication["rootTask"]
        title = f" · {task['title']}" if task["title"] is not None else ""
        lines.append(f"Root Task: {task['taskId']}{title}")
        detail = publication["orientation"]["detail"]
        position = publication["orientation"]["position"]
        lines.append(
            f"Flow: {V2_POSITIONS.index(position) + 1}/9 · {position} · "
            f"{publication['orientation']['movement']}"
        )
        measure = publication["orientation"]["measure"]
        if measure is not None:
            lines.append(
                f"Measure: {measure['label']} {measure['current']}/{measure['total']} "
                f"{measure['unit']}"
            )
        if position == "execute":
            lines.append(
                f"Accepted Work: {detail['acceptedWork']}/{detail['workTotal']}"
            )
            if detail["currentWork"] is not None:
                current = detail["currentWork"]
                lines.append(
                    f"Current Work: {current['title'] or current['workId']} · "
                    f"{current['focus']} · review {current['reviewRound']} · "
                    f"rework {current['reworkRound']}"
                )
        wave = publication["drilldown"]["wave"]
        if wave is not None:
            lines.append(
                f"Wave: {wave['waveId']} · {wave['ordinal']}/{wave['total']} · "
                f"{wave['workSetRevision']}"
            )
    else:
        lines.append(f"Root Task: unavailable ({root['reason']})")
    native = snapshot["nativeActivity"]
    if native is None:
        lines.append("Native activity: unavailable")
    else:
        task_set = native["taskSet"]
        if task_set["state"] == "available":
            lines.append(
                f"Native activity: {task_set['completed']}/{task_set['total']} complete · "
                f"{task_set['active']} active · {task_set['failed']} failed"
            )
        else:
            lines.append(f"Native activity: unavailable ({task_set['reason']})")
    return "\n".join(lines)


def inspection_error_response(exc: BaseException) -> dict[str, Any]:
    code = exc.code if isinstance(exc, FlowStatusError) else "malformed"
    return {
        "version": 2,
        "state": "unavailable",
        "freshness": "unknown",
        "ageMs": None,
        "reason": code,
        "degraded": [],
        "snapshot": None,
        "error": {"code": code},
    }
