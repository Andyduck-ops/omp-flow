from __future__ import annotations

import json
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from .active_task import clear_task_sessions, set_active_task
from .io import WorkflowError, atomic_write_text
from .paths import task_dir, tasks_dir


def _slug(value: str) -> str:
    pieces: list[str] = []
    separator = False
    for character in value.lower():
        if character.isascii() and character.isalnum():
            if separator and pieces:
                pieces.append("-")
            pieces.append(character)
            separator = False
        else:
            separator = True
    slug = "".join(pieces).strip("-")[:48].rstrip("-")
    return slug or "untitled-task"


def build_task_id(title: str, slug: str | None = None, now: datetime | None = None) -> str:
    stamp = now or datetime.now()
    base = _slug(slug or title)
    if slug is not None:
        # Explicit slugs may already carry a date prefix; avoid doubling it.
        parts = base.split("-", 2)
        if len(parts) == 3 and all(len(part) == 2 and part.isdigit() for part in parts[:2]):
            base = parts[2]
    return f"{stamp.month:02d}-{stamp.day:02d}-{base}"


def _concept(concept_type: str, title: str, body: str) -> str:
    return (
        "---\n"
        f"type: {json.dumps(concept_type, ensure_ascii=False)}\n"
        f"title: {json.dumps(title, ensure_ascii=False)}\n"
        "---\n\n"
        f"# {title}\n\n"
        f"{body.rstrip()}\n"
    )


def _bundle_index(title: str) -> str:
    return (
        '---\nokf_version: "0.2"\n---\n\n'
        f"# {title}\n\n"
        "- [Task](task.md) — purpose and durable task identity.\n"
        "- [Brainstorm](brainstorm.md) — questions, hypotheses, and reframing.\n\n"
        "Add and link Concepts as the task grows. This index is navigation, not a closed manifest.\n"
    )


def create_task(
    repo: Path,
    title: str,
    *,
    slug: str | None = None,
    parent: str | None = None,
    no_start: bool = False,
) -> dict[str, Any]:
    task_id = build_task_id(title, slug)
    target = tasks_dir(repo) / task_id
    if target.exists():
        raise WorkflowError(f"Task already exists: {task_id}")

    parent_text = ""
    if parent:
        task_dir(repo, parent)
        parent_text = f"\n\nParent: [{parent}](../{parent}/index.md)"

    tasks_dir(repo).mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f".{task_id}.", dir=tasks_dir(repo)))
    try:
        atomic_write_text(temporary / "index.md", _bundle_index(title))
        atomic_write_text(
            temporary / "task.md",
            _concept(
                "Task",
                title,
                f"Task directory: `{task_id}`.{parent_text}",
            ),
        )
        atomic_write_text(
            temporary / "brainstorm.md",
            _concept(
                "Brainstorm",
                f"Brainstorm: {title}",
                "Capture questions, hypotheses, alternatives, and reframing here or in linked Concepts.",
            ),
        )
        temporary.replace(target)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise

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
            if (path / "index.md").is_file():
                result.append({"id": path.name, "taskDir": str(path)})
    return result


def archive_task(repo: Path, task_id: str) -> tuple[Path, dict[str, Any]]:
    source = task_dir(repo, task_id)
    from .operation_store import has_active_operations
    from .sleep_store import finalize_sleep_source, prepare_sleep_source

    if has_active_operations(repo, task_id):
        raise WorkflowError("Task has active runtime operations")
    month = datetime.now().strftime("%Y-%m")
    destination = tasks_dir(repo) / "archive" / month / task_id
    if destination.exists():
        raise WorkflowError(f"Archive destination exists: {destination}")
    sleep_source = prepare_sleep_source(repo, task_id, source, destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    source.replace(destination)
    clear_task_sessions(repo, task_id)
    return destination, finalize_sleep_source(repo, sleep_source, destination)
