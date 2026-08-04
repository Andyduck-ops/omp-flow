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


def _runtime_status(root: Path, session_id: str) -> str:
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
            [sys.executable, "-X", "utf8", str(runtime), "--cwd", str(root), "status"],
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
        raise OrientationUnavailable("runtime status unavailable")
    if len(stdout) > MAX_STATUS_CHARS:
        stdout = f"{stdout[: MAX_STATUS_CHARS - 1]}…"
    return stdout


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
        status = _runtime_status(root, session_id)
        _emit(f"{MARKER}\n{status}\n{BOUNDARY}")
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
