from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .evidence import write_csv
from .gates import _design_digest, _digest, _frontmatter, _row_digest
from .io import (
    WorkflowError,
    atomic_write_json,
    atomic_write_text,
    read_json,
    read_text,
)
from .paths import task_dir
from .task_store import TASK_HEADERS
from .topology import parse_topology_id, read_rows, validate_rows


UNCOMMITTED_MARKER = "<!-- Uncommitted template."
CLOSED_STATUSES = {"approved", "rejected"}
CHANGE_OPS = {"add-row", "supersede", "edit-brief", "edit-design"}
MAX_ATTEMPTS = 3
# Guardrails (M4): a cumulative cap forces a full QbD 2 re-audit once incremental amendment has
# drifted the frozen topology too far -- more than 3 approved amendments, or more than one third of
# the current rows retired-or-edited across all approved amendments.
MAX_APPROVED_AMENDMENTS = 3
_REAUDIT_HINT = (
    "run a full QbD 2 re-audit via `omp-flow task rework --reason \"...\"` to return the task to "
    "decompose for a fresh whole-topology QbD 2 (task rework still forbids reopening completed rows)"
)
# Design amendment (M4): when a change set edits prd.md/design.md, the proposal MUST declare which
# COMPLETED rows remain valid under the new design with `valid-completed:` lines. This is fail-closed
# and usable: an explicit declaration is required (even `valid-completed: none`), and any completed
# row not listed is downgraded to needs_fix so it is re-reviewed rather than kept on stale evidence.
_VALID_COMPLETED_RE = re.compile(r"^[^\S\n]*valid-completed:[^\S\n]*(.*)$", re.MULTILINE)

_PROPOSAL_TEMPLATE = (
    "---\n"
    "amendment: {amend_id}\n"
    "gate: qbd2-delta\n"
    "---\n\n"
    "# Amendment Proposal: {amend_id}\n\n"
    "<!-- Uncommitted template. Fill in the Change Set and Impact Statement below, then run"
    " `topology amend prepare`. Leaving this marker keeps prepare failing visibly. -->\n\n"
    "Reason: {reason}\n\n"
    "## Change Set\n\n"
    "Enumerate every add-row / supersede / edit-brief / edit-design change with justification.\n\n"
    "## Impact Statement\n\n"
    "Describe the impact on existing rows, their evidence, and the frozen design. A filled"
    " Impact Statement is REQUIRED to supersede a completed row.\n\n"
    "If this amendment includes an `edit-design` change (prd.md and/or design.md edited on disk),"
    " you MUST declare which COMPLETED rows remain valid under the new design, one per line:\n\n"
    "    valid-completed: <ROW-ID>\n\n"
    "List `valid-completed: none` if no completed row survives the design change. Any completed row"
    " not listed here is downgraded to needs_fix and must be re-implemented/re-reviewed.\n"
)


def _parse_valid_completed(root: Path, record: dict[str, Any]) -> set[str]:
    """Fail-closed parse of the proposal's `valid-completed:` declarations. Requires at least one
    such line whenever an edit-design change is present (raise otherwise), so a design edit can never
    silently keep stale completed-row evidence. `valid-completed: none` yields the empty set."""
    content = read_text(root / str(record.get("proposal", "")))
    matches = _VALID_COMPLETED_RE.findall(content)
    if not matches:
        raise WorkflowError(
            "edit-design requires an explicit `valid-completed:` declaration in the proposal Impact "
            "Statement (use `valid-completed: none` if no completed row remains valid under the new design)"
        )
    ids: set[str] = set()
    for raw in matches:
        for token in re.split(r"[,\s]+", raw.strip()):
            if token and token.lower() != "none":
                ids.add(token)
    return ids


def _save(root: Path, task: dict[str, Any]) -> None:
    task["updatedAt"] = datetime.now(timezone.utc).isoformat()
    atomic_write_json(root / "task.json", task)


