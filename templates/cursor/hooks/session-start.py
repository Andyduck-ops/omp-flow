#!/usr/bin/env python3
"""Bridge Cursor conversation identity into omp-flow's explicit context."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
from typing import NoReturn


EVENT = "sessionStart"
MARKER = "<!-- omp-flow-runtime-orientation:v1 -->"
BOUNDARY = (
    "Task meaning lives in the linked Bundle; do not infer Task, Flow, approval, "
    "verdict, or progress from this mechanical orientation."
)
MAX_STATUS_CHARS = 850


class BridgeUnavailable(Exception):
    """Expected, sanitized Cursor session-bridge failure."""


def _read_payload() -> dict[str, object]:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeError, OSError) as exc:
        raise BridgeUnavailable("invalid hook input") from exc
    if not isinstance(payload, dict):
        raise BridgeUnavailable("invalid hook input")
    return payload


def _required_text(payload: dict[str, object], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str) or not value.strip():
        raise BridgeUnavailable(f"missing {name}")
    return value.strip()


def _conversation_id(payload: dict[str, object]) -> str:
    conversation_id = _required_text(payload, "conversation_id")
    if "session_id" in payload:
        session_id = payload.get("session_id")
        if (
            not isinstance(session_id, str)
            or not session_id.strip()
            or session_id.strip() != conversation_id
        ):
            raise BridgeUnavailable("conflicting session_id")
    return conversation_id


def _repository_root(payload: dict[str, object]) -> Path:
    roots = payload.get("workspace_roots")
    if not isinstance(roots, list) or not roots:
        raise BridgeUnavailable("missing workspace_roots")
    candidates: list[Path] = []
    for value in roots:
        if not isinstance(value, str) or not value.strip():
            raise BridgeUnavailable("invalid workspace_roots")
        try:
            candidate = Path(value).resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            raise BridgeUnavailable("invalid workspace_roots") from exc
        if not candidate.is_dir():
            raise BridgeUnavailable("invalid workspace_roots")
        candidates.append(candidate)

    try:
        cwd = Path.cwd().resolve(strict=True)
        result = subprocess.run(
            ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
            capture_output=True,
            check=False,
            timeout=5,
        )
        if result.returncode != 0:
            raise OSError("git root lookup failed")
        root_text = result.stdout.decode("utf-8", errors="strict").strip()
        root = Path(root_text).resolve(strict=True)
    except (OSError, subprocess.SubprocessError, UnicodeError) as exc:
        raise BridgeUnavailable("repository root unavailable") from exc
    if root not in candidates:
        raise BridgeUnavailable("workspace identity mismatch")
    return root


def _runtime_command(root: Path, arguments: list[str], conversation_id: str) -> str:
    runtime = root / ".omp-flow" / "scripts" / "omp_flow.py"
    if not runtime.is_file():
        raise BridgeUnavailable("omp-flow runtime unavailable")
    environment = os.environ.copy()
    environment["OMP_FLOW_CONTEXT_ID"] = conversation_id
    environment["OMP_FLOW_HOST"] = "cursor"
    try:
        result = subprocess.run(
            [sys.executable, "-X", "utf8", str(runtime), "--cwd", str(root), *arguments],
            cwd=str(root),
            env=environment,
            capture_output=True,
            check=False,
            timeout=10,
        )
        stdout = result.stdout.decode("utf-8", errors="strict").strip()
    except (OSError, subprocess.SubprocessError, UnicodeError) as exc:
        raise BridgeUnavailable("runtime status unavailable") from exc
    if result.returncode != 0 or not stdout:
        raise BridgeUnavailable("runtime command unavailable")
    return stdout


def _task_index(root: Path, conversation_id: str) -> tuple[str | None, str | None]:
    try:
        status_text = _runtime_command(
            root,
            ["status", "inspect", "--host", "cursor", "--session", conversation_id, "--json"],
            conversation_id,
        )
        status = json.loads(status_text)
        if not isinstance(status, dict) or status.get("state") != "available":
            return None, "no validated active Task"
        snapshot = status.get("snapshot")
        if not isinstance(snapshot, dict):
            return None, "runtime status had no validated snapshot"
        scope = snapshot.get("scope")
        if not isinstance(scope, dict) or scope.get("repositoryRoot") != str(root):
            return None, "runtime status workspace mismatch"
        root_flow = snapshot.get("rootFlow")
        publication = root_flow.get("publication") if isinstance(root_flow, dict) else None
        root_task = publication.get("rootTask") if isinstance(publication, dict) else None
        task_id = root_task.get("taskId") if isinstance(root_task, dict) else None
        if not isinstance(task_id, str) or not task_id.strip() or len(task_id) > 240:
            return None, "no validated active Task"
        task_text = _runtime_command(
            root,
            ["task", "show", task_id, "--workspace", str(root)],
            conversation_id,
        )
        task = json.loads(task_text)
        if not isinstance(task, dict) or task.get("taskId") != task_id:
            return None, "task show returned an invalid Task"
        index = task.get("index")
        if (
            not isinstance(index, str)
            or not index.strip()
            or len(index) > 240
            or Path(index).is_absolute()
            or any(ord(char) < 0x20 for char in index)
        ):
            return None, "task show returned an invalid Bundle index"
        return index, None
    except (BridgeUnavailable, json.JSONDecodeError, UnicodeError, OSError, ValueError):
        return None, "Task index unavailable; run task show with an explicit Task/workspace"


def _orientation(root: Path, conversation_id: str) -> str:
    task_index, reason = _task_index(root, conversation_id)
    lines = [
        MARKER,
        "Wiki index: .omp-flow/wiki/index.md",
        "Workflow index: .omp-flow/workflow/index.md",
    ]
    if task_index is not None:
        lines.append(f"Task index: {task_index}")
    else:
        lines.append(f"Task index: unavailable ({reason or 'no validated active Task'})")
        lines.append("Use task show with an explicit Task/workspace; do not infer a Task or path.")
    lines.append(BOUNDARY)
    return "\n".join(lines)


def _emit(value: dict[str, object]) -> NoReturn:
    sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    raise SystemExit(0)


def main() -> NoReturn:
    try:
        payload = _read_payload()
        if payload.get("hook_event_name") != EVENT:
            raise BridgeUnavailable("unexpected hook event")
        conversation_id = _conversation_id(payload)
        root = _repository_root(payload)
        environment = {
            "OMP_FLOW_CONTEXT_ID": conversation_id,
            "OMP_FLOW_HOST": "cursor",
        }
        try:
            context = _orientation(root, conversation_id)
        except BridgeUnavailable as exc:
            context = f"{MARKER}\nomp-flow orientation unavailable: {exc}.\n{BOUNDARY}"
        _emit({"env": environment, "additional_context": context})
    except BridgeUnavailable as exc:
        _emit(
            {
                "additional_context": (
                    f"omp-flow Cursor session bridge unavailable: {exc}. No task was selected; "
                    "use an explicit supported session context."
                )
            }
        )
    except Exception:
        _emit(
            {
                "additional_context": (
                    "omp-flow Cursor session bridge unavailable: unexpected handler failure. "
                    "No task was selected; use an explicit supported session context."
                )
            }
        )


if __name__ == "__main__":
    main()
