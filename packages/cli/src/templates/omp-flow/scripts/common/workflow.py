from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from .active_task import resolve_active_task
from .context import build_context
from .gates import _digest
from .io import WorkflowError, read_json, read_text
from .paths import flow_dir, task_dir


STATE_BLOCK = re.compile(
    r"\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n(.*?)\n\s*\[/workflow-state:\1\]",
    re.DOTALL,
)

# A markdown ``## `` heading line (level-2 only; deeper headings stay inside the
# section they belong to). Used by extract_section below.
SECTION_HEADING = re.compile(r"^##[ \t]+(.+?)[ \t]*$", re.MULTILINE)

# ``workflow explain`` section aliases -> the deployed workflow.md ``## `` heading
# text. Frozen in interface:cli-inspection-verbs. Reused by the Row D-A001--003
# SessionStart overview extractor (extract_section is the shared primitive).
EXPLAIN_SECTIONS = {
    "principles": "Principles",
    "phases": "Phase Index",
    "blocks": "Workflow State Blocks",
    "ownership": "Artifact Ownership",
    "topology": "Exact Topology",
    "routing": "Agent Routing",
    "commands": "Portable Commands",
    "guardrails": "Guardrails",
}


def extract_section(content: str, heading: str) -> str:
    """Return one ``## <heading>`` section of a markdown document, verbatim.

    The returned text runs from the ``## <heading>`` line through the line
    immediately before the next ``## `` heading (or end of document), with
    trailing whitespace stripped. The match is exact on the heading text (after
    trimming). Raises WorkflowError when the heading is absent so a caller never
    silently emits an empty section. This is the shared primitive behind both
    ``workflow explain`` and the SessionStart overview builder.
    """
    target = heading.strip()
    matches = list(SECTION_HEADING.finditer(content))
    for index, match in enumerate(matches):
        if match.group(1).strip() == target:
            start = match.start()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
            return content[start:end].rstrip()
    raise WorkflowError(f"workflow.md has no section: ## {target}")


def workflow_explain(repo: Path, section: str | None) -> str:
    """Render one ``## `` section of the DEPLOYED workflow.md on demand.

    ``section is None`` -> a plain-text listing of the valid section aliases.
    An unknown alias raises WorkflowError naming the valid aliases (the CLI turns
    that into exit 2). Read-only and identity-free.
    """
    valid = ", ".join(sorted(EXPLAIN_SECTIONS))
    if section is None:
        return "Sections: " + valid
    heading = EXPLAIN_SECTIONS.get(section)
    if heading is None:
        raise WorkflowError(f"Unknown workflow section: {section!r}. Valid sections: {valid}")
    content = read_text(flow_dir(repo) / "workflow.md")
    return extract_section(content, heading)


def load_state_blocks(repo: Path) -> dict[str, str]:
    content = read_text(flow_dir(repo) / "workflow.md")
    blocks = {match.group(1): match.group(2).strip() for match in STATE_BLOCK.finditer(content)}
    if not blocks:
        raise WorkflowError("workflow.md contains no [workflow-state:STATUS] blocks")
    return blocks


def workflow_state(repo: Path, payload: dict[str, Any] | None = None) -> str:
    active = resolve_active_task(repo, payload)
    blocks = load_state_blocks(repo)
    if not active.task_id:
        key = "no_task"
        header = "No active task for this session."
    elif active.stale:
        key = "stale"
        header = f"Active task pointer is stale: {active.task_id}"
    else:
        data = read_json(task_dir(repo, active.task_id) / "task.json")
        status = str(data.get("status") or "planning")
        phase = str(data.get("phase") or status)
        key = phase if phase in blocks else status
        header = f"Task: {active.task_id}\nStatus: {status}\nPhase: {phase}\nSource: {active.source}"
    body = blocks.get(key)
    if body is None:
        body = f"ERROR: workflow.md is missing [workflow-state:{key}]."
    return f"<workflow-state>\n{header}\n{body}\n</workflow-state>"