def _require_amendable(task: dict[str, Any]) -> dict[str, Any]:
    """An amend operation is only legal on an executing, QbD 2-frozen task with per-row digests."""
    if task.get("status") != "in_progress" or task.get("phase") != "execute":
        raise WorkflowError("Amendment requires an executing task (status=in_progress, phase=execute)")
    qbd2 = task.get("gates", {}).get("qbd2", {})
    if qbd2.get("status") != "approved":
        raise WorkflowError("Amendment requires approved QbD 2")
    if not isinstance(qbd2.get("rows"), dict):
        raise WorkflowError("Amendment requires per-row frozen digests; re-approve QbD 2")
    return qbd2


def _amendments(task: dict[str, Any]) -> list[dict[str, Any]]:
    amendments = task.setdefault("amendments", [])
    if not isinstance(amendments, list):
        raise WorkflowError("task.json amendments must be an array")
    return amendments


def _find_open(amendments: list[dict[str, Any]]) -> dict[str, Any] | None:
    for record in amendments:
        if isinstance(record, dict) and record.get("status") not in CLOSED_STATUSES:
            return record
    return None


def _next_number(amendments: list[dict[str, Any]]) -> int:
    highest = 0
    for record in amendments:
        match = re.fullmatch(r"amend-(\d+)", str(record.get("id", "")))
        if match:
            highest = max(highest, int(match.group(1)))
    return highest + 1


def _proposal_filled(root: Path, record: dict[str, Any]) -> bool:
    content = read_text(root / str(record.get("proposal", "")))
    return UNCOMMITTED_MARKER not in content


def _amend_digest(root: Path, paths: list[Path], design_digest: str) -> str:
    """Fold the design digest into the reusable bundle digest so a design drift also invalidates
    a prepared delta audit. `_digest` already special-cases tasks.csv (status-insensitive)."""
    base = _digest(root, paths)
    combined = hashlib.sha256()
    combined.update(base.encode("utf-8"))
    combined.update(b"\0")
    combined.update(design_digest.encode("utf-8"))
    return f"sha256:{combined.hexdigest()}"


def amend_audit_prompt(
    root: Path,
    amend_id: str,
    report_rel: str,
    evidence_digest: str,
    rel_paths: list[str],
    design_digest: str,
) -> str:
    """Shared delta-audit prompt, used by ``amend_prepare`` and the read-only Claude
    re-render in ``workflow.claude_qbd_report``. Emits the ABSOLUTE report path so the
    auditor never resolves it against its current directory."""
    context = "\n\n".join(f"=== {rel} ===\n{read_text(root / rel)}" for rel in rel_paths)
    context += f"\n\n=== designDigest ===\n{design_digest}\n"
    abs_report = (root / report_rel).as_posix()
    return (
        f"Delta-audit amendment {amend_id} adversarially. Write your report to exactly this "
        f"absolute path (do not resolve it against the current directory): {abs_report}\n"
        f"Frontmatter must contain gate: qbd2-delta, verdict: PASS|FAIL|NEEDS_EVIDENCE, "
        f"risk: low|medium|high, evidenceDigest: {evidence_digest}.\n\n{context}"
    )


def _require_committed_brief(root: Path, row_id: str) -> Path:
    """Return a changed row's brief, failing visibly if it is missing or still an uncommitted
    template. Mirrors gates.py `_evidence_paths` so a marked brief can never reach decide and
    trigger a half-applied change set (validated CSV committed, digest recompute then raising)."""
    brief = root / ".task" / f"{row_id}.implement.md"
    content = read_text(brief)  # raises visibly if the brief is missing on disk
    if UNCOMMITTED_MARKER in content:
        raise WorkflowError(f"Changed-row brief is still an uncommitted template: {row_id}")
    return brief


def _changed_row_briefs(root: Path, change_set: list[dict[str, Any]]) -> list[Path]:
    briefs: list[Path] = []
    seen: set[str] = set()
    for entry in change_set:
        if entry.get("op") == "edit-design":
            continue
        row_id = entry["id"]
        if row_id in seen:
            continue
        seen.add(row_id)
        briefs.append(_require_committed_brief(root, row_id))
    return briefs


