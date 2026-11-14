from __future__ import annotations

import hashlib
import html
import json
import os
import posixpath
import re
import stat
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from .io import WorkflowError, atomic_write_json, confined_path, read_json
from .paths import flow_dir
from .task_store import (
    BRIEF_FILENAME,
    SILENT_ACTIVE_STATUSES,
    extract_relative_markdown_links,
    inspect_wiki_diagnostics,
    parse_frontmatter,
    refresh_wiki_indexes,
)


SLEEP_DESCRIPTOR_VERSION = 2
BRIEF_CHAR_LIMIT = 2_000
MAX_ASSIGNMENT_DIAGNOSTICS = 25
# Four bytes per character bounds the read before decoding brief.md.
BRIEF_BYTE_LIMIT = BRIEF_CHAR_LIMIT * 4
TERMINAL_STATES = {"completed", "failed"}
WIKI_ROOT = ".omp-flow/wiki"
NEW_CONCEPT_STATUSES = frozenset({"draft", "conflict"})
NEW_DECISION_STATUSES = frozenset({"proposed", "accepted", "draft", "conflict"})
BASELINE_FIELDS = (
    "specsDigest",
    "preExistingWikiPaths",
    "preExistingTrustedWiki",
    "preExistingWikiDigests",
)


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
    (flow_dir(repo) / "sleep" / "runs").mkdir(parents=True, exist_ok=True)
    (flow_dir(repo) / "wiki").mkdir(parents=True, exist_ok=True)


def _wiki_root(repo: Path) -> Path:
    return flow_dir(repo) / "wiki"


def _lexical_parts(value: str) -> list[str] | None:
    """Split a relative POSIX path lexically; None when it is absolute or climbs above its base."""
    text = value.replace("\\", "/")
    if not text or text.startswith("/") or (len(text) > 1 and text[1] == ":"):
        return None
    normalized = posixpath.normpath(text)
    if normalized in (".", "..") or normalized.startswith("../"):
        return None
    return normalized.split("/")


def _lstat_regular(repo: Path, parts: list[str]) -> os.stat_result | None:
    """lstat every component below repo before any resolve(); reject symlinks at any level.

    Returns the final component's stat when it is a regular file, None when any component is
    missing. A symlink or non-directory intermediate component raises WorkflowError.
    """
    current = repo
    info: os.stat_result | None = None
    for index, part in enumerate(parts):
        current = current / part
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            return None
        except OSError as exc:
            raise WorkflowError(f"Cannot inspect {'/'.join(parts)}: {exc.strerror or exc}") from exc
        if stat.S_ISLNK(info.st_mode):
            raise WorkflowError(f"Symbolic link is not allowed: {'/'.join(parts[: index + 1])}")
        if index < len(parts) - 1 and not stat.S_ISDIR(info.st_mode):
            return None
    if info is None or not stat.S_ISREG(info.st_mode):
        return None
    return info


def _wiki_parts(rel: str) -> list[str]:
    return [".omp-flow", "wiki", *rel.split("/")]


def _is_map_name(rel: str) -> bool:
    return posixpath.basename(rel) in ("index.md", "log.md")


def _lf_text(raw: bytes) -> str:
    return raw.decode("utf-8").replace("\r\n", "\n")


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _normalized_concept_sha256(text: str, *, source_path: str, archived_path: str) -> str:
    """CRLF-normalize and rewrite the archived Task path back to its pre-archive path.

    Wiki pages link to Tasks without the `.omp-flow/` prefix (`../../tasks/<id>/...`), so the
    prefix-stripped pair is rewritten as well. Repairing an inbound link to the just-archived Task
    keeps the digest; any other body change alters it.
    """
    normalized = text.replace("\r\n", "\n")
    if source_path and archived_path:
        normalized = normalized.replace(archived_path, source_path)
        prefix = ".omp-flow/"
        src_sub = source_path[len(prefix) :] if source_path.startswith(prefix) else source_path
        arch_sub = archived_path[len(prefix) :] if archived_path.startswith(prefix) else archived_path
        if src_sub and arch_sub:
            normalized = normalized.replace(arch_sub, src_sub)
    return _sha256_text(normalized)