def codex_hook_output(repo: Path, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": workflow_state(repo, payload),
        }
    }


# ===========================================================================
# Claude Code hook control-plane API (Row C).
#
# A thin, deterministic, READ-ONLY adapter over the existing control plane
# (active_task / context / gates). The Row-D Claude Hook wrappers call these as
# ``omp_flow.py hook <kind>`` subprocesses: one UTF-8 JSON object on stdin, one
# UTF-8 JSON object on stdout. None of them mutates task lifecycle, gate
# pointers, decisions, Evidence, or session records -- all state changes remain
# in the existing explicit CLI operations. Fail-closed: any missing, stale, or
# invalid state raises WorkflowError (the CLI turns that into stderr + exit 2,
# which a Row-D wrapper renders as a visible denial).
#
# Session identity is the raw Claude ``session_id`` that the wrappers export as
# OMP_FLOW_CONTEXT_ID on every subprocess; ``resolve_active_task`` picks that up.
# The ``session_id`` field is additionally required in every payload and never
# trusted for anything other than presence validation. No guessed field aliases,
# no global active-task fallback, no permissive empty context.
# ===========================================================================

# ASCII protocol marker (JSON bodies use ensure_ascii=False; markers stay ASCII).
WORKFLOW_STATE_MARKER = "<!-- omp-flow-workflow-state -->"

# Claude events that inject workflow state (claude-hook-contract Settings Events).
CLAUDE_STATE_EVENTS = {"SessionStart", "UserPromptSubmit"}

# Descriptor role -> Python role. Names match build_context's roles except the
# QbD auditor, which does not use generic role context.
DISPATCH_ROLES = {"researcher", "architect", "executor", "reviewer"}
ROW_DISPATCH_ROLES = {"executor", "reviewer"}
QBD_ROLE = "qbd-auditor"

# Allowed descriptor keys per role. Every listed key is REQUIRED; any unlisted
# key denies (schema-drift guard). version/role/taskId are always required.
_ALWAYS_KEYS = {"version", "role", "taskId"}
_ROLE_EXTRA_KEYS: dict[str, set[str]] = {
    "researcher": set(),
    "architect": set(),
    "executor": {"rowId"},
    "reviewer": {"rowId"},
    QBD_ROLE: {"gate", "report", "evidenceDigest"},
}

# Match the existing OMP process boundary (design section 6): bounded project
# context; oversize denies dispatch rather than truncating.
MAX_CONTEXT_BYTES = 8 * 1024 * 1024

# No slash means no path traversal; task_dir still confirms the directory exists.
TASK_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
ROW_ID_RE = re.compile(r"^(?:[A-Z]-(?:[A-Z][0-9]{3})+--[0-9]{3}|[A-Z]-[0-9]{3})$")
QBD_GATES = ("qbd1", "qbd2")


