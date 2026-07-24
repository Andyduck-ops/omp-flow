from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from pathlib import Path

from .io import WorkflowError, read_text


ROOT_ID = re.compile(r"^([A-Z])-([0-9]{3})$")
DEPENDENT_ID = re.compile(r"^([A-Z])-((?:[A-Z][0-9]{3})+)--([0-9]{3})$")
DEPENDENCY_REF = re.compile(r"([A-Z])([0-9]{3})")


@dataclass(frozen=True)
class TopologyId:
    full_id: str
    canonical_id: str
    unit: str
    seq: str
    dependencies: tuple[str, ...]


def parse_topology_id(value: str) -> TopologyId:
    root = ROOT_ID.fullmatch(value)
    if root:
        unit, seq = root.groups()
        return TopologyId(value, f"{unit}-{seq}", unit, seq, ())
    dependent = DEPENDENT_ID.fullmatch(value)
    if not dependent:
        raise WorkflowError(f"Invalid topology ID: {value}")
    unit, encoded, seq = dependent.groups()
    refs = tuple(f"{match.group(1)}-{match.group(2)}" for match in DEPENDENCY_REF.finditer(encoded))
    if "".join(ref.replace("-", "") for ref in refs) != encoded:
        raise WorkflowError(f"Ambiguous dependency encoding: {value}")
    return TopologyId(value, f"{unit}-{seq}", unit, seq, refs)


def read_rows(path: Path) -> list[dict[str, str]]:
    raw = read_text(path)
    body = "\n".join(line for line in raw.splitlines() if not line.lstrip().startswith("#"))
    return [
        {str(key): (value or "").strip() for key, value in row.items() if key}
        for row in csv.DictReader(io.StringIO(body))
    ]


def validate_rows(root: Path, rows: list[dict[str, str]]) -> dict[str, int]:
    parsed: dict[str, TopologyId] = {}
    by_full: dict[str, TopologyId] = {}
    for row in rows:
        full_id = row.get("id", "")
        item = parse_topology_id(full_id)
        if item.canonical_id in parsed:
            raise WorkflowError(f"Duplicate canonical row: {item.canonical_id}")
        parsed[item.canonical_id] = item
        by_full[item.full_id] = item
        expected = f".task/{item.full_id}.implement.md"
        task_md = row.get("taskMd", "").replace("\\", "/")
        if task_md != expected:
            raise WorkflowError(f"taskMd for {item.full_id} must be {expected}")

    visiting: set[str] = set()
    visited: set[str] = set()
    waves: dict[str, int] = {}

    def visit(canonical: str) -> int:
        if canonical in visiting:
            raise WorkflowError(f"Topology cycle includes {canonical}")
        if canonical in visited:
            return waves[canonical]
        item = parsed[canonical]
        visiting.add(canonical)
        dependency_waves = []
        for dependency in item.dependencies:
            if dependency == canonical:
                raise WorkflowError(f"Self dependency: {item.full_id}")
            if dependency not in parsed:
                raise WorkflowError(f"Missing dependency {dependency} for {item.full_id}")
            dependency_waves.append(visit(dependency))
        visiting.remove(canonical)
        visited.add(canonical)
        waves[canonical] = 1 + max(dependency_waves, default=0)
        return waves[canonical]

    for canonical in sorted(parsed):
        visit(canonical)

    for row in rows:
        item = by_full[row["id"]]
        expected_wave = waves[item.canonical_id]
        try:
            actual_wave = int(row.get("wave", ""))
        except ValueError as exc:
            raise WorkflowError(f"Invalid wave for {item.full_id}") from exc
        if actual_wave != expected_wave:
            raise WorkflowError(
                f"Wave mismatch for {item.full_id}: expected {expected_wave}, got {actual_wave}"
            )

    # An active row (one that is still executable/reviewable) must not depend on a
    # row that has been retired. Retiring a row only sets its status; a replacement
    # is a new row with a new ID, so an active dependant would point at a dead node.
    # Completed rows depending on retired rows are historical and therefore allowed.
    active_statuses = {"pending", "needs_fix", "review"}
    retired_statuses = {"superseded", "cancelled"}
    status_by_canonical = {
        by_full[row["id"]].canonical_id: row.get("status", "") for row in rows
    }
    for row in rows:
        if row.get("status", "") not in active_statuses:
            continue
        item = by_full[row["id"]]
        for dependency in item.dependencies:
            dep_status = status_by_canonical.get(dependency, "")
            if dep_status in retired_statuses:
                raise WorkflowError(
                    f"Active row {item.full_id} depends on {dep_status} row {dependency}"
                )

    # Context refs are consumed at dispatch time; validate them at freeze time so a
    # malformed `context` cell cannot slip past QbD 2 and force post-freeze rework.
    from .context import _context_index_map
    by_context_id = _context_index_map(root) if (root / "context" / "index.json").is_file() else {}
    token_re = re.compile(r"^[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?$")
    for row in rows:
        cell = row.get("context", "")
        if not cell:
            continue
        full_id = row.get("id", "")
        for token in cell.split(";"):
            token = token.strip()
            if not token:
                continue
            if any(ch in token for ch in "/\\, \t\n\r"):
                raise WorkflowError(
                    f"Row {full_id} has malformed context reference (paths/commas/whitespace are not allowed): {token}"
                )
            if not token_re.fullmatch(token):
                raise WorkflowError(
                    f"Row {full_id} has malformed context reference (must be entryId or type:entryId): {token}"
                )
            if token not in by_context_id:
                raise WorkflowError(f"Row {full_id} has unresolved context reference: {token}")

    return waves


def ready_rows(root: Path, rows: list[dict[str, str]], role: str) -> list[dict[str, str]]:
    validate_rows(root, rows)
    if role not in {"executor", "reviewer"}:
        raise WorkflowError(f"Unsupported topology role: {role}")
    if role == "reviewer":
        return [row for row in rows if row.get("status") == "review"]
    parsed = {parse_topology_id(row["id"]).canonical_id: (parse_topology_id(row["id"]), row) for row in rows}
    result = []
    for row in rows:
        item = parse_topology_id(row["id"])
        # Only pending/needs_fix rows are executable; this also excludes retired
        # (superseded/cancelled) and completed rows from the ready set.
        if row.get("status") not in {"pending", "needs_fix"}:
            continue
        if all(parsed[dependency][1].get("status") == "completed" for dependency in item.dependencies):
            result.append(row)
    return result
