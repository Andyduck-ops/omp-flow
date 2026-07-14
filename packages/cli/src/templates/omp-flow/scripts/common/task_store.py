from __future__ import annotations

import csv
import io
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .active_task import clear_task_sessions, resolve_context_key, set_active_task
from .io import WorkflowError, atomic_write_json, atomic_write_text, read_json
from .paths import flow_dir, task_dir, tasks_dir


TASK_HEADERS = [
    "id", "wave", "priority", "title", "scope", "action", "reference",
    "context", "status", "modelSlot", "taskMd",
]
EVIDENCE_HEADERS = [
    "rowId", "verdict", "tests_run", "tests_failed", "evidence",
    "reviewer_agent_id", "phase", "timestamp", "artifact",
]


def _csv_header(fields: list[str]) -> str:
    stream = io.StringIO(newline="")
    csv.writer(stream, lineterminator="\n").writerow(fields)
    return stream.getvalue()


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:48]
    return slug or "untitled-task"


def build_task_id(title: str, slug: str | None = None, now: datetime | None = None) -> str:
    stamp = now or datetime.now()
    return f"{stamp.month:02d}-{stamp.day:02d}-{_slug(slug or title)}"


def _template(title: str, heading: str, body: str) -> str:
    return f"# {heading}: {title}\n\n{body.rstrip()}\n"


def create_task(
    repo: Path,
    title: str,
    *,
    slug: str | None = None,
    parent: str | None = None,
    no_start: bool = False,
) -> dict[str, Any]:
    if not no_start and resolve_context_key() is None:
        raise WorkflowError(
            "No session identity. Set OMP_FLOW_CONTEXT_ID or pass --no-start."
        )
    task_id = build_task_id(title, slug)
    target = tasks_dir(repo) / task_id
    if target.exists():
        raise WorkflowError(f"Task already exists: {task_id}")

    now = datetime.now(timezone.utc).isoformat()
    for relative in (
        "research", "reference", "context/brief", "context/interface",
        "context/decision", "context/finding", "qbd/qbd-1", "qbd/qbd-2",
        ".task", ".summaries",
    ):
        (target / relative).mkdir(parents=True, exist_ok=True)

    task = {
        "schemaVersion": 2,
        "id": task_id,
        "title": title,
        "status": "planning",
        "phase": "explore",
        "selectedSynthesis": None,
        "topologyFrozen": False,
        "gates": {
            "qbd1": {"status": "not_started", "attempt": 0},
            "qbd2": {"status": "not_started", "attempt": 0},
        },
        "parent": parent,
        "children": [],
        "createdAt": now,
        "updatedAt": now,
    }
    atomic_write_json(target / "task.json", task)
    atomic_write_text(target / "brainstorm.md", _template(title, "Brainstorm", "## Raw Direction\n\n## Candidate Angles\n\n## Convergence Notes"))
    atomic_write_text(target / "guidance-specification.md", _template(title, "Guidance Specification", "## Research Gate\n\n## Reference Candidates\n\n## Design Constraints"))
    atomic_write_text(target / "prd.md", _template(title, "PRD", "<!-- Uncommitted template. Complete after selected research synthesis. -->\n\n## Goal\n\n## Requirements\n\n## Acceptance Criteria"))
    atomic_write_text(target / "design.md", _template(title, "Design", "<!-- Uncommitted template. Complete after selected research synthesis. -->\n\n## Architecture\n\n## Decisions\n\n## Verification"))
    atomic_write_text(target / "tasks.csv", _csv_header(TASK_HEADERS))
    atomic_write_text(target / "evidence.csv", _csv_header(EVIDENCE_HEADERS))
    seed = '{"_example":"Add project spec/research files with file and reason fields."}\n'
    atomic_write_text(target / "implement.jsonl", seed)
    atomic_write_text(target / "check.jsonl", seed)
    atomic_write_json(target / "context" / "index.json", {"version": 1, "entries": []})
    atomic_write_text(target / "research" / "README.md", "# Research\n\nPersist investigation by topic. End design research with a selected 90-synthesis artifact.\n")
    atomic_write_text(target / "reference" / "README.md", "# Reference\n\nTier 2 source slices with provenance metadata only.\n")

    if parent:
        parent_dir = task_dir(repo, parent)
        parent_data = read_json(parent_dir / "task.json")
        children = parent_data.setdefault("children", [])
        if isinstance(children, list) and task_id not in children:
            children.append(task_id)
        parent_data["updatedAt"] = now
        atomic_write_json(parent_dir / "task.json", parent_data)

    activation = "not_requested"
    if not no_start:
        set_active_task(repo, task_id)
        activation = "session"
    return {"taskId": task_id, "taskDir": str(target), "activation": activation}


def list_tasks(repo: Path) -> list[dict[str, Any]]:
    root = tasks_dir(repo)
    if not root.is_dir():
        return []
    result = []
    for path in sorted(root.iterdir()):
        if path.is_dir() and path.name != "archive" and not path.name.startswith("."):
            data = read_json(path / "task.json", required=False)
            if data:
                result.append(data)
    return result


def archive_task(repo: Path, task_id: str) -> Path:
    source = task_dir(repo, task_id)
    data = read_json(source / "task.json")
    if data.get("status") != "completed":
        raise WorkflowError("Task must be completed before archive")
    month = datetime.now().strftime("%Y-%m")
    destination = tasks_dir(repo) / "archive" / month / task_id
    if destination.exists():
        raise WorkflowError(f"Archive destination exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    data["status"] = "archived"
    data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    atomic_write_json(source / "task.json", data)
    shutil.move(str(source), str(destination))
    clear_task_sessions(repo, task_id)
    return destination
