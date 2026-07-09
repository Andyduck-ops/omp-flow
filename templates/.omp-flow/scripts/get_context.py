#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build omp-flow native-task prompts.

This script is intentionally platform-neutral. OMP uses it from the extension
`tool_call` hook before native `task` dispatch; other harnesses can call it
directly and pass the returned text as a sub-agent prompt.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

if sys.platform.startswith("win") and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]

ROW_BOUND_ROLES = {"executor", "reviewer"}
SUPPORT_ROLES = {"researcher", "architect", "planner", "explore", "oracle", "qbd-auditor"}
ALL_ROLES = ROW_BOUND_ROLES | SUPPORT_ROLES


def fail(message: str) -> None:
    print(f"[omp-flow get_context] ERROR: {message}", file=sys.stderr)
    raise SystemExit(2)


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    while True:
        if (current / ".omp-flow").is_dir() or (current / ".git").exists():
            return current
        if current == current.parent:
            fail(f"Cannot find repository root from {start}")
        current = current.parent


def read_text(path: Path, *, required: bool, label: str | None = None) -> str:
    if not path.is_file():
        if required:
            fail(f"Missing required {label or 'file'}: {path}")
        return ""
    content = path.read_text(encoding="utf-8")
    if required and not content.strip():
        fail(f"Required {label or 'file'} is empty: {path}")
    return content


def resolve_active_task(repo: Path, explicit_task: str | None) -> str:
    if explicit_task:
        return explicit_task.strip()
    active_path = repo / ".omp-flow" / "tasks" / ".active-task"
    active = read_text(active_path, required=True, label="active task pointer").strip()
    if not active:
        fail(f"Active task pointer is empty: {active_path}")
    return active


def read_csv_rows(csv_path: Path) -> list[dict[str, str]]:
    raw = read_text(csv_path, required=True, label="tasks.csv")
    body = "\n".join(line for line in raw.splitlines() if not line.lstrip().startswith("#"))
    rows = list(csv.DictReader(io.StringIO(body)))
    return [{str(k): (v or "").strip() for k, v in row.items() if k} for row in rows]


def select_row(rows: list[dict[str, str]], row_id: str | None) -> dict[str, str]:
    if row_id:
        for row in rows:
            if row.get("id") == row_id:
                return row
        fail(f"Row not found in tasks.csv: {row_id}")
    for status in ("in_progress", "pending"):
        for row in rows:
            if row.get("status", "").lower() == status:
                return row
    fail("No in_progress or pending row found in tasks.csv; pass --row explicitly")


def read_jsonl_manifest(repo: Path, task_dir: Path, name: str, *, required: bool) -> list[str]:
    path = task_dir / name
    if not path.is_file():
        if required:
            fail(f"Missing required context manifest: {path}")
        return []
    blocks: list[str] = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            item = json.loads(stripped)
        except json.JSONDecodeError as exc:
            fail(f"Invalid JSON in {path}:{line_no}: {exc.msg}")
        file_path = item.get("file") or item.get("path")
        if not file_path:
            continue
        target = (repo / str(file_path)).resolve()
        if item.get("type") == "directory":
            if not target.is_dir():
                fail(f"Manifest directory not found: {file_path}")
            for child in sorted(target.rglob("*.md"))[:30]:
                rel = child.relative_to(repo).as_posix()
                blocks.append(f"=== {rel} ===\n{read_text(child, required=True)}")
        else:
            if not target.is_file():
                fail(f"Manifest file not found: {file_path}")
            blocks.append(f"=== {str(file_path)} ===\n{read_text(target, required=True)}")
    return blocks


