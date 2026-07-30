"""Bounded disposal of the legacy control-plane state ``doctor`` diagnoses.

One inventory, two consumers: ``doctor`` reports what :func:`legacy_inventory`
finds and ``dispose`` acts on it through the same call. Neither can be pointed at
a path -- the only path source is the module-level constants below, so the
constants ARE the safety boundary. An entry without a recorded verdict is an
unverified deletion target; do not add one.

Disposal moves into a dated quarantine and never unlinks: every current member has
no second copy, being either gitignored or merely untracked, which is exactly as
unrecoverable.

Contract: ADR-001 of task 07-25-cp-disposition. Verdict sources: that ADR's
decision 3 table, itself drawn from research 10-internal-003.
"""
from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path

from .io import WorkflowError, atomic_write_json
from .paths import flow_dir, tasks_dir

KIND_LEGACY_STRUCTURE = "legacy-structure"
KIND_SUPERSEDED_STORE_FILE = "superseded-store-file"

#: The two kinds, in the order the CLI offers them as ``--kind`` choices.
DISPOSABLE_KINDS: tuple[str, ...] = (KIND_LEGACY_STRUCTURE, KIND_SUPERSEDED_STORE_FILE)

_FLOW_PREFIX = ".omp-flow/"
_TASKS_DIR = ".omp-flow/tasks"

# Ralph-era and pre-portable structure under the control-plane directory. Exact
# repo-relative posix paths only, never prefixes. Each entry carries a
# SAFE-TO-DELETE or REFERENCED verdict from ADR-001 decision 3.
# Naming hazard: .omp-flow/sessions is the dead ralph-era directory and is NOT the
# live .omp-flow/.runtime/sessions -- the two names differ by one dot.
LEGACY_STRUCTURE: tuple[str, ...] = (
    ".omp-flow/events",       # SAFE-TO-DELETE - only hit is the update.ts protection list
    ".omp-flow/findings",     # SAFE-TO-DELETE - empty; protection-list hit only
    ".omp-flow/fsm",          # SAFE-TO-DELETE - flow_dir never composes it
    ".omp-flow/issues",       # SAFE-TO-DELETE - empty; protection-list hit only
    ".omp-flow/scratch",      # SAFE-TO-DELETE - zero hits in code scopes
    ".omp-flow/sessions",     # SAFE-TO-DELETE - empty; distinct from .runtime/sessions
    ".omp-flow/state.json",   # SAFE-TO-DELETE - ralph-era fsmState; zero code hits
    ".omp-flow/config.yaml",  # SAFE-TO-DELETE - zero hits; the live config is config.json
    ".omp-flow/.version",     # SAFE-TO-DELETE - zero readers; hashes live in .template-hashes.json
    ".omp-flow/workspace",    # REFERENCED - disposed; its three .codex/skills referrers are
                              # recorded as unowned debt in ADR-001 decision 6
)

# Ships EMPTY, deliberately: the KIND is defined here so doctor and dispose carry
# the code path; its MEMBERSHIP is not. Nothing establishes that any store file is
# superseded today -- the replacement corpus is the knowledge-corpus task's
# deliverable, and it populates this tuple beside the superseding evidence. An
# empty tuple is valid input: legacy_inventory simply yields no finding of this
# kind, so no fixture planted anywhere can produce one.
SUPERSEDED_STORE_FILES: tuple[str, ...] = ()

_QUARANTINE_DIRNAME = ".quarantine"
_QUARANTINE_STAMP = "%Y-%m-%dT%H-%M-%S"
_MANIFEST_VERSION = 1


def _repo_base(repo: Path) -> Path:
    """Absolute base for ``repo`` without resolving symlinks along it.

    ``is_absolute`` is lexical and cannot raise; resolving only when it must keeps
    the reported paths anchored to the root the caller actually passed.
    """
    return repo if repo.is_absolute() else repo.resolve()