def _build_new_row(entry: dict[str, Any], row_id: str) -> dict[str, str]:
    wave = entry.get("wave")
    if wave is None or str(wave).strip() == "":
        raise WorkflowError(f"add-row {row_id} requires a wave")
    title = entry.get("title")
    if not isinstance(title, str) or not title.strip():
        raise WorkflowError(f"add-row {row_id} requires a title")
    return {
        "id": row_id,
        "wave": str(wave),
        "priority": str(entry.get("priority", "P1")),
        "title": title,
        "scope": str(entry.get("scope", "")),
        "action": str(entry.get("action", "implement")),
        "reference": str(entry.get("reference", "")),
        "context": str(entry.get("context", "")),
        "status": "pending",
        "modelSlot": str(entry.get("modelSlot", "task")),
        "taskMd": f".task/{row_id}.implement.md",
    }


def _validate_change_entry(
    entry: Any,
    by_id: dict[str, dict[str, str]],
    canonicals: set[str],
    proposal_filled: bool,
) -> dict[str, Any]:
    if not isinstance(entry, dict):
        raise WorkflowError("Each change-set entry must be a JSON object")
    op = entry.get("op")
    if op not in CHANGE_OPS:
        raise WorkflowError(f"Unsupported change op: {op!r} (expected one of {sorted(CHANGE_OPS)})")
    if op == "edit-design":
        # No id: prd.md/design.md were edited on disk. designDigest is asserted at prepare/decide.
        return {"op": op}
    row_id = entry.get("id")
    if not isinstance(row_id, str) or not row_id:
        raise WorkflowError("Change entry requires a non-empty string id")

    if op == "add-row":
        item = parse_topology_id(row_id)  # raises on invalid topology ID
        if row_id in by_id:
            raise WorkflowError(f"add-row id already present in topology: {row_id}")
        for dependency in item.dependencies:
            if dependency not in canonicals:
                raise WorkflowError(f"add-row {row_id} depends on missing row {dependency}")
        return {"op": op, "id": row_id, "row": _build_new_row(entry, row_id)}

    row = by_id.get(row_id)
    if row is None:
        raise WorkflowError(f"{op} references unknown row: {row_id}")

    if op == "edit-brief":
        if row.get("status") == "completed":
            raise WorkflowError(f"edit-brief on a completed row is forbidden: {row_id}")
        return {"op": op, "id": row_id}

    # op == "supersede"
    if row.get("status") == "completed" and not proposal_filled:
        raise WorkflowError(
            f"Superseding completed row {row_id} requires a filled Impact Statement in the proposal"
        )
    superseded_by = entry.get("supersededBy")
    if superseded_by is not None and not isinstance(superseded_by, str):
        raise WorkflowError(f"supersede {row_id} supersededBy must be a string")
    result: dict[str, Any] = {"op": op, "id": row_id}
    if superseded_by:
        result["supersededBy"] = superseded_by
    return result


def _enforce_cumulative_cap(root: Path, amendments: list[dict[str, Any]]) -> None:
    """Force a full QbD 2 re-audit once incremental amendment has drifted too far. Reject a new
    propose when either (a) more than MAX_APPROVED_AMENDMENTS amendments are already approved, or
    (b) the DISTINCT rows retired-or-edited (supersede + edit-brief targets) across all approved
    amendments exceed one third of the current total rows. Thresholds are strictly-greater."""
    approved = [a for a in amendments if isinstance(a, dict) and a.get("status") == "approved"]
    if len(approved) > MAX_APPROVED_AMENDMENTS:
        raise WorkflowError(
            f"Amendment cap reached: {len(approved)} approved amendments exceed the limit of "
            f"{MAX_APPROVED_AMENDMENTS}; " + _REAUDIT_HINT
        )
    affected: set[str] = set()
    for amendment in approved:
        for entry in amendment.get("changeSet", []) or []:
            if not isinstance(entry, dict):
                continue
            row_id = entry.get("id")
            if entry.get("op") in {"supersede", "edit-brief"} and isinstance(row_id, str) and row_id:
                affected.add(row_id)
    total = len(read_rows(root / "tasks.csv"))
    if total and len(affected) > total / 3:
        raise WorkflowError(
            f"Amendment cap reached: {len(affected)}/{total} rows retired-or-edited across approved "
            f"amendments exceed one third of the topology; " + _REAUDIT_HINT
        )


