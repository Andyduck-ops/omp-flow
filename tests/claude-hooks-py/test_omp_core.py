#!/usr/bin/env python3
"""Unit driver for the shared in-process shim ``templates/claude/hooks/_omp_core.py``
(task 07-22-dispatch-stutter, row B-A001--001).

Driver argv contract -- EVERY ``tests/claude-hooks-py/test_*.py`` driver accepts
exactly these arguments; the TS runner in ``tests/omp-flow.test.ts`` (Test 8k)
discovers and invokes each one against the standard executing-task fixture:

    python -X utf8 <driver> --root <fixtureRoot> --task <taskId> \
        --session <sid> --qbd-task <id> --qbd-session <sid>

- ``--root``        confined fixture project (deployed ``.omp-flow`` core);
- ``--task``        executing task (phase=execute, rows A-001/B-001 pending)
  whose active-task pointer was written under the ``--session`` explicit key;
- ``--qbd-task``    task with gate qbd1 PREPARED, selected by ``--qbd-session``.

Exit code 0 iff every scenario passes; failing scenarios echo their output.

Isolation-sensitive scenarios (module import cost, identity-env parity, broken
core) re-invoke this file with ``--scenario <name>`` in a FRESH interpreter so
``sys.modules``/``sys.path`` residue from another scenario cannot mask a
regression. Broken-core simulation technique (rows C/D/E reuse this for AC6):
point ``run_core`` at a fake root whose ``.omp-flow/scripts/common/__init__.py``
raises ImportError, inside a process that has never imported the real core.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

DRIVER = Path(__file__).resolve()
REPO_ROOT = DRIVER.parents[2]
SHIM_DIR = REPO_ROOT / "templates" / "claude" / "hooks"
GOLDEN_DIR = REPO_ROOT / "tests" / "fixtures" / "claude-hooks" / "golden"

# Session-identity env keys the control plane reads (active_task.py); child
# scenario processes must not inherit any ambient identity.
IDENTITY_ENV_KEYS = (
    "OMP_FLOW_CONTEXT_ID",
    "CODEX_THREAD_ID",
    "CODEX_SESSION_ID",
    "OMP_SESSION_ID",
    "PI_SESSION_ID",
)

STATE_MARKER = "<!-- omp-flow-workflow-state -->"


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _no_common_loaded(stage: str) -> None:
    loaded = [name for name in sys.modules if name == "common" or name.startswith("common.")]
    _check(not loaded, f"{stage}: heavy common.* modules are loaded: {loaded}")


def _import_shim():
    if str(SHIM_DIR) not in sys.path:
        sys.path.insert(0, str(SHIM_DIR))
    import _omp_core

    return _omp_core


def _explicit_key(session_id: str) -> str:
    return "explicit-" + hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:20]


# --- scenarios (each runs in a fresh interpreter via --scenario) -------------


def scenario_import_cheap(args: argparse.Namespace) -> None:
    """B'-lite groundwork (AC3): importing the shim loads NO common.* module."""
    _no_common_loaded("before import")
    shim = _import_shim()
    _no_common_loaded("after import _omp_core (module top must stay stdlib-only)")
    for name in ("run_core", "CoreDenied", "CoreUnavailable"):
        _check(hasattr(shim, name), f"shim exports {name}")
    _check(
        issubclass(shim.CoreDenied, Exception) and issubclass(shim.CoreUnavailable, Exception),
        "typed shim exceptions subclass Exception",
    )


def scenario_identity(args: argparse.Namespace) -> None:
    """H1 parity: run_core sets OMP_FLOW_CONTEXT_ID=<raw session_id> BEFORE the
    core call, so the active task written under the subprocess-parity key
    explicit-<sha256(sid)[:20]> resolves (groundwork for AC9)."""
    _check(
        os.environ.get("OMP_FLOW_CONTEXT_ID") is None,
        "scenario precondition: OMP_FLOW_CONTEXT_ID starts UNSET",
    )
    shim = _import_shim()
    result = shim.run_core(
        Path(args.root),
        "claude-workflow-state",
        {"session_id": args.session, "event": "UserPromptSubmit"},
        args.session,
    )
    _check(
        os.environ.get("OMP_FLOW_CONTEXT_ID") == args.session,
        "run_core exports OMP_FLOW_CONTEXT_ID=<raw session_id> in its own process",
    )
    context = result["hookSpecificOutput"]["additionalContext"]
    # Without the env set, resolve_context_key would fall to the payload branch
    # (key session-<hash>, a DIFFERENT pointer file) and no executing task would
    # resolve -- so "Phase: execute" proves pointer equality with the subprocess path.
    _check(
        "Phase: execute" in context,
        "in-process call resolves the active task written under the explicit-<hash> key",
    )
    from common.active_task import resolve_context_key

    _check(
        resolve_context_key({}) == _explicit_key(args.session),
        "resolve_context_key({}) takes the env-var explicit-<sha256[:20]> branch, not a payload key",
    )


