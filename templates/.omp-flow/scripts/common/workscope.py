from __future__ import annotations

import json
import os
import subprocess
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .io import WorkflowError, atomic_write_text


MARKER_VERSION = 1
MARKER_NAME = "workscope.json"
_MARKER_KEYS = {"version", "taskId", "workspaceRoot"}


@dataclass(frozen=True)
class WorkScope:
    """The only durable authority for selecting a Task and its code boundary."""

    task_id: str
    workspace_root: Path

    def as_dict(self) -> dict[str, Any]:
        return {
            "taskId": self.task_id,
            "workspaceRoot": str(self.workspace_root),
        }


def _git_value(workspace: Path, *arguments: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(workspace), "rev-parse", *arguments],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip()
        suffix = f": {detail}" if detail else ""
        raise WorkflowError(f"Workspace is not an existing Git worktree: {workspace}{suffix}")
    return result.stdout.strip()


def _canonical_input(value: str | Path, base: Path) -> Path:
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = base / candidate
    try:
        return candidate.resolve(strict=True)
    except (FileNotFoundError, RuntimeError) as exc:
        raise WorkflowError(f"Workspace does not exist: {candidate}") from exc


def _git_worktree(path: str | Path, *, base: Path) -> tuple[Path, Path]:
    candidate = _canonical_input(path, base)
    if not candidate.is_dir():
        raise WorkflowError(f"Workspace is not a directory: {candidate}")
    if _git_value(candidate, "--is-inside-work-tree") != "true":
        raise WorkflowError(f"Workspace is not an existing Git worktree: {candidate}")

    root_text = _git_value(candidate, "--show-toplevel")
    try:
        root = Path(root_text).resolve(strict=True)
    except (FileNotFoundError, RuntimeError) as exc:
        raise WorkflowError(f"Git worktree root does not exist: {root_text}") from exc
    if not root.is_dir():
        raise WorkflowError(f"Git worktree root is not a directory: {root}")

    common_text = _git_value(root, "--git-common-dir")
    common_path = Path(common_text)
    if not common_path.is_absolute():
        common_path = root / common_path
    try:
        common = common_path.resolve(strict=True)
    except (FileNotFoundError, RuntimeError) as exc:
        raise WorkflowError(f"Git common directory does not exist: {common_path}") from exc
    return root, common


def resolve_workspace(invoking_path: str | Path, workspace: str | Path | None = None) -> Path:
    """Resolve a supplied workspace and require it shares the invoking worktree's Git common dir."""

    invoking = _canonical_input(invoking_path, Path.cwd())
    if not invoking.is_dir():
        raise WorkflowError(f"Invoking workspace is not a directory: {invoking}")
    invoking_root, invoking_common = _git_worktree(invoking, base=Path.cwd())

    target_input: str | Path = workspace if workspace is not None else invoking_root
    target_root, target_common = _git_worktree(target_input, base=invoking)
    if target_common != invoking_common:
        raise WorkflowError(
            "Workspace must be an existing Git worktree sharing the invoking worktree's Git common directory"
        )
    return target_root


def _tasks_root(workspace_root: Path) -> Path:
    try:
        flow_root = (workspace_root / ".omp-flow").resolve(strict=True)
    except (FileNotFoundError, RuntimeError) as exc:
        raise WorkflowError(f"Required .omp-flow directory not found: {workspace_root / '.omp-flow'}") from exc
    try:
        flow_root.relative_to(workspace_root)
    except ValueError as exc:
        raise WorkflowError("Workspace .omp-flow path escapes the Git worktree") from exc
    if not flow_root.is_dir():
        raise WorkflowError(f"Required .omp-flow directory not found: {flow_root}")
    try:
        tasks_root = (flow_root / "tasks").resolve(strict=True)
    except (FileNotFoundError, RuntimeError) as exc:
        raise WorkflowError(f"Required task root not found: {flow_root / 'tasks'}") from exc
    if tasks_root.parent != flow_root:
        raise WorkflowError("Workspace task root escapes the Git worktree")
    if not tasks_root.is_dir():
        raise WorkflowError(f"Required task root not found: {tasks_root}")
    return tasks_root


def resolve_task(workspace_root: Path, task_id: str) -> WorkScope:
    """Validate a direct child Bundle and return its canonical WorkScope."""

    if not isinstance(task_id, str) or not task_id or task_id != task_id.strip():
        raise WorkflowError("Task id must be a non-empty direct Bundle name")
    if task_id in {".", ".."} or "/" in task_id or "\\" in task_id:
        raise WorkflowError(f"Task path escapes task root: {task_id}")
    tasks_root = _tasks_root(workspace_root)
    try:
        target = (tasks_root / task_id).resolve(strict=True)
    except FileNotFoundError:
        target = (tasks_root / task_id).resolve()
    except RuntimeError as exc:
        raise WorkflowError(f"Task path escapes task root: {task_id}") from exc
    if target.parent != tasks_root:
        raise WorkflowError(f"Task path escapes task root: {task_id}")
    if not target.is_dir():
        raise WorkflowError(
            f"Task not found: {task_id}. Run `task list` or provide an explicit Task/workspace pair."
        )
    index = target / "index.md"
    if not index.is_file():
        raise WorkflowError(f"Required Bundle entry not found: {index}")
    try:
        if index.resolve(strict=True).parent != target:
            raise WorkflowError(f"Task index escapes Bundle root: {index}")
    except (FileNotFoundError, RuntimeError) as exc:
        raise WorkflowError(f"Required Bundle entry not found: {index}") from exc
    return WorkScope(task_id, workspace_root)


