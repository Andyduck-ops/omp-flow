from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .io import WorkflowError, confined_path, read_json, read_text
from .gates import verify_row_frozen
from .paths import task_dir
from .reference import render_references
from .topology import read_rows, validate_rows


ROW_ROLES = {"executor", "reviewer"}
PLANNING_ROLES = {"researcher", "architect", "planner", "explore", "oracle"}
ALL_ROLES = ROW_ROLES | PLANNING_ROLES


def _research(root: Path, selected: str | None = None) -> str:
    paths = sorted((root / "research").glob("*.md"))
    if selected:
        selected_path = root / selected
        if not selected_path.is_file():
            raise WorkflowError(f"Selected synthesis not found: {selected}")
        paths = [selected_path]
    return "\n\n".join(
        f"=== {path.relative_to(root).as_posix()} ===\n{read_text(path)}"
        for path in paths if path.name.lower() != "readme.md"
    )


def _manifest(repo: Path, root: Path, name: str) -> str:
    path = root / name
    if not path.is_file():
        return ""
    blocks = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            raise WorkflowError(f"Invalid JSON in {path}:{line_no}") from exc
        target_value = item.get("file") or item.get("path")
        if not target_value:
            continue
        target = confined_path(repo, str(target_value))
        if not target.is_file():
            raise WorkflowError(f"Manifest file not found: {target_value}")
        blocks.append(f"=== {target_value} ===\n{read_text(target)}")
    return "\n\n".join(blocks)


def _context_refs(root: Path, refs: str) -> str:
    values = [value.strip() for value in refs.split(";") if value.strip()]
    if not values:
        return ""
    index = read_json(root / "context" / "index.json")
    entries = index.get("entries")
    if not isinstance(entries, list):
        raise WorkflowError("context/index.json must contain an entries array")
    by_id = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("entryId", ""))
        entry_type = str(entry.get("type", ""))
        if entry_id:
            by_id[entry_id] = entry
            by_id[f"{entry_type}:{entry_id}"] = entry
    blocks = ["<omp-flow-context-pack>"]
    for value in values:
        entry = by_id.get(value)
        if not entry:
            raise WorkflowError(f"Unresolved context reference: {value}")
        relative = str(entry.get("path", ""))
        body = read_text(confined_path(root / "context", relative))
        blocks.append(f'<context-entry ref="{value}">\n{body}\n</context-entry>')
    blocks.append("</omp-flow-context-pack>")
    return "\n".join(blocks)


def build_context(
    repo: Path,
    task_id: str,
    role: str,
    assignment: str,
    *,
    row_id: str | None = None,
) -> str:
    if role not in ALL_ROLES:
        raise WorkflowError(f"Unsupported role: {role}")
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    parts = [
        "<!-- omp-flow-python-context -->",
        f"# OMP-Flow {role.title()} Handoff",
        f"Task ID: {task_id}",
        f"Task phase: {task.get('phase', 'unknown')}",
    ]
    if role in PLANNING_ROLES:
        selected = task.get("selectedSynthesis") if role == "architect" else None
        parts.extend([
            "## Intent and Guidance",
            read_text(root / "brainstorm.md"),
            read_text(root / "guidance-specification.md"),
            "## Research",
            _research(root, str(selected) if selected else None) or "(no research reports)",
        ])
        for name in ("prd.md", "design.md"):
            content = read_text(root / name, required=False)
            if content:
                parts.extend([f"## Existing {name}", content])
    else:
        if task.get("status") != "in_progress" or task.get("phase") != "execute":
            raise WorkflowError(f"{role} context requires task status=in_progress and phase=execute")
        if not row_id:
            raise WorkflowError(f"{role} requires --row with the full topology ID")
        verify_row_frozen(repo, task_id, row_id)
        rows = read_rows(root / "tasks.csv")
        validate_rows(rows)
        row = next((candidate for candidate in rows if candidate.get("id") == row_id), None)
        if row is None:
            raise WorkflowError(f"Row not found: {row_id}")
        allowed_status = {"pending", "needs_fix"} if role == "executor" else {"review"}
        if row.get("status") not in allowed_status:
            raise WorkflowError(
                f"Row {row_id} status={row.get('status')} is not valid for {role}"
            )
        brief = read_text(root / ".task" / f"{row_id}.implement.md")
        manifest_name = "implement.jsonl" if role == "executor" else "check.jsonl"
        parts.extend([
            "## Committed Design",
            read_text(root / "prd.md"),
            read_text(root / "design.md"),
            "## Row",
            json.dumps(row, ensure_ascii=False, indent=2),
            "## Curated Context",
            _manifest(repo, root, manifest_name),
            _context_refs(root, row.get("context", "")),
            render_references(repo, task_id, row.get("reference", "")) if row.get("reference") else "",
            "## Implementation Brief",
            brief,
        ])
        if role == "reviewer":
            parts.append(
                f"Write .task/{row_id}.review.md, then submit evidence with "
                f"omp_flow.py evidence submit --task {task_id} --row {row_id} "
                "and your native reviewer agent ID."
            )
    parts.extend(["## Original Assignment", assignment.strip()])
    return "\n\n".join(part for part in parts if part)