def _require_dict(value: Any, what: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WorkflowError(f"{what} must be a JSON object")
    return value


def _require_session_id(payload: dict[str, Any]) -> str:
    session_id = payload.get("session_id")
    if not isinstance(session_id, str) or not session_id.strip():
        raise WorkflowError("Claude hook payload requires a non-empty string session_id")
    return session_id


def _bound_context(text: str) -> str:
    if not text or not text.strip():
        raise WorkflowError("Refusing to dispatch empty context")
    size = len(text.encode("utf-8"))
    if size > MAX_CONTEXT_BYTES:
        raise WorkflowError(
            f"Dispatch context is oversized ({size} bytes > {MAX_CONTEXT_BYTES}); denying dispatch"
        )
    return text


def _parse_descriptor(payload: dict[str, Any], allowed_roles: set[str]) -> tuple[dict[str, Any], str, str]:
    """Strictly parse ``payload['descriptor'] == {"ompFlowDispatch": {...}}``.

    Returns ``(body, role, task_id)``. Denies on wrong wrapper shape, wrong
    version, an unrecognized/out-of-scope role, any unknown or missing
    role-specific key, or an invalid taskId. No prose inference; no aliases.
    """
    descriptor = _require_dict(payload.get("descriptor"), "descriptor")
    if set(descriptor.keys()) != {"ompFlowDispatch"}:
        raise WorkflowError("descriptor must contain exactly one ompFlowDispatch object")
    body = _require_dict(descriptor["ompFlowDispatch"], "ompFlowDispatch")

    if body.get("version") != 1:
        raise WorkflowError("ompFlowDispatch.version must be exactly 1")
    role = body.get("role")
    if not isinstance(role, str) or role not in allowed_roles:
        raise WorkflowError(f"Unsupported dispatch role: {role!r}")

    allowed_keys = _ALWAYS_KEYS | _ROLE_EXTRA_KEYS[role]
    present = set(body.keys())
    unknown = present - allowed_keys
    if unknown:
        raise WorkflowError(f"Unknown descriptor keys for role {role}: {sorted(unknown)}")
    missing = allowed_keys - present
    if missing:
        raise WorkflowError(f"Missing descriptor keys for role {role}: {sorted(missing)}")

    task_id = body.get("taskId")
    if not isinstance(task_id, str) or ".." in task_id or not TASK_ID_RE.match(task_id):
        raise WorkflowError(f"Invalid descriptor taskId: {task_id!r}")
    return body, role, task_id


def _require_row_id(body: dict[str, Any]) -> str:
    row_id = body.get("rowId")
    if not isinstance(row_id, str) or not ROW_ID_RE.match(row_id):
        raise WorkflowError(f"Invalid descriptor rowId: {row_id!r}")
    return row_id


def _check_active_task(
    repo: Path,
    payload: dict[str, Any],
    task_id: str,
    *,
    require_selected: bool,
) -> None:
    """Enforce the session/descriptor active-task agreement.

    - A present-but-different or stale active task always denies (no mismatch is
      ever silently accepted, no global fallback to "the only task").
    - ``require_selected`` (QbD) additionally denies when the session has NOT
      selected the descriptor's task: an explicit descriptor never substitutes
      for a selected task.
    """
    active = resolve_active_task(repo, payload)
    if active.task_id:
        if active.stale:
            raise WorkflowError(f"Active task pointer is stale: {active.task_id}")
        if active.task_id != task_id:
            raise WorkflowError(
                f"Descriptor taskId {task_id} does not match the session's active task {active.task_id}"
            )
    elif require_selected:
        raise WorkflowError(
            f"QbD dispatch requires the session to have already selected task {task_id}; none is selected"
        )


def _audit_prompt(root: Path, gate: str, report: str, evidence_digest: str, evidence_paths: list[str]) -> str:
    """Reconstruct the exact prepared-gate audit prompt from recorded evidence.

    Byte-identical to ``gates.prepare_gate``'s prompt so the QbD auditor sees the
    same instructions whether the prompt is first minted by ``gate prepare`` or
    re-rendered read-only here. Kept in sync with gates.py by contract.
    """
    context = "\n\n".join(f"=== {rel} ===\n{read_text(root / rel)}" for rel in evidence_paths)
    return (
        f"Audit {gate} evidence adversarially. Write your report to exactly this absolute path (do not resolve it against the current directory): {(root / report).as_posix()}\n"
        f"Frontmatter must contain gate: {gate}, verdict: PASS|FAIL|NEEDS_EVIDENCE, "
        f"risk: low|medium|high, evidenceDigest: {evidence_digest}.\n\n{context}"
    )


def _read_only_prepared_gate(root: Path, task: dict[str, Any], gate: str) -> dict[str, Any]:
    """Validate that ``gate`` is currently prepared with fresh evidence, WITHOUT
    mutating anything (unlike ``gates.inspect_gate``, which flips status to stale
    and persists). Recomputes the digest from the recorded evidence paths on every
    call; a changed/missing evidence file denies."""
    gates = task.get("gates")
    if not isinstance(gates, dict):
        raise WorkflowError("task.json has no gate state")
    gate_data = gates.get(gate)
    if not isinstance(gate_data, dict) or gate_data.get("status") != "prepared":
        raise WorkflowError(f"{gate} is not currently prepared")
    report = gate_data.get("report")
    if not isinstance(report, str) or not report:
        raise WorkflowError(f"{gate} prepared state has no report path")
    evidence_paths = gate_data.get("evidencePaths")
    if not isinstance(evidence_paths, list) or not evidence_paths:
        raise WorkflowError(f"{gate} prepared state has no evidence paths")
    rel_paths = [str(rel) for rel in evidence_paths]
    current_digest = _digest(root, [root / rel for rel in rel_paths])  # reads files; raises if missing
    if current_digest != gate_data.get("evidenceDigest"):
        raise WorkflowError(f"{gate} evidence changed since prepare; the prepared report is stale")
    return {
        "gate": gate,
        "attempt": int(gate_data.get("attempt", 0)),
        "report": report,
        "evidenceDigest": current_digest,
        "evidencePaths": rel_paths,
        "prompt": _audit_prompt(root, gate, report, current_digest, rel_paths),
    }


def _single_prepared_gate(root: Path, task: dict[str, Any]) -> dict[str, Any]:
    """Discover THE currently prepared QbD gate for the write predicate. No gate
    is accepted from the caller; it is read from current Python state. Zero or
    more-than-one prepared gate denies (fail-closed / ambiguous)."""
    gates = task.get("gates")
    if not isinstance(gates, dict):
        raise WorkflowError("task.json has no gate state")
    prepared = [
        name
        for name in QBD_GATES
        if isinstance(gates.get(name), dict) and gates[name].get("status") == "prepared"
    ]
    if not prepared:
        raise WorkflowError("No currently prepared QbD gate for this task")
    if len(prepared) > 1:
        raise WorkflowError("Ambiguous QbD state: more than one prepared gate")
    return _read_only_prepared_gate(root, task, prepared[0])


def _read_only_prepared_amend(root: Path, task: dict[str, Any]) -> dict[str, Any] | None:
    """Return the single currently prepared amendment's re-rendered delta-audit context,
    or None when zero (or ambiguously more than one) amendment is prepared. Recomputes the
    bundle digest from the recorded evidence on every call; a changed evidence file raises.
    This is the amendment analogue of ``_read_only_prepared_gate`` for the Claude adapter."""
    from .amend import _amend_digest, amend_audit_prompt  # local import: avoid any import cycle

    amendments = task.get("amendments")
    if not isinstance(amendments, list):
        return None
    prepared = [a for a in amendments if isinstance(a, dict) and a.get("status") == "prepared"]
    if len(prepared) != 1:
        return None
    rec = prepared[0]
    report = rec.get("report")
    rel_paths = rec.get("evidencePaths")
    design_digest = rec.get("designDigest")
    amend_id = rec.get("id")
    if not (
        isinstance(report, str) and report
        and isinstance(rel_paths, list) and rel_paths
        and isinstance(design_digest, str)
        and isinstance(amend_id, str)
    ):
        return None
    rel = [str(item) for item in rel_paths]
    current_digest = _amend_digest(root, [root / item for item in rel], design_digest)
    if current_digest != rec.get("evidenceDigest"):
        raise WorkflowError("amendment evidence changed since prepare; the prepared report is stale")
    return {
        "amendId": amend_id,
        "report": report,
        "evidenceDigest": current_digest,
        "attempt": int(rec.get("attempt", 0)),
        "prompt": amend_audit_prompt(root, amend_id, report, current_digest, rel, design_digest),
    }


def _resolve_repo_target(repo: Path, target: str) -> Path:
    candidate = Path(target)
    if not candidate.is_absolute():
        candidate = repo / target
    resolved = candidate.resolve()
    try:
        resolved.relative_to(repo.resolve())
    except ValueError as exc:
        raise WorkflowError(f"Write target escapes repository root: {target}") from exc
    return resolved


# --- Operation 1: Claude session workflow-state injection. ------------------
def claude_workflow_state(repo: Path, payload: dict[str, Any]) -> dict[str, Any]:
    """SessionStart / UserPromptSubmit workflow-state envelope, keyed by the raw
    Claude session (exported as OMP_FLOW_CONTEXT_ID). Mirrors codex_hook_output
    but tags the documented Claude event name and the ASCII state marker."""
    _require_dict(payload, "payload")
    _require_session_id(payload)
    event = payload.get("event", "SessionStart")
    if event not in CLAUDE_STATE_EVENTS:
        raise WorkflowError(f"Unsupported Claude workflow-state event: {event!r}")
    state = workflow_state(repo, payload)
    return {
        "hookSpecificOutput": {
            "hookEventName": event,
            "additionalContext": f"{WORKFLOW_STATE_MARKER}\n{state}",
        }
    }


# --- Operation 2: Typed dispatch-context (research/architect/executor/reviewer). ---
def claude_dispatch_context(repo: Path, payload: dict[str, Any]) -> dict[str, Any]:
    """Resolve the bounded Python handoff prompt for a validated dispatch
    descriptor. Executor/Reviewer flow through build_context, which performs the
    CURRENT per-row ``verify_row_frozen`` check (so an open amendment or a stale
    row digest denies exactly as ``topology ready``/``context`` do). Research/
    Architect flow through the same build_context planning path."""
    _require_dict(payload, "payload")
    _require_session_id(payload)
    body, role, task_id = _parse_descriptor(payload, DISPATCH_ROLES)
    _check_active_task(repo, payload, task_id, require_selected=False)

    assignment = payload.get("assignment", "")
    if not isinstance(assignment, str):
        raise WorkflowError("assignment must be a string")

    row_id = _require_row_id(body) if role in ROW_DISPATCH_ROLES else None
    prompt = build_context(repo, task_id, role, assignment, row_id=row_id)
    _bound_context(prompt)
    result: dict[str, Any] = {"role": role, "taskId": task_id, "prompt": prompt}
    if row_id is not None:
        result["rowId"] = row_id
    return result


# --- Operation 3: QbD prepared-gate validation (read-only). -----------------
def claude_qbd_report(repo: Path, payload: dict[str, Any]) -> dict[str, Any]:
    """Accept a QbD dispatch ONLY when the payload session has already selected
    the descriptor's exact taskId AND there is a currently prepared gate whose
    report and current evidence digest exactly equal the descriptor. Returns only
    that prepared report/digest (plus the re-rendered audit prompt). No mutation,
    no attempt increment, no authorization record."""
    _require_dict(payload, "payload")
    _require_session_id(payload)
    body, role, task_id = _parse_descriptor(payload, {QBD_ROLE})
    _check_active_task(repo, payload, task_id, require_selected=True)

    gate = body["gate"]
    if gate not in QBD_GATES:
        raise WorkflowError(f"Invalid QbD gate: {gate!r}")
    report = body["report"]
    if not isinstance(report, str) or not report:
        raise WorkflowError("descriptor report must be a non-empty string")
    digest = body["evidenceDigest"]
    if not isinstance(digest, str) or not digest.startswith("sha256:"):
        raise WorkflowError("descriptor evidenceDigest must be a sha256 digest")

    root = task_dir(repo, task_id)
    task = read_json(root / "task.json")
    amend = _read_only_prepared_amend(root, task)
    if amend is not None and amend["report"] == report:
        # Amendment delta-audit dispatch: descriptor gate stays qbd2 (the amend lives under
        # qbd/qbd-2/), but the prepared state is the amendment record, not the qbd2 gate.
        if amend["evidenceDigest"] != digest:
            raise WorkflowError("Descriptor evidenceDigest does not match the current prepared amendment digest")
        _bound_context(amend["prompt"])
        return {
            "role": role,
            "taskId": task_id,
            "gate": gate,
            "report": amend["report"],
            "evidenceDigest": amend["evidenceDigest"],
            "attempt": amend["attempt"],
            "prompt": amend["prompt"],
        }
    prepared = _read_only_prepared_gate(root, task, gate)
    if prepared["report"] != report:
        raise WorkflowError(
            f"Descriptor report {report} does not match the prepared report {prepared['report']}"
        )
    if prepared["evidenceDigest"] != digest:
        raise WorkflowError("Descriptor evidenceDigest does not match the current prepared digest")
    _bound_context(prepared["prompt"])
    return {
        "role": role,
        "taskId": task_id,
        "gate": gate,
        "report": prepared["report"],
        "evidenceDigest": prepared["evidenceDigest"],
        "attempt": prepared["attempt"],
        "prompt": prepared["prompt"],
    }


# --- Operation 4: Protected-write predicate (read-only, recomputed each call). ---
def claude_protect_write(repo: Path, payload: dict[str, Any]) -> dict[str, Any]:
    """Decide whether a QbD report Write is currently eligible for the protected-
    path exception. Recomputed on EVERY call from session + gate + digest + report
    + path; nothing is written. All terms must agree:

    1. ``agent_type`` is exactly ``omp-flow-qbd`` and ``agent_id`` is non-empty;
    2. the session's currently selected task (never a request-supplied task);
    3. a single currently prepared QbD gate whose current evidence digest matches;
    4. the normalized Write target equals that gate's exact reserved report path.

    Any absent/unequal term denies (raises). ``Edit`` never reaches here (Row D
    routes only ``Write``). No lifecycle/gate/decision/evidence/session mutation.
    """
    _require_dict(payload, "payload")
    _require_session_id(payload)

    if payload.get("agent_type") != "omp-flow-qbd":
        raise WorkflowError("Protected QbD Write exception requires agent_type omp-flow-qbd")
    agent_id = payload.get("agent_id")
    if not isinstance(agent_id, str) or not agent_id.strip():
        raise WorkflowError("Protected QbD Write exception requires a non-empty agent_id")
    target = payload.get("path")
    if not isinstance(target, str) or not target.strip():
        raise WorkflowError("Protected QbD Write predicate requires a target path")

    active = resolve_active_task(repo, payload)
    if not active.task_id:
        raise WorkflowError("No active task for this session; QbD Write is not eligible")
    if active.stale:
        raise WorkflowError(f"Active task pointer is stale: {active.task_id}")

    root = task_dir(repo, active.task_id)
    task = read_json(root / "task.json")
    resolved_target = _resolve_repo_target(repo, target)

    # Amendment delta-audit report is the analogue of the QbD report exception: allow the
    # omp-flow-qbd auditor to write exactly the single prepared amendment's report path.
    amend = _read_only_prepared_amend(root, task)
    if amend is not None:
        expected_amend = (root / amend["report"]).resolve()
        if os.path.normcase(str(resolved_target)) == os.path.normcase(str(expected_amend)):
            return {
                "decision": "allow",
                "taskId": active.task_id,
                "amendId": amend["amendId"],
                "report": amend["report"],
                "agentType": "omp-flow-qbd",
                "targetPath": resolved_target.as_posix(),
            }

    prepared = _single_prepared_gate(root, task)
    expected = (root / prepared["report"]).resolve()
    if os.path.normcase(str(resolved_target)) != os.path.normcase(str(expected)):
        raise WorkflowError(
            f"Write target {target} is not the current prepared QbD report {prepared['report']}"
        )
    return {
        "decision": "allow",
        "taskId": active.task_id,
        "gate": prepared["gate"],
        "report": prepared["report"],
        "agentType": "omp-flow-qbd",
        "targetPath": resolved_target.as_posix(),
    }
