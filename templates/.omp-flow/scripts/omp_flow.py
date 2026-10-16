#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

if sys.platform.startswith("win"):
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]

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
from common.workscope import (
    WorkScope,
    open_workscope,
    resolve_task,
    resolve_workspace,
    resolve_workscope,
)
from common.task_store import archive_task, create_task, list_tasks, refresh_indexes


def _repo(args: argparse.Namespace) -> Path:
    return find_repo_root(Path(args.cwd or os.getcwd()))


def _invoking_path(args: argparse.Namespace) -> Path:
    return Path(args.cwd or os.getcwd())


def _workspace(args: argparse.Namespace) -> Path:
    return resolve_workspace(_invoking_path(args), getattr(args, "workspace", None))


def _scope(args: argparse.Namespace, task_id: str | None = None) -> WorkScope:
    return resolve_workscope(
        _invoking_path(args),
        task_id,
        getattr(args, "workspace", None),
    )


_RUNTIME_PROBE = {
    "ompFlowRuntimeProbe": {
        "version": 1,
        "workscope": 1,
        "operationStore": 1,
        "dispatch": 1,
    }
}
_TARGET_RUNTIME_COMMANDS = {
    ("task", "open"),
    ("task", "show"),
    ("task", "archive"),
    ("operation", "start"),
    ("operation", "show"),
    ("operation", "list"),
    ("operation", "finish"),
}
_LEGACY_ENVIRONMENT_KEYS = (
    "OMP_FLOW_CONTEXT_ID",
    "OMP_SESSION_ID",
    "PI_SESSION_ID",
    "CODEX_THREAD_ID",
    "CODEX_SESSION_ID",
    "SNOW_SESSION_ID",
)


def _runtime_environment() -> dict[str, str]:
    environment = dict(os.environ)
    for key in _LEGACY_ENVIRONMENT_KEYS:
        environment.pop(key, None)
    environment.pop("PYTHONPATH", None)
    return environment


def _target_runtime_script(target: Path) -> Path:
    script = target / ".omp-flow" / "scripts" / "omp_flow.py"
    required = (
        script,
        target / ".omp-flow" / "scripts" / "common" / "workscope.py",
        target / ".omp-flow" / "scripts" / "common" / "operation_store.py",
        target / ".omp-flow" / "scripts" / "common" / "task_store.py",
        target / ".omp-flow" / "scripts" / "common" / "sleep_store.py",
    )
    for candidate in required:
        try:
            resolved = candidate.resolve(strict=True)
            resolved.relative_to(target)
        except (FileNotFoundError, RuntimeError, ValueError) as exc:
            raise WorkflowError(
                f"Target workspace runtime is unavailable: {candidate}"
            ) from exc
    return script


