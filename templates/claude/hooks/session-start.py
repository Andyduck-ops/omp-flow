#!/usr/bin/env python3
"""Inject authored navigation maps at Claude session start."""
from __future__ import annotations

import codecs
import json
import os
import sys
from pathlib import Path


# Claude Code moves hook context over 10,000 characters into a file and shows only a
# 2,000-character preview, so the whole orientation stays under this budget. A map that does not
# fit is cut at a line boundary with a pointer to its file instead of being dropped.
ORIENTATION_BUDGET = 9000

MARKER = "<!-- omp-flow-runtime-orientation:v1 -->"
BOUNDARY = (
    "Task meaning lives in the linked Bundle; do not infer Task, Flow, approval, "
    "verdict, or progress from this runtime orientation."
)


def _contains(parent: Path, child: Path) -> bool:
    try:
        return os.path.commonpath([os.path.normcase(str(parent)), os.path.normcase(str(child))]) == os.path.normcase(str(parent))
    except ValueError:
        return False


def _emit(value: dict) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False) + "\n")


def _stop(reason: str) -> dict:
    return {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": f"STOP: omp-flow session orientation failed.\nReason: {reason}",
        },
        "systemMessage": f"omp-flow SessionStart failed: {reason}",
    }


def _read_map(root: Path, relative: str) -> tuple[str | None, str | None]:
    """Read the start of one authored navigation map without interpreting Markdown semantics."""
    path = (root / relative).resolve()
    if not _contains(root, path) or path.suffix.lower() != ".md":
        return None, "map path is outside repository"
    limit = ORIENTATION_BUDGET * 4
    try:
        with path.open("rb") as stream:
            raw = stream.read(limit)
        # A multi-byte character split by the read limit is held back instead of failing decode.
        decoder = codecs.getincrementaldecoder("utf-8")("strict")
        text = decoder.decode(raw, final=len(raw) < limit)
    except (OSError, UnicodeError):
        return None, "map unavailable"
    return text, None


def _fit(text: str, budget: int, relative: str) -> str:
    if len(text) <= budget:
        return text
    note = f"[... truncated; read {relative} for the rest]"
    cut = text.rfind("\n", 0, max(budget - len(note) - 1, 0))
    return (text[:cut] + "\n" if cut > 0 else "") + note


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

def _orientation(root: Path, session_id: str) -> str:
    maps = [
        (".omp-flow/workflow/index.md", "Workflow"),
        (".omp-flow/tasks/index.md", "Task"),
        (".omp-flow/wiki/index.md", "Wiki"),
    ]
    reads = {relative: _read_map(root, relative) for relative, _ in maps}
    lines = [
        MARKER,
        "Read the Task, Wiki, and Workflow maps carefully. Follow useful links relative to each index; maps are navigation, not workflow state.",
        *(
            f"{label} index: {relative}" if label != "Task" or reads[relative][0] is not None
            else f"{label} index: unavailable ({reads[relative][1]})"
            for relative, label in maps
        ),
    ]
    # The local marker is a default, not proof the Task is still open, so it gets a pointer only.
    active_index = _active_task_index(root)
    if active_index is not None:
        lines.append(f"Active Task index: {active_index}")
    sections: dict[str, str] = {}
    readable: list[tuple[str, str, str]] = []
    for relative, label in maps:
        text, reason = reads[relative]
        if text is None:
            sections[relative] = f"{label} map content: unavailable ({reason})"
            if label == "Task":
                sections[relative] += "\nUse an explicit Task/workspace or WorkScope to open a Bundle; do not infer a Task or path."
        else:
            readable.append((relative, label, text.rstrip("\n")))
    available = ORIENTATION_BUDGET - len("\n".join([*lines, BOUNDARY])) - len(maps)
    available -= sum(len(section) for section in sections.values())
    available -= sum(len(f"--- {label} map ------ End {label} map ---") + 2 for _, label, _ in readable)
    # Share the budget evenly; a short map passes its unused share on to the longer ones.
    for count, (relative, label, text) in enumerate(sorted(readable, key=lambda item: len(item[2]))):
        share = available // (len(readable) - count)
        body = _fit(text, share, relative)
        sections[relative] = "\n".join([f"--- {label} map ---", body, f"--- End {label} map ---"])
        available -= len(body)
    lines += [sections[relative] for relative, _ in maps]
    lines.append(BOUNDARY)
    return "\n".join(lines)


def main() -> int:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        payload = json.loads(sys.stdin.read())
        if not isinstance(payload, dict):
            raise ValueError("payload must be an object")
        session_id = payload.get("session_id")
        if not isinstance(session_id, str) or not session_id.strip():
            raise ValueError("payload requires a non-empty session_id")
        project = os.environ.get("CLAUDE_PROJECT_DIR", "").strip()
        if not project:
            raise ValueError("CLAUDE_PROJECT_DIR is not set")
        root = Path(project).resolve()
        orientation = _orientation(root, session_id)
        _emit(
            {
                "hookSpecificOutput": {
                    "hookEventName": "SessionStart",
                    "additionalContext": orientation,
                }
            }
        )
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        _emit(_stop(str(exc)))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
