from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


class WorkflowError(RuntimeError):
    pass


def read_text(path: Path, *, required: bool = True) -> str:
    if not path.is_file():
        if required:
            raise WorkflowError(f"Required file not found: {path}")
        return ""
    return path.read_text(encoding="utf-8")


def read_json(path: Path, *, required: bool = True) -> dict[str, Any]:
    raw = read_text(path, required=required)
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise WorkflowError(f"Invalid JSON in {path}: {exc.msg}") from exc
    if not isinstance(value, dict):
        raise WorkflowError(f"Expected JSON object in {path}")
    return value


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    atomic_write_text(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def confined_path(root: Path, value: str) -> Path:
    candidate = (root / value).resolve()
    resolved_root = root.resolve()
    try:
        candidate.relative_to(resolved_root)
    except ValueError as exc:
        raise WorkflowError(f"Path escapes repository root: {value}") from exc
    return candidate
