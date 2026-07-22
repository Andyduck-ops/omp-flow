#!/usr/bin/env python3
"""Unit driver for ``templates/claude/hooks/protect-python-owned.py`` (task
07-22-dispatch-stutter, row E-B001--001: B'-lite cheap guard).

Driver argv contract -- EVERY ``tests/claude-hooks-py/test_*.py`` driver accepts
exactly these arguments; the TS runner in ``tests/omp-flow.test.ts`` (Test 8k)
discovers and invokes each one against the standard executing-task fixture:

    python -X utf8 <driver> --root <fixtureRoot> --task <taskId> \
        --session <sid> --qbd-task <id> --qbd-session <sid>

What this driver proves (PRD R4/R5, AC3/AC6 + predicate parity):

- AC3 import isolation: every FAST path -- a Bash command with no ``.omp-flow``
  token, a Bash command decided purely by the quote-aware segment policy, a
  Write/Edit to a non-protected path, and an Edit to a protected path --
  completes WITHOUT loading any heavy ``common.*`` module (``sys.modules``
  snapshot before/after in a fresh interpreter). Only the protected QbD-report
  Write predicate triggers the shim's lazy heavy import.
- Predicate parity: the QbD prepared-report Write allow emits the recorded
  golden envelope, a denied predicate reason byte-equals the A-001 recorded
  subprocess reason, and NO ``omp_flow.py`` subprocess is spawned (AC1-style
  spy on ``subprocess.run``/``subprocess.Popen``).
- AC6 fail-closed split: with the ``common.*`` LAYER broken (a fake root whose
  ``.omp-flow/scripts/common/__init__.py`` raises ImportError -- per the QbD2
  audit caution the shim file itself stays intact), the protected QbD-Write
  predicate path BLOCKS with exit 2 while every fast path is unaffected
  (they never import the core).

Isolation-sensitive scenarios re-invoke this file with ``--scenario <name>`` in
a FRESH interpreter so ``sys.modules``/``sys.path`` residue from another
scenario cannot mask a regression. Exit code 0 iff every scenario passes.
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import runpy
import subprocess
import sys
import tempfile
from pathlib import Path

DRIVER = Path(__file__).resolve()
REPO_ROOT = DRIVER.parents[2]
HOOK_DIR = REPO_ROOT / "templates" / "claude" / "hooks"
HOOK = HOOK_DIR / "protect-python-owned.py"
MIRROR = REPO_ROOT / ".claude" / "hooks" / "protect-python-owned.py"
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

ALLOW_REASON = "QbD prepared report Write permitted by read-only predicate"


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _common_modules() -> list[str]:
    return sorted(name for name in sys.modules if name == "common" or name.startswith("common."))


def _assert_no_heavy_import(stage: str) -> None:
    loaded = _common_modules()
    _check(not loaded, f"{stage}: heavy common.* modules are loaded: {loaded}")
    _check("common.workflow" not in sys.modules, f"{stage}: common.workflow must not be in sys.modules")


def _run_hook(root: str, payload: dict) -> tuple[int, str, str]:
    """Execute the guard hook IN-PROCESS (module load + main()) so the caller
    can inspect ``sys.modules`` afterwards. Mirrors the real invocation shape:
    JSON payload on stdin, CLAUDE_PROJECT_DIR set, hook dir first on sys.path
    (as it is when Claude runs ``python .../.claude/hooks/<hook>.py``)."""
    if str(HOOK_DIR) not in sys.path:
        sys.path.insert(0, str(HOOK_DIR))
    os.environ["CLAUDE_PROJECT_DIR"] = str(root)
    out, err = io.StringIO(), io.StringIO()
    old_stdin = sys.stdin
    sys.stdin = io.StringIO(json.dumps(payload, ensure_ascii=False))
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            module = runpy.run_path(str(HOOK), run_name="omp_protect_guard_under_test")
            status = module["main"]()
    finally:
        sys.stdin = old_stdin
    return status, out.getvalue(), err.getvalue()


def _decision(stdout_text: str) -> tuple[str, str]:
    envelope = json.loads(stdout_text)["hookSpecificOutput"]
    return envelope.get("permissionDecision", ""), envelope.get("permissionDecisionReason", "")


def _bash_payload(root: str, session: str, command: str) -> dict:
    return {
        "hook_event_name": "PreToolUse",
        "session_id": session,
        "cwd": root,
        "tool_name": "Bash",
        "tool_input": {"command": command},
    }


def _write_payload(root: str, session: str, tool_name: str, file_path: str, **identity: str) -> dict:
    tool_input: dict = {"file_path": file_path}
    tool_input.update({"content": "# body"} if tool_name == "Write" else {"old_string": "a", "new_string": "b"})
    payload = {
        "hook_event_name": "PreToolUse",
        "session_id": session,
        "cwd": root,
        "tool_name": tool_name,
        "tool_input": tool_input,
    }
    payload.update(identity)
    return payload


def _qbd_report(root: str, qbd_task: str) -> str:
    gate = json.loads(
        (Path(root) / ".omp-flow" / "tasks" / qbd_task / "task.json").read_text(encoding="utf-8")
    )["gates"]["qbd1"]
    _check(gate.get("status") == "prepared", "fixture qbd task has gate qbd1 prepared")
    return str(gate["report"])


def _make_broken_core_root(base: Path) -> Path:
    """A fake project whose common.* LAYER is broken (QbD2 audit caution: the
    _omp_core.py shim itself stays intact and importable; only the heavy core
    import inside run_core fails)."""
    scripts = base / ".omp-flow" / "scripts"
    (scripts / "common").mkdir(parents=True)
    (scripts / "omp_flow.py").write_text("# placeholder managed core (never executed)\n", encoding="utf-8")
    (scripts / "common" / "__init__.py").write_text('raise ImportError("broken core for test")\n', encoding="utf-8")
    (base / ".omp-flow" / "tasks").mkdir(parents=True)
    return base


# --- scenarios (each runs in a fresh interpreter via --scenario) -------------


def scenario_fastpath_bash_free(args: argparse.Namespace) -> None:
    """AC3(1): a Bash command with no .omp-flow token allows silently with NO
    heavy import (and no output envelope at all)."""
    _assert_no_heavy_import("before run")
    status, out, err = _run_hook(args.root, _bash_payload(args.root, args.session, "ls src && echo done"))
    _check(status == 0 and out.strip() == "" and err.strip() == "", "token-free Bash defers silently (exit 0, no output)")
    _check("_omp_core" in sys.modules, "the hook imported the cheap shim at module top")
    _assert_no_heavy_import("after token-free Bash")


def scenario_fastpath_bash_segment(args: argparse.Namespace) -> None:
    """AC3(2): Bash commands WITH .omp-flow are decided purely by the segment
    policy -- an allowlisted read passes and a live composition denies, and the
    Bash path NEVER imports the core either way."""
    _assert_no_heavy_import("before run")
    status, out, _ = _run_hook(args.root, _bash_payload(args.root, args.session, "ls .omp-flow/tasks"))
    _check(status == 0 and out.strip() == "", "allowlisted read-only head passes through the segment policy")
    status, out, _ = _run_hook(
        args.root,
        _bash_payload(args.root, args.session, "python .omp-flow/scripts/omp_flow.py --cwd . task current > steal.txt"),
    )
    decision, reason = _decision(out)
    _check(status == 0 and decision == "deny", "live composition around the managed CLI denies")
    _check("shell composition" in reason, "composition deny keeps the M-hardmeta wording")
    status, out, _ = _run_hook(args.root, _bash_payload(args.root, args.session, "cat .omp-flow/tasks/x/task.json"))
    decision, reason = _decision(out)
    _check(status == 0 and decision == "deny" and "managed omp_flow.py" in reason, "direct protected read denies via the segment policy")
    _assert_no_heavy_import("after segment-policy Bash (allow + deny): Bash NEVER imports the core")


def scenario_fastpath_write_edit_free(args: argparse.Namespace) -> None:
    """AC3(3): Write and Edit to non-protected paths return before any core
    import (silent allow, normal Claude flow)."""
    _assert_no_heavy_import("before run")
    status, out, _ = _run_hook(args.root, _write_payload(args.root, args.session, "Write", "src/feature-note.ts"))
    _check(status == 0 and out.strip() == "", "non-protected Write defers silently")
    status, out, _ = _run_hook(args.root, _write_payload(args.root, args.session, "Edit", "docs/readme.md"))
    _check(status == 0 and out.strip() == "", "non-protected Edit defers silently")
    _assert_no_heavy_import("after non-protected Write/Edit")


def scenario_fastpath_edit_protected(args: argparse.Namespace) -> None:
    """AC3(4): an Edit to a protected path denies BEFORE any core import (the
    QbD carve-out applies to Write, never Edit)."""
    _assert_no_heavy_import("before run")
    status, out, _ = _run_hook(
        args.root,
        _write_payload(
            args.root, args.session, "Edit", f".omp-flow/tasks/{args.task}/task.json",
            agent_id="qbd-driver-1", agent_type="omp-flow-qbd",
        ),
    )
    decision, reason = _decision(out)
    _check(status == 0 and decision == "deny", "Edit to a protected path denies")
    _check("Python-owned path is denied" in reason, "Edit deny keeps the Python-owned wording")
    _assert_no_heavy_import("after protected Edit (deny happens with no core import)")


def scenario_predicate_allow(args: argparse.Namespace) -> None:
    """Predicate parity (allow): the QbD prepared-report Write runs the
    predicate IN-PROCESS -- golden envelope bytes, heavy import happens exactly
    here, and NO omp_flow.py subprocess is spawned (AC1-style spy)."""
    _assert_no_heavy_import("before run")
    spawned: list[str] = []
    real_run, real_popen = subprocess.run, subprocess.Popen

    def spy_run(*call_args, **call_kwargs):  # noqa: ANN002, ANN003
        spawned.append(repr(call_args[0] if call_args else call_kwargs.get("args")))
        return real_run(*call_args, **call_kwargs)

    def spy_popen(*call_args, **call_kwargs):  # noqa: ANN002, ANN003
        spawned.append(repr(call_args[0] if call_args else call_kwargs.get("args")))
        return real_popen(*call_args, **call_kwargs)

    subprocess.run, subprocess.Popen = spy_run, spy_popen  # type: ignore[assignment]
    try:
        report = _qbd_report(args.root, args.qbd_task)
        status, out, _ = _run_hook(
            args.root,
            _write_payload(
                args.root, args.qbd_session, "Write", f".omp-flow/tasks/{args.qbd_task}/{report}",
                agent_id="qbd-driver-1", agent_type="omp-flow-qbd",
            ),
        )
    finally:
        subprocess.run, subprocess.Popen = real_run, real_popen  # type: ignore[assignment]
    _check(not any("omp_flow.py" in call for call in spawned), f"no omp_flow.py subprocess on the predicate path: {spawned}")
    _check(status == 0, "prepared-report Write allow exits 0")
    golden = json.loads((GOLDEN_DIR / "protect-write-allow.json").read_text(encoding="utf-8"))
    expected = str(golden["stdout"]).replace("\r\n", "\n")  # \r\n is text-mode transport, not payload
    _check(out == expected, f"allow envelope byte-matches the recorded golden stdout: {out!r} != {expected!r}")
    decision, reason = _decision(out)
    _check(decision == "allow" and reason == ALLOW_REASON, "allow envelope fields match Test 8i (E)")
    _check("common.workflow" in sys.modules, "the heavy core import happened exactly on the predicate path")


def scenario_predicate_denied_parity(args: argparse.Namespace) -> None:
    """Predicate parity (deny): a QbD Write to a protected non-report path
    denies with a reason that byte-equals the A-001 recorded subprocess
    stderr (golden protect-write-wrong-path-core-error)."""
    report = _qbd_report(args.root, args.qbd_task)
    status, out, _ = _run_hook(
        args.root,
        _write_payload(
            args.root, args.qbd_session, "Write", f".omp-flow/tasks/{args.qbd_task}/task.json",
            agent_id="qbd-driver-1", agent_type="omp-flow-qbd",
        ),
    )
    decision, reason = _decision(out)
    _check(status == 0 and decision == "deny", "wrong-path predicate Write denies with exit 0")
    recorded = json.loads((GOLDEN_DIR / "protect-write-wrong-path-core-error.json").read_text(encoding="utf-8"))
    expected = (
        str(recorded["reason"])
        .replace("__GOLDEN_ROOT__", args.root)
        .replace("__GOLDEN_QBD_TASK__", args.qbd_task)
        .replace("__GOLDEN_REPORT__", report)
    )
    _check(reason == expected, f"deny reason byte-matches the recorded subprocess reason: {reason!r} != {expected!r}")
    _check(reason.startswith("[omp-flow] ERROR: "), "reason carries the [omp-flow] ERROR prefix (AC5)")


def scenario_predicate_broken_core(args: argparse.Namespace) -> None:
    """AC6 (predicate half): with the common.* layer broken, the protected
    QbD-report Write predicate BLOCKS with exit 2 (CoreUnavailable ->
    _Internal), never an allow envelope."""
    _assert_no_heavy_import("before run")
    with tempfile.TemporaryDirectory() as tmp:
        fake = _make_broken_core_root(Path(tmp))
        status, out, err = _run_hook(
            str(fake),
            _write_payload(
                str(fake), "broken-core-session", "Write", ".omp-flow/tasks/t/qbd/qbd-1/audit-1.md",
                agent_id="qbd-driver-1", agent_type="omp-flow-qbd",
            ),
        )
    _check(status == 2, "broken core blocks the protected QbD Write with exit 2")
    _check(out.strip() == "", "broken core emits no decision envelope (no silent allow)")
    _check("broken core for test" in err, "the import failure detail is visible on stderr")
    _assert_no_heavy_import("after broken-core predicate (failed import leaves no residue)")


def scenario_fastpath_broken_core_unaffected(args: argparse.Namespace) -> None:
    """AC6 (fast-path half): the SAME broken common.* layer leaves every fast
    path unaffected -- they never import the core, so their decisions and exit
    codes are identical to a healthy install."""
    _assert_no_heavy_import("before run")
    with tempfile.TemporaryDirectory() as tmp:
        fake = str(_make_broken_core_root(Path(tmp)))
        status, out, _ = _run_hook(fake, _bash_payload(fake, "broken-core-session", "ls src && echo done"))
        _check(status == 0 and out.strip() == "", "token-free Bash still defers silently under a broken core")
        status, out, _ = _run_hook(fake, _bash_payload(fake, "broken-core-session", "ls .omp-flow/tasks"))
        _check(status == 0 and out.strip() == "", "allowlisted segment-policy read still passes under a broken core")
        status, out, _ = _run_hook(fake, _bash_payload(fake, "broken-core-session", "cat .omp-flow/tasks/x/task.json"))
        decision, _reason = _decision(out)
        _check(status == 0 and decision == "deny", "segment-policy deny still denies (exit 0) under a broken core")
        status, out, _ = _run_hook(fake, _write_payload(fake, "broken-core-session", "Write", "notes/todo.md"))
        _check(status == 0 and out.strip() == "", "non-protected Write still defers silently under a broken core")
        status, out, _ = _run_hook(
            fake, _write_payload(fake, "broken-core-session", "Edit", ".omp-flow/tasks/t/task.json")
        )
        decision, _reason = _decision(out)
        _check(status == 0 and decision == "deny", "protected Edit still denies (exit 0) under a broken core")
    _assert_no_heavy_import("after broken-core fast paths (they never import the core)")


def scenario_mirror_identical(args: argparse.Namespace) -> None:
    """Row done condition: the live .claude mirror is byte-identical to the
    template source of truth."""
    _check(HOOK.read_bytes() == MIRROR.read_bytes(), "templates/claude/hooks and .claude/hooks guard copies are byte-identical")


SCENARIO_ORDER = (
    "fastpath-bash-free",
    "fastpath-bash-segment",
    "fastpath-write-edit-free",
    "fastpath-edit-protected",
    "predicate-allow",
    "predicate-denied-parity",
    "predicate-broken-core",
    "fastpath-broken-core-unaffected",
    "mirror-identical",
)
SCENARIOS = {
    "fastpath-bash-free": scenario_fastpath_bash_free,
    "fastpath-bash-segment": scenario_fastpath_bash_segment,
    "fastpath-write-edit-free": scenario_fastpath_write_edit_free,
    "fastpath-edit-protected": scenario_fastpath_edit_protected,
    "predicate-allow": scenario_predicate_allow,
    "predicate-denied-parity": scenario_predicate_denied_parity,
    "predicate-broken-core": scenario_predicate_broken_core,
    "fastpath-broken-core-unaffected": scenario_fastpath_broken_core_unaffected,
    "mirror-identical": scenario_mirror_identical,
}


def _child_env() -> dict:
    env = dict(os.environ)
    for key in IDENTITY_ENV_KEYS:
        env.pop(key, None)
    return env


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Unit driver for the protect-python-owned.py B'-lite guard "
        "(standard claude-hooks-py driver argv contract; exit 0 iff all scenarios pass).",
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
    print("all protect-python-owned guard scenarios passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
