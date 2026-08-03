#!/usr/bin/env python3
"""Protect Python-owned runtime state from known Snow filesystem mutators."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import NoReturn


TOOLS = {"filesystem-create", "filesystem-edit", "filesystem-replaceedit"}
RUNTIME_REASON = (
    "Runtime coordination is Python-owned. Use .omp-flow/scripts/omp_flow.py "
    "task/operation/flow-status commands instead of writing .omp-flow/.runtime directly."
)
UNVERIFIABLE_REASON = "Cannot safely verify Snow filesystem paths; the tool call was denied."
DRIVE_PATH = re.compile(r"^[A-Za-z]:")


class UnverifiablePath(Exception):
    """The handler cannot prove a requested file path is repository-confined."""


class RuntimeWrite(Exception):
    """A requested path targets Python-owned runtime coordination state."""


def _deny(reason: str) -> NoReturn:
    print(reason, file=sys.stderr)
    raise SystemExit(1)


def _required_text(payload: dict[str, object], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str) or not value.strip():
        raise UnverifiablePath(f"missing {name}")
    return value.strip()


def _read_payload() -> tuple[str, dict[str, object], str]:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeError, OSError) as exc:
        raise UnverifiablePath("invalid hook input") from exc
    if not isinstance(payload, dict):
        raise UnverifiablePath("invalid hook input")
    tool_name = _required_text(payload, "toolName")
    if tool_name not in TOOLS:
        raise UnverifiablePath("unexpected tool")
    args = payload.get("args")
    if not isinstance(args, dict):
        raise UnverifiablePath("missing args")
    cwd = _required_text(payload, "cwd")
    return tool_name, args, cwd


def _paths(args: dict[str, object]) -> list[str]:
    value = args.get("filePath")
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    if not isinstance(value, list) or not value:
        raise UnverifiablePath("missing filePath")

    paths: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            paths.append(item.strip())
        elif isinstance(item, dict):
            path = item.get("path")
            if not isinstance(path, str) or not path.strip():
                raise UnverifiablePath("invalid batch path")
            paths.append(path.strip())
        else:
            raise UnverifiablePath("invalid batch path")
    return paths


def _contains(parent: Path, child: Path) -> bool:
    parent_text = os.path.normcase(str(parent))
    child_text = os.path.normcase(str(child))
    try:
        return os.path.commonpath([parent_text, child_text]) == parent_text
    except ValueError:
        return False


def _portable_contains(parent: Path, child: Path) -> bool:
    """Match path components consistently across case-sensitive filesystems."""
    parent_parts = tuple(part.casefold() for part in parent.parts)
    child_parts = tuple(part.casefold() for part in child.parts)
    return child_parts[: len(parent_parts)] == parent_parts


def _repository_root(cwd_text: str) -> tuple[Path, Path]:
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
        root = Path(root_text).resolve(strict=True)
    except (OSError, subprocess.SubprocessError, UnicodeError) as exc:
        raise UnverifiablePath("repository root unavailable") from exc
    if not root.is_dir() or not _contains(root, cwd):
        raise UnverifiablePath("cwd is outside repository root")
    return root, cwd


def _resolve_path(root: Path, cwd: Path, raw_path: str) -> Path:
    if "\x00" in raw_path or raw_path.startswith("ssh://"):
        raise UnverifiablePath("unsupported path")
    portable = raw_path.replace("\\", "/")
    try:
        if portable.startswith("/") or portable.startswith("//") or DRIVE_PATH.match(portable):
            candidate = Path(raw_path)
        else:
            if any(component == "" for component in portable.split("/")):
                raise UnverifiablePath("ambiguous path")
            candidate = cwd / Path(*portable.split("/"))
        resolved = candidate.resolve(strict=False)
    except (OSError, RuntimeError, ValueError) as exc:
        raise UnverifiablePath("path cannot be resolved") from exc
    if not _contains(root, resolved):
        raise UnverifiablePath("path escapes repository root")
    return resolved


def _check_paths(cwd_text: str, raw_paths: list[str]) -> None:
    root, cwd = _repository_root(cwd_text)
    runtime = (root / ".omp-flow" / ".runtime").resolve(strict=False)
    for raw_path in raw_paths:
        resolved = _resolve_path(root, cwd, raw_path)
        if _portable_contains(runtime, resolved):
            raise RuntimeWrite


def main() -> None:
    try:
        _, args, cwd = _read_payload()
        _check_paths(cwd, _paths(args))
    except RuntimeWrite:
        _deny(RUNTIME_REASON)
    except UnverifiablePath:
        _deny(UNVERIFIABLE_REASON)
    except Exception:
        _deny(UNVERIFIABLE_REASON)


if __name__ == "__main__":
    main()