def resolve_context_refs(task_dir: Path, refs: str) -> str:
    refs_list = [part.strip() for part in refs.split(";") if part.strip()]
    if not refs_list:
        return ""
    index_path = task_dir / "context" / "index.json"
    parsed = json.loads(read_text(index_path, required=True, label="context/index.json"))
    entries = parsed.get("entries")
    if not isinstance(entries, list):
        fail(f"context/index.json has no entries array: {index_path}")
    by_ref: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("entryId", "")).strip()
        entry_type = str(entry.get("type", "")).strip()
        title = str(entry.get("title", "")).strip()
        if entry_id:
            by_ref[entry_id] = entry
        if entry_type and entry_id:
            by_ref[f"{entry_type}:{entry_id}"] = entry
        if entry_type and title:
            by_ref[f"{entry_type}:{title}"] = entry
    blocks: list[str] = ["<omp-flow-context-pack>"]
    missing: list[str] = []
    for ref in refs_list:
        entry = by_ref.get(ref)
        if not entry:
            missing.append(ref)
            continue
        rel_path = str(entry.get("path", "")).strip()
        body_path = task_dir / "context" / rel_path
        body = read_text(body_path, required=True, label=f"context ref {ref}")
        blocks.append(
            f'<context-entry ref="{ref}" type="{entry.get("type", "")}" title="{entry.get("title", "")}">\n'
            f"<summary>{entry.get('summary', '')}</summary>\n{body}\n</context-entry>"
        )
    if missing:
        fail(f"Unresolved context refs in tasks.csv: {', '.join(missing)}")
    blocks.append("</omp-flow-context-pack>")
    return "\n".join(blocks)


def resolve_reference_refs(task_dir: Path, refs: str) -> str:
    refs_list = [part.strip() for part in refs.split(";") if part.strip()]
    if not refs_list:
        return ""
    reference_dir = task_dir / "reference"
    blocks: list[str] = ["<omp-flow-references>"]
    missing: list[str] = []
    for spec in refs_list:
        match = re.match(r"^ref:([^#]+)(?:#L(\d+)(?:-(\d+))?)?$", spec, flags=re.I)
        if not match:
            missing.append(spec)
            continue
        slug = match.group(1)
        meta_path = reference_dir / f"{slug}.meta.json"
        if not meta_path.is_file():
            missing.append(spec)
            continue
        meta = json.loads(read_text(meta_path, required=True, label=f"reference metadata {slug}"))
        candidates = [p for p in reference_dir.iterdir() if p.name.startswith(f"{slug}.") and p.name != f"{slug}.meta.json"]
        if not candidates:
            missing.append(spec)
            continue
        content = read_text(candidates[0], required=True, label=f"reference slice {slug}")
        start = int(match.group(2)) if match.group(2) else None
        end = int(match.group(3)) if match.group(3) else start
        selected = content
        source_lines = meta.get("sourceLines", "full")
        if start is not None:
            lines = content.splitlines()
            end = max(start, end or start)
            selected = "\n".join(lines[start - 1:end])
            source_lines = f"L{start}-{end}"
        blocks.append(
            f'<reference slug="{slug}" sourceRepo="{meta.get("sourceRepo", "")}" '
            f'sourcePath="{meta.get("sourcePath", "")}" sourceLines="{source_lines}" '
            f'summary="{meta.get("summary", "")}">\n{selected}\n</reference>'
        )
    if missing:
        fail(f"Unresolved reference refs in tasks.csv: {', '.join(missing)}")
    blocks.append("</omp-flow-references>")
    return "\n".join(blocks)


