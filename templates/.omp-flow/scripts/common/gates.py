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


def prepare_gate(repo: Path, task_id: str, gate_value: str) -> dict[str, Any]:
    gate, directory = _gate_key(gate_value)
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    expected_phase = "design" if gate == "qbd1" else "decompose"
    if task.get("phase") != expected_phase:
        raise WorkflowError(f"{gate} prepare requires phase={expected_phase}")
    if gate == "qbd2":
        verify_approved_gate(repo, task_id, "qbd1")
    paths = _evidence_paths(root, gate, task)
    gate_data = task.setdefault("gates", {}).setdefault(gate, {"attempt": 0})
    attempt = int(gate_data.get("attempt", 0)) + 1
    if attempt > 3:
        raise WorkflowError(f"{gate} exceeded 3 audit attempts; human intervention is required")
    report = f"qbd/{directory}/audit-{attempt:03d}.md"
    evidence_digest = _digest(root, paths)
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
            f"Audit {gate} evidence adversarially. Write exactly {report}.\n"
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
    else:
        task["phase"] = "design" if gate == "qbd1" else "decompose"
    task["updatedAt"] = datetime.now(timezone.utc).isoformat()
    atomic_write_json(root / "task.json", task)
    return gate_data
