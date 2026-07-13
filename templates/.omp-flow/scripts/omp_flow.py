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
from common.paths import find_repo_root, flow_dir, task_dir
from common.reference import digest_file, list_references, render_references
from common.task_store import archive_task, create_task, list_tasks
from common.topology import ready_rows, read_rows, validate_rows
from common.workflow import (
    claude_dispatch_context,
    claude_protect_write,
    claude_qbd_report,
    claude_workflow_state,
    codex_hook_output,
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


def _task_command(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    if args.task_action == "create":
        return create_task(repo, args.title, slug=args.slug, parent=args.parent, no_start=args.no_start)
    if args.task_action == "list":
        return list_tasks(repo)
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
        return set_active_task(repo, args.task).__dict__
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Portable omp-flow workflow core")
    parser.add_argument("--cwd")
    sub = parser.add_subparsers(dest="command", required=True)

    task = sub.add_parser("task")
    task_sub = task.add_subparsers(dest="task_action", required=True)
    create = task_sub.add_parser("create")
    create.add_argument("title")
    create.add_argument("--slug")
    create.add_argument("--parent")
    create.add_argument("--no-start", action="store_true")
    for name in ("start", "select", "finish", "archive"):
        item = task_sub.add_parser(name)
        item.add_argument("task", nargs="?")
    rework = task_sub.add_parser("rework")
    rework.add_argument("--task")
    rework.add_argument("--reason", required=True)
    redesign = task_sub.add_parser("redesign")
    redesign.add_argument("--task")
    redesign.add_argument("--reason", required=True)
    task_sub.add_parser("current")
    task_sub.add_parser("list")
    task_sub.add_parser("clear")

    workflow = sub.add_parser("workflow")
    workflow_sub = workflow.add_subparsers(dest="workflow_action", required=True)
    workflow_sub.add_parser("state")
    select_synthesis = workflow_sub.add_parser("select-synthesis")
    select_synthesis.add_argument("--task")
    select_synthesis.add_argument("--path", required=True)

    context = sub.add_parser("context")
    context.add_argument("--role", required=True)
    context.add_argument("--task")
    context.add_argument("--row")
    context.add_argument("--prompt")

    topology = sub.add_parser("topology")
    topology_sub = topology.add_subparsers(dest="topology_action", required=True)
    for name in ("validate", "ready"):
        item = topology_sub.add_parser(name)
        item.add_argument("--task")
        if name == "ready":
            item.add_argument("--role", default="executor", choices=("executor", "reviewer"))
            item.add_argument("--assignment")
    mark = topology_sub.add_parser("mark-result")
    mark.add_argument("--task")
    mark.add_argument("--row", required=True)
    mark.add_argument("--result", required=True, choices=("success", "failure"))

    amend = topology_sub.add_parser("amend")
    amend_sub = amend.add_subparsers(dest="amend_action", required=True)
    amend_propose_parser = amend_sub.add_parser("propose")
    amend_propose_parser.add_argument("--task")
    amend_propose_parser.add_argument("--reason", required=True)
    amend_set_change_parser = amend_sub.add_parser("set-change")
    amend_set_change_parser.add_argument("--task")
    amend_set_change_parser.add_argument("--change", required=True)
    for name in ("prepare", "inspect"):
        item = amend_sub.add_parser(name)
        item.add_argument("--task")
    amend_decide_parser = amend_sub.add_parser("decide")
    amend_decide_parser.add_argument("--task")
    amend_decide_parser.add_argument("--decision", required=True, choices=("pass", "reject"))
    amend_decide_parser.add_argument("--note")

    reference = sub.add_parser("reference")
    reference_sub = reference.add_subparsers(dest="reference_action", required=True)
    digest = reference_sub.add_parser("digest-file")
    digest.add_argument("--task")
    digest.add_argument("--source-repo", required=True)
    digest.add_argument("--source-path", required=True)
    digest.add_argument("--line-start", type=int)
    digest.add_argument("--line-end", type=int)
    digest.add_argument("--summary")
    digest.add_argument("--intent")
    ref_list = reference_sub.add_parser("list")
    ref_list.add_argument("--task")
    render = reference_sub.add_parser("render")
    render.add_argument("--task")
    render.add_argument("--refs", required=True)

    gate = sub.add_parser("gate")
    gate_sub = gate.add_subparsers(dest="gate_action", required=True)
    for name in ("prepare", "inspect"):
        item = gate_sub.add_parser(name)
        item.add_argument("gate", choices=("qbd1", "qbd2"))
        item.add_argument("--task")
    decide = gate_sub.add_parser("decide")
    decide.add_argument("gate", choices=("qbd1", "qbd2"))
    decide.add_argument("--task")
    decide.add_argument("--decision", required=True, choices=("pass", "reject"))
    decide.add_argument("--note")
    reset = gate_sub.add_parser("reset")
    reset.add_argument("gate", choices=("qbd1", "qbd2"))
    reset.add_argument("--task")
    reset.add_argument("--reason", required=True)

    evidence = sub.add_parser("evidence")
    evidence_sub = evidence.add_subparsers(dest="evidence_action", required=True)
    submit = evidence_sub.add_parser("submit")
    submit.add_argument("--task")
    submit.add_argument("--row", required=True)
    submit.add_argument("--verdict", required=True, choices=("pass", "fail"))
    submit.add_argument("--tests-run", required=True, type=int)
    submit.add_argument("--tests-failed", required=True, type=int)
    submit.add_argument("--report", required=True)
    submit.add_argument("--evidence")
    submit.add_argument("--reviewer-agent-id", required=True)

    hook = sub.add_parser("hook")
    hook.add_argument("kind", choices=(
        "codex-workflow-state",
        "claude-workflow-state",
        "claude-dispatch-context",
        "claude-qbd-report",
        "claude-protect-write",
    ))
    sub.add_parser("status")
    sub.add_parser("doctor")
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
            repo = _repo(args)
            active = resolve_active_task(repo)
            result = {"active": active.__dict__, "task": read_json(task_dir(repo, active.task_id) / "task.json") if active.task_id and not active.stale else None}
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
