#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if sys.platform.startswith("win"):
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]

from common.active_task import clear_active_task, resolve_active_task, set_active_task
from common.amend import (
    amend_decide,
    amend_inspect,
    amend_prepare,
    amend_propose,
    amend_set_change,
)
from common.context import build_context
from common.evidence import submit_evidence
from common.gates import (
    decide_gate,
    inspect_gate,
    prepare_gate,
    reset_gate,
    verify_approved_gate,
    verify_design_frozen,
    verify_row_frozen,
)
from common.io import WorkflowError, atomic_write_json, atomic_write_text, read_json, read_text
from common.paths import find_repo_root, flow_dir, task_dir, tasks_dir
from common.reference import digest_file, list_references, render_references
from common.task_store import archive_task, create_task, list_tasks
from common.topology import ready_rows, read_rows, validate_rows
from common.workflow import (
    claude_dispatch_context,
    claude_protect_write,
    claude_qbd_report,
    claude_workflow_state,
    codex_hook_output,
    workflow_explain,
    workflow_state,
)


def _repo(args: argparse.Namespace) -> Path:
    return find_repo_root(Path(args.cwd or os.getcwd()))


def _active_id(repo: Path, explicit: str | None) -> str:
    if explicit:
        return explicit
    active = resolve_active_task(repo)
    if not active.task_id:
        raise WorkflowError("No active task for this session; pass --task explicitly")
    if active.stale:
        raise WorkflowError(f"Active task pointer is stale: {active.task_id}")
    return active.task_id


def _save_task(root: Path, task: dict[str, Any]) -> None:
    task["updatedAt"] = datetime.now(timezone.utc).isoformat()
    atomic_write_json(root / "task.json", task)


