"""Currency closure: derive which completed rows are no longer current at re-freeze."""
from __future__ import annotations

from collections import deque
from typing import Callable

from .topology import parse_topology_id


_LEVELS = {
    "completed": 2,
    "pending": 1,
    "needs_fix": 1,
    "review": 1,
    "superseded": 0,
    "cancelled": 0,
}

_RETIRED = {"superseded", "cancelled"}


def apply_currency_closure(
    rows: list[dict[str, str]],
    *,
    is_row_current: Callable[[dict[str, str]], bool],
    retired_by_caller: frozenset[str] = frozenset(),
) -> dict[str, list[str]]:
    """Mutate ``rows`` in place, demoting non-current completed rows and cascading.

    Returns ``{"downgraded": [...], "cancelled": [...]}`` (both sorted). Never raises.
    """
    touched: set[str] = set()
    invalidated: set[str] = set(retired_by_caller)

    parsed = {row["id"]: parse_topology_id(row["id"]) for row in rows}
    status_by_canonical: dict[str, str] = {
        parsed[row["id"]].canonical_id: row.get("status", "") for row in rows
    }
    dependants: dict[str, list[str]] = {item.canonical_id: [] for item in parsed.values()}
    for row in rows:
        item = parsed[row["id"]]
        for dep in item.dependencies:
            if dep in dependants:
                dependants[dep].append(item.canonical_id)

    def _level(status: str) -> int:
        return _LEVELS.get(status, 1)

    def _target(row: dict[str, str]) -> str:
        item = parsed[row["id"]]
        for dep in item.dependencies:
            if status_by_canonical.get(dep, "") in _RETIRED:
                return "cancelled"
        return "needs_fix"

    def _needs_demotion(row: dict[str, str]) -> bool:
        status = row.get("status", "")
        level = _level(status)
        if level == 0:
            return False
        canonical = parsed[row["id"]].canonical_id
        if status == "completed":
            if not is_row_current(row):
                return True
            item = parsed[row["id"]]
            for dep in item.dependencies:
                if dep in invalidated:
                    return True
            return False
        item = parsed[row["id"]]
        for dep in item.dependencies:
            if dep in touched and status_by_canonical.get(dep, "") in _RETIRED:
                return True
        return False

    queue: deque[dict[str, str]] = deque(rows)
    while queue:
        row = queue.popleft()
        if not _needs_demotion(row):
            continue
        new_status = _target(row)
        if _level(new_status) >= _level(row.get("status", "")):
            continue
        row["status"] = new_status
        canonical = parsed[row["id"]].canonical_id
        status_by_canonical[canonical] = new_status
        touched.add(canonical)
        invalidated.add(canonical)
        for dep_canonical in dependants.get(canonical, []):
            dependent_row = next(
                (r for r in rows if parsed[r["id"]].canonical_id == dep_canonical), None
            )
            if dependent_row is not None:
                queue.append(dependent_row)

    downgraded = sorted(
        parsed[r["id"]].canonical_id
        for r in rows
        if parsed[r["id"]].canonical_id in touched and r.get("status") == "needs_fix"
    )
    cancelled = sorted(
        parsed[r["id"]].canonical_id
        for r in rows
        if parsed[r["id"]].canonical_id in touched and r.get("status") == "cancelled"
    )
    return {"downgraded": downgraded, "cancelled": cancelled}
