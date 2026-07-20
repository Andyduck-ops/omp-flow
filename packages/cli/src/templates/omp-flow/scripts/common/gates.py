from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .io import WorkflowError, atomic_write_json, atomic_write_text, read_json, read_text
from .paths import task_dir
from .topology import read_rows, validate_rows


FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def _gate_key(value: str) -> tuple[str, str]:
    normalized = value.lower().replace("-", "")
    if normalized not in {"qbd1", "qbd2"}:
        raise WorkflowError("Gate must be qbd1 or qbd2")
    return normalized, "qbd-1" if normalized == "qbd1" else "qbd-2"


def _evidence_paths(root: Path, gate: str, task: dict[str, Any]) -> list[Path]:
    if gate == "qbd1":
        selected = task.get("selectedSynthesis")
        if not isinstance(selected, str) or not selected:
            raise WorkflowError("QbD 1 requires task.json selectedSynthesis")
        paths = [root / selected, root / "prd.md", root / "design.md", root / "context" / "index.json"]
        paths.extend(
            path for path in sorted((root / "context").rglob("*"))
            if path.is_file() and path.name != "index.json"
        )
        paths.extend(
            path for path in sorted((root / "reference").glob("*"))
            if path.is_file() and path.name.lower() != "readme.md"
        )
    else:
        rows = read_rows(root / "tasks.csv")
        validate_rows(rows)
        if not rows:
            raise WorkflowError("QbD 2 requires at least one tasks.csv row")
        paths = [root / "prd.md", root / "design.md", root / "tasks.csv", root / "context" / "index.json"]
        paths.extend(root / ".task" / f"{row['id']}.implement.md" for row in rows)
    for path in paths:
        content = read_text(path)
        if "<!-- Uncommitted template." in content:
            raise WorkflowError(f"Gate evidence is still an uncommitted template: {path.name}")
    return paths


def _digest(root: Path, paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths):
        relative = path.relative_to(root).as_posix()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        if path.name == "tasks.csv":
            rows = []
            for row in csv.DictReader(io.StringIO(read_text(path))):
                rows.append({key: (value or "") for key, value in row.items() if key != "status"})
            digest.update(json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        else:
            digest.update(path.read_bytes())
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}"


def _design_digest(root: Path) -> str:
    digest = hashlib.sha256()
    for name in ("prd.md", "design.md"):
        path = root / name
        content = read_text(path)  # raises if missing -> fail visibly
        if "<!-- Uncommitted template." in content:
            raise WorkflowError(f"Design evidence is still an uncommitted template: {name}")
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}"