def marker_path(workspace_root: Path) -> Path:
    return workspace_root / ".omp-flow" / ".runtime" / MARKER_NAME


def _lock_descriptor(descriptor: int, *, blocking: bool) -> bool:
    if os.name == "nt":
        import msvcrt

        os.lseek(descriptor, 0, os.SEEK_SET)
        try:
            mode = msvcrt.LK_LOCK if blocking else msvcrt.LK_NBLCK
            msvcrt.locking(descriptor, mode, 1)
        except OSError:
            return False
        return True
    import fcntl

    try:
        mode = fcntl.LOCK_EX if blocking else fcntl.LOCK_EX | fcntl.LOCK_NB
        fcntl.flock(descriptor, mode)
    except OSError:
        return False
    return True


@contextmanager
def marker_lock(workspace_root: Path):
    """Serialize marker replacement with archive's conditional marker removal."""

    runtime = workspace_root / ".omp-flow" / ".runtime"
    if runtime.is_symlink() or (runtime.exists() and not runtime.is_dir()):
        raise WorkflowError(f"Workspace marker directory is invalid: {runtime}")
    runtime.mkdir(parents=True, exist_ok=True)
    locks = runtime / "locks"
    if locks.is_symlink() or (locks.exists() and not locks.is_dir()):
        raise WorkflowError(f"Workspace marker lock directory is invalid: {locks}")
    locks.mkdir(parents=True, exist_ok=True)
    path = locks / "workscope.lock"
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise WorkflowError(f"Workspace marker lock path is invalid: {path}")
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    if not _lock_descriptor(descriptor, blocking=True):
        os.close(descriptor)
        raise WorkflowError("WorkScope marker is busy")
    try:
        yield
    finally:
        if os.name == "nt":
            import msvcrt

            os.lseek(descriptor, 0, os.SEEK_SET)
            try:
                msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
        else:
            import fcntl

            fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def _marker_value(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        raw = path.read_text(encoding="utf-8")
        value = json.loads(raw)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(value, dict) or set(value) != _MARKER_KEYS:
        return None
    if value.get("version") != MARKER_VERSION or isinstance(value.get("version"), bool):
        return None
    if not isinstance(value.get("taskId"), str) or not isinstance(value.get("workspaceRoot"), str):
        return None
    return value


def read_marker(workspace_root: Path) -> WorkScope | None:
    path = marker_path(workspace_root)
    runtime = path.parent
    if (
        runtime.is_symlink()
        or (runtime.exists() and not runtime.is_dir())
        or path.is_symlink()
    ):
        return None
    value = _marker_value(path)
    if value is None:
        return None
    stored_root = value["workspaceRoot"]
    if not Path(stored_root).is_absolute() or stored_root != str(workspace_root):
        return None
    try:
        return resolve_task(workspace_root, value["taskId"])
    except WorkflowError:
        return None


def resolve_workscope(
    invoking_path: str | Path,
    task_id: str | None = None,
    workspace: str | Path | None = None,
) -> WorkScope:
    """Resolve an explicit pair, or a valid local marker when Task input is omitted."""

    target_root = resolve_workspace(invoking_path, workspace)
    if task_id is not None:
        return resolve_task(target_root, task_id)
    marker = read_marker(target_root)
    if marker is None:
        raise WorkflowError(
            "No valid local WorkScope. Run `task open <task> [--workspace <path>]` "
            "or provide an explicit Task/workspace pair."
        )
    return marker


def open_workscope(
    invoking_path: str | Path,
    task_id: str,
    workspace: str | Path | None = None,
    *,
    replace: bool = False,
) -> WorkScope:
    """Validate a pair, then atomically create or replace only its local marker."""

    scope = resolve_workscope(invoking_path, task_id, workspace)
    path = marker_path(scope.workspace_root)
    with marker_lock(scope.workspace_root):
        if path.exists():
            existing = read_marker(scope.workspace_root)
            if existing is not None and existing == scope:
                return scope
            if not replace:
                raise WorkflowError(
                    "A different or invalid local WorkScope marker already exists; "
                    "rerun `task open ... --replace` after validating the replacement"
                )
        payload = {
            "version": MARKER_VERSION,
            "taskId": scope.task_id,
            "workspaceRoot": str(scope.workspace_root),
        }
        atomic_write_text(
            path,
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        )
    return scope