def read_research_reports(task_dir: Path) -> str:
    research_dir = task_dir / "research"
    if not research_dir.is_dir():
        fail(f"Missing research directory: {research_dir}")
    blocks = []
    for path in sorted(research_dir.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        blocks.append(f"=== research/{path.name} ===\n{read_text(path, required=True)}")
    return "\n\n".join(blocks)


def row_brief_path(task_dir: Path, row: dict[str, str]) -> Path:
    task_md = row.get("taskMd", "").strip()
    if task_md:
        candidate = Path(task_md)
        if not candidate.is_absolute():
            candidate = Path.cwd() / candidate
        return candidate
    return task_dir / ".task" / f"{row.get('id')}.implement.md"


def build_prompt(repo: Path, role: str, task_id: str, row_id: str | None, original_prompt: str) -> str:
    task_dir = repo / ".omp-flow" / "tasks" / task_id
    if not task_dir.is_dir():
        fail(f"Task directory not found: {task_dir}")

    artifacts = {
        "brainstorm.md": read_text(task_dir / "brainstorm.md", required=True, label="brainstorm.md"),
        "guidance-specification.md": read_text(task_dir / "guidance-specification.md", required=True, label="guidance-specification.md"),
        "prd.md": read_text(task_dir / "prd.md", required=role in ROW_BOUND_ROLES, label="prd.md"),
        "design.md": read_text(task_dir / "design.md", required=role in ROW_BOUND_ROLES, label="design.md"),
    }

    parts = [
        "<!-- omp-flow-python-context -->",
        f"# OMP-Flow {role.title()} Native Task Handoff",
        f"Task ID: {task_id}",
        "Context source: .omp-flow/scripts/get_context.py",
    ]

    if role in ROW_BOUND_ROLES:
        rows = read_csv_rows(task_dir / "tasks.csv")
        row = select_row(rows, row_id)
        brief_path = row_brief_path(task_dir, row)
        brief = read_text(brief_path, required=True, label=f"task brief for row {row.get('id')}")
        manifest = "implement.jsonl" if role == "executor" else "check.jsonl"
        manifest_blocks = read_jsonl_manifest(repo, task_dir, manifest, required=True)
        parts.extend([
            f"Row ID: {row.get('id')}",
            f"Row title: {row.get('title', '')}",
            f"Row scope: {row.get('scope', '')}",
            f"Row action: {row.get('action', '')}",
            "",
            "## Task Artifacts",
            f"=== brainstorm.md ===\n{artifacts['brainstorm.md']}",
            f"=== guidance-specification.md ===\n{artifacts['guidance-specification.md']}",
            f"=== prd.md ===\n{artifacts['prd.md']}",
            f"=== design.md ===\n{artifacts['design.md']}",
            "",
            "## Manifest Context",
            "\n\n".join(manifest_blocks) if manifest_blocks else "(manifest has no curated file entries)",
            "",
            "## CSV-Bound Context",
            resolve_reference_refs(task_dir, row.get("reference", "")),
            resolve_context_refs(task_dir, row.get("context", "")),
            "",
            "## Row Task Brief",
            brief,
        ])
        if role == "reviewer":
            parts.append("Reviewer postcondition: call omp_flow_submit_verdict after writing .task/{rowId}.review.md.")
    else:
        manifest_blocks = read_jsonl_manifest(repo, task_dir, "implement.jsonl", required=False)
        parts.extend([
            "",
            "## Planning Artifacts",
            f"=== brainstorm.md ===\n{artifacts['brainstorm.md']}",
            f"=== guidance-specification.md ===\n{artifacts['guidance-specification.md']}",
            f"=== prd.md ===\n{artifacts['prd.md']}" if artifacts["prd.md"].strip() else "",
            f"=== design.md ===\n{artifacts['design.md']}" if artifacts["design.md"].strip() else "",
            "",
            "## Research Reports",
            read_research_reports(task_dir) or "(no research reports yet)",
            "",
            "## Manifest Context",
            "\n\n".join(manifest_blocks) if manifest_blocks else "(no curated manifest entries)",
        ])

    parts.extend(["", "## Original Assignment", original_prompt.strip()])
    return "\n".join(part for part in parts if part is not None)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--role", required=True)
    parser.add_argument("--task")
    parser.add_argument("--row")
    parser.add_argument("--cwd", default=os.getcwd())
    parser.add_argument("--prompt")
    args = parser.parse_args()

    role = args.role.strip().lower()
    if role not in ALL_ROLES:
        fail(f"Unsupported role: {args.role}")
    repo = find_repo_root(Path(args.cwd))
    task_id = resolve_active_task(repo, args.task)
    prompt = args.prompt if args.prompt is not None else sys.stdin.read()
    print(build_prompt(repo, role, task_id, args.row, prompt))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