def _walk_wiki(root: Path) -> list[tuple[str, Path, bool]]:
    """Return sorted (POSIX rel, path, is_symlink) for every entry under root without following links."""
    entries: list[tuple[str, Path, bool]] = []
    for directory, dirnames, filenames in os.walk(root, followlinks=False):
        base = Path(directory)
        for name in dirnames + filenames:
            path = base / name
            entries.append((path.relative_to(root).as_posix(), path, path.is_symlink()))
    entries.sort(key=lambda entry: entry[0])
    return entries


def _specs_digest(repo: Path) -> str:
    """Deterministic SHA-256 of .omp-flow/wiki/specs/ except its generated root index.md."""
    specs = _wiki_root(repo) / "specs"
    if specs.is_symlink():
        raise WorkflowError("Wiki specs directory must not be a symbolic link")
    if not specs.is_dir():
        return hashlib.sha256(b"").hexdigest()
    digest = hashlib.sha256()
    for rel, path, is_link in _walk_wiki(specs):
        if rel == "index.md":
            continue
        if is_link:
            raise WorkflowError(f"Wiki specs contain unsupported symlink: specs/{rel}")
        if path.is_dir():
            digest.update(f"{rel}/".encode("utf-8"))
            digest.update(b"\0")
            continue
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _wiki_markdown(repo: Path) -> list[tuple[str, Path, bool]]:
    """Every non-map .md entry under .omp-flow/wiki as (rel, path, is_symlink)."""
    root = _wiki_root(repo)
    if root.is_symlink():
        raise WorkflowError("Wiki root must not be a symbolic link")
    if not root.is_dir():
        return []
    return [
        (rel, path, is_link)
        for rel, path, is_link in _walk_wiki(root)
        if rel.endswith(".md") and not _is_map_name(rel) and (is_link or path.is_file())
    ]


def _read_brief_sha256(repo: Path) -> str | None:
    try:
        info = _lstat_regular(repo, _wiki_parts(BRIEF_FILENAME))
        if info is None:
            return None
        return _sha256_text(_lf_text((repo / ".omp-flow" / "wiki" / BRIEF_FILENAME).read_bytes()))
    except (OSError, UnicodeDecodeError, WorkflowError):
        return None


def _snapshot_wiki_baseline(
    repo: Path, *, source_path: str, archived_path: str
) -> tuple[list[str], dict[str, dict[str, str]], str | None, dict[str, dict[str, str]]]:
    """Snapshot the Wiki before Sleep edits it.

    Returns (preExistingWikiPaths, preExistingTrustedWiki, preExistingBriefSha256,
    preExistingWikiDigests). Paths include every non-map .md entry, symlinks too, so a symlink
    that already existed is not mistaken for a new Concept; symlinks are never trusted or digested.
    """
    paths: list[str] = []
    trusted: dict[str, dict[str, str]] = {}
    digests: dict[str, dict[str, str]] = {}
    for rel, path, is_link in _wiki_markdown(repo):
        paths.append(rel)
        if is_link or rel == BRIEF_FILENAME or rel.split("/", 1)[0] == "archive":
            continue
        try:
            text = _lf_text(path.read_bytes())
        except (OSError, UnicodeDecodeError):
            continue
        raw_status = parse_frontmatter(text)["raw_status"]
        record = {
            "sha256": _sha256_text(text),
            "normSha256": _normalized_concept_sha256(
                text, source_path=source_path, archived_path=archived_path
            ),
            "status": raw_status,
        }
        digests[rel] = record
        in_specs = rel.startswith("specs/")
        if raw_status in ("stable", "accepted") or (
            in_specs and raw_status in SILENT_ACTIVE_STATUSES
        ):
            trusted[rel] = dict(record)
    return paths, trusted, _read_brief_sha256(repo), digests


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


def _diagnostics_block(diagnostics: list[str]) -> str:
    total = len(diagnostics)
    if total == 0:
        return "Wiki diagnostics: none\n"
    lines = [f"Wiki diagnostics ({total}):"]
    lines.extend(f"- {warning}" for warning in diagnostics[:MAX_ASSIGNMENT_DIAGNOSTICS])
    if total > MAX_ASSIGNMENT_DIAGNOSTICS:
        lines.append(
            f"- ... and {total - MAX_ASSIGNMENT_DIAGNOSTICS} more (run omp_flow.py index wiki)"
        )
    return "\n".join(lines) + "\n"