def amend_propose(repo: Path, task_id: str, reason: str) -> dict[str, Any]:
    reason = reason.strip()
    if not reason:
        raise WorkflowError("Amendment requires a non-empty --reason")
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    _require_amendable(task)
    amendments = _amendments(task)
    existing = _find_open(amendments)
    if existing is not None:
        raise WorkflowError(f"An open amendment already exists: {existing.get('id')}")
    _enforce_cumulative_cap(root, amendments)
    amend_id = f"amend-{_next_number(amendments):03d}"
    proposal_rel = f"qbd/qbd-2/{amend_id}/proposal.md"
    proposal_path = root / proposal_rel
    if proposal_path.exists():
        raise WorkflowError(f"Proposal already exists: {proposal_rel}")
    atomic_write_text(proposal_path, _PROPOSAL_TEMPLATE.format(amend_id=amend_id, reason=reason))
    record = {
        "id": amend_id,
        "status": "open",
        "reason": reason,
        "proposal": proposal_rel,
        "attempt": 0,
    }
    amendments.append(record)
    _save(root, task)
    return {"id": amend_id, "status": "open", "proposal": proposal_rel}


def amend_set_change(repo: Path, task_id: str, change_json: str) -> dict[str, Any]:
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    _require_amendable(task)
    record = _find_open(_amendments(task))
    if record is None:
        raise WorkflowError("No open amendment; run `topology amend propose` first")
    if record.get("status") in CLOSED_STATUSES:
        raise WorkflowError(f"Amendment {record.get('id')} is closed")
    try:
        change_set = json.loads(change_json)
    except json.JSONDecodeError as exc:
        raise WorkflowError(f"Invalid change-set JSON: {exc.msg}") from exc
    if not isinstance(change_set, list) or not change_set:
        raise WorkflowError("Change set must be a non-empty JSON array")
    rows = read_rows(root / "tasks.csv")
    validate_rows(rows)
    by_id = {row["id"]: row for row in rows}
    canonicals = {parse_topology_id(row["id"]).canonical_id for row in rows}
    proposal_filled = _proposal_filled(root, record)
    normalized: list[dict[str, Any]] = []
    added: set[str] = set()
    for entry in change_set:
        result = _validate_change_entry(entry, by_id, canonicals, proposal_filled)
        if result["op"] == "add-row":
            if result["id"] in added:
                raise WorkflowError(f"Duplicate add-row id in change set: {result['id']}")
            added.add(result["id"])
            canonicals.add(parse_topology_id(result["id"]).canonical_id)
            by_id[result["id"]] = result["row"]
        normalized.append(result)
    # Every changed-row brief must already be committed (present, no uncommitted-template marker)
    # before the change set is stored, so a marked brief can never survive to decide. edit-design
    # carries no row id/brief; its evidence is prd.md/design.md, asserted at prepare/decide.
    for entry in normalized:
        if entry["op"] == "edit-design":
            continue
        _require_committed_brief(root, entry["id"])
    record["changeSet"] = normalized
    # A new change set invalidates any prior prepared/inspected state; require a fresh prepare.
    record["status"] = "open"
    for key in ("report", "evidenceDigest", "evidencePaths", "designDigest", "verdict", "preparedAt", "inspectedAt"):
        record.pop(key, None)
    _save(root, task)
    return {"id": record["id"], "status": record["status"], "changeSet": normalized}