def scenario_success_kinds(args: argparse.Namespace) -> None:
    """Success path returns the core function's dict for each of the four kinds,
    and repeated run_core calls keep sys.path idempotent (H3)."""
    shim = _import_shim()
    root = Path(args.root)
    scripts = str(root / ".omp-flow" / "scripts")

    state = shim.run_core(
        root, "claude-workflow-state", {"session_id": args.session, "event": "SessionStart"}, args.session
    )
    envelope = state["hookSpecificOutput"]
    _check(
        envelope["hookEventName"] == "SessionStart" and envelope["additionalContext"].startswith(STATE_MARKER),
        "claude-workflow-state returns the marker-led state envelope",
    )

    descriptor = {"ompFlowDispatch": {"version": 1, "role": "executor", "taskId": args.task, "rowId": "A-001"}}
    dispatch = shim.run_core(
        root,
        "claude-dispatch-context",
        {"session_id": args.session, "assignment": "Implement the root row.", "descriptor": descriptor},
        args.session,
    )
    _check(
        dispatch["role"] == "executor" and dispatch["taskId"] == args.task and dispatch["rowId"] == "A-001",
        "claude-dispatch-context resolves the executor descriptor",
    )
    _check("# A brief" in dispatch["prompt"], "dispatch prompt carries the fixture row brief")

    gate = json.loads(
        (root / ".omp-flow" / "tasks" / args.qbd_task / "task.json").read_text(encoding="utf-8")
    )["gates"]["qbd1"]
    _check(gate.get("status") == "prepared", "fixture qbd task has gate qbd1 prepared")
    report, digest = gate["report"], gate["evidenceDigest"]
    qbd_descriptor = {
        "ompFlowDispatch": {
            "version": 1,
            "role": "qbd-auditor",
            "taskId": args.qbd_task,
            "gate": "qbd1",
            "report": report,
            "evidenceDigest": digest,
        }
    }
    qbd = shim.run_core(
        root, "claude-qbd-report", {"session_id": args.qbd_session, "descriptor": qbd_descriptor}, args.qbd_session
    )
    _check(
        qbd["gate"] == "qbd1" and qbd["report"] == report and qbd["evidenceDigest"] == digest,
        "claude-qbd-report returns the current prepared report/digest",
    )

    allow = shim.run_core(
        root,
        "claude-protect-write",
        {
            "session_id": args.qbd_session,
            "agent_id": "qbd-driver-1",
            "agent_type": "omp-flow-qbd",
            "path": f".omp-flow/tasks/{args.qbd_task}/{report}",
        },
        args.qbd_session,
    )
    _check(
        allow.get("decision") == "allow" and allow.get("taskId") == args.qbd_task,
        "claude-protect-write allows exactly the prepared QbD report",
    )

    _check(
        sys.path.count(scripts) == 1,
        "scripts dir is inserted exactly once across repeated run_core calls (H3 idempotence)",
    )


def scenario_denied_parity(args: argparse.Namespace) -> None:
    """A core validation failure raises CoreDenied whose reason byte-matches the
    A-001 recorded subprocess proc.stderr.strip(), including degenerate
    whitespace/empty exception messages (QbD1 audit rec 2)."""
    shim = _import_shim()
    recorded = json.loads(
        (GOLDEN_DIR / "dispatch-task-mismatch-core-error.json").read_text(encoding="utf-8")
    )
    expected = (
        str(recorded["reason"])
        .replace("__GOLDEN_TASK__", args.task)
        .replace("__GOLDEN_SESSION__", args.session)
    )
    descriptor = {
        "ompFlowDispatch": {"version": 1, "role": "executor", "taskId": "golden-other-task", "rowId": "A-001"}
    }
    try:
        shim.run_core(
            Path(args.root),
            "claude-dispatch-context",
            {"session_id": args.session, "assignment": "x", "descriptor": descriptor},
            args.session,
        )
        raise AssertionError("core validation failure must raise CoreDenied")
    except shim.CoreDenied as denied:
        _check(
            denied.reason == expected,
            f"CoreDenied.reason byte-matches the recorded subprocess stderr: {denied.reason!r} != {expected!r}",
        )
        _check(denied.reason.startswith("[omp-flow] ERROR: "), "reason carries the [omp-flow] ERROR prefix")

    # Degenerate messages strip exactly as the wrappers stripped proc.stderr
    # (main() printed f"[omp-flow] ERROR: {exc}" plus a newline).
    trailing = ValueError("boom trails  \t\n")
    _check(
        shim.CoreDenied(trailing).reason == f"[omp-flow] ERROR: {trailing}\n".strip() == "[omp-flow] ERROR: boom trails",
        "whitespace-trailing exception message strips to the exact subprocess bytes",
    )
    empty = ValueError("")
    _check(
        shim.CoreDenied(empty).reason == f"[omp-flow] ERROR: {empty}\n".strip() == "[omp-flow] ERROR:",
        "empty exception message strips to the exact subprocess bytes",
    )