def _sleep_assignment(run: dict[str, Any], diagnostics: list[str]) -> str:
    descriptor = {
        "ompFlowSleep": {
            "version": SLEEP_DESCRIPTOR_VERSION,
            "sourceReceipt": run["sourceReceipt"],
            "sourceTask": run["sourceTask"],
            "sourceCommit": run["sourceCommit"],
            "sourceTree": run["sourceTree"],
            "entry": run["entry"],
            "wikiRoot": run["wikiRoot"],
            "wikiIndex": run["wikiIndex"],
            "wikiBrief": run["wikiBrief"],
            "runOutput": run["runOutput"],
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
        f"Wiki root: {run['wikiRoot']}\n"
        f"Wiki index: {run['wikiIndex']}\n"
        f"Wiki brief: {run['wikiBrief']}\n"
        f"Run output: {run['runOutput']}\n"
        f"Actor ID: {run['actorId']}\n"
        f"Sleep receipt: {run['receipt']}\n"
        f"{_diagnostics_block(diagnostics)}"
    )


def start_sleep_run(repo: Path, source_receipt: str, actor_id: str) -> dict[str, Any]:
    # Resolve once: on Windows an unresolved root may be an 8.3 short path that never matches the
    # resolved one, so every path below must be derived from the same base.
    repo = repo.resolve()
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
        specs_digest = _specs_digest(repo)
        paths, trusted, brief_sha256, digests = _snapshot_wiki_baseline(
            repo,
            source_path=str(source.get("sourcePath", "")),
            archived_path=str(source["archivedPath"]),
        )
        _ensure_sleep_root(repo)
        diagnostics = inspect_wiki_diagnostics(repo)
        now = datetime.now(timezone.utc).isoformat()
        run = {
            "receipt": receipt,
            "sourceReceipt": source_receipt,
            "sourceTask": archived.relative_to(repo).as_posix(),
            "sourceCommit": source["sourceCommit"],
            "sourceTree": source["sourceTree"],
            "archiveDigest": source["archiveDigest"],
            "entry": (archived / "index.md").relative_to(repo).as_posix(),
            "wikiRoot": WIKI_ROOT,
            "wikiIndex": f"{WIKI_ROOT}/index.md",
            "wikiBrief": f"{WIKI_ROOT}/{BRIEF_FILENAME}",
            "runOutput": run_output.relative_to(repo).as_posix(),
            "actorId": cleaned_actor,
            "harvesterRevision": harvester_revision,
            "state": "active",
            "wikiOutputs": [],
            "specsDigest": specs_digest,
            "preExistingWikiPaths": paths,
            "preExistingTrustedWiki": trusted,
            "preExistingWikiDigests": digests,
            "preExistingBriefSha256": brief_sha256,
            "createdAt": now,
            "updatedAt": now,
        }
        run["assignment"] = _sleep_assignment(run, diagnostics)
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
    runs = [read_sleep_run(repo, path.stem) for path in root.glob("*.json")]
    return sorted(runs, key=lambda run: (str(run.get("createdAt", "")), str(run.get("receipt", ""))))


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


def _body_without_frontmatter(text: str) -> str:
    lines = text.split("\n")
    if lines and lines[0].strip() == "---":
        for index in range(1, len(lines)):
            if lines[index].strip() in ("---", "..."):
                return "\n".join(lines[index + 1 :])
    return text


def _read_wiki_concept(repo: Path, rel: str) -> str:
    try:
        return _lf_text((_wiki_root(repo) / rel).read_bytes())
    except (OSError, UnicodeDecodeError) as exc:
        raise WorkflowError(f"Wiki Concept is unreadable: {WIKI_ROOT}/{rel}") from exc


def _verify_run_output(repo: Path, run: dict[str, Any]) -> None:
    value = str(run["runOutput"])
    parts = _lexical_parts(value)
    if parts is None:
        raise WorkflowError(f"Sleep run receipt output escapes the repository: {value}")
    confined_path(repo, value)
    if not value.endswith(".md") or _lstat_regular(repo, parts) is None:
        raise WorkflowError("Sleep run receipt output is missing")


def _verify_wiki_outputs(repo: Path, wiki_outputs: list[str]) -> list[str]:
    output_paths: list[str] = []
    seen: set[str] = set()
    for value in wiki_outputs:
        parts = _lexical_parts(value)
        if parts is None:
            raise WorkflowError(f"Wiki output escapes {WIKI_ROOT}: {value}")
        rel = "/".join(parts)
        if _is_map_name(rel) or parts[0] in ("specs", "archive"):
            raise WorkflowError(f"Wiki output is not a Sleep-editable Concept: {value}")
        if not rel.endswith(".md") or _lstat_regular(repo, _wiki_parts(rel)) is None:
            raise WorkflowError(f"Wiki output Markdown not found: {value}")
        confined_path(_wiki_root(repo), rel)
        if rel in seen:
            raise WorkflowError(f"Duplicate Wiki output: {value}")
        seen.add(rel)
        output_paths.append(f"{WIKI_ROOT}/{rel}")
    return output_paths


def _verify_new_concepts(repo: Path, run: dict[str, Any]) -> None:
    pre_existing = set(run["preExistingWikiPaths"])
    for rel, _, is_link in _wiki_markdown(repo):
        if rel in pre_existing or rel == BRIEF_FILENAME:
            continue
        if is_link:
            raise WorkflowError(f"New Wiki symbolic link is not allowed: {WIKI_ROOT}/{rel}")
        raw_status = parse_frontmatter(_read_wiki_concept(repo, rel))["raw_status"]
        allowed = NEW_DECISION_STATUSES if rel.split("/", 1)[0] == "decisions" else NEW_CONCEPT_STATUSES
        if raw_status not in allowed:
            raise WorkflowError(
                f"New Wiki Concept {WIKI_ROOT}/{rel} must start with status in "
                f"{sorted(allowed)}, not '{raw_status}'"
            )


# Any syntax that links a Concept must name its .md path. A changed brief may therefore mention a
# .md path outside a checked inline [text](target) link only when that path does not resolve, from
# any base a reader or renderer may use, to a Wiki Concept that was untrusted before this Sleep run.
# A trailing "_" still ends a .md mention, because _path.md_ renders as italic path.md.
_BRIEF_MD_END = re.compile(r"\.md(?![A-Za-z0-9-])", re.IGNORECASE)
# Relative bases: brief.md's directory (the Wiki root), the repository root, and the Wiki root's
# parent, where wiki/... names the Wiki root itself.
_BRIEF_RELATIVE_BASES = (WIKI_ROOT, "", posixpath.dirname(WIKI_ROOT))
_BRIEF_TOKEN_STOP = frozenset("\n()<>[]\"'`")
_BRIEF_WORD_STOP = _BRIEF_TOKEN_STOP | frozenset(" \t\r")
_BRIEF_PATH_CHARS = frozenset("./-~+%")
_BRIEF_URL = re.compile(
    r"^(?:[A-Za-z][A-Za-z0-9+.-]*://|(?:mailto|tel|sms|urn|data|javascript):)", re.IGNORECASE
)
_BRIEF_ESCAPE = re.compile(r"\\([!-/:-@\[-`{-~])")


def _brief_decodings(value: str) -> set[str]:
    """Return the value as written and as entity, percent, and escape decoding can render it.

    Each form is also kept with ASCII tab, CR, and LF removed, as a URL parser does.
    """
    unescaped = html.unescape(value)
    forms = {value, unescaped, unquote(value), unquote(unescaped)}
    forms |= {_BRIEF_ESCAPE.sub(r"\1", form) for form in forms}
    return forms | {re.sub(r"[\t\r\n]", "", form) for form in forms}


def _brief_md_candidates(rendering: str, end: int) -> list[str]:
    """Every path a .md mention ending at `end` can name, unless it is a real URL."""
    word_start = end
    while word_start > 0 and rendering[word_start - 1] not in _BRIEF_WORD_STOP:
        word_start -= 1
    if _BRIEF_URL.match(rendering[word_start:end]):
        return []
    start = end
    while start > 0 and rendering[start - 1] not in _BRIEF_TOKEN_STOP:
        start -= 1
    segment = rendering[start:end]
    return [
        segment[index:]
        for index in range(len(segment))
        if index == 0
        or not (segment[index - 1].isalnum() or segment[index - 1] in _BRIEF_PATH_CHARS)
    ]


def _brief_wiki_rels(repo: Path, candidate: str) -> list[str]:
    """Every Wiki-relative path `candidate` lands on from each base, including as an absolute path."""
    text = candidate.strip().replace("\\", "/")
    if not text:
        return []
    if text.startswith("/") or (len(text) > 1 and text[1] == ":"):
        normalized = posixpath.normpath(text).casefold()
        paths = []
        for root in {repo.as_posix(), repo.resolve().as_posix()}:
            prefix = root.rstrip("/").casefold() + "/"
            if normalized.startswith(prefix):
                paths.append(normalized[len(prefix):])
    else:
        paths = [posixpath.normpath(posixpath.join(base, text)) for base in _BRIEF_RELATIVE_BASES]
    wiki_prefix = WIKI_ROOT.casefold() + "/"
    return [path[len(wiki_prefix):] for path in paths if path.casefold().startswith(wiki_prefix)]


def _verify_brief_md_paths(
    repo: Path, run: dict[str, Any], text: str, links: list[tuple[int, str]]
) -> None:
    trusted: dict[str, Any] = run["preExistingTrustedWiki"]
    untrusted = {
        rel.casefold(): rel
        for rel, _, _ in _wiki_markdown(repo)
        if rel not in trusted and rel != BRIEF_FILENAME
    }
    if not untrusted:
        return
    allowed: set[str] = set()
    for _, raw_target in links:
        allowed |= _brief_decodings(raw_target.split("#", 1)[0])
    for rendering in _brief_decodings(text):
        for found in _BRIEF_MD_END.finditer(rendering):
            for candidate in _brief_md_candidates(rendering, found.end()):
                if candidate in allowed:
                    continue
                rel = next(
                    (
                        untrusted[landed.casefold()]
                        for landed in _brief_wiki_rels(repo, candidate)
                        if landed.casefold() in untrusted
                    ),
                    None,
                )
                if rel is None:
                    continue
                raise WorkflowError(
                    f"Changed {WIKI_ROOT}/{BRIEF_FILENAME} names {candidate.strip()!r} "
                    f"({WIKI_ROOT}/{rel}) outside a checked inline [text](target) link; it may "
                    f"mention only Concepts that were stable or accepted before this Sleep run"
                )


def _brief_target(repo: Path, target: str) -> str:
    candidates = [target]
    decoded = unquote(target)
    if decoded != target:
        candidates.append(decoded)
    for candidate in candidates:
        parts = _lexical_parts(candidate)
        if parts is None:
            raise WorkflowError(f"brief.md link escapes {WIKI_ROOT}: {target}")
        rel = "/".join(parts)
        if (
            len(parts) < 2
            or _is_map_name(rel)
            or parts[0] == "archive"
            or not rel.endswith(".md")
        ):
            raise WorkflowError(f"brief.md link is not an active Wiki domain Concept: {target}")
        if _lstat_regular(repo, _wiki_parts(rel)) is not None:
            confined_path(_wiki_root(repo), rel)
            return rel
    raise WorkflowError(f"brief.md links to a missing Wiki Concept: {target}")


def _verify_brief(repo: Path, run: dict[str, Any], source: dict[str, Any]) -> None:
    brief = _wiki_root(repo) / BRIEF_FILENAME
    info = _lstat_regular(repo, _wiki_parts(BRIEF_FILENAME))
    if info is None:
        if os.path.lexists(brief):
            raise WorkflowError(f"{WIKI_ROOT}/{BRIEF_FILENAME} must be a regular file")
        return
    if info.st_size > BRIEF_BYTE_LIMIT:
        raise WorkflowError(f"{WIKI_ROOT}/{BRIEF_FILENAME} exceeds {BRIEF_CHAR_LIMIT} characters")
    try:
        text = _lf_text(brief.read_bytes())
    except (OSError, UnicodeDecodeError) as exc:
        raise WorkflowError(f"{WIKI_ROOT}/{BRIEF_FILENAME} is not readable UTF-8") from exc
    if len(text) > BRIEF_CHAR_LIMIT:
        raise WorkflowError(
            f"{WIKI_ROOT}/{BRIEF_FILENAME} is {len(text)} characters (budget: {BRIEF_CHAR_LIMIT})"
        )
    brief_changed = _sha256_text(text) != run.get("preExistingBriefSha256")
    links = extract_relative_markdown_links(text)
    if brief_changed:
        _verify_brief_md_paths(repo, run, text, links)
    if brief_changed and not links and _body_without_frontmatter(text).strip():
        raise WorkflowError(f"Changed {WIKI_ROOT}/{BRIEF_FILENAME} must link every rule to a Wiki Concept")
    trusted: dict[str, dict[str, str]] = run["preExistingTrustedWiki"]
    digests: dict[str, dict[str, str]] = run["preExistingWikiDigests"]
    source_path = str(source.get("sourcePath", ""))
    archived_path = str(source["archivedPath"])
    for _, raw_target in links:
        target = raw_target.split("#", 1)[0]
        if not target:
            continue
        rel = _brief_target(repo, target)
        text_now = _read_wiki_concept(repo, rel)
        raw_status = parse_frontmatter(text_now)["raw_status"]
        shown = f"{WIKI_ROOT}/{rel}"
        if brief_changed:
            baseline = trusted.get(rel)
            if baseline is None:
                raise WorkflowError(
                    f"Changed brief.md may only link Concepts that were stable or accepted "
                    f"before this Sleep run: {shown}"
                )
            if raw_status != baseline["status"]:
                raise WorkflowError(f"brief.md target status changed during this Sleep run: {shown}")
        else:
            baseline = trusted.get(rel) or digests.get(rel)
            if baseline is None:
                raise WorkflowError(f"brief.md links a Concept created during this Sleep run: {shown}")
            if raw_status not in SILENT_ACTIVE_STATUSES:
                raise WorkflowError(f"brief.md target is no longer an active Concept: {shown}")
        current = _normalized_concept_sha256(
            text_now, source_path=source_path, archived_path=archived_path
        )
        if current != baseline["normSha256"]:
            raise WorkflowError(
                f"brief.md target changed during this Sleep run beyond archived-Task link repair: {shown}"
            )


def _verify_completed_run(
    repo: Path, run: dict[str, Any], wiki_outputs: list[str]
) -> list[str]:
    """Steps 2-7 of the zero-side-effect completion gate; nothing is written here."""
    missing = [field for field in BASELINE_FIELDS if field not in run]
    if missing:
        raise WorkflowError(
            "Sleep run lacks the ompFlowSleep v2 Wiki baseline; finish it with --state failed"
        )
    source = read_sleep_source(repo, str(run["sourceReceipt"]))
    _verify_source_content(repo, source)
    if _specs_digest(repo) != run["specsDigest"]:
        raise WorkflowError(f"Sleep must not change {WIKI_ROOT}/specs/")
    _verify_run_output(repo, run)
    output_paths = _verify_wiki_outputs(repo, wiki_outputs)
    _verify_new_concepts(repo, run)
    _verify_brief(repo, run, source)
    return output_paths


def finish_sleep_run(
    repo: Path,
    receipt: str,
    *,
    state: str,
    actor_id: str,
    wiki_outputs: list[str],
) -> dict[str, Any]:
    repo = repo.resolve()
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
            output_paths = _verify_completed_run(repo, run, wiki_outputs)
            refresh_wiki_indexes(repo)
        elif wiki_outputs:
            raise WorkflowError("Failed Sleep run cannot claim Wiki outputs")
        run.pop("assignment", None)
        run["state"] = state
        run["wikiOutputs"] = output_paths
        run["updatedAt"] = datetime.now(timezone.utc).isoformat()
        atomic_write_json(_run_path(repo, receipt), run)
        return run
    finally:
        _release_run_lock(lock)
