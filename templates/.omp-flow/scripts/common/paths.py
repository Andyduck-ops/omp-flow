from __future__ import annotations

from pathlib import Path

from .io import WorkflowError


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    while True:
        if (current / ".omp-flow").is_dir() or (current / ".git").exists():
            return current
        if current == current.parent:
            raise WorkflowError(f"Cannot find repository root from {start}")
        current = current.parent


def flow_dir(repo: Path) -> Path:
    return repo / ".omp-flow"


def tasks_dir(repo: Path) -> Path:
    return flow_dir(repo) / "tasks"


def task_dir(repo: Path, task_id: str) -> Path:
    if not isinstance(task_id, str) or not task_id or task_id != task_id.strip():
        raise WorkflowError("Task id must be a non-empty direct Bundle name")
    if task_id in {".", ".."} or "/" in task_id or "\\" in task_id:
        raise WorkflowError(f"Task path escapes task root: {task_id}")
    root = tasks_dir(repo).resolve()
    target = (root / task_id).resolve()
    if target.parent != root:
        raise WorkflowError(f"Task path escapes task root: {task_id}")
    if not target.is_dir():
        raise WorkflowError(
            f"Task not found: {task_id}. Run `task list` to see available tasks."
        )
    return target