def amend_prepare(repo: Path, task_id: str) -> dict[str, Any]:
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    _require_amendable(task)
    record = _find_open(_amendments(task))
    if record is None:
        raise WorkflowError("No open amendment; run `topology amend propose` first")
    change_set = record.get("changeSet")
    if not isinstance(change_set, list) or not change_set:
        raise WorkflowError("Amendment has no change set; run `topology amend set-change` first")
    if not _proposal_filled(root, record):
        raise WorkflowError("Amendment proposal is still an uncommitted template")
    attempt = int(record.get("attempt", 0)) + 1
    if attempt > MAX_ATTEMPTS:
        raise WorkflowError(
            f"Amendment exceeded {MAX_ATTEMPTS} delta-audit attempts; human intervention is required"
        )
    has_edit_design = any(
        isinstance(entry, dict) and entry.get("op") == "edit-design" for entry in change_set
    )
    if has_edit_design:
        # Fail-closed: a design edit must declare which completed rows remain valid (raises if absent).
        _parse_valid_completed(root, record)
    amend_id = record["id"]
    report_rel = f"qbd/qbd-2/{amend_id}/audit-{attempt:03d}.md"
    proposal_path = root / str(record["proposal"])
    paths = [proposal_path, root / "tasks.csv", *_changed_row_briefs(root, change_set)]
    if has_edit_design:
        # Surface the new prd/design in the evidence bundle so the delta audit sees them; the design
        # digest is also folded into the bundle digest so any later drift invalidates this report.
        paths[1:1] = [root / "prd.md", root / "design.md"]
    design_digest = _design_digest(root)
    evidence_digest = _amend_digest(root, paths, design_digest)
    rel_paths = [path.relative_to(root).as_posix() for path in paths]
    record.update({
        "status": "prepared",
        "attempt": attempt,
        "report": report_rel,
        "evidenceDigest": evidence_digest,
        "evidencePaths": rel_paths,
        "designDigest": design_digest,
        "preparedAt": datetime.now(timezone.utc).isoformat(),
    })
    record.pop("verdict", None)
    record.pop("inspectedAt", None)
    _save(root, task)
    prompt = amend_audit_prompt(root, amend_id, report_rel, evidence_digest, rel_paths, design_digest)
    return {
        "id": amend_id,
        "attempt": attempt,
        "report": report_rel,
        "evidenceDigest": evidence_digest,
        "prompt": prompt,
    }


def amend_inspect(repo: Path, task_id: str) -> dict[str, Any]:
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    _require_amendable(task)
    record = _find_open(_amendments(task))
    if record is None:
        raise WorkflowError("No open amendment to inspect")
    if record.get("status") != "prepared":
        raise WorkflowError(f"Amendment {record.get('id')} is not prepared")
    report = root / str(record.get("report", ""))
    frontmatter = _frontmatter(report)
    paths = [root / str(value) for value in record.get("evidencePaths", [])]
    current_design = _design_digest(root)
    current_digest = _amend_digest(root, paths, current_design)
    expected = str(record.get("evidenceDigest", ""))
    if current_digest != expected or frontmatter.get("evidenceDigest") != expected:
        record["status"] = "stale"
        _save(root, task)
        raise WorkflowError(f"Amendment {record.get('id')} evidence changed; report is stale")
    if frontmatter.get("gate") != "qbd2-delta":
        raise WorkflowError("Amendment report frontmatter gate must be qbd2-delta")
    verdict = frontmatter.get("verdict", "").upper()
    if verdict not in {"PASS", "FAIL", "NEEDS_EVIDENCE"}:
        raise WorkflowError(f"Invalid amendment verdict: {verdict}")
    record["verdict"] = verdict
    record["status"] = "awaiting_human" if verdict == "PASS" else "needs_revision"
    record["inspectedAt"] = datetime.now(timezone.utc).isoformat()
    _save(root, task)
    return record