def _probe_target_runtime(target: Path) -> Path:
    script = _target_runtime_script(target)
    result = subprocess.run(
        [sys.executable, "-X", "utf8", str(script), "--cwd", str(target), "runtime", "probe"],
        cwd=target,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
        env=_runtime_environment(),
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "probe exited unsuccessfully"
        raise WorkflowError(f"Target workspace runtime capability probe failed: {detail}")
    try:
        value = json.loads(result.stdout)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise WorkflowError("Target workspace runtime capability probe returned invalid JSON") from exc
    if value != _RUNTIME_PROBE:
        raise WorkflowError("Target workspace runtime capability probe reported an unsupported runtime")
    return script


def _target_runtime_target(args: argparse.Namespace) -> Path | None:
    workspace = getattr(args, "workspace", None)
    if args.command == "task":
        action = getattr(args, "task_action", None)
    elif args.command == "operation":
        action = getattr(args, "operation_action", None)
    else:
        action = None
    if workspace is None or (args.command, action) not in _TARGET_RUNTIME_COMMANDS:
        return None
    invoking_root = resolve_workspace(_invoking_path(args))
    target_root = resolve_workspace(_invoking_path(args), workspace)
    if target_root == invoking_root:
        return None
    return target_root


def _forwarded_target_args(target: Path) -> list[str]:
    forwarded = ["--cwd", str(target)]
    original = sys.argv[1:]
    index = 0
    while index < len(original):
        value = original[index]
        if value == "--cwd":
            index += 2
            continue
        if value.startswith("--cwd="):
            index += 1
            continue
        if value == "--workspace":
            forwarded.extend((value, str(target)))
            index += 2
            continue
        if value.startswith("--workspace="):
            forwarded.append(f"--workspace={target}")
            index += 1
            continue
        forwarded.append(value)
        index += 1
    return forwarded


def _forward_target_if_needed(args: argparse.Namespace) -> int | None:
    target = _target_runtime_target(args)
    if target is None:
        return None
    script = _probe_target_runtime(target)
    result = subprocess.run(
        [sys.executable, "-X", "utf8", str(script), *_forwarded_target_args(target)],
        cwd=target,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
        env=_runtime_environment(),
    )
    if result.stdout:
        sys.stdout.write(result.stdout)
    if result.stderr:
        sys.stderr.write(result.stderr)
    return result.returncode



def _task_locator(repo: Path, task_id: str) -> dict[str, str]:
    scope = resolve_task(repo, task_id)
    root = task_dir(repo, scope.task_id)
    index = root / "index.md"
    return {
        "taskId": scope.task_id,
        "taskDir": root.relative_to(repo).as_posix(),
        "index": index.relative_to(repo).as_posix(),
    }


def _task_command(args: argparse.Namespace) -> Any:
    repo = _repo(args)
    if args.task_action == "create":
        return create_task(
            repo,
            args.title,
            slug=args.slug,
            parent=args.parent,
            description=getattr(args, "description", None),
            tags=getattr(args, "tags", None),
        )
    if args.task_action == "list":
        return list_tasks(repo)
    if args.task_action == "open":
        scope = open_workscope(
            _invoking_path(args),
            args.task,
            getattr(args, "workspace", None),
            replace=args.replace,
        )
        return scope.as_dict()
    if args.task_action == "show":
        if not args.task:
            raise WorkflowError(
                "task show requires a named Task and validated workspace; "
                "provide `<task> [--workspace <path>]`"
            )
        scope = _scope(args, args.task)
        return _task_locator(scope.workspace_root, scope.task_id)
    if args.task_action == "archive":
        if not args.task:
            raise WorkflowError(
                "task archive requires a named Task and validated workspace; "
                "provide `<task> [--workspace <path>]`"
            )
        scope = _scope(args, args.task)
        destination, sleep_source = archive_task(scope.workspace_root, scope.task_id)
        return {
            "taskId": scope.task_id,
            "archivedTo": destination.relative_to(scope.workspace_root).as_posix(),
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
    if args.operation_action == "start":
        scope = _scope(args, args.task)
        if not args.objective.strip():
            raise WorkflowError("Operation objective is required")
        operation = create_operation(
            scope.workspace_root,
            scope.task_id,
            entry_path=args.entry,
            output_path=args.output,
            role=args.role,
            actor_id=args.actor_id,
            predecessor=args.predecessor,
            require_external_receipt=args.require_external_receipt,
        )
        return {
            "operation": operation,
            "assignment": _dispatch_assignment(scope.workspace_root, operation, args.objective),
        }
    if args.operation_action == "show":
        repo = _workspace(args)
        return read_operation(repo, args.operation)
    if args.operation_action == "list":
        scope = _scope(args, args.task)
        return list_operations(scope.workspace_root, scope.task_id)
    if args.operation_action == "finish":
        repo = _workspace(args)
        operation = read_operation(repo, args.operation)
        return finish_operation(
            repo,
            args.operation,
            state=args.state,
            actor_id=args.actor_id,
            external_receipt=args.external_receipt,
        )
    raise WorkflowError(f"Unknown operation action: {args.operation_action}")


def _runtime_command(args: argparse.Namespace) -> dict[str, Any]:
    if args.runtime_action == "probe":
        return _RUNTIME_PROBE
    raise WorkflowError(f"Unknown runtime action: {args.runtime_action}")


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
    "  omp_flow.py task create \"Investigate cache behavior\"\n"
    "  omp_flow.py task open 07-30-investigate-cache [--workspace <path>] [--replace]\n"
    "  omp_flow.py operation start --task 07-30-investigate-cache "
    "--entry work/cache.md --output src/cache "
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

    task = leaf(sub, "task", "Create, open, inspect, and archive task Bundles")
    task_sub = task.add_subparsers(dest="task_action", required=True)
    create = leaf(task_sub, "create", "Create the smallest useful OKF task Bundle")
    create.add_argument("title")
    create.add_argument("--slug")
    create.add_argument("--parent")
    create.add_argument("--description", help="One-line task summary for task.md and index.md")
    create.add_argument("--tag", action="append", default=[], dest="tags", help="Tag for task.md and index.md")
    leaf(task_sub, "list", "List task Bundle directories")
    task_open = leaf(task_sub, "open", "Validate and open a Task/worktree WorkScope marker")
    task_open.add_argument("task")
    task_open.add_argument("--workspace")
    task_open.add_argument("--replace", action="store_true")
    show = leaf(task_sub, "show", "Show named Task Bundle paths without parsing Markdown")
    show.add_argument("task", nargs="?")
    show.add_argument("--workspace")
    archive = leaf(task_sub, "archive", "Archive a named Bundle with no active operations")
    archive.add_argument("task", nargs="?")
    archive.add_argument("--workspace")

    operation = leaf(sub, "operation", "Coordinate native work with opaque runtime receipts")
    operation_sub = operation.add_subparsers(dest="operation_action", required=True)
    start = leaf(operation_sub, "start", "Create a path-bounded native assignment receipt")
    start.add_argument("--task")
    start.add_argument("--workspace")
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
    show_operation.add_argument("--workspace")
    list_operation = leaf(operation_sub, "list", "List operations for the selected task")
    list_operation.add_argument("--task")
    list_operation.add_argument("--workspace")
    finish = leaf(operation_sub, "finish", "Finish or fail an operation as its bound actor")
    finish.add_argument("operation")
    finish.add_argument("--state", required=True, choices=("completed", "failed"))
    finish.add_argument("--actor-id", required=True)
    finish.add_argument("--external-receipt")

    finish.add_argument("--workspace")
    runtime = sub.add_parser("runtime", help=argparse.SUPPRESS)
    runtime_sub = runtime.add_subparsers(dest="runtime_action", required=True)
    runtime_sub.add_parser("probe", help=argparse.SUPPRESS)

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


    index_cmd = leaf(
        sub,
        "index",
        "Regenerate index.md files from Markdown frontmatter (all, wiki, tasks, or <task>)",
    )
    index_cmd.add_argument(
        "target",
        nargs="?",
        default="all",
        help="Index target: all (default), wiki, tasks, or a specific <task-id>",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        forwarded = _forward_target_if_needed(args)
        if forwarded is not None:
            return forwarded
        if args.command == "runtime":
            result = _runtime_command(args)
        elif args.command == "task":
            result = _task_command(args)
        elif args.command == "operation":
            result = _operation_command(args)
        elif args.command == "sleep":
            result = _sleep_command(args)
        elif args.command == "index":
            result = refresh_indexes(_repo(args), args.target)
        else:
            raise WorkflowError(f"Unknown command: {args.command}")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (WorkflowError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"[omp-flow] ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
