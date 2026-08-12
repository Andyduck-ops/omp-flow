#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

if sys.platform.startswith("win"):
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]

from common.active_task import clear_active_task, resolve_active_task, set_active_task
from common.flow_status import (
    MAX_OBSERVATION_BYTES,
    FlowStatusError,
    clear_root_flow_v2,
    flow_status_command_failure_v2,
    format_inspection,
    inspect_cached_snapshot,
    inspection_error_response,
    observe_and_cache,
    publish_root_flow_v2,
    renew_root_flow_v2,
)
from common.io import WorkflowError
from common.operation_store import (
    create_operation,
    finish_operation,
    list_operations,
    read_operation,
)
from common.sleep_store import (
    finish_sleep_run,
    list_sleep_runs,
    read_sleep_run,
    start_sleep_run,
)
from common.paths import find_repo_root, task_dir
from common.task_store import archive_task, create_task, list_tasks


def _repo(args: argparse.Namespace) -> Path:
    return find_repo_root(Path(args.cwd or os.getcwd()))


def _selected_task(repo: Path, explicit: str | None = None) -> str:
    if explicit:
        task_dir(repo, explicit)
        return explicit
    active = resolve_active_task(repo)
    if not active.task_id:
        raise WorkflowError("No active task for this session")
    if active.stale:
        raise WorkflowError(f"Active task pointer is stale: {active.task_id}")
    return active.task_id


def _task_locator(repo: Path, task_id: str) -> dict[str, str]:
    root = task_dir(repo, task_id)
    index = root / "index.md"
    if not index.is_file():
        raise WorkflowError(f"Required Bundle entry not found: {index}")
    return {
        "taskId": task_id,
        "taskDir": root.relative_to(repo).as_posix(),
        "index": index.relative_to(repo).as_posix(),
    }


def _status(repo: Path) -> dict[str, Any]:
    active = resolve_active_task(repo)
    if not active.task_id:
        return {
            "active": None,
            "task": None,
            "operations": [],
        }
    active_value = {
        "taskId": active.task_id,
        "source": active.source,
        "contextKey": active.context_key,
        "stale": active.stale,
    }
    if active.stale:
        return {
            "active": active_value,
            "task": None,
            "operations": [],
        }
    return {
        "active": active_value,
        "task": _task_locator(repo, active.task_id),
        "operations": list_operations(repo, active.task_id),
    }