def amend_decide(repo: Path, task_id: str, decision: str, note: str) -> dict[str, Any]:
    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    qbd2 = _require_amendable(task)
    record = _find_open(_amendments(task))
    if record is None:
        raise WorkflowError("No open amendment to decide")
    if record.get("status") != "awaiting_human":
        raise WorkflowError(f"Amendment {record.get('id')} is not awaiting human decision")
    normalized = decision.lower()
    if normalized not in {"pass", "reject"}:
        raise WorkflowError("Decision must be pass or reject")
    amend_id = record["id"]
    attempt = int(record.get("attempt", 0))
    decision_rel = f"qbd/qbd-2/{amend_id}/human-decision-{attempt:03d}.md"
    content = (
        f"---\namendment: {amend_id}\ngate: qbd2-delta\nattempt: {attempt}\n"
        f"decision: {normalized.upper()}\nevidenceDigest: {record.get('evidenceDigest', '')}\n---\n\n"
        f"# Human Decision\n\n{note.strip()}\n"
    )
    atomic_write_text(root / decision_rel, content)
    record["humanDecision"] = decision_rel

    if normalized == "reject":
        record["status"] = "rejected"
        _save(root, task)
        return {"id": amend_id, "decision": "reject", "status": "rejected", "applied": []}

    # PASS: apply the change set atomically. EVERY fallible step -- change-set validation, the
    # committed-brief checks, validate_rows, and all _row_digest/_design_digest recomputations
    # (which reject uncommitted-template markers) -- runs BEFORE any file is written. tasks.csv is
    # written only once all digests exist, and task.json is written last with nothing fallible in
    # between, so a raise can never leave the CSV committed with task.json stale.
    change_set = record.get("changeSet") or []
    if not _proposal_filled(root, record):
        raise WorkflowError("Amendment proposal is still an uncommitted template")
    working = [dict(row) for row in read_rows(root / "tasks.csv")]
    by_id = {row["id"]: row for row in working}
    applied: list[dict[str, Any]] = []
    affected: set[str] = set()
    for entry in change_set:
        op = entry["op"]
        if op == "edit-design":
            # No row id/brief; handled after the loop as a completed-row impact downgrade.
            applied.append({"op": op})
            continue
        row_id = entry["id"]
        _require_committed_brief(root, row_id)  # present + no uncommitted-template marker
        if op == "add-row":
            if row_id in by_id:
                raise WorkflowError(f"add-row id already present in topology: {row_id}")
            new_row = dict(entry["row"])
            new_row["status"] = "pending"
            new_row["taskMd"] = f".task/{row_id}.implement.md"
            working.append(new_row)
            by_id[row_id] = new_row
            affected.add(row_id)
            applied.append({"op": op, "id": row_id})
        elif op == "supersede":
            row = by_id.get(row_id)
            if row is None:
                raise WorkflowError(f"supersede references unknown row: {row_id}")
            if row.get("status") == "completed" and not _proposal_filled(root, record):
                raise WorkflowError(
                    f"Superseding completed row {row_id} requires a filled Impact Statement"
                )
            row["status"] = "superseded"
            affected.add(row_id)
            applied.append({"op": op, "id": row_id, "supersededBy": entry.get("supersededBy")})
        elif op == "edit-brief":
            row = by_id.get(row_id)
            if row is None:
                raise WorkflowError(f"edit-brief references unknown row: {row_id}")
            if row.get("status") == "completed":
                raise WorkflowError(f"edit-brief on a completed row is forbidden: {row_id}")
            affected.add(row_id)
            applied.append({"op": op, "id": row_id})
        else:  # pragma: no cover - guarded by set-change validation
            raise WorkflowError(f"Unsupported change op: {op}")

    # Design amendment (M4): a design edit invalidates completed-row evidence. Any COMPLETED row not
    # declared valid-completed in the proposal is downgraded to needs_fix so it must be re-reviewed
    # rather than silently kept on stale evidence. Its append-only evidence.csv rows are untouched.
    if any(entry["op"] == "edit-design" for entry in change_set):
        valid_completed = _parse_valid_completed(root, record)  # fail-closed (raises if absent)
        for row in working:
            if row.get("status") == "completed" and row["id"] not in valid_completed:
                row["status"] = "needs_fix"
                affected.add(row["id"])
                applied.append({"op": "downgrade", "id": row["id"]})

    validate_rows(working)  # fail-closed (includes M2 active-vs-retired rule)

    # Recompute every affected digest BEFORE touching disk. _row_digest/_design_digest reject
    # uncommitted-template markers, so any failure here happens with tasks.csv still untouched.
    rows_map = dict(qbd2.get("rows", {}))
    for row in working:
        if row["id"] in affected:
            rows_map[row["id"]] = _row_digest(root, row)
    new_design_digest = _design_digest(root)

    # All fallible work has succeeded. Commit tasks.csv, then task.json last; nothing between the
    # two writes can raise, so the two files can never disagree about the applied change set.
    write_csv(root / "tasks.csv", working, TASK_HEADERS)
    qbd2["rows"] = rows_map
    qbd2["designDigest"] = new_design_digest
    record["status"] = "approved"
    record["designDigest"] = new_design_digest
    _save(root, task)
    return {"id": amend_id, "decision": "pass", "status": "approved", "applied": applied}