def _by_status(rows: list[dict[str, str]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        status = row.get("status") or ""
        counts[status] = counts.get(status, 0) + 1
    return counts


def _read_rows_safe(root: Path) -> list[dict[str, str]]:
    """Rows from tasks.csv, tolerating an absent/empty file (returns [])."""
    path = root / "tasks.csv"
    if not path.is_file():
        return []
    return read_rows(path)


def _topology_summary(root: Path) -> dict[str, Any] | None:
    """Compact ``{rows, byStatus}`` topology summary, or None when tasks.csv is
    absent/empty (interface:cli-inspection-verbs)."""
    rows = _read_rows_safe(root)
    if not rows:
        return None
    return {"rows": len(rows), "byStatus": _by_status(rows)}


def _status_command(args: argparse.Namespace) -> Any:
    """`status [--task]` -- null-safe on missing/stale session identity.

    Never hard-fails on identity: with no session task the result is
    ``{"active": null, "task": null, "topology": null}`` (exit 0); a stale pointer
    reports the pointer with ``task``/``topology`` null. An explicit ``--task``
    always reports that task (a bad id is a real error -> exit 2)."""
    repo = _repo(args)
    active = resolve_active_task(repo)
    active_out = active.__dict__ if active.task_id else None
    if args.task:
        task_id = args.task
    elif active.task_id and not active.stale:
        task_id = active.task_id
    else:
        return {"active": active_out, "task": None, "topology": None}
    root = task_dir(repo, task_id)
    return {
        "active": active_out,
        "task": read_json(root / "task.json"),
        "topology": _topology_summary(root),
    }


def _task_show(repo: Path, task_id: str) -> Any:
    """`task show [ID]` -- summary-only (gate DETAIL stays in `gate inspect`).

    Reads task.json + gate status/attempt + row counts + evidence count. A missing
    task is a real error (exit 2) naming `task list`; empty tasks.csv/evidence.csv
    degrade to zero counts."""
    root = tasks_dir(repo) / task_id
    task_json = root / "task.json"
    if not task_json.is_file():
        raise WorkflowError(f"Task not found: {task_id}. Run `task list` to see available tasks.")
    task = read_json(task_json)
    gates = task.get("gates") if isinstance(task.get("gates"), dict) else {}
    gate_summary = {
        name: {"status": data.get("status"), "attempt": data.get("attempt")}
        for name, data in gates.items()
        if isinstance(data, dict)
    }
    rows = _read_rows_safe(root)
    evidence_path = root / "evidence.csv"
    evidence_entries = len(read_rows(evidence_path)) if evidence_path.is_file() else 0
    return {
        "task": task,
        "gates": gate_summary,
        "topology": {
            "rows": len(rows),
            "frozen": bool(task.get("topologyFrozen")),
            "byStatus": _by_status(rows),
        },
        "evidence": {"entries": evidence_entries},
        "taskDir": root.relative_to(repo).as_posix(),
    }


def _task_command(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    if args.task_action == "create":
        return create_task(repo, args.title, slug=args.slug, parent=args.parent, no_start=args.no_start)
    if args.task_action == "list":
        tasks = list_tasks(repo)
        if args.status:
            tasks = [task for task in tasks if task.get("status") == args.status]
        if args.phase:
            tasks = [task for task in tasks if task.get("phase") == args.phase]
        return tasks
    if args.task_action == "show":
        task_id = _active_id(repo, args.task)
        return _task_show(repo, task_id)
    if args.task_action == "current":
        active = resolve_active_task(repo)
        return {"taskId": active.task_id, "source": active.source, "contextKey": active.context_key, "stale": active.stale}
    if args.task_action == "start":
        task_id = _active_id(repo, args.task)
        root = task_dir(repo, task_id)
        task = read_json(root / "task.json")
        if task.get("phase") != "ready":
            raise WorkflowError("Task start requires phase=ready")
        for gate in ("qbd1", "qbd2"):
            verify_approved_gate(repo, task_id, gate)
        rows = read_rows(root / "tasks.csv")
        validate_rows(rows)
        if not rows:
            raise WorkflowError("Task start requires at least one topology row")
        for row in rows:
            verify_row_frozen(repo, task_id, row["id"])
        task["status"] = "in_progress"
        task["phase"] = "execute"
        _save_task(root, task)
        set_active_task(repo, task_id)
        return task
    if args.task_action == "rework":
        task_id = _active_id(repo, args.task)
        root = task_dir(repo, task_id)
        task = read_json(root / "task.json")
        reason = args.reason.strip()
        if not reason:
            raise WorkflowError("Task rework requires a non-empty --reason")
        if task.get("status") != "in_progress" or task.get("phase") != "execute":
            raise WorkflowError("Task rework requires an executing task")
        if not task.get("topologyFrozen"):
            raise WorkflowError("Task rework requires a QbD 2-frozen topology")
        rows = read_rows(root / "tasks.csv")
        validate_rows(rows)
        completed = [row["id"] for row in rows if row.get("status") == "completed"]
        if completed:
            raise WorkflowError(
                "Task rework is forbidden after completed rows: " + ", ".join(completed)
            )
        qbd2 = task.get("gates", {}).get("qbd2", {})
        if qbd2.get("status") != "approved":
            raise WorkflowError("Task rework requires approved QbD 2")
        attempt = int(qbd2.get("attempt", 0))
        record = root / ".summaries" / f"rework-qbd2-{attempt:03d}.md"
        atomic_write_text(record, (
            f"# Topology Rework: {task_id}\n\n"
            f"QbD 2 attempt: {attempt}\n\n"
            f"Reason: {reason}\n"
        ))
        task["status"] = "planning"
        task["phase"] = "decompose"
        task["topologyFrozen"] = False
        qbd2["status"] = "needs_revision"
        qbd2["reworkRecord"] = record.relative_to(root).as_posix()
        _save_task(root, task)
        return {"taskId": task_id, "phase": task["phase"], "reworkRecord": qbd2["reworkRecord"]}
    if args.task_action == "redesign":
        task_id = _active_id(repo, args.task)
        root = task_dir(repo, task_id)
        task = read_json(root / "task.json")
        reason = args.reason.strip()
        if not reason:
            raise WorkflowError("Task redesign requires a non-empty --reason")
        if task.get("status") != "planning" or task.get("phase") != "qbd2":
            raise WorkflowError("Task redesign requires planning phase=qbd2")
        if any(row.get("status") == "completed" for row in read_rows(root / "tasks.csv")):
            raise WorkflowError("Task redesign is forbidden after completed rows")
        record = root / ".summaries" / "redesign-qbd.md"
        atomic_write_text(record, f"# Design Revision: {task_id}\n\nReason: {reason}\n")
        task["phase"] = "design"
        task["topologyFrozen"] = False
        for gate in ("qbd1", "qbd2"):
            task["gates"][gate]["status"] = "needs_revision"
        _save_task(root, task)
        return {"taskId": task_id, "phase": "design", "record": record.relative_to(root).as_posix()}
    if args.task_action == "select":
        task_id = args.task or getattr(args, "task_flag", None)
        if not task_id:
            raise WorkflowError("task select requires a task id (positional or --task)")
        return set_active_task(repo, task_id).__dict__
    if args.task_action == "finish":
        task_id = _active_id(repo, args.task)
        root = task_dir(repo, task_id)
        rows = read_rows(root / "tasks.csv")
        finished_statuses = {"completed", "superseded", "cancelled"}
        if any(row.get("status") not in finished_statuses for row in rows):
            raise WorkflowError(
                "All topology rows must be completed, superseded, or cancelled before finish"
            )
        task = read_json(root / "task.json")
        task["status"] = "completed"
        task["phase"] = "completed"
        _save_task(root, task)
        return task
    if args.task_action == "archive":
        task_id = _active_id(repo, args.task)
        return {"archivedTo": str(archive_task(repo, task_id))}
    if args.task_action == "clear":
        return clear_active_task(repo).__dict__
    raise WorkflowError(f"Unknown task action: {args.task_action}")


def _workflow_command(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    if args.workflow_action == "state":
        return workflow_state(repo)
    if args.workflow_action == "explain":
        return workflow_explain(repo, args.section)
    if args.workflow_action == "select-synthesis":
        task_id = _active_id(repo, args.task)
        root = task_dir(repo, task_id)
        relative = args.path.replace("\\", "/")
        if not re.fullmatch(r"research/90-synthesis-[A-Za-z0-9._-]+\.md", relative):
            raise WorkflowError("Selected synthesis must match research/90-synthesis-*.md")
        read_text(root / relative)
        task = read_json(root / "task.json")
        if task.get("phase") != "explore":
            raise WorkflowError("Synthesis selection requires phase=explore")
        task["selectedSynthesis"] = relative
        task["phase"] = "design"
        _save_task(root, task)
        return task
    raise WorkflowError(f"Unknown workflow action: {args.workflow_action}")


def _topology_command(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    task_id = _active_id(repo, args.task)
    root = task_dir(repo, task_id)
    if args.topology_action == "amend":
        return _amend_command(args, repo, task_id)
    rows = read_rows(root / "tasks.csv")
    if args.topology_action == "list":
        try:
            validation: dict[str, Any] = {"ok": True, "waves": validate_rows(rows)}
        except WorkflowError as exc:
            validation = {"ok": False, "error": str(exc)}
        return {
            "taskId": task_id,
            "rows": rows,
            "byStatus": _by_status(rows),
            "validation": validation,
        }
    if args.topology_action == "validate":
        return {"taskId": task_id, "rows": len(rows), "waves": validate_rows(rows)}
    if args.topology_action == "ready":
        task = read_json(root / "task.json")
        if task.get("phase") != "execute" or task.get("status") != "in_progress":
            raise WorkflowError("Topology ready requires an executing task")
        verify_design_frozen(repo, task_id)
        ready = ready_rows(rows, args.role)
        if args.role == "executor":
            for row in ready:
                verify_row_frozen(repo, task_id, row["id"])
                row["assignment"] = build_context(repo, task_id, "executor", args.assignment or "Implement the assigned row.", row_id=row["id"])
        return {"taskId": task_id, "role": args.role, "rows": ready}
    if args.topology_action == "mark-result":
        task = read_json(root / "task.json")
        if task.get("phase") != "execute" or task.get("status") != "in_progress":
            raise WorkflowError("Topology mark-result requires an executing task")
        verify_row_frozen(repo, task_id, args.row)
        validate_rows(rows)
        row = next((item for item in rows if item.get("id") == args.row), None)
        if row is None:
            raise WorkflowError(f"Row not found: {args.row}")
        if row.get("status") not in {"pending", "needs_fix"}:
            raise WorkflowError(f"Row {args.row} is not executable: status={row.get('status')}")
        row["status"] = "review" if args.result == "success" else "needs_fix"
        from common.evidence import write_csv
        from common.task_store import TASK_HEADERS
        write_csv(root / "tasks.csv", rows, TASK_HEADERS)
        return row
    raise WorkflowError(f"Unknown topology action: {args.topology_action}")


def _amend_command(args: argparse.Namespace, repo: Path, task_id: str) -> Any:
    if args.amend_action == "propose":
        return amend_propose(repo, task_id, args.reason)
    if args.amend_action == "set-change":
        return amend_set_change(repo, task_id, args.change)
    if args.amend_action == "prepare":
        return amend_prepare(repo, task_id)
    if args.amend_action == "inspect":
        return amend_inspect(repo, task_id)
    if args.amend_action == "decide":
        return amend_decide(repo, task_id, args.decision, args.note or "")
    raise WorkflowError(f"Unknown amend action: {args.amend_action}")


def _reference_command(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    task_id = _active_id(repo, args.task)
    if args.reference_action == "digest-file":
        result = digest_file(repo, task_id, args.source_repo, args.source_path,
            line_start=args.line_start, line_end=args.line_end, summary=args.summary or "", intent=args.intent or "")
        return {"reference": result, "ref": f"ref:{result['slug']}"}
    if args.reference_action == "list":
        return list_references(repo, task_id)
    if args.reference_action == "render":
        return render_references(repo, task_id, args.refs)
    raise WorkflowError(f"Unknown reference action: {args.reference_action}")


def _gate_command(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    task_id = _active_id(repo, args.task)
    if args.gate_action == "prepare":
        return prepare_gate(repo, task_id, args.gate)
    if args.gate_action == "inspect":
        return inspect_gate(repo, task_id, args.gate)
    if args.gate_action == "decide":
        return decide_gate(repo, task_id, args.gate, args.decision, args.note or "")
    if args.gate_action == "reset":
        return reset_gate(repo, task_id, args.gate, args.reason)
    raise WorkflowError(f"Unknown gate action: {args.gate_action}")


def _evidence_command(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    task_id = _active_id(repo, args.task)
    return submit_evidence(repo, task_id, args.row, args.verdict, args.tests_run,
        args.tests_failed, args.report, args.evidence or "", args.reviewer_agent_id)


def _doctor(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    findings = []
    legacy_active = flow_dir(repo) / "tasks" / ".active-task"
    if legacy_active.exists():
        findings.append({"kind": "legacy-active-task", "path": str(legacy_active)})
    for path in (flow_dir(repo) / "tasks").glob("*/plan.json"):
        findings.append({"kind": "legacy-plan", "path": str(path)})
    for path in (flow_dir(repo) / "tasks").glob("*/tasks.csv"):
        first = read_text(path, required=False).splitlines()
        if first and "dependsOn" in first[0]:
            findings.append({"kind": "legacy-depends-on", "path": str(path)})
    # Informational: a QbD 2 approved before per-row digests existed has no gates.qbd2.rows. The
    # runtime already falls back to the legacy whole-topology check (verify_row_frozen), so this is
    # purely diagnostic -- it flags tasks that would benefit from a fresh QbD 2 to gain per-row freeze.
    for path in (flow_dir(repo) / "tasks").glob("*/task.json"):
        task = read_json(path, required=False)
        if not isinstance(task, dict):
            continue
        qbd2 = task.get("gates", {}).get("qbd2", {})
        if isinstance(qbd2, dict) and qbd2.get("status") == "approved" and "rows" not in qbd2:
            findings.append({"kind": "legacy-qbd2-whole-digest", "path": str(path)})
    return {"ok": not findings, "findings": findings}


EPILOG = (
    "Examples:\n"
    "  omp_flow.py status                    # where am I (null-safe session/task/topology)\n"
    "  omp_flow.py status --task <id>        # topology summary for a specific task\n"
    "  omp_flow.py task show <id>            # one task's gates, row counts, evidence count\n"
    "  omp_flow.py topology list             # every row + status counts + DAG validation\n"
    "  omp_flow.py workflow explain phases   # print one section of the deployed workflow.md\n"
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Portable omp-flow workflow core",
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--cwd", help="Project root override (defaults to the current directory)")
    sub = parser.add_subparsers(dest="command", required=True)

    def leaf(subparsers: Any, name: str, text: str, **kwargs: Any) -> argparse.ArgumentParser:
        # help= surfaces in the parent listing; description= surfaces in this
        # command's own -h. Setting both makes every subparser -h non-empty.
        return subparsers.add_parser(name, help=text, description=text, **kwargs)

    task = leaf(sub, "task", "Task lifecycle and read-only task inspection")
    task_sub = task.add_subparsers(dest="task_action", required=True)
    create = leaf(task_sub, "create", "Create a new task and (unless --no-start) select it")
    create.add_argument("title", help="Human-readable task title")
    create.add_argument("--slug", help="Explicit slug override for the task id")
    create.add_argument("--parent", help="Parent task id for a child task")
    create.add_argument("--no-start", action="store_true", help="Create without selecting the task for this session")
    for name in ("start", "finish", "archive"):
        item = leaf(task_sub, name, f"{name.capitalize()} the session-active or given task")
        item.add_argument("task", nargs="?", help="Task id (defaults to the session-active task)")
    select = leaf(task_sub, "select", "Select the session-active task (positional id or --task alias)")
    select.add_argument("task", nargs="?", help="Task id to select")
    select.add_argument("--task", dest="task_flag", help="Task id to select (alias of the positional)")
    show = leaf(task_sub, "show", "Read-only summary of one task (gates, row counts, evidence count)")
    show.add_argument("task", nargs="?", help="Task id (defaults to the session-active task)")
    rework = leaf(task_sub, "rework", "Return an executing task to decompose for a fresh QbD 2")
    rework.add_argument("--task", help="Task id (defaults to the session-active task)")
    rework.add_argument("--reason", required=True, help="Why the topology needs rework")
    redesign = leaf(task_sub, "redesign", "Return a QbD-2 task to design for revision")
    redesign.add_argument("--task", help="Task id (defaults to the session-active task)")
    redesign.add_argument("--reason", required=True, help="Why the design needs revision")
    leaf(task_sub, "current", "Print the session-active task pointer")
    task_list = leaf(task_sub, "list", "List tasks, optionally filtered by --status/--phase")
    task_list.add_argument("--status", help="Only tasks whose status equals this value")
    task_list.add_argument("--phase", help="Only tasks whose phase equals this value")
    leaf(task_sub, "clear", "Clear the session-active task pointer")

    workflow = leaf(sub, "workflow", "Workflow-state and on-demand methodology help")
    workflow_sub = workflow.add_subparsers(dest="workflow_action", required=True)
    leaf(workflow_sub, "state", "Print the current workflow-state block")
    explain = leaf(workflow_sub, "explain", "Print one section of the deployed workflow.md")
    explain.add_argument("section", nargs="?", help="Section alias (omit to list valid sections)")
    select_synthesis = leaf(workflow_sub, "select-synthesis", "Select the design synthesis and advance to design")
    select_synthesis.add_argument("--task", help="Task id (defaults to the session-active task)")
    select_synthesis.add_argument("--path", required=True, help="research/90-synthesis-*.md path to select")

    context = leaf(sub, "context", "Render the bounded role/handoff context for a task")
    context.add_argument("--role", required=True, help="Dispatch role (researcher/architect/executor/reviewer)")
    context.add_argument("--task", help="Task id (defaults to the session-active task)")
    context.add_argument("--row", help="Row id for executor/reviewer context")
    context.add_argument("--prompt", help="Assignment text (defaults to stdin)")

    topology = leaf(sub, "topology", "Exact-topology validation, readiness, listing, and amendments")
    topology_sub = topology.add_subparsers(dest="topology_action", required=True)
    validate = leaf(topology_sub, "validate", "Validate the exact-topology DAG and derived waves")
    validate.add_argument("--task", help="Task id (defaults to the session-active task)")
    ready = leaf(topology_sub, "ready", "List topology-ready rows for a role")
    ready.add_argument("--task", help="Task id (defaults to the session-active task)")
    ready.add_argument("--role", default="executor", choices=("executor", "reviewer"), help="Dispatch role")
    ready.add_argument("--assignment", help="Assignment text pushed into executor context")
    topo_list = leaf(topology_sub, "list", "List every row with status counts and non-fatal DAG validation")
    topo_list.add_argument("--task", help="Task id (defaults to the session-active task)")
    mark = leaf(topology_sub, "mark-result", "Record a row execution result (review/needs_fix)")
    mark.add_argument("--task", help="Task id (defaults to the session-active task)")
    mark.add_argument("--row", required=True, help="Row id")
    mark.add_argument("--result", required=True, choices=("success", "failure"), help="Execution result")

    amend = leaf(topology_sub, "amend", "Approved-amendment loop over a frozen topology")
    amend_sub = amend.add_subparsers(dest="amend_action", required=True)
    amend_propose_parser = leaf(amend_sub, "propose", "Open an amendment proposal")
    amend_propose_parser.add_argument("--task", help="Task id (defaults to the session-active task)")
    amend_propose_parser.add_argument("--reason", required=True, help="Why the topology needs an amendment")
    amend_set_change_parser = leaf(amend_sub, "set-change", "Set the amendment change-set JSON")
    amend_set_change_parser.add_argument("--task", help="Task id (defaults to the session-active task)")
    amend_set_change_parser.add_argument("--change", required=True, help="Change-set JSON")
    for name in ("prepare", "inspect"):
        item = leaf(amend_sub, name, f"{name.capitalize()} the open amendment")
        item.add_argument("--task", help="Task id (defaults to the session-active task)")
    amend_decide_parser = leaf(amend_sub, "decide", "Human decision on the prepared amendment")
    amend_decide_parser.add_argument("--task", help="Task id (defaults to the session-active task)")
    amend_decide_parser.add_argument("--decision", required=True, choices=("pass", "reject"), help="Human decision")
    amend_decide_parser.add_argument("--note", help="Optional decision note")

    reference = leaf(sub, "reference", "Tier-2 reference digestion and rendering")
    reference_sub = reference.add_subparsers(dest="reference_action", required=True)
    digest = leaf(reference_sub, "digest-file", "Digest a source slice into the reference store")
    digest.add_argument("--task", help="Task id (defaults to the session-active task)")
    digest.add_argument("--source-repo", required=True, help="Source repository label")
    digest.add_argument("--source-path", required=True, help="Path within the source repository")
    digest.add_argument("--line-start", type=int, help="First line of the slice")
    digest.add_argument("--line-end", type=int, help="Last line of the slice")
    digest.add_argument("--summary", help="Human summary of the slice")
    digest.add_argument("--intent", help="Why the slice is referenced")
    ref_list = leaf(reference_sub, "list", "List digested references")
    ref_list.add_argument("--task", help="Task id (defaults to the session-active task)")
    render = leaf(reference_sub, "render", "Render selected references")
    render.add_argument("--task", help="Task id (defaults to the session-active task)")
    render.add_argument("--refs", required=True, help="Comma-separated ref ids")

    gate = leaf(sub, "gate", "QbD gate preparation, inspection, decision, and reset")
    gate_sub = gate.add_subparsers(dest="gate_action", required=True)
    for name in ("prepare", "inspect"):
        item = leaf(gate_sub, name, f"{name.capitalize()} a QbD gate")
        item.add_argument("gate", choices=("qbd1", "qbd2"), help="Which QbD gate")
        item.add_argument("--task", help="Task id (defaults to the session-active task)")
    decide = leaf(gate_sub, "decide", "Record the human decision on a gate")
    decide.add_argument("gate", choices=("qbd1", "qbd2"), help="Which QbD gate")
    decide.add_argument("--task", help="Task id (defaults to the session-active task)")
    decide.add_argument("--decision", required=True, choices=("pass", "reject"), help="Human decision")
    decide.add_argument("--note", help="Optional decision note")
    reset = leaf(gate_sub, "reset", "Reset a stuck gate to a clean pre-prepare state")
    reset.add_argument("gate", choices=("qbd1", "qbd2"), help="Which QbD gate")
    reset.add_argument("--task", help="Task id (defaults to the session-active task)")
    reset.add_argument("--reason", required=True, help="Why the gate is being reset")

    evidence = leaf(sub, "evidence", "Structured review evidence submission")
    evidence_sub = evidence.add_subparsers(dest="evidence_action", required=True)
    submit = leaf(evidence_sub, "submit", "Append a review evidence record")
    submit.add_argument("--task", help="Task id (defaults to the session-active task)")
    submit.add_argument("--row", required=True, help="Row id under review")
    submit.add_argument("--verdict", required=True, choices=("pass", "fail"), help="Review verdict")
    submit.add_argument("--tests-run", required=True, type=int, help="Number of tests run")
    submit.add_argument("--tests-failed", required=True, type=int, help="Number of tests failed")
    submit.add_argument("--report", required=True, help="Path to the review report artifact")
    submit.add_argument("--evidence", help="Free-form evidence note")
    submit.add_argument("--reviewer-agent-id", required=True, help="Reviewer agent id")

    hook = leaf(sub, "hook", "Harness hook control-plane bridge (JSON stdin/stdout)")
    hook.add_argument("kind", choices=(
        "codex-workflow-state",
        "claude-workflow-state",
        "claude-dispatch-context",
        "claude-qbd-report",
        "claude-protect-write",
    ), help="Hook kind")
    status = leaf(sub, "status", "Where am I: null-safe session/task/topology summary")
    status.add_argument("--task", help="Report a specific task instead of the session-active one")
    leaf(sub, "doctor", "Diagnose legacy state without mutating anything")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "task":
            result = _task_command(args)
        elif args.command == "workflow":
            result = _workflow_command(args)
        elif args.command == "context":
            repo = _repo(args)
            task_id = _active_id(repo, args.task)
            assignment = args.prompt if args.prompt is not None else sys.stdin.read()
            result = build_context(repo, task_id, args.role, assignment, row_id=args.row)
        elif args.command == "topology":
            result = _topology_command(args)
        elif args.command == "reference":
            result = _reference_command(args)
        elif args.command == "gate":
            result = _gate_command(args)
        elif args.command == "evidence":
            result = _evidence_command(args)
        elif args.command == "hook":
            payload = json.load(sys.stdin)
            repo = _repo(args)
            if args.kind == "codex-workflow-state":
                result = codex_hook_output(repo, payload)
            elif args.kind == "claude-workflow-state":
                result = claude_workflow_state(repo, payload)
            elif args.kind == "claude-dispatch-context":
                result = claude_dispatch_context(repo, payload)
            elif args.kind == "claude-qbd-report":
                result = claude_qbd_report(repo, payload)
            elif args.kind == "claude-protect-write":
                result = claude_protect_write(repo, payload)
            else:
                raise WorkflowError(f"Unknown hook kind: {args.kind}")
        elif args.command == "status":
            result = _status_command(args)
        elif args.command == "doctor":
            result = _doctor(args)
        else:
            raise WorkflowError(f"Unknown command: {args.command}")
        if isinstance(result, str):
            print(result)
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (WorkflowError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"[omp-flow] ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
