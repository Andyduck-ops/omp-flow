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
    target = tasks_dir(repo) / task_id
    if not target.is_dir():
        raise WorkflowError(f"Task not found: {task_id}")
    return target
