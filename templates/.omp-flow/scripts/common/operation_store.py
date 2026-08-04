from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .io import WorkflowError, atomic_write_json, confined_path, read_json
from .paths import flow_dir, task_dir


TERMINAL_STATES = {"completed", "failed"}
INDEPENDENT_ROLES = {"reviewer", "check", "qbd-auditor"}
REVIEW_ROLES = {"reviewer", "check"}


def _operations_dir(repo: Path) -> Path:
    return flow_dir(repo) / ".runtime" / "operations"


def _operation_path(repo: Path, operation_id: str) -> Path:
    if not operation_id or not operation_id.isalnum():
        raise WorkflowError(f"Invalid operation id: {operation_id}")
    return _operations_dir(repo) / f"{operation_id}.json"


def _operation_lock(repo: Path, operation_id: str) -> Path:
    return flow_dir(repo) / ".runtime" / "locks" / f"operation-{operation_id}.lock"


def _acquire_operation_lock(repo: Path, operation_id: str) -> Path:
    path = _operation_lock(repo, operation_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
    except FileExistsError as exc:
        raise WorkflowError(f"Operation is already being updated: {operation_id}") from exc
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as stream:
        stream.write(operation_id + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    return path


def _claim_receipt(repo: Path, operation_id: str, receipt: str) -> None:
    claims = flow_dir(repo) / ".runtime" / "receipts"
    claims.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(receipt.encode("utf-8")).hexdigest()
    path = claims / f"{digest}.json"
    claim = {
        "operation_id": operation_id,
        "receipt": receipt,
        "claimed_at": datetime.now(timezone.utc).isoformat(),
    }
    payload = (json.dumps(claim, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
    except FileExistsError as exc:
        existing = read_json(path, required=False)
        if existing.get("operation_id") == operation_id:
            return
        raise WorkflowError("External action receipt is already claimed") from exc
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        # Keep an incomplete claim fail-closed: the external action may already
        # have happened, so automatically releasing it could permit duplication.
        raise


def create_operation(
    repo: Path,
    task_id: str,
    *,
    entry_path: str,
    role: str,
    actor_id: str,
    output_path: str,
    predecessor: str | None = None,
    require_external_receipt: bool = False,
) -> dict[str, Any]:
    root = task_dir(repo, task_id)
    entry = confined_path(root, entry_path)
    if not entry.is_file():
        raise WorkflowError(f"Required entry Concept not found: {entry_path}")
    if not output_path.strip():
        raise WorkflowError("Operation output boundary is required")
    output = confined_path(repo, output_path)
    cleaned_role = role.strip().lower()
    cleaned_actor = actor_id.strip()
    if not cleaned_role or not cleaned_actor:
        raise WorkflowError("Operation role and actor identity are required")

    if cleaned_role in REVIEW_ROLES and not predecessor:
        raise WorkflowError("Independent review requires a completed predecessor operation")

    if predecessor:
        previous = read_operation(repo, predecessor)
        if previous.get("task_id") != task_id:
            raise WorkflowError("Predecessor operation belongs to another task")
        if previous.get("state") != "completed":
            raise WorkflowError("Predecessor operation is not completed")
        if cleaned_role in INDEPENDENT_ROLES and previous.get("actor_id") == cleaned_actor:
            raise WorkflowError("Independent review actor must differ from predecessor actor")

    now = datetime.now(timezone.utc).isoformat()
    operation = {
        "id": uuid4().hex,
        "task_id": task_id,
        "entry_path": entry.relative_to(root.resolve()).as_posix(),
        "output_path": output.relative_to(repo.resolve()).as_posix(),
        "role": cleaned_role,
        "actor_id": cleaned_actor,
        "state": "active",
        "predecessor": predecessor,
        "requires_external_receipt": bool(require_external_receipt),
        "external_receipt": None,
        "created_at": now,
        "updated_at": now,
    }
    atomic_write_json(_operation_path(repo, operation["id"]), operation)
    return operation


def read_operation(repo: Path, operation_id: str) -> dict[str, Any]:
    value = read_json(_operation_path(repo, operation_id))
    if value.get("id") != operation_id:
        raise WorkflowError(f"Operation identity mismatch: {operation_id}")
    return value


def has_active_operations(repo: Path, task_id: str) -> bool:
    root = _operations_dir(repo)
    if not root.is_dir():
        return False
    for path in root.glob("*.json"):
        operation = read_json(path, required=False)
        if operation.get("task_id") == task_id and operation.get("state") == "active":
            return True
    return False


def list_operations(repo: Path, task_id: str | None = None) -> list[dict[str, Any]]:
    root = _operations_dir(repo)
    if not root.is_dir():
        return []
    operations = []
    for path in sorted(root.glob("*.json")):
        operation = read_operation(repo, path.stem)
        if task_id is None or operation.get("task_id") == task_id:
            operations.append(operation)
    return operations


def finish_operation(
    repo: Path,
    operation_id: str,
    *,
    state: str,
    actor_id: str,
    external_receipt: str | None = None,
) -> dict[str, Any]:
    if state not in TERMINAL_STATES:
        raise WorkflowError(f"Invalid terminal operation state: {state}")
    cleaned_actor = actor_id.strip()
    if not cleaned_actor:
        raise WorkflowError("Operation actor identity is required")

    lock = _acquire_operation_lock(repo, operation_id)
    try:
        operation = read_operation(repo, operation_id)
        if operation.get("state") != "active":
            raise WorkflowError(f"Operation is already terminal: {operation_id}")
        if operation.get("actor_id") != cleaned_actor:
            raise WorkflowError("Operation actor identity mismatch")

        receipt = external_receipt.strip() if external_receipt else None
        if state == "completed" and operation.get("requires_external_receipt") and not receipt:
            raise WorkflowError("Operation completion requires an external action receipt")
        if receipt:
            _claim_receipt(repo, operation_id, receipt)

        operation["state"] = state
        operation["external_receipt"] = receipt
        operation["updated_at"] = datetime.now(timezone.utc).isoformat()
        atomic_write_json(_operation_path(repo, operation_id), operation)
        return operation
    finally:
        lock.unlink(missing_ok=True)
