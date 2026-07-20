from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path

from .gates import verify_row_frozen
from .io import WorkflowError, atomic_write_json, atomic_write_text, read_json, read_text
from .paths import task_dir
from .task_store import EVIDENCE_HEADERS, TASK_HEADERS
from .topology import read_rows, validate_rows


def write_csv(path: Path, rows: list[dict[str, str]], headers: list[str]) -> None:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=headers, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    atomic_write_text(path, stream.getvalue())


def submit_evidence(
    repo: Path,
    task_id: str,
    row_id: str,
    verdict: str,
    tests_run: int,
    tests_failed: int,
    report: str,
    evidence: str,
    reviewer_agent_id: str,
) -> dict[str, str]:
    normalized = verdict.lower()
    if normalized not in {"pass", "fail"}:
        raise WorkflowError("Verdict must be pass or fail")
    if tests_run < 0 or tests_failed < 0 or tests_failed > tests_run:
        raise WorkflowError("Invalid test counts")
    if normalized == "pass" and tests_failed != 0:
        raise WorkflowError("PASS requires tests_failed=0")
    if not reviewer_agent_id.strip():
        raise WorkflowError("reviewer_agent_id is required")
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    if task.get("status") != "in_progress" or task.get("phase") != "execute":
        raise WorkflowError("Evidence submission requires an executing task")
    rows = read_rows(root / "tasks.csv")
    validate_rows(rows)
    row = next((candidate for candidate in rows if candidate.get("id") == row_id), None)
    if row is None:
        raise WorkflowError(f"Row not found: {row_id}")
    if row.get("status") != "review":
        raise WorkflowError(f"Row {row_id} must have status=review")
    verify_row_frozen(repo, task_id, row_id)
    expected_report = f".task/{row_id}.review.md"
    if report.replace("\\", "/") != expected_report:
        raise WorkflowError(f"Review report must be {expected_report}")
    read_text(root / expected_report)
    timestamp = datetime.now(timezone.utc).isoformat()
    entry = {
        "rowId": row_id,
        "verdict": normalized,
        "tests_run": str(tests_run),
        "tests_failed": str(tests_failed),
        "evidence": evidence,
        "reviewer_agent_id": reviewer_agent_id.strip(),
        "phase": "review",
        "timestamp": timestamp,
        "artifact": f".task/{row_id}.verdict.json",
    }
    atomic_write_json(root / ".task" / f"{row_id}.verdict.json", entry)
    evidence_rows = []
    evidence_path = root / "evidence.csv"
    if evidence_path.is_file():
        evidence_rows = read_rows(evidence_path)
    evidence_rows.append(entry)
    write_csv(evidence_path, evidence_rows, EVIDENCE_HEADERS)
    row["status"] = "completed" if normalized == "pass" else "needs_fix"
    write_csv(root / "tasks.csv", rows, TASK_HEADERS)
    if normalized == "pass" and all(item.get("status") == "completed" for item in rows):
        task["phase"] = "finish"
        task["updatedAt"] = timestamp
        atomic_write_json(root / "task.json", task)
    return entry