def _confined_entry(base: Path, entry: str) -> Path | None:
    """Return the absolute path for a legal constant entry, else ``None``.

    Runtime confinement, defence in depth behind the Test 11b constant-shape
    guard: an entry counts only if it is relative, free of ``..``, lands beneath
    ``flow_dir``, and lies outside the task store.

    A non-conforming entry is SKIPPED, never raised on. ``_doctor`` calls
    ``legacy_inventory`` and the design forbids adding a new exit path to
    ``doctor``, so a bad constant must not turn every ``doctor`` call into a
    failure.
    """
    if not entry or not entry.startswith(_FLOW_PREFIX):
        return None
    if "\\" in entry or ":" in entry:
        return None
    if any(segment in ("", ".", "..") for segment in entry.split("/")):
        return None
    if entry == _TASKS_DIR or entry.startswith(_TASKS_DIR + "/"):
        return None

    candidate = base / entry
    try:
        resolved = candidate.resolve()
        flow = flow_dir(base).resolve()
        tasks = tasks_dir(base).resolve()
    except (OSError, ValueError):
        # ValueError, not only OSError: an entry carrying an embedded null byte
        # raises `ValueError: stat: embedded null character in path` from
        # resolve(), which OSError does not cover. `_doctor` calls
        # legacy_inventory and must gain no new exit path, so a hostile constant
        # entry has to SKIP here rather than propagate through main()'s
        # ValueError handler and turn every `doctor` call into exit 2.
        return None
    if resolved == flow or flow not in resolved.parents:
        return None
    if resolved == tasks or tasks in resolved.parents:
        return None
    return candidate


def _exists(path: Path) -> bool:
    try:
        return path.exists()
    except (OSError, ValueError):
        # Same widening as _confined_entry, for the same reason: existence
        # probing is the other place a hostile path can raise, and neither may
        # add an exit path to `doctor`.
        return False


def legacy_inventory(repo: Path) -> list[dict[str, str]]:
    """Findings for every constant entry that currently exists.

    Read-only: existence probes only, no mutation, no raise. Existence-gating is
    what makes both kinds self-retiring once the state is disposed of.
    """
    base = _repo_base(repo)
    findings: list[dict[str, str]] = []
    for kind, entries in (
        (KIND_LEGACY_STRUCTURE, LEGACY_STRUCTURE),
        (KIND_SUPERSEDED_STORE_FILE, SUPERSEDED_STORE_FILES),
    ):
        for entry in entries:
            candidate = _confined_entry(base, entry)
            if candidate is None or not _exists(candidate):
                continue
            findings.append({"kind": kind, "path": str(candidate)})
    return findings


def _unique_quarantine_dir(base: Path) -> Path:
    """``.omp-flow/.quarantine/<UTC stamp>``, suffixed -1, -2, ... on collision.

    The suffix loop is the one ``createUniqueBackupDir`` runs in src/cli/update.ts,
    which opens ``let suffix = 1;``. Deliberately NOT unified with
    ``_relocate_to_month_archive``'s ``-dupN``: both are correct in their place.
    """
    stamp = datetime.now(timezone.utc).strftime(_QUARANTINE_STAMP)
    parent = flow_dir(base) / _QUARANTINE_DIRNAME
    target = parent / stamp
    suffix = 1
    while target.exists():
        target = parent / f"{stamp}-{suffix}"
        suffix += 1
    target.mkdir(parents=True, exist_ok=True)
    return target


def dispose_legacy(repo: Path, *, kinds: list[str] | None, reason: str) -> dict:
    """Move the selected inventory members into a dated quarantine.

    ``kinds`` narrows the selection; ``None`` selects both. There is no path
    argument and no other path source in this body -- the selection can only ever
    be a subset of what :func:`legacy_inventory` reports.

    Moves with ``shutil.move``; never unlinks. An empty selection creates no
    directory and returns the same four keys, so ``result["reason"]`` cannot raise
    on the idempotent re-run the verb is designed to allow.
    """
    if not reason or not reason.strip():
        raise WorkflowError("`dispose` requires a non-empty --reason")
    note = reason.strip()
    selected = set(DISPOSABLE_KINDS) if kinds is None else set(kinds)

    base = _repo_base(repo)
    findings = [item for item in legacy_inventory(repo) if item["kind"] in selected]
    if not findings:
        return {"quarantine": None, "reason": note, "count": 0, "disposed": []}

    quarantine = _unique_quarantine_dir(base)
    items: list[dict[str, str]] = []
    disposed: list[dict[str, str]] = []
    for finding in findings:
        source = Path(finding["path"])
        relative = source.relative_to(base).as_posix()
        destination = quarantine / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(destination))
        items.append(
            {
                "kind": finding["kind"],
                "from": relative,
                "to": destination.relative_to(base).as_posix(),
            }
        )
        disposed.append({"kind": finding["kind"], "path": finding["path"]})

    atomic_write_json(
        quarantine / "manifest.json",
        {
            "version": _MANIFEST_VERSION,
            "disposedAt": datetime.now(timezone.utc).isoformat(),
            "reason": note,
            "items": items,
        },
    )
    return {
        "quarantine": str(quarantine),
        "reason": note,
        "count": len(disposed),
        "disposed": disposed,
    }
