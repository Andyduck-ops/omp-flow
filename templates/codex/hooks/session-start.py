#!/usr/bin/env python3
"""Return bounded mechanical omp-flow orientation for Codex SessionStart."""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path
import subprocess
import sys
from typing import NoReturn


EVENT = "SessionStart"
SOURCES = {"startup", "resume", "clear", "compact"}
MARKER = "<!-- omp-flow-runtime-orientation:v1 -->"
BOUNDARY = (
    "Task meaning lives in the linked Bundle; do not infer Task, Flow, approval, "
    "verdict, or progress from this runtime orientation."
)
# Every part is injected whole: the maps are the cheapest global view and the Router holds Main's
# working rules. Claude Code previews only 2,000 characters of a single injection over 10,000, so
# the Claude hook registers each part as its own injection instead of sharing one budget.
ROUTER = ".agents/skills/omp-flow/SKILL.md"
MAPS = (
    (".omp-flow/workflow/index.md", "Workflow"),
    (".omp-flow/tasks/index.md", "Task"),
    (".omp-flow/wiki/index.md", "Wiki"),
)
READ_LIMIT = 1_000_000
# The optional brief is the one bounded part: a few counter-default conclusions pushed at startup.
WIKI_BRIEF = ".omp-flow/wiki/brief.md"
BRIEF_CHAR_LIMIT = 2_000


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


def _required_text(payload: dict[str, object], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str) or not value.strip():
        raise OrientationUnavailable(f"missing {name}")
    return value


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
        if not root_text:
            raise OSError("git returned an empty root")
        root = Path(root_text).resolve(strict=True)
    except (OSError, subprocess.SubprocessError, UnicodeError) as exc:
        raise OrientationUnavailable("repository root unavailable") from exc
    if not root.is_dir() or not _contains(root, cwd):
        raise OrientationUnavailable("repository root unavailable")
    return root, cwd


def _read_map(root: Path, relative: str) -> tuple[str | None, str | None]:
    """Read one authored file whole without interpreting Markdown semantics."""
    try:
        path = (root / relative).resolve()
        if not _contains(root, path) or path.suffix.lower() != ".md":
            return None, "map path is outside repository"
        with path.open("rb") as stream:
            raw = stream.read(READ_LIMIT + 1)
        if len(raw) > READ_LIMIT:
            return None, f"larger than {READ_LIMIT} bytes; read {relative} directly"
        text = raw.decode("utf-8")
    except (OSError, RuntimeError, UnicodeError):
        return None, "map unavailable"
    return text, None


def _read_optional_brief(root: Path) -> tuple[str | None, str | None, bool]:
    """Read the optional Wiki brief as (rendered text, failure reason, present); never raise.

    Each path part is checked with lstat before opening, so a symlink is never followed and a FIFO
    is never opened. A missing brief is absent; any other failure stays local to the brief.
    """
    try:
        current = root.resolve(strict=True)
        status = None
        for part in (".omp-flow", "wiki", "brief.md"):
            current = current / part
            status = os.lstat(current)
            if stat.S_ISLNK(status.st_mode):
                return None, "brief must not be a symlink", True
        if status is None or not stat.S_ISREG(status.st_mode):
            return None, "brief is not a regular file", True
        with current.open("rb") as stream:
            raw = stream.read(READ_LIMIT + 1)
        if len(raw) > READ_LIMIT:
            return None, f"larger than {READ_LIMIT} bytes; read {WIKI_BRIEF} directly", True
        text = raw.decode("utf-8").replace("\r\n", "\n")
    except FileNotFoundError:
        return None, None, False
    except UnicodeError:
        return None, "invalid UTF-8", True
    except (OSError, RuntimeError, ValueError):
        return None, "brief unavailable", True
    if len(text) <= BRIEF_CHAR_LIMIT:
        return text.rstrip("\n"), None, True
    prefix = text[:BRIEF_CHAR_LIMIT]
    newline_idx = prefix.rfind("\n")
    capped = prefix[:newline_idx] if newline_idx > 0 else prefix
    warning = (
        f"[WARNING: {WIKI_BRIEF} exceeds {BRIEF_CHAR_LIMIT} chars (actual: {len(text)}); "
        "remainder omitted at startup. Run Sleep or trim brief.md and move detail into domain Concepts.]"
    )
    return f"{capped}\n{warning}", None, True


