#!/usr/bin/env python3
"""Unit driver for the in-process state hooks (task 07-22-dispatch-stutter,
row D-B001--001): ``templates/claude/hooks/inject-workflow-state.py`` and
``templates/claude/hooks/session-start.py``.

Driver argv contract (Test 8k, established by ``test_omp_core.py``):

    python -X utf8 <driver> --root <fixtureRoot> --task <taskId> \
        --session <sid> --qbd-task <id> --qbd-session <sid>

Exit code 0 iff every scenario passes; failing scenarios echo their output.

Covered done conditions:

- AC2 (one process per firing): each hook's ``main()`` is run IN-PROCESS with
  ``subprocess.run``/``subprocess.Popen`` spied; zero spied argvs may contain an
  ``omp_flow.py`` path, the shared shim's ``run_core`` must have been invoked,
  and the emitted envelope must carry the workflow-state marker plus the
  resolved executing phase.
- AC6 (fail-closed on broken core): with the core import forced to fail (row
  B's technique -- a fake root whose ``.omp-flow/scripts/common/__init__.py``
  raises ImportError, in a fresh interpreter that never imported the real
  core), each hook still exits 0 and emits the visible STOP
  ``additionalContext`` envelope plus a ``systemMessage`` -- never an empty
  context, never a non-STOP success envelope.
- H2 regression: SessionStart with NO active-task pointer for the session
  resolves the ``no_task`` state block successfully in-process.
- Failure-reason parity: a real core validation failure (corrupt session
  pointer) produces the same STOP reason text as the recorded PRE-CHANGE
  subprocess corpus (``tests/fixtures/claude-hooks/golden``), modulo the
  declared ``__GOLDEN_ROOT__`` placeholder.
- Row done condition: both template/mirror hook pairs are byte-identical.

Each scenario re-invokes this file with ``--scenario <name>`` in a FRESH
interpreter so ``sys.modules``/``sys.path``/env residue from another scenario
cannot mask a regression.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

DRIVER = Path(__file__).resolve()
REPO_ROOT = DRIVER.parents[2]
HOOKS_DIR = REPO_ROOT / "templates" / "claude" / "hooks"
MIRROR_DIR = REPO_ROOT / ".claude" / "hooks"
GOLDEN_DIR = REPO_ROOT / "tests" / "fixtures" / "claude-hooks" / "golden"

STATE_MARKER = "<!-- omp-flow-workflow-state -->"
CORRUPT_SID = "golden-corrupt-session"  # matches the recorded golden corpus sid

# Session-identity env keys the control plane reads (active_task.py); child
# scenario processes must not inherit any ambient identity.
IDENTITY_ENV_KEYS = (
    "OMP_FLOW_CONTEXT_ID",
    "CODEX_THREAD_ID",
    "CODEX_SESSION_ID",
    "OMP_SESSION_ID",
    "PI_SESSION_ID",
)


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _load_hook(script: str):
    """Load a hook wrapper as a module (dashes in the filename forbid a plain
    import). ``HOOKS_DIR`` is put on ``sys.path`` first, mirroring the real
    runtime where the hook's own directory is ``sys.path[0]`` -- that is what
    lets the hook's lazy ``from _omp_core import ...`` resolve."""
    if str(HOOKS_DIR) not in sys.path:
        sys.path.insert(0, str(HOOKS_DIR))
    module_name = script.removesuffix(".py").replace("-", "_")
    spec = importlib.util.spec_from_file_location(module_name, HOOKS_DIR / script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_hook_main(module, payload: dict) -> tuple[int, dict]:
    """Drive ``module.main()`` exactly as Claude does (one JSON object on
    stdin, one on stdout) but inside THIS interpreter, so subprocess spies and
    ``sys.modules`` observations apply to the hook's own work."""
    old_stdin, old_stdout = sys.stdin, sys.stdout
    sys.stdin = io.StringIO(json.dumps(payload, ensure_ascii=False))
    sys.stdout = io.StringIO()
    try:
        code = module.main()
        raw = sys.stdout.getvalue()
    finally:
        sys.stdin, sys.stdout = old_stdin, old_stdout
    _check(raw.strip() != "", "hook emitted a non-empty JSON envelope")
    return code, json.loads(raw)


class _SubprocessSpy:
    """Record every argv handed to subprocess.run/Popen (AC2: none may invoke
    omp_flow.py). run() internally resolves Popen through the module global, so
    patching both catches every spawn route."""

    def __init__(self) -> None:
        self.argvs: list[str] = []
        self._real_run = subprocess.run
        self._real_popen = subprocess.Popen

    def install(self) -> None:
        def spy_run(*args, **kwargs):
            self.argvs.append(str(args[0] if args else kwargs.get("args")))
            return self._real_run(*args, **kwargs)

        def spy_popen(*args, **kwargs):
            self.argvs.append(str(args[0] if args else kwargs.get("args")))
            return self._real_popen(*args, **kwargs)

        subprocess.run = spy_run
        subprocess.Popen = spy_popen

    def assert_no_core_spawn(self) -> None:
        offenders = [argv for argv in self.argvs if "omp_flow.py" in argv]
        _check(not offenders, f"no omp_flow.py subprocess may be spawned (AC2): {offenders}")


class _RunCoreSpy:
    """Wrap _omp_core.run_core so the driver can prove the hook's result came
    from the in-process shim (the hook imports run_core lazily at call time, so
    patching the module attribute intercepts it)."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        if str(HOOKS_DIR) not in sys.path:
            sys.path.insert(0, str(HOOKS_DIR))
        import _omp_core

        self._module = _omp_core
        self._real = _omp_core.run_core

    def install(self) -> None:
        def spy(root, kind, payload, session_id):
            self.calls.append((kind, session_id))
            return self._real(root, kind, payload, session_id)

        self._module.run_core = spy


def _explicit_key(session_id: str) -> str:
    return "explicit-" + hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:20]


def _root_placeholder_normalize(text: str, root: str) -> str:
    """Mirror the Test 8j goldenNormalize root rule on an already-parsed string:
    replace the fixture root's raw, resolved, and posix spellings with
    __GOLDEN_ROOT__, longest form first."""
    forms = {root, str(Path(root).resolve()), root.replace("\\", "/"), str(Path(root).resolve()).replace("\\", "/")}
    for form in sorted((f for f in forms if f), key=len, reverse=True):
        text = text.replace(form, "__GOLDEN_ROOT__")
    return text


def _assert_state_allow(envelope: dict, event: str) -> str:
    hso = envelope.get("hookSpecificOutput")
    _check(isinstance(hso, dict), "success envelope carries hookSpecificOutput")
    _check(hso.get("hookEventName") == event, f"envelope echoes the {event} event")
    context = hso.get("additionalContext")
    _check(isinstance(context, str) and context.startswith(STATE_MARKER), "context starts with the workflow-state marker")
    _check("STOP:" not in context, "success context is not a STOP envelope")
    return context


def _assert_stop(envelope: dict, event: str) -> str:
    hso = envelope.get("hookSpecificOutput")
    _check(isinstance(hso, dict), "STOP envelope carries hookSpecificOutput")
    _check(hso.get("hookEventName") == event, f"STOP envelope echoes the {event} event")
    context = hso.get("additionalContext")
    _check(isinstance(context, str) and context.startswith(STATE_MARKER), "STOP context keeps the workflow-state marker")
    _check("STOP:" in context, "failure context is a visible STOP envelope, never empty/permissive")
    message = envelope.get("systemMessage")
    _check(isinstance(message, str) and message.strip() != "", "failure envelope carries a systemMessage")
    return message


def _make_broken_root(base: Path) -> Path:
    """Row B's AC6 technique: a fake root that passes _project_root's existence
    check but whose common package import raises ImportError."""
    scripts = base / ".omp-flow" / "scripts"
    (scripts / "common").mkdir(parents=True)
    (scripts / "omp_flow.py").write_text("# stub core for broken-install simulation\n", encoding="utf-8")
    (scripts / "common" / "__init__.py").write_text('raise ImportError("broken core for test")\n', encoding="utf-8")
    return base


# --- scenarios (each runs in a fresh interpreter via --scenario) -------------


def scenario_turn_allow(args: argparse.Namespace) -> None:
    """AC2 for inject-workflow-state.py: one process, in-process shim result."""
    os.environ["CLAUDE_PROJECT_DIR"] = args.root
    spy = _SubprocessSpy()
    spy.install()
    core_spy = _RunCoreSpy()
    core_spy.install()
    module = _load_hook("inject-workflow-state.py")
    code, envelope = _run_hook_main(
        module,
        {"hook_event_name": "UserPromptSubmit", "session_id": args.session, "cwd": args.root, "prompt": "state?"},
    )
    _check(code == 0, "UserPromptSubmit hook exits 0 on success")
    spy.assert_no_core_spawn()
    _check(
        core_spy.calls == [("claude-workflow-state", args.session)],
        f"the envelope was produced by exactly one in-process run_core call: {core_spy.calls}",
    )
    context = _assert_state_allow(envelope, "UserPromptSubmit")
    _check("Phase: execute" in context, "per-turn state resolves the executing task phase in-process")
    _check(
        os.environ.get("OMP_FLOW_CONTEXT_ID") == args.session,
        "the shim exported OMP_FLOW_CONTEXT_ID=<raw session_id> in the hook's own process",
    )


def scenario_session_start_allow(args: argparse.Namespace) -> None:
    """AC2 for session-start.py: one process, shim result, env-file bridge kept."""
    os.environ["CLAUDE_PROJECT_DIR"] = args.root
    spy = _SubprocessSpy()
    spy.install()
    core_spy = _RunCoreSpy()
    core_spy.install()
    module = _load_hook("session-start.py")
    with tempfile.TemporaryDirectory() as tmp:
        env_file = Path(tmp) / "env-bridge.sh"
        os.environ["CLAUDE_ENV_FILE"] = str(env_file)
        code, envelope = _run_hook_main(
            module,
            {"hook_event_name": "SessionStart", "source": "startup", "session_id": args.session, "cwd": args.root},
        )
        _check(code == 0, "SessionStart hook exits 0 on success")
        bridge = env_file.read_text(encoding="utf-8")
        _check(
            f"export OMP_FLOW_CONTEXT_ID={shlex.quote(args.session)}" in bridge,
            "_bridge_env_file still appends the raw session id export (bridge preserved)",
        )
    spy.assert_no_core_spawn()
    _check(
        core_spy.calls == [("claude-workflow-state", args.session)],
        f"the envelope was produced by exactly one in-process run_core call: {core_spy.calls}",
    )
    context = _assert_state_allow(envelope, "SessionStart")
    _check("Phase: execute" in context, "SessionStart state resolves the executing task phase in-process")


def scenario_session_start_no_task(args: argparse.Namespace) -> None:
    """H2 regression: SessionStart with NO active-task pointer for the session
    succeeds in-process and renders the no_task state block."""
    os.environ["CLAUDE_PROJECT_DIR"] = args.root
    no_task_sid = "state-driver-no-task-session"
    pointer = Path(args.root) / ".omp-flow" / ".runtime" / "sessions" / (_explicit_key(no_task_sid) + ".json")
    _check(not pointer.exists(), f"scenario precondition: no active-task pointer at {pointer}")
    module = _load_hook("session-start.py")
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["CLAUDE_ENV_FILE"] = str(Path(tmp) / "env-bridge.sh")
        code, envelope = _run_hook_main(
            module,
            {"hook_event_name": "SessionStart", "source": "startup", "session_id": no_task_sid, "cwd": args.root},
        )
    _check(code == 0, "no-active-task SessionStart exits 0 (H2: not a failure)")
    context = _assert_state_allow(envelope, "SessionStart")
    _check(
        "No active task for this session." in context,
        "no-active-task SessionStart renders the no_task state block in-process",
    )


def scenario_turn_broken_core(args: argparse.Namespace) -> None:
    """AC6 for inject-workflow-state.py: broken core import -> STOP at exit 0."""
    _scenario_broken_core("inject-workflow-state.py", "UserPromptSubmit", args)


def scenario_session_start_broken_core(args: argparse.Namespace) -> None:
    """AC6 for session-start.py: broken core import -> STOP at exit 0."""
    _scenario_broken_core("session-start.py", "SessionStart", args)


def _scenario_broken_core(script: str, event: str, args: argparse.Namespace) -> None:
    loaded = [name for name in sys.modules if name == "common" or name.startswith("common.")]
    _check(not loaded, f"scenario precondition: fresh interpreter without common.*: {loaded}")
    spy = _SubprocessSpy()
    spy.install()
    with tempfile.TemporaryDirectory() as tmp:
        broken_root = _make_broken_root(Path(tmp))
        os.environ["CLAUDE_PROJECT_DIR"] = str(broken_root)
        os.environ["CLAUDE_ENV_FILE"] = str(broken_root / "env-bridge.sh")
        module = _load_hook(script)
        payload = {"hook_event_name": event, "session_id": args.session, "cwd": str(broken_root)}
        if event == "SessionStart":
            payload["source"] = "startup"
        else:
            payload["prompt"] = "state?"
        code, envelope = _run_hook_main(module, payload)
    _check(code == 0, f"{script} with a broken core still exits 0 (visible, non-blocking failure)")
    spy.assert_no_core_spawn()
    message = _assert_stop(envelope, event)
    _check(
        "broken core for test" in message and "core unavailable" in message,
        f"STOP reason names the CoreUnavailable import failure: {message!r}",
    )


def scenario_turn_corrupt_parity(args: argparse.Namespace) -> None:
    """Failure-reason parity for inject-workflow-state.py against the recorded
    PRE-CHANGE subprocess corpus case state-turn-corrupt-session-core-error."""
    _scenario_corrupt_parity(
        "inject-workflow-state.py",
        "UserPromptSubmit",
        "state-turn-corrupt-session-core-error",
        args,
    )


def scenario_session_start_corrupt_parity(args: argparse.Namespace) -> None:
    """Failure-reason parity for session-start.py against the recorded
    PRE-CHANGE subprocess corpus case state-session-start-corrupt-core-error."""
    _scenario_corrupt_parity(
        "session-start.py",
        "SessionStart",
        "state-session-start-corrupt-core-error",
        args,
    )


def _scenario_corrupt_parity(script: str, event: str, golden_case: str, args: argparse.Namespace) -> None:
    os.environ["CLAUDE_PROJECT_DIR"] = args.root
    recorded = json.loads((GOLDEN_DIR / (golden_case + ".json")).read_text(encoding="utf-8"))
    expected_reason = str(recorded["reason"])
    pointer = Path(args.root) / ".omp-flow" / ".runtime" / "sessions" / (_explicit_key(CORRUPT_SID) + ".json")
    pointer.parent.mkdir(parents=True, exist_ok=True)
    pointer.write_text("not json", encoding="utf-8")
    try:
        module = _load_hook(script)
        with tempfile.TemporaryDirectory() as tmp:
            payload = {"hook_event_name": event, "session_id": CORRUPT_SID, "cwd": args.root}
            if event == "SessionStart":
                payload["source"] = "startup"
                os.environ["CLAUDE_ENV_FILE"] = str(Path(tmp) / "env-bridge.sh")
            else:
                payload["prompt"] = "state?"
            code, envelope = _run_hook_main(module, payload)
    finally:
        pointer.unlink(missing_ok=True)  # never leak the corrupt pointer into the shared fixture
    _check(code == 0, f"{script} on a core validation failure exits 0 with a STOP envelope")
    message = _assert_stop(envelope, event)
    normalized = _root_placeholder_normalize(message, args.root)
    _check(
        normalized == expected_reason,
        "in-process STOP reason equals the recorded subprocess reason "
        f"(modulo __GOLDEN_ROOT__): {normalized!r} != {expected_reason!r}",
    )
    _check("[omp-flow] ERROR: " in message, "STOP reason keeps the [omp-flow] ERROR prefix (AC5 class)")


def scenario_mirrors_identical(args: argparse.Namespace) -> None:
    """Row done condition: template and live .claude mirrors are byte-identical."""
    for script in ("inject-workflow-state.py", "session-start.py"):
        template = (HOOKS_DIR / script).read_bytes()
        mirror = (MIRROR_DIR / script).read_bytes()
        _check(template == mirror, f"templates/claude/hooks/{script} and .claude/hooks/{script} are byte-identical")


SCENARIO_ORDER = (
    "turn-allow",
    "session-start-allow",
    "session-start-no-task",
    "turn-broken-core",
    "session-start-broken-core",
    "turn-corrupt-parity",
    "session-start-corrupt-parity",
    "mirrors-identical",
)
SCENARIOS = {
    "turn-allow": scenario_turn_allow,
    "session-start-allow": scenario_session_start_allow,
    "session-start-no-task": scenario_session_start_no_task,
    "turn-broken-core": scenario_turn_broken_core,
    "session-start-broken-core": scenario_session_start_broken_core,
    "turn-corrupt-parity": scenario_turn_corrupt_parity,
    "session-start-corrupt-parity": scenario_session_start_corrupt_parity,
    "mirrors-identical": scenario_mirrors_identical,
}


def _child_env() -> dict:
    env = dict(os.environ)
    for key in IDENTITY_ENV_KEYS:
        env.pop(key, None)
    env.pop("CLAUDE_ENV_FILE", None)
    return env


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Unit driver for the in-process state hooks (standard "
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
    print("all state-hook scenarios passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
