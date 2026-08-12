from __future__ import annotations

import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .io import WorkflowError, atomic_write_json, atomic_write_text, confined_path, read_json
from .paths import flow_dir


SLEEP_DESCRIPTOR_VERSION = 1
TERMINAL_STATES = {"completed", "failed"}


def _runtime_root(repo: Path) -> Path:
    return flow_dir(repo) / ".runtime" / "sleep"


def _source_path(repo: Path, receipt: str) -> Path:
    _validate_receipt(receipt)
    return _runtime_root(repo) / "sources" / f"{receipt}.json"


def _run_path(repo: Path, receipt: str) -> Path:
    _validate_receipt(receipt)
    return _runtime_root(repo) / "runs" / f"{receipt}.json"


def _run_lock(repo: Path, receipt: str) -> Path:
    return flow_dir(repo) / ".runtime" / "locks" / f"sleep-{receipt}.lock"


def _validate_receipt(receipt: str) -> None:
    if len(receipt) != 64 or any(character not in "0123456789abcdef" for character in receipt):
        raise WorkflowError(f"Invalid Sleep receipt: {receipt}")


def _git(repo: Path, *arguments: str) -> str:
    result = subprocess.run(
        ["git", *arguments],
        cwd=repo,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "Git command failed"
        raise WorkflowError(detail)
    return result.stdout.strip()


def _directory_digest(root: Path) -> str:
    if not root.is_dir():
        raise WorkflowError(f"Sleep source directory not found: {root}")
    digest = hashlib.sha256()
    entries = sorted(root.rglob("*"), key=lambda path: path.relative_to(root).as_posix())
    for path in entries:
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            raise WorkflowError(f"Sleep source contains unsupported symlink: {relative}")
        if not path.is_file():
            continue
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        with path.open("rb") as stream:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
        digest.update(b"\0")
    return digest.hexdigest()


def _skill_path(repo: Path) -> Path:
    candidates = (
        repo / ".agents" / "skills" / "omp-flow-sleep" / "SKILL.md",
        repo / ".omp" / "skills" / "omp-flow-sleep" / "SKILL.md",
        repo / ".claude" / "skills" / "omp-flow-sleep" / "SKILL.md",
    )
    for path in candidates:
        if path.is_file():
            return path
    raise WorkflowError("omp-flow-sleep Skill is not installed")


def _skill_revision(repo: Path) -> str:
    return hashlib.sha256(_skill_path(repo).read_bytes()).hexdigest()


def _git_task_snapshot(repo: Path, source: Path) -> tuple[str, str]:
    source_relative = source.resolve().relative_to(repo.resolve()).as_posix()
    commit = _git(repo, "rev-parse", "--verify", "HEAD")
    dirty = subprocess.run(
        ["git", "diff", "--quiet", commit, "--", source_relative],
        cwd=repo,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=False,
    )
    if dirty.returncode == 1:
        raise WorkflowError("Task Bundle differs from its Git checkpoint")
    if dirty.returncode != 0:
        raise WorkflowError(dirty.stderr.decode("utf-8", errors="replace").strip() or "Cannot inspect Task checkpoint")
    untracked = _git(repo, "ls-files", "--others", "--exclude-standard", "--", source_relative)
    if untracked:
        raise WorkflowError("Task Bundle contains untracked files")
    tree = _git(repo, "rev-parse", f"{commit}:{source_relative}")
    if _git(repo, "cat-file", "-t", tree) != "tree":
        raise WorkflowError("Task checkpoint is not a Git tree")
    return commit, tree


def prepare_sleep_source(
    repo: Path,
    task_id: str,
    source: Path,
    destination: Path,
) -> dict[str, Any]:
    archived_relative = destination.resolve().relative_to(repo.resolve()).as_posix()
    try:
        commit, tree = _git_task_snapshot(repo, source)
        archive_digest = _directory_digest(source)
        receipt = hashlib.sha256(
            f"{task_id}\0{commit}\0{tree}\0{archive_digest}".encode("utf-8")
        ).hexdigest()
        return {
            "ready": True,
            "receipt": receipt,
            "taskId": task_id,
            "sourcePath": source.resolve().relative_to(repo.resolve()).as_posix(),
            "archivedPath": archived_relative,
            "sourceCommit": commit,
            "sourceTree": tree,
            "archiveDigest": archive_digest,
        }
    except (OSError, ValueError, WorkflowError) as exc:
        return {
            "ready": False,
            "taskId": task_id,
            "archivedPath": archived_relative,
            "reason": str(exc),
        }


def finalize_sleep_source(repo: Path, prepared: dict[str, Any], destination: Path) -> dict[str, Any]:
    if not prepared.get("ready"):
        return prepared
    try:
        if _directory_digest(destination) != prepared.get("archiveDigest"):
            raise WorkflowError("Archived Task content changed during relocation")
        receipt = str(prepared["receipt"])
        record = {
            **prepared,
            "state": "ready",
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        path = _source_path(repo, receipt)
        if path.exists():
            existing = read_json(path)
            stable_fields = ("taskId", "sourceCommit", "sourceTree", "archiveDigest", "archivedPath")
            if any(existing.get(field) != record.get(field) for field in stable_fields):
                raise WorkflowError(f"Sleep source receipt collision: {receipt}")
            return existing
        atomic_write_json(path, record)
        return record
    except (OSError, ValueError, WorkflowError) as exc:
        return {
            "ready": False,
            "taskId": prepared.get("taskId"),
            "archivedPath": prepared.get("archivedPath"),
            "reason": str(exc),
        }


def read_sleep_source(repo: Path, receipt: str) -> dict[str, Any]:
    value = read_json(_source_path(repo, receipt))
    if value.get("receipt") != receipt or value.get("state") != "ready":
        raise WorkflowError(f"Sleep source identity mismatch: {receipt}")
    return value


def _ensure_sleep_root(repo: Path) -> None:
    root = flow_dir(repo) / "sleep"
    index = root / "index.md"
    if not index.exists():
        atomic_write_text(
            index,
            "---\nokf_version: \"0.2\"\n---\n\n# Wiki Sleep\n\n"
            "Candidate knowledge awaiting review and possible Wiki promotion belongs here.\n",
        )
    (root / "candidates").mkdir(parents=True, exist_ok=True)
    (root / "runs").mkdir(parents=True, exist_ok=True)


def _archived_root(repo: Path, source: dict[str, Any]) -> Path:
    archived = confined_path(repo, str(source["archivedPath"]))
    archive_root = (flow_dir(repo) / "tasks" / "archive").resolve()
    try:
        archived.relative_to(archive_root)
    except ValueError as exc:
        raise WorkflowError("Sleep source escapes the Task archive") from exc
    if not archived.is_dir() or not (archived / "index.md").is_file():
        raise WorkflowError("Archived Sleep source or Bundle index is missing")
    return archived


def _verify_source_content(repo: Path, source: dict[str, Any]) -> Path:
    archived = _archived_root(repo, source)
    if _directory_digest(archived) != source.get("archiveDigest"):
        raise WorkflowError("Archived Sleep source has drifted from its receipt")
    return archived


def _sleep_assignment(run: dict[str, Any]) -> str:
    descriptor = {
        "ompFlowSleep": {
            "version": SLEEP_DESCRIPTOR_VERSION,
            "sourceReceipt": run["sourceReceipt"],
            "sourceTask": run["sourceTask"],
            "sourceCommit": run["sourceCommit"],
            "sourceTree": run["sourceTree"],
            "entry": run["entry"],
            "sleepIndex": run["sleepIndex"],
            "runOutput": run["runOutput"],
            "candidateRoot": run["candidateRoot"],
            "actorId": run["actorId"],
            "receipt": run["receipt"],
            "harvesterRevision": run["harvesterRevision"],
        }
    }
    first_line = json.dumps(descriptor, ensure_ascii=False, separators=(",", ":"))
    return (
        f"{first_line}\n\n"
        f"Archived Task: {run['sourceTask']}\n"
        f"Entry Concept: {run['entry']}\n"
        f"Sleep index: {run['sleepIndex']}\n"
        f"Run output: {run['runOutput']}\n"
        f"Candidate root: {run['candidateRoot']}\n"
        f"Actor ID: {run['actorId']}\n"
        f"Sleep receipt: {run['receipt']}\n"
    )


def start_sleep_run(repo: Path, source_receipt: str, actor_id: str) -> dict[str, Any]:
    cleaned_actor = actor_id.strip()
    if not cleaned_actor:
        raise WorkflowError("Sleep actor identity is required")
    source = read_sleep_source(repo, source_receipt)
    archived = _verify_source_content(repo, source)
    harvester_revision = _skill_revision(repo)
    receipt = hashlib.sha256(
        f"{source_receipt}\0{harvester_revision}".encode("utf-8")
    ).hexdigest()
    lock = _acquire_run_lock(repo, receipt)
    try:
        month = Path(str(source["archivedPath"])).parent.name
        run_directory = (
            flow_dir(repo)
            / "sleep"
            / "runs"
            / month
            / f"{source['taskId']}--{str(source['sourceTree'])[:12]}--{harvester_revision[:12]}"
        )
        run_output = run_directory / "receipt.md"
        if _run_path(repo, receipt).exists() or run_output.exists():
            raise WorkflowError(f"Sleep run already exists: {receipt}")
        _ensure_sleep_root(repo)
        now = datetime.now(timezone.utc).isoformat()
        run = {
            "receipt": receipt,
            "sourceReceipt": source_receipt,
            "sourceTask": archived.relative_to(repo.resolve()).as_posix(),
            "sourceCommit": source["sourceCommit"],
            "sourceTree": source["sourceTree"],
            "archiveDigest": source["archiveDigest"],
            "entry": (archived / "index.md").relative_to(repo.resolve()).as_posix(),
            "sleepIndex": ".omp-flow/sleep/index.md",
            "runOutput": run_output.relative_to(repo.resolve()).as_posix(),
            "candidateRoot": ".omp-flow/sleep/candidates",
            "actorId": cleaned_actor,
            "harvesterRevision": harvester_revision,
            "state": "active",
            "candidates": [],
            "createdAt": now,
            "updatedAt": now,
        }
        run["assignment"] = _sleep_assignment(run)
        atomic_write_json(_run_path(repo, receipt), run)
        return {"run": run, "assignment": run["assignment"]}
    finally:
        _release_run_lock(lock)


def read_sleep_run(repo: Path, receipt: str) -> dict[str, Any]:
    value = read_json(_run_path(repo, receipt))
    if value.get("receipt") != receipt:
        raise WorkflowError(f"Sleep run identity mismatch: {receipt}")
    return value


def list_sleep_runs(repo: Path) -> list[dict[str, Any]]:
    root = _runtime_root(repo) / "runs"
    if not root.is_dir():
        return []
    return [read_sleep_run(repo, path.stem) for path in sorted(root.glob("*.json"))]


def _lock_descriptor(descriptor: int) -> bool:
    if os.name == "nt":
        import msvcrt

        # Locking beyond EOF is explicitly allowed; touching the byte before
        # locking could hit a live holder's lock and raise PermissionError.
        os.lseek(descriptor, 0, os.SEEK_SET)
        try:
            msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
        except OSError:
            return False
        return True
    import fcntl

    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return False
    return True


def _acquire_run_lock(repo: Path, receipt: str) -> int:
    """Hold an OS-level exclusive lock for the receipt's critical section.

    The descriptor stays open until _release_run_lock. The OS releases the
    lock on close, process exit, or kill, so a crashed or stopped holder can
    never strand a receipt and no stale-lock reclaimer is needed. Lock files
    are permanent rendezvous points and are never deleted.
    """
    _validate_receipt(receipt)
    path = _run_lock(repo, receipt)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    if not _lock_descriptor(descriptor):
        os.close(descriptor)
        raise WorkflowError(f"Sleep run is busy: {receipt}")
    return descriptor


def _release_run_lock(descriptor: int) -> None:
    os.close(descriptor)


def finish_sleep_run(
    repo: Path,
    receipt: str,
    *,
    state: str,
    actor_id: str,
    candidates: list[str],
) -> dict[str, Any]:
    if state not in TERMINAL_STATES:
        raise WorkflowError(f"Invalid terminal Sleep state: {state}")
    cleaned_actor = actor_id.strip()
    if not cleaned_actor:
        raise WorkflowError("Sleep actor identity is required")
    lock = _acquire_run_lock(repo, receipt)
    try:
        run = read_sleep_run(repo, receipt)
        if run.get("state") != "active":
            raise WorkflowError(f"Sleep run is already terminal: {receipt}")
        if run.get("actorId") != cleaned_actor:
            raise WorkflowError("Sleep actor identity mismatch")
        output_paths: list[str] = []
        if state == "completed":
            source = read_sleep_source(repo, str(run["sourceReceipt"]))
            _verify_source_content(repo, source)
            run_output = confined_path(repo, str(run["runOutput"]))
            if not run_output.is_file():
                raise WorkflowError("Sleep run receipt output is missing")
            candidate_root = confined_path(repo, str(run["candidateRoot"]))
            seen: set[str] = set()
            for value in candidates:
                candidate = confined_path(candidate_root, value)
                try:
                    relative = candidate.relative_to(candidate_root.resolve()).as_posix()
                except ValueError as exc:
                    raise WorkflowError(f"Sleep candidate escapes candidate root: {value}") from exc
                if candidate.suffix.lower() != ".md" or not candidate.is_file():
                    raise WorkflowError(f"Sleep candidate Markdown not found: {value}")
                if relative in seen:
                    raise WorkflowError(f"Duplicate Sleep candidate output: {value}")
                seen.add(relative)
                output_paths.append(candidate.relative_to(repo.resolve()).as_posix())
        elif candidates:
            raise WorkflowError("Failed Sleep run cannot claim candidate outputs")
        run.pop("assignment", None)
        run["state"] = state
        run["candidates"] = output_paths
        run["updatedAt"] = datetime.now(timezone.utc).isoformat()
        atomic_write_json(_run_path(repo, receipt), run)
        return run
    finally:
        _release_run_lock(lock)