def _active_task_index(root: Path) -> str | None:
    try:
        canonical_root = root.resolve(strict=True)
        marker = canonical_root / ".omp-flow" / ".runtime" / "workscope.json"
        if marker.is_symlink() or not marker.is_file():
            return None
        data = json.loads(marker.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or data.get("version") != 1:
            return None
        task_id = data.get("taskId")
        ws_root = data.get("workspaceRoot")
        if not isinstance(task_id, str) or not isinstance(ws_root, str):
            return None
        task_id = task_id.strip()
        if not task_id or task_id in (".", "..", "archive") or "/" in task_id or "\\" in task_id:
            return None
        if Path(ws_root).resolve(strict=True) != canonical_root:
            return None
        rel = f".omp-flow/tasks/{task_id}/index.md"
        target = canonical_root / rel
        if target.is_symlink() or not target.is_file():
            return None
        return rel
    except Exception:
        return None


def _segments(root: Path) -> dict[str, str]:
    """Return the Router and each map whole, keyed by part, in injection order."""
    router_text, router_reason = _read_map(root, ROUTER)
    head = [
        MARKER,
        "Follow the omp-flow Router below as Main's working rules. Read the Workflow, Task, and Wiki "
        "maps injected with it (parts may arrive in any order) and open useful links relative to each "
        "index; maps are navigation, not workflow state.",
    ]
    reads = {relative: _read_map(root, relative) for relative, _ in MAPS}
    head += [
        f"{label} index: {relative}" if label != "Task" or reads[relative][0] is not None
        else f"{label} index: unavailable ({reads[relative][1]})"
        for relative, label in MAPS
    ]
    brief_text, brief_reason, brief_present = _read_optional_brief(root)
    if brief_present:
        head.append(f"Wiki brief: {WIKI_BRIEF}" if brief_text is not None else f"Wiki brief: unavailable ({brief_reason})")
    # The local marker is a default, not proof the Task is still open, so it gets a pointer only.
    active_index = _active_task_index(root)
    if active_index is not None:
        head.append(f"Active Task index: {active_index}")
    if router_text is None:
        head.append(f"Router Skill content: unavailable ({router_reason}); load the omp-flow Skill.")
    else:
        head += ["--- Router Skill ---", router_text.rstrip("\n"), "--- End Router Skill ---"]
    head.append(BOUNDARY)
    segments = {"router": "\n".join(head)}
    for relative, label in MAPS:
        text, reason = reads[relative]
        if text is None:
            section = f"{label} map content: unavailable ({reason})"
            if label == "Task":
                section += "\nUse an explicit Task/workspace or WorkScope to open a Bundle; do not infer a Task or path."
        else:
            section = "\n".join([f"--- {label} map ---", text.rstrip("\n"), f"--- End {label} map ---"])
        segments[label.lower()] = section
    if brief_present:
        brief = (
            "\n".join(["--- Wiki brief ---", brief_text, "--- End Wiki brief ---"]) if brief_text is not None
            else f"Wiki brief content: unavailable ({brief_reason})"
        )
        segments["wiki"] = f"{brief}\n\n{segments['wiki']}"
    return segments


def _orientation(root: Path, *_: object) -> str:
    return "\n\n".join(_segments(root).values())


def _emit(additional_context: str, system_message: str | None = None) -> NoReturn:
    hook_output: dict[str, object] = {
        "hookSpecificOutput": {
            "hookEventName": EVENT,
            "additionalContext": additional_context,
        }
    }
    if system_message is not None:
        hook_output["systemMessage"] = system_message
    sys.stdout.write(json.dumps(hook_output, ensure_ascii=False, separators=(",", ":")) + "\n")
    raise SystemExit(0)


def main() -> NoReturn:
    try:
        payload = _read_payload()
        if payload.get("hook_event_name") != EVENT:
            raise OrientationUnavailable("unexpected hook event")
        source = _required_text(payload, "source")
        if source not in SOURCES:
            raise OrientationUnavailable("unsupported session source")
        session_id = _required_text(payload, "session_id")
        cwd_text = _required_text(payload, "cwd")
        root, _ = _repository_root(cwd_text)
        _emit(_orientation(root, session_id))
    except OrientationUnavailable as exc:
        message = (
            f"omp-flow orientation unavailable: {exc}. Read the Task, Wiki, and Workflow indexes "
            "directly; do not infer workflow state."
        )
        print(f"omp-flow SessionStart: {exc}", file=sys.stderr)
        _emit(message, message)
    except Exception:
        message = (
            "omp-flow orientation unavailable: unexpected handler failure. Read the Task, Wiki, and Workflow "
            "indexes directly; do not infer workflow state."
        )
        print("omp-flow SessionStart: unexpected handler failure", file=sys.stderr)
        _emit(message, message)


if __name__ == "__main__":
    main()
