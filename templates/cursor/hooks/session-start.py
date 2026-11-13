#!/usr/bin/env python3
"""Bridge Cursor conversation identity into omp-flow's explicit context."""

from __future__ import annotations

import json
import os
import stat
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


def _contains(parent: Path, child: Path) -> bool:
    try:
        return os.path.commonpath([os.path.normcase(str(parent)), os.path.normcase(str(child))]) == os.path.normcase(str(parent))
    except ValueError:
        return False


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
            # Windows lstat reports a junction as a plain directory; its reparse attribute marks it.
            if stat.S_ISLNK(status.st_mode) or getattr(status, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                return None, "brief must not be a symlink", True
            # A file where a directory belongs is unavailable on every platform (Windows reports it as missing).
            if part != "brief.md" and not stat.S_ISDIR(status.st_mode):
                return None, "brief unavailable", True
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
        try:
            context = _orientation(root, conversation_id)
        except BridgeUnavailable as exc:
            context = f"{MARKER}\nomp-flow orientation unavailable: {exc}.\n{BOUNDARY}"
        _emit({"additional_context": context})
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