def _stdin_json() -> dict[str, Any]:
    raw = sys.stdin.buffer.read(MAX_OBSERVATION_BYTES + 1)
    if len(raw) > MAX_OBSERVATION_BYTES:
        raise FlowStatusError("too-large", "Flow Status observation exceeds 256 KiB")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise FlowStatusError("malformed", "Observation stdin is not valid UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise FlowStatusError("malformed", "Observation stdin must be one JSON object")
    return value


def _task_command(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    if args.task_action == "create":
        return create_task(
            repo,
            args.title,
            slug=args.slug,
            parent=args.parent,
            no_start=args.no_start,
        )
    if args.task_action == "list":
        return list_tasks(repo)
    if args.task_action == "current":
        active = resolve_active_task(repo)
        return {
            "taskId": active.task_id,
            "source": active.source,
            "contextKey": active.context_key,
            "stale": active.stale,
        }
    if args.task_action == "select":
        if args.task and args.task_flag and args.task != args.task_flag:
            raise WorkflowError("Conflicting positional task id and --task")
        task_id = args.task or args.task_flag
        if not task_id:
            raise WorkflowError("task select requires a task id")
        selected = set_active_task(repo, task_id)
        return {
            "taskId": selected.task_id,
            "source": selected.source,
            "contextKey": selected.context_key,
            "stale": selected.stale,
        }
    if args.task_action == "clear":
        cleared = clear_active_task(repo)
        return {"clearedTaskId": cleared.task_id}
    if args.task_action == "show":
        task_id = args.task or _selected_task(repo)
        return _task_locator(repo, task_id)
    if args.task_action == "archive":
        task_id = args.task or _selected_task(repo)
        destination, sleep_source = archive_task(repo, task_id)
        return {
            "taskId": task_id,
            "archivedTo": destination.relative_to(repo).as_posix(),
            "sleepSource": sleep_source,
        }
    raise WorkflowError(f"Unknown task action: {args.task_action}")


def _dispatch_assignment(
    repo: Path,
    operation: dict[str, Any],
    objective: str,
) -> str:
    root = task_dir(repo, str(operation["task_id"]))
    bundle = root.relative_to(repo).as_posix()
    entry = (root / str(operation["entry_path"])).relative_to(repo).as_posix()
    predecessor = operation.get("predecessor")
    predecessor_output = None
    if isinstance(predecessor, str) and predecessor:
        predecessor_operation = read_operation(repo, predecessor)
        predecessor_output = predecessor_operation.get("output_path")
    descriptor = {
        "ompFlowDispatch": {
            "version": 1,
            "bundle": bundle,
            "entry": entry,
            "output": operation["output_path"],
            "role": operation["role"],
            "actorId": operation["actor_id"],
            "objective": objective.strip(),
            "receipt": operation["id"],
            "predecessor": predecessor,
            "predecessorOutput": predecessor_output,
        }
    }
    descriptor_line = json.dumps(
        descriptor,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return (
        f"{descriptor_line}\n\n"
        f"Bundle root: {bundle}\n"
        f"Role: {operation['role']}\n"
        f"Entry Concept: {entry}\n"
        f"Output boundary: {operation['output_path']}\n"
        f"Actor ID: {operation['actor_id']}\n"
        f"Dispatch receipt: {operation['id']}\n\n"
        f"Predecessor receipt: {predecessor or '(none)'}\n"
        f"Predecessor output/handoff: {predecessor_output or '(none)'}\n\n"
        f"Objective:\n{objective.strip()}"
    )


def _operation_command(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    if args.operation_action == "start":
        task_id = _selected_task(repo, args.task)
        if not args.objective.strip():
            raise WorkflowError("Operation objective is required")
        operation = create_operation(
            repo,
            task_id,
            entry_path=args.entry,
            output_path=args.output,
            role=args.role,
            actor_id=args.actor_id,
            predecessor=args.predecessor,
            require_external_receipt=args.require_external_receipt,
        )
        return {
            "operation": operation,
            "assignment": _dispatch_assignment(repo, operation, args.objective),
        }
    if args.operation_action == "show":
        operation = read_operation(repo, args.operation)
        _selected_task(repo, str(operation["task_id"]))
        return operation
    if args.operation_action == "list":
        task_id = _selected_task(repo, args.task)
        return list_operations(repo, task_id)
    if args.operation_action == "finish":
        operation = read_operation(repo, args.operation)
        _selected_task(repo, str(operation["task_id"]))
        return finish_operation(
            repo,
            args.operation,
            state=args.state,
            actor_id=args.actor_id,
            external_receipt=args.external_receipt,
        )
    raise WorkflowError(f"Unknown operation action: {args.operation_action}")


def _sleep_command(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    if args.sleep_action == "start":
        return start_sleep_run(repo, args.source, args.actor_id)
    if args.sleep_action == "show":
        return read_sleep_run(repo, args.run)
    if args.sleep_action == "list":
        return list_sleep_runs(repo)
    if args.sleep_action == "finish":
        return finish_sleep_run(
            repo,
            args.run,
            state=args.state,
            actor_id=args.actor_id,
            candidates=args.candidate,
        )
    raise WorkflowError(f"Unknown Sleep action: {args.sleep_action}")


EPILOG = (
    "Examples:\n"
    "  omp_flow.py status\n"
    "  omp_flow.py status inspect --json\n"
    "  omp_flow.py status observe --host claude --session <id> < observation.json\n"
    "  omp_flow.py task create \"Investigate cache behavior\"\n"
    "  omp_flow.py task select 07-30-investigate-cache\n"
    "  omp_flow.py operation start --entry work/cache.md --output src/cache "
    "--role executor --actor-id <native-id> --objective \"Implement the linked work\"\n"
    "  omp_flow.py operation finish <receipt> --state completed "
    "--actor-id <native-id> --external-receipt <native-receipt>\n"
    "  omp_flow.py sleep start --source <archive-sleep-receipt> --actor-id <native-id>\n"
    "  omp_flow.py sleep finish <run-receipt> --state completed --actor-id <native-id>\n"
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="omp-flow semantic Bundle runtime kernel",
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--cwd", help="Project root override")
    sub = parser.add_subparsers(dest="command", required=True)

    def leaf(
        subparsers: Any,
        name: str,
        description: str,
    ) -> argparse.ArgumentParser:
        return subparsers.add_parser(
            name,
            help=description,
            description=description,
        )

    task = leaf(sub, "task", "Create, select, inspect, and archive task Bundles")
    task_sub = task.add_subparsers(dest="task_action", required=True)
    create = leaf(task_sub, "create", "Create the smallest useful OKF task Bundle")
    create.add_argument("title")
    create.add_argument("--slug")
    create.add_argument("--parent")
    create.add_argument("--no-start", action="store_true")
    leaf(task_sub, "list", "List task Bundle directories")
    leaf(task_sub, "current", "Show the active task pointer for this session or local terminal")
    select = leaf(task_sub, "select", "Select a task Bundle for this session or local terminal")
    select.add_argument("task", nargs="?")
    select.add_argument("--task", dest="task_flag")
    show = leaf(task_sub, "show", "Show task Bundle paths without parsing Markdown")
    show.add_argument("task", nargs="?")
    archive = leaf(task_sub, "archive", "Archive a Bundle with no active operations")
    archive.add_argument("task", nargs="?")
    leaf(task_sub, "clear", "Clear the active task pointer for this session or local terminal")

    operation = leaf(sub, "operation", "Coordinate native work with opaque runtime receipts")
    operation_sub = operation.add_subparsers(dest="operation_action", required=True)
    start = leaf(operation_sub, "start", "Create a path-bounded native assignment receipt")
    start.add_argument("--task")
    start.add_argument("--entry", required=True, help="Concept path relative to the task Bundle")
    start.add_argument("--output", required=True, help="Allowed output path relative to the repository")
    start.add_argument("--role", required=True)
    start.add_argument("--actor-id", required=True)
    start.add_argument("--objective", required=True)
    start.add_argument("--predecessor", help="Completed predecessor operation receipt")
    start.add_argument(
        "--require-external-receipt",
        action="store_true",
        help="Require a native/external receipt before successful completion",
    )
    show_operation = leaf(operation_sub, "show", "Read one mechanical operation record")
    show_operation.add_argument("operation")
    list_operation = leaf(operation_sub, "list", "List operations for the selected task")
    list_operation.add_argument("--task")
    finish = leaf(operation_sub, "finish", "Finish or fail an operation as its bound actor")
    finish.add_argument("operation")
    finish.add_argument("--state", required=True, choices=("completed", "failed"))
    finish.add_argument("--actor-id", required=True)
    finish.add_argument("--external-receipt")

    sleep = leaf(sub, "sleep", "Run post-archive OKF knowledge consolidation")
    sleep_sub = sleep.add_subparsers(dest="sleep_action", required=True)
    sleep_start = leaf(sleep_sub, "start", "Create an archived-source Sleep assignment")
    sleep_start.add_argument("--source", required=True, help="Archive-produced Sleep source receipt")
    sleep_start.add_argument("--actor-id", required=True)
    sleep_show = leaf(
        sleep_sub,
        "show",
        "Read one mechanical Sleep run; an active revised run contains its recoverable assignment",
    )
    sleep_show.add_argument("run")
    leaf(sleep_sub, "list", "List mechanical Sleep runs")
    sleep_finish = leaf(sleep_sub, "finish", "Finish or fail a Sleep run as its bound actor")
    sleep_finish.add_argument("run")
    sleep_finish.add_argument("--state", required=True, choices=("completed", "failed"))
    sleep_finish.add_argument("--actor-id", required=True)
    sleep_finish.add_argument(
        "--candidate",
        action="append",
        default=[],
        help="Candidate Markdown path relative to .omp-flow/sleep/candidates",
    )

    status = leaf(sub, "status", "Show mechanical session or inspect read-only Flow Status")
    status_sub = status.add_subparsers(dest="status_action")
    inspect = leaf(status_sub, "inspect", "Inspect the latest validated Flow Status snapshot")
    inspect.add_argument("--json", action="store_true", dest="inspect_json")
    inspect.add_argument(
        "--host", choices=("claude", "codex", "oh-my-pi", "snow", "cursor")
    )
    inspect.add_argument("--session")
    observe = leaf(
        status_sub,
        "observe",
        "Validate one bounded stdin observation and atomically cache its snapshot",
    )
    observe.add_argument(
        "--host",
        required=True,
        choices=("claude", "codex", "oh-my-pi", "snow", "cursor"),
    )
    observe.add_argument("--session", required=True)
    flow_status = leaf(
        sub,
        "flow-status",
        "Receive closed Root Task/Flow publication, renewal, and clear requests",
    )
    flow_status_sub = flow_status.add_subparsers(
        dest="flow_status_action", required=True
    )
    for action in ("receive", "renew", "clear"):
        command = leaf(
            flow_status_sub,
            action,
            f"Validate and atomically apply one closed Flow Status {action} request",
        )
        command.add_argument(
            "--host",
            required=True,
            choices=("claude", "codex", "oh-my-pi", "snow", "cursor"),
        )
        command.add_argument("--session", required=True)
        command.add_argument("--actor-id", required=True)
    workflow = leaf(sub, "workflow", "Show mechanical workflow orientation")
    workflow_sub = workflow.add_subparsers(dest="workflow_action", required=True)
    leaf(workflow_sub, "state", "Show the same mechanical orientation as status")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "task":
            result = _task_command(args)
        elif args.command == "operation":
            result = _operation_command(args)
        elif args.command == "sleep":
            result = _sleep_command(args)
        elif args.command == "status" and args.status_action == "observe":
            result = observe_and_cache(
                _repo(args),
                args.host,
                args.session,
                _stdin_json(),
            )
        elif args.command == "status" and args.status_action == "inspect":
            result = inspect_cached_snapshot(
                _repo(args),
                host=args.host or os.environ.get("OMP_FLOW_HOST") or None,
                host_session_id=(
                    args.session
                    or os.environ.get("OMP_FLOW_HOST_SESSION_ID")
                    or None
                ),
            )
            if args.inspect_json:
                print(json.dumps(result, ensure_ascii=False, indent=2))
            else:
                print(format_inspection(result))
            return 0 if result["state"] == "available" else 2
        elif args.command == "flow-status":
            request = _stdin_json()
            if args.flow_status_action == "receive":
                result = publish_root_flow_v2(
                    _repo(args),
                    args.host,
                    args.session,
                    args.actor_id,
                    request,
                )
            elif args.flow_status_action == "renew":
                result = renew_root_flow_v2(
                    _repo(args),
                    args.host,
                    args.session,
                    args.actor_id,
                    request,
                )
            else:
                result = clear_root_flow_v2(
                    _repo(args),
                    args.host,
                    args.session,
                    args.actor_id,
                    request,
                )
            print(
                json.dumps(
                    result,
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
            )
            return 0
        elif args.command in {"status", "workflow"}:
            result = _status(_repo(args))
        else:
            raise WorkflowError(f"Unknown command: {args.command}")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (WorkflowError, OSError, ValueError, json.JSONDecodeError) as exc:
        if args.command == "flow-status":
            command_name = (
                "publish"
                if args.flow_status_action == "receive"
                else args.flow_status_action
            )
            print(
                json.dumps(
                    flow_status_command_failure_v2(command_name, exc),
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                file=sys.stderr,
            )
            return 3 if isinstance(exc, OSError) else 2
        json_failure = (
            args.command == "status"
            and (
                args.status_action == "observe"
                or (
                    args.status_action == "inspect"
                    and getattr(args, "inspect_json", False)
                )
            )
        )
        if json_failure:
            print(json.dumps(inspection_error_response(exc), ensure_ascii=False, indent=2))
            return 2
        print(f"[omp-flow] ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