def scenario_broken_core(args: argparse.Namespace) -> None:
    """A broken core import raises CoreUnavailable (fail-closed groundwork for
    AC6). Runs in a fresh interpreter that never imported the real core."""
    _no_common_loaded("before broken-core")
    shim = _import_shim()
    with tempfile.TemporaryDirectory() as tmp:
        fake_root = Path(tmp)
        package = fake_root / ".omp-flow" / "scripts" / "common"
        package.mkdir(parents=True)
        (package / "__init__.py").write_text('raise ImportError("broken core for test")\n', encoding="utf-8")
        try:
            shim.run_core(
                fake_root,
                "claude-workflow-state",
                {"session_id": args.session, "event": "SessionStart"},
                args.session,
            )
            raise AssertionError("a broken core import must raise CoreUnavailable")
        except shim.CoreUnavailable as unavailable:
            _check("broken core for test" in str(unavailable), "CoreUnavailable carries the import failure detail")
    _no_common_loaded("after broken-core (a failed import leaves no common.* residue)")


def scenario_unknown_kind(args: argparse.Namespace) -> None:
    """An unknown hook kind raises CoreUnavailable (never a silent allow)."""
    shim = _import_shim()
    try:
        shim.run_core(Path(args.root), "claude-bogus-kind", {"session_id": args.session}, args.session)
        raise AssertionError("an unknown hook kind must raise CoreUnavailable")
    except shim.CoreUnavailable as unavailable:
        _check(
            "Unknown hook kind" in str(unavailable) and "claude-bogus-kind" in str(unavailable),
            "unknown kind is classified CoreUnavailable with the offending kind named",
        )


SCENARIO_ORDER = (
    "import-cheap",
    "identity",
    "success-kinds",
    "denied-parity",
    "broken-core",
    "unknown-kind",
)
SCENARIOS = {
    "import-cheap": scenario_import_cheap,
    "identity": scenario_identity,
    "success-kinds": scenario_success_kinds,
    "denied-parity": scenario_denied_parity,
    "broken-core": scenario_broken_core,
    "unknown-kind": scenario_unknown_kind,
}


def _child_env() -> dict:
    env = dict(os.environ)
    for key in IDENTITY_ENV_KEYS:
        env.pop(key, None)
    return env


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Unit driver for the _omp_core in-process shim (standard "
        "claude-hooks-py driver argv contract; exit 0 iff all scenarios pass).",
    )
    parser.add_argument("--root", required=True, help="fixture project root (deployed .omp-flow core)")
    parser.add_argument("--task", required=True, help="executing fixture task id (rows A-001/B-001)")
    parser.add_argument("--session", required=True, help="raw session id owning --task")
    parser.add_argument("--qbd-task", required=True, dest="qbd_task", help="fixture task id with qbd1 prepared")
    parser.add_argument("--qbd-session", required=True, dest="qbd_session", help="raw session id owning --qbd-task")
    parser.add_argument("--scenario", choices=sorted(SCENARIOS), help=argparse.SUPPRESS)
    args = parser.parse_args()

    if args.scenario:
        SCENARIOS[args.scenario](args)
        print(f"ok {args.scenario}")
        return 0

    failures = []
    for name in SCENARIO_ORDER:
        proc = subprocess.run(
            [
                sys.executable, "-X", "utf8", str(DRIVER),
                "--root", args.root, "--task", args.task, "--session", args.session,
                "--qbd-task", args.qbd_task, "--qbd-session", args.qbd_session,
                "--scenario", name,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=_child_env(),
            cwd=str(REPO_ROOT),
            timeout=120,
        )
        status = "PASS" if proc.returncode == 0 else "FAIL"
        print(f"[{status}] {name}")
        if proc.returncode != 0:
            failures.append(name)
            sys.stderr.write(proc.stdout)
            sys.stderr.write(proc.stderr)
    if failures:
        print(f"{len(failures)} scenario(s) failed: {', '.join(failures)}", file=sys.stderr)
        return 1
    print("all _omp_core scenarios passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