def _row_digest(root: Path, row: dict[str, str]) -> str:
    row_id = row["id"]
    digest = hashlib.sha256()
    digest.update(b"row:")
    digest.update(row_id.encode("utf-8"))
    digest.update(b"\0")
    fields = {key: (value or "") for key, value in row.items() if key != "status"}
    digest.update(json.dumps(fields, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    digest.update(b"\0")
    brief = root / ".task" / f"{row_id}.implement.md"
    content = read_text(brief)
    if "<!-- Uncommitted template." in content:
        raise WorkflowError(f"Row brief is still an uncommitted template: {row_id}")
    digest.update(brief.read_bytes())
    return f"sha256:{digest.hexdigest()}"


def verify_approved_gate(repo: Path, task_id: str, gate_value: str) -> None:
    gate, _ = _gate_key(gate_value)
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    gate_data = task.get("gates", {}).get(gate, {})
    if gate_data.get("status") != "approved":
        raise WorkflowError(f"{gate} is not approved")
    values = gate_data.get("evidencePaths", [])
    if not isinstance(values, list):
        raise WorkflowError(f"{gate} has invalid evidencePaths")
    paths = [root / str(value) for value in values]
    if not paths or _digest(root, paths) != gate_data.get("evidenceDigest"):
        raise WorkflowError(f"{gate} approved evidence is stale")


def verify_row_frozen(repo: Path, task_id: str, row_id: str) -> None:
    """Fail visibly unless QbD 2 is approved AND design + this row's brief/fields are unchanged
    since approval. Falls back to the legacy whole-topology check for tasks approved before
    per-row digests existed (no gates.qbd2.rows key)."""
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    qbd2 = task.get("gates", {}).get("qbd2", {})
    if qbd2.get("status") != "approved":
        raise WorkflowError("qbd2 is not approved")
    rows_map = qbd2.get("rows")
    if not isinstance(rows_map, dict):
        # Legacy task: fall back to whole-topology digest check.
        verify_approved_gate(repo, task_id, "qbd2")
        return
    if _design_digest(root) != qbd2.get("designDigest"):
        raise WorkflowError("qbd2 approved design evidence is stale")
    recorded = rows_map.get(row_id)
    if not recorded:
        raise WorkflowError(f"qbd2 has no frozen digest for row {row_id}")
    rows = read_rows(root / "tasks.csv")
    row = next((item for item in rows if item.get("id") == row_id), None)
    if row is None:
        raise WorkflowError(f"Row not found: {row_id}")
    if _row_digest(root, row) != recorded:
        raise WorkflowError(f"qbd2 approved evidence is stale for row {row_id}")


def verify_design_frozen(repo: Path, task_id: str) -> None:
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    qbd2 = task.get("gates", {}).get("qbd2", {})
    if qbd2.get("status") != "approved":
        raise WorkflowError("qbd2 is not approved")
    if not isinstance(qbd2.get("rows"), dict):
        verify_approved_gate(repo, task_id, "qbd2")
        return
    if _design_digest(root) != qbd2.get("designDigest"):
        raise WorkflowError("qbd2 approved design evidence is stale")


def _next_audit_slot(gate_dir: Path) -> str:
    """Monotonic-global audit slot: highest existing audit-NNN.md in the gate dir + 1.
    Mirrors reset_gate's reset-record numbering so a report slot is never reused across
    cycles (a reset zeroes attempt but leaves prior audit-*.md in place)."""
    highest = 0
    if gate_dir.exists():
        for path in gate_dir.glob("audit-*.md"):
            match = re.fullmatch(r"audit-(\d+)", path.stem)
            if match:
                highest = max(highest, int(match.group(1)))
    return f"audit-{highest + 1:03d}.md"


def prepare_gate(repo: Path, task_id: str, gate_value: str) -> dict[str, Any]:
    gate, directory = _gate_key(gate_value)
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    expected_phase = "design" if gate == "qbd1" else "decompose"
    gate_data = task.setdefault("gates", {}).setdefault(gate, {"attempt": 0})
    refresh = task.get("phase") == gate and gate_data.get("status") == "prepared"
    if task.get("phase") != expected_phase and not refresh:
        raise WorkflowError(f"{gate} prepare requires phase={expected_phase}")
    if refresh and (root / str(gate_data.get("report", ""))).exists():
        raise WorkflowError(f"{gate} prepared report already exists; inspect it instead")
    if gate == "qbd2":
        verify_approved_gate(repo, task_id, "qbd1")
    paths = _evidence_paths(root, gate, task)
    if gate == "qbd2" and int(gate_data.get("attempt", 0)) >= 3:
        qbd1 = task.get("gates", {}).get("qbd1", {})
        if qbd1.get("status") != "approved":
            raise WorkflowError("QbD 2 retry limit requires a newly approved QbD 1")
        gate_data["supersededAttempts"] = int(gate_data["attempt"])
        gate_data["attempt"] = 0
        for key in ("report", "evidenceDigest", "evidencePaths", "preparedAt", "verdict", "inspectedAt", "humanDecision"):
            gate_data.pop(key, None)
    attempt = int(gate_data.get("attempt", 0)) if refresh else int(gate_data.get("attempt", 0)) + 1
    if attempt > 3:
        raise WorkflowError(f"{gate} exceeded 3 audit attempts; human intervention is required")
    if refresh:
        report = str(gate_data.get("report", ""))
    else:
        report = f"qbd/{directory}/{_next_audit_slot(root / 'qbd' / directory)}"
    evidence_digest = _digest(root, paths)
    for key in ("verdict", "inspectedAt", "humanDecision"):
        gate_data.pop(key, None)
    gate_data.update({
        "status": "prepared",
        "attempt": attempt,
        "report": report,
        "evidenceDigest": evidence_digest,
        "evidencePaths": [path.relative_to(root).as_posix() for path in paths],
        "preparedAt": datetime.now(timezone.utc).isoformat(),
    })
    task["phase"] = gate
    task["updatedAt"] = datetime.now(timezone.utc).isoformat()
    atomic_write_json(root / "task.json", task)
    context = "\n\n".join(
        f"=== {path.relative_to(root).as_posix()} ===\n{read_text(path)}" for path in paths
    )
    return {
        "gate": gate,
        "attempt": attempt,
        "report": report,
        "evidenceDigest": evidence_digest,
        "prompt": (
            f"Audit {gate} evidence adversarially. Write your report to exactly this absolute path (do not resolve it against the current directory): {(root / report).as_posix()}\n"
            f"Frontmatter must contain gate: {gate}, verdict: PASS|FAIL|NEEDS_EVIDENCE, "
            f"risk: low|medium|high, evidenceDigest: {evidence_digest}.\n\n{context}"
        ),
    }


def _frontmatter(path: Path) -> dict[str, str]:
    content = read_text(path)
    match = FRONTMATTER.match(content)
    if not match:
        raise WorkflowError(f"QbD report has no frontmatter: {path}")
    result = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            result[key.strip()] = value.strip()
    return result


def inspect_gate(repo: Path, task_id: str, gate_value: str) -> dict[str, Any]:
    gate, _ = _gate_key(gate_value)
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    gate_data = task.get("gates", {}).get(gate, {})
    if gate_data.get("status") != "prepared":
        raise WorkflowError(f"{gate} is not prepared")
    report = root / str(gate_data.get("report", ""))
    frontmatter = _frontmatter(report)
    current_paths = [root / str(path) for path in gate_data.get("evidencePaths", [])]
    current_digest = _digest(root, current_paths)
    expected = str(gate_data.get("evidenceDigest", ""))
    if current_digest != expected or frontmatter.get("evidenceDigest") != expected:
        gate_data["status"] = "stale"
        atomic_write_json(root / "task.json", task)
        raise WorkflowError(f"{gate} evidence changed; report is stale")
    verdict = frontmatter.get("verdict", "").upper()
    if verdict not in {"PASS", "FAIL", "NEEDS_EVIDENCE"}:
        raise WorkflowError(f"Invalid QbD verdict: {verdict}")
    gate_data["verdict"] = verdict
    gate_data["status"] = "awaiting_human" if verdict == "PASS" else "needs_revision"
    if verdict != "PASS":
        task["phase"] = "design" if gate == "qbd1" else "decompose"
    gate_data["inspectedAt"] = datetime.now(timezone.utc).isoformat()
    atomic_write_json(root / "task.json", task)
    return gate_data


def reset_gate(repo: Path, task_id: str, gate_value: str, reason: str) -> dict[str, Any]:
    """Escape hatch out of a deadlocked qbd1/qbd2 gate (stale, needs_revision, or attempt>=3)
    without hand-editing task.json. Records a reset-NNN.md and returns the gate to a clean
    pre-prepare state so a fresh `gate prepare` can proceed. Resetting an approved gate is
    forbidden (that would silently unfreeze a frozen topology -- use amend/rework/redesign)."""
    gate, directory = _gate_key(gate_value)
    reason = reason.strip()
    if not reason:
        raise WorkflowError("Gate reset requires a non-empty --reason")
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    gate_data = task.get("gates", {}).get(gate)
    if not isinstance(gate_data, dict):
        raise WorkflowError(f"{gate} has no gate state to reset")
    status = gate_data.get("status")
    attempt = int(gate_data.get("attempt", 0))
    if status == "approved":
        raise WorkflowError(
            f"{gate} is approved; a reset would silently unfreeze a frozen topology. "
            "Use `topology amend` to revise an approved gate, or `task rework`/`task redesign`."
        )
    if status not in {"stale", "needs_revision"} and attempt < 3:
        raise WorkflowError(
            f"{gate} is not in a recoverable state (status={status!r}, attempt={attempt}); "
            "gate reset only clears a stale, needs_revision, or attempt>=3 deadlock"
        )
    if gate == "qbd2":
        # A reset must never strand completed work; mirror `task rework`'s completed-row rule.
        completed = [row["id"] for row in read_rows(root / "tasks.csv") if row.get("status") == "completed"]
        if completed:
            raise WorkflowError(
                "qbd2 reset is forbidden after completed rows: " + ", ".join(completed)
                + "; use `topology amend` to revise the frozen topology instead"
            )
    reset_dir = root / "qbd" / directory
    highest = 0
    if reset_dir.exists():
        for path in reset_dir.glob("reset-*.md"):
            match = re.fullmatch(r"reset-(\d+)", path.stem)
            if match:
                highest = max(highest, int(match.group(1)))
    index = highest + 1
    record_rel = f"qbd/{directory}/reset-{index:03d}.md"
    content = (
        f"---\ngate: {gate}\nkind: reset\nindex: {index}\n"
        f"priorStatus: {status}\npriorAttempt: {attempt}\n---\n\n"
        f"# Gate Reset: {gate}\n\nReason: {reason}\n"
    )
    atomic_write_text(root / record_rel, content)
    for key in (
        "report", "evidenceDigest", "evidencePaths", "verdict", "preparedAt",
        "inspectedAt", "humanDecision", "designDigest", "rows", "supersededAttempts",
    ):
        gate_data.pop(key, None)
    gate_data["status"] = "not_started"
    gate_data["attempt"] = 0
    gate_data["resetRecord"] = record_rel
    task["phase"] = "design" if gate == "qbd1" else "decompose"
    if gate == "qbd2":
        task["topologyFrozen"] = False
    task["updatedAt"] = datetime.now(timezone.utc).isoformat()
    atomic_write_json(root / "task.json", task)
    return {
        "gate": gate,
        "resetRecord": record_rel,
        "status": "not_started",
        "attempt": 0,
        "phase": task["phase"],
    }


def decide_gate(repo: Path, task_id: str, gate_value: str, decision: str, note: str) -> dict[str, Any]:
    gate, directory = _gate_key(gate_value)
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    gate_data = task.get("gates", {}).get(gate, {})
    if gate_data.get("status") != "awaiting_human":
        raise WorkflowError(f"{gate} is not awaiting human decision")
    normalized = decision.lower()
    if normalized not in {"pass", "reject"}:
        raise WorkflowError("Decision must be pass or reject")
    attempt = int(gate_data["attempt"])
    path = root / "qbd" / directory / f"human-decision-{attempt:03d}.md"
    content = (
        f"---\ngate: {gate}\nattempt: {attempt}\ndecision: {normalized.upper()}\n"
        f"evidenceDigest: {gate_data['evidenceDigest']}\n---\n\n# Human Decision\n\n{note.strip()}\n"
    )
    atomic_write_text(path, content)
    gate_data["humanDecision"] = path.relative_to(root).as_posix()
    gate_data["status"] = "approved" if normalized == "pass" else "needs_revision"
    if normalized == "pass":
        task["phase"] = "decompose" if gate == "qbd1" else "ready"
        if gate == "qbd2":
            task["topologyFrozen"] = True
            rows = read_rows(root / "tasks.csv")
            validate_rows(rows)
            gate_data["designDigest"] = _design_digest(root)
            gate_data["rows"] = {row["id"]: _row_digest(root, row) for row in rows}
    else:
        task["phase"] = "design" if gate == "qbd1" else "decompose"
    task["updatedAt"] = datetime.now(timezone.utc).isoformat()
    atomic_write_json(root / "task.json", task)
    return gate_data
