#!/usr/bin/env python3
"""Deny unverifiable apply_patch writes and direct omp-flow runtime writes."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import NoReturn


EVENT = "PreToolUse"
TOOL = "apply_patch"
RUNTIME_REASON = (
    "Runtime coordination is Python-owned. Use .omp-flow/scripts/omp_flow.py "
    "task/operation/flow-status commands instead of patching .omp-flow/.runtime directly."
)
UNVERIFIABLE_REASON = "Cannot safely verify apply_patch paths; the patch was denied."
FILE_DIRECTIVES = {
    "*** Add File: ": "add",
    "*** Update File: ": "update",
    "*** Delete File: ": "delete",
}
DRIVE_PATH = re.compile(r"^[A-Za-z]:")


class UnverifiablePatch(Exception):
    """The handler cannot prove the patch is safe."""


class RuntimePatch(Exception):
    """The patch targets Python-owned runtime coordination state."""


def _deny(reason: str) -> NoReturn:
    output = {
        "hookSpecificOutput": {
            "hookEventName": EVENT,
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }
    sys.stdout.write(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")
    raise SystemExit(0)


def _required_text(payload: dict[str, object], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str) or not value.strip():
        raise UnverifiablePatch(f"missing {name}")
    return value


def _read_payload() -> tuple[str, str]:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeError, OSError) as exc:
        raise UnverifiablePatch("invalid hook input") from exc
    if not isinstance(payload, dict):
        raise UnverifiablePatch("invalid hook input")
    if payload.get("hook_event_name") != EVENT or payload.get("tool_name") != TOOL:
        raise UnverifiablePatch("unexpected hook or tool")
    cwd = _required_text(payload, "cwd")
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        raise UnverifiablePatch("missing tool_input")
    command = _required_text(tool_input, "command")
    return cwd, command


def _extract_paths(command: str) -> list[str]:
    if "\x00" in command:
        raise UnverifiablePatch("NUL in patch")
    lines = command.splitlines()
    begin = [index for index, line in enumerate(lines) if line == "*** Begin Patch"]
    end = [index for index, line in enumerate(lines) if line == "*** End Patch"]
    if len(begin) != 1 or len(end) != 1 or begin[0] >= end[0]:
        raise UnverifiablePatch("invalid patch envelope")
    if any(line.strip() for line in lines[: begin[0]] + lines[end[0] + 1 :]):
        raise UnverifiablePatch("content outside patch envelope")

    paths: list[str] = []
    active_kind: str | None = None
    active_move = False
    for line in lines[begin[0] + 1 : end[0]]:
        matched = False
        for prefix, kind in FILE_DIRECTIVES.items():
            if line.startswith(prefix):
                path_text = line[len(prefix) :].strip()
                if not path_text or "\x00" in path_text:
                    raise UnverifiablePatch("empty patch path")
                paths.append(path_text)
                active_kind = kind
                active_move = False
                matched = True
                break
        if matched:
            continue
        if line.startswith("*** Move to: "):
            path_text = line[len("*** Move to: ") :].strip()
            if active_kind != "update" or active_move or not path_text or "\x00" in path_text:
                raise UnverifiablePatch("invalid move directive")
            paths.append(path_text)
            active_move = True
            continue
        if line == "*** End of File":
            continue
        if line.startswith("***"):
            raise UnverifiablePatch("unknown or broken patch directive")
    if not paths:
        raise UnverifiablePatch("patch has no file directive")
    return paths


def _contains(parent: Path, child: Path) -> bool:
    parent_text = os.path.normcase(str(parent))
    child_text = os.path.normcase(str(child))
    try:
        return os.path.commonpath([parent_text, child_text]) == parent_text
    except ValueError:
        return False


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
        raise UnverifiablePatch("repository root unavailable") from exc
    if not root.is_dir() or not _contains(root, cwd):
        raise UnverifiablePatch("cwd is outside repository root")
    return root, cwd


def _resolve_patch_path(root: Path, cwd: Path, raw_path: str) -> Path:
    portable = raw_path.replace("\\", "/")
    if (
        portable.startswith("/")
        or portable.startswith("//")
        or DRIVE_PATH.match(portable)
    ):
        raise UnverifiablePatch("absolute patch path")
    components = portable.split("/")
    if any(component == "" for component in components) or portable in {".", ".."}:
        raise UnverifiablePatch("ambiguous patch path")
    try:
        resolved = (cwd / Path(*components)).resolve(strict=False)
    except (OSError, RuntimeError, ValueError) as exc:
        raise UnverifiablePatch("patch path cannot be resolved") from exc
    if not _contains(root, resolved):
        raise UnverifiablePatch("patch path escapes repository root")
    return resolved


def _check_paths(cwd_text: str, raw_paths: list[str]) -> None:
    root, cwd = _repository_root(cwd_text)
    runtime = (root / ".omp-flow" / ".runtime").resolve(strict=False)
    for raw_path in raw_paths:
        resolved = _resolve_patch_path(root, cwd, raw_path)
        if _contains(runtime, resolved):
            raise RuntimePatch


def main() -> None:
    try:
        cwd, command = _read_payload()
        _check_paths(cwd, _extract_paths(command))
    except RuntimePatch:
        _deny(RUNTIME_REASON)
    except UnverifiablePatch:
        _deny(UNVERIFIABLE_REASON)
    except Exception:
        _deny(UNVERIFIABLE_REASON)


if __name__ == "__main__":
    main()
