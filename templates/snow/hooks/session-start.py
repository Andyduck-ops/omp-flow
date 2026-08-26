#!/usr/bin/env python3
"""Return bounded mechanical omp-flow orientation for Snow onSessionStart."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
from typing import NoReturn


MARKER = "<!-- omp-flow-runtime-orientation:v1 -->"
BOUNDARY = (
    "Task meaning lives in the linked Bundle; do not infer Task, Flow, approval, "
    "verdict, or progress from this runtime orientation."
)
MAX_STATUS_CHARS = 850
MAX_INDEX_CHARS = 512
FOREIGN_CONTEXT_ENV_KEYS = (
    "CODEX_THREAD_ID",
    "CODEX_SESSION_ID",
    "OMP_SESSION_ID",
    "PI_SESSION_ID",
)


class OrientationUnavailable(Exception):
    """Expected, sanitized orientation failure."""


def _contains(parent: Path, child: Path) -> bool:
    parent_text = os.path.normcase(str(parent))
    child_text = os.path.normcase(str(child))
    try:
        return os.path.commonpath([parent_text, child_text]) == parent_text
    except ValueError:
        return False


def _read_payload() -> dict[str, object]:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeError, OSError) as exc:
        raise OrientationUnavailable("invalid hook input") from exc
    if not isinstance(payload, dict):
        raise OrientationUnavailable("invalid hook input")
    return payload


def _required_text(payload: dict[str, object], *names: str) -> str:
    values = [payload.get(name) for name in names]
    present = [value.strip() for value in values if isinstance(value, str) and value.strip()]
    if not present:
        raise OrientationUnavailable(f"missing {names[0]}")
    if any(value != present[0] for value in present[1:]):
        raise OrientationUnavailable(f"conflicting {names[0]}")
    return present[0]


def _repository_root(cwd_text: str) -> Path:
    try:
        cwd = Path(cwd_text).resolve(strict=True)
        if not cwd.is_dir():
            raise OSError("cwd is not a directory")
        result = subprocess.run(
            ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
            capture_output=True,
            check=False,
            timeout=5,
        )
        if result.returncode != 0:
            raise OSError("git root lookup failed")
        root_text = result.stdout.decode("utf-8", errors="strict").strip()
        if not root_text:
            raise OSError("git returned an empty root")
        root = Path(root_text).resolve(strict=True)
    except (OSError, subprocess.SubprocessError, UnicodeError) as exc:
        raise OrientationUnavailable("repository root unavailable") from exc
    if not root.is_dir() or not _contains(root, cwd):
        raise OrientationUnavailable("repository root unavailable")
    return root


def _runtime_command(root: Path, arguments: list[str], session_id: str) -> str:
    runtime = root / ".omp-flow" / "scripts" / "omp_flow.py"
    if not runtime.is_file():
        raise OrientationUnavailable("omp-flow runtime unavailable")
    environment = os.environ.copy()
    environment["SNOW_SESSION_ID"] = session_id
    environment.pop("OMP_FLOW_CONTEXT_ID", None)
    for name in FOREIGN_CONTEXT_ENV_KEYS:
        environment.pop(name, None)
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
        raise OrientationUnavailable("runtime status unavailable") from exc
    if result.returncode != 0 or not stdout:
        raise OrientationUnavailable("runtime command unavailable")
    return stdout


def _task_index(root: Path, session_id: str) -> tuple[str | None, str | None]:
    try:
        status_text = _runtime_command(
            root,
            ["status", "inspect", "--host", "snow", "--session", session_id, "--json"],
            session_id,
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
        if not isinstance(task_id, str) or not task_id.strip() or len(task_id) > MAX_INDEX_CHARS:
            return None, "no validated active Task"
        task_text = _runtime_command(
            root,
            ["task", "show", task_id, "--workspace", str(root)],
            session_id,
        )
        task = json.loads(task_text)
        if not isinstance(task, dict) or task.get("taskId") != task_id:
            return None, "task show returned an invalid Task"
        index = task.get("index")
        if (
            not isinstance(index, str)
            or not index.strip()
            or len(index) > MAX_INDEX_CHARS
            or Path(index).is_absolute()
            or any(ord(char) < 0x20 for char in index)
        ):
            return None, "task show returned an invalid Bundle index"
        return index, None
    except (OrientationUnavailable, json.JSONDecodeError, UnicodeError, OSError, ValueError):
        return None, "Task index unavailable; run task show with an explicit Task/workspace"


def _orientation(root: Path, session_id: str) -> str:
    task_index, reason = _task_index(root, session_id)
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


def _emit(additional_context: str) -> NoReturn:
    sys.stdout.write(
        json.dumps(
            {"additionalContext": additional_context},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n"
    )
    raise SystemExit(0)


def main() -> NoReturn:
    try:
        payload = _read_payload()
        messages = payload.get("messages")
        message_count = payload.get("messageCount")
        is_resume = payload.get("isResume")
        if not isinstance(messages, list):
            raise OrientationUnavailable("missing messages")
        if (
            not isinstance(message_count, int)
            or isinstance(message_count, bool)
            or message_count < 0
        ):
            raise OrientationUnavailable("invalid messageCount")
        if not isinstance(is_resume, bool):
            raise OrientationUnavailable("invalid isResume")
        session_id = _required_text(payload, "sessionId", "session_id")
        cwd_text = _required_text(payload, "cwd")
        root = _repository_root(cwd_text)
        _emit(_orientation(root, session_id))
    except OrientationUnavailable as exc:
        message = (
            f"omp-flow orientation unavailable: {exc}. Use $flow-status or the explicit "
            "omp_flow.py CLI; do not infer workflow state."
        )
        print(f"omp-flow onSessionStart: {exc}", file=sys.stderr)
        _emit(message)
    except Exception:
        message = (
            "omp-flow orientation unavailable: unexpected handler failure. Use $flow-status or "
            "the explicit omp_flow.py CLI; do not infer workflow state."
        )
        print("omp-flow onSessionStart: unexpected handler failure", file=sys.stderr)
        _emit(message)


if __name__ == "__main__":
    main()
