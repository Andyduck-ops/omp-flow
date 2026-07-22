#!/usr/bin/env python3
"""Unit driver for the in-process dispatch hook (task 07-22-dispatch-stutter,
row C-B001--001): ``templates/claude/hooks/inject-agent-context.py``.

Driver argv contract (Test 8k, established by ``test_omp_core.py``):

    python -X utf8 <driver> --root <fixtureRoot> --task <taskId> \
        --session <sid> --qbd-task <id> --qbd-session <sid>

Exit code 0 iff every scenario passes; failing scenarios echo their output.

Covered done conditions:

- AC1 (no core subprocess on dispatch): a recognized executor dispatch AND a
  QbD dispatch each run ``main()`` IN-PROCESS with ``subprocess.run``/
  ``subprocess.Popen`` spied; zero spied argvs may contain an ``omp_flow.py``
  path, the shared shim's ``run_core`` must have been invoked, and the output
  must be an allow whose ``updatedInput`` prompt starts with the dispatch
  marker while every other native ``tool_input`` field is preserved.
- AC5 (error-string parity): a payload tripping a core WorkflowError (descriptor
  taskId vs active task mismatch) emits a deny whose reason byte-equals the
  recorded PRE-CHANGE subprocess corpus reason
  (``tests/fixtures/claude-hooks/golden/dispatch-task-mismatch-core-error.json``),
  ``[omp-flow] ERROR:`` prefix intact.
- AC6 (fail-closed on broken core): with the core import forced to fail (row
  B's technique -- a fake root whose ``.omp-flow/scripts/common/__init__.py``
  raises ImportError, in a fresh interpreter that never imported the real
  core), ``main()`` exits 2 with NO stdout (no allow) and a visible stderr.
- AC9 (session-identity parity, both asserts in one scenario): (a) with
  ``OMP_FLOW_CONTEXT_ID`` initially UNSET and the fixture's active-task pointer
  pre-written under the subprocess-parity key ``explicit-<sha256(sid)[:20]>``,
  the in-process dispatch resolves exactly that active task -- the valid
  descriptor allows with the fixture task named in the handoff, AND a
  taskId-mismatch probe denies with a reason NAMING the pointer's exact task
  (``does not match the session's active task <task>``; a no-pointer session
  cannot produce that reason because ``_check_active_task`` passes executor
  dispatches with no active task); (b) ``resolve_context_key({})`` evaluated
  in the same process after ``run_core`` returns that explicit key, NOT a
  payload-derived ``session-<hash>`` key. The companion ``identity-detector``
  scenario PROVES the detector trips: it runs the hook against a mutated shim
  copy with the ``os.environ["OMP_FLOW_CONTEXT_ID"] = session_id`` line
  removed and asserts the observable flips -- the QbD dispatch that allows
  with the line intact (``require_selected=True``) DENIES with "none is
  selected", and the mismatch probe no longer names an active task -- so
  dropping the env-set line observably fails this driver.
- Row done condition: template and live ``.claude`` mirror are byte-identical.

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
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DRIVER = Path(__file__).resolve()
REPO_ROOT = DRIVER.parents[2]
HOOKS_DIR = REPO_ROOT / "templates" / "claude" / "hooks"
MIRROR_DIR = REPO_ROOT / ".claude" / "hooks"
GOLDEN_DIR = REPO_ROOT / "tests" / "fixtures" / "claude-hooks" / "golden"

HOOK_SCRIPT = "inject-agent-context.py"
DISPATCH_MARKER = "<!-- omp-flow-claude-dispatch:v1 -->"
# The shim's H1 identity-parity line the identity-detector scenario mutates out.
ENV_SET_LINE = 'os.environ["OMP_FLOW_CONTEXT_ID"] = session_id'

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


def _explicit_key(session_id: str) -> str:
    return "explicit-" + hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:20]


def _load_hook():
    """Load the hook wrapper as a module (dashes in the filename forbid a plain
    import). ``HOOKS_DIR`` is put on ``sys.path`` first, mirroring the real
    runtime where the hook's own directory is ``sys.path[0]`` -- that is what
    lets the hook's lazy ``from _omp_core import ...`` resolve."""
    if str(HOOKS_DIR) not in sys.path:
        sys.path.insert(0, str(HOOKS_DIR))
    spec = importlib.util.spec_from_file_location("inject_agent_context", HOOKS_DIR / HOOK_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_hook_main(module, payload: dict) -> tuple[int, str, str]:
    """Drive ``module.main()`` exactly as Claude does (one JSON object on
    stdin, decision on stdout, diagnostics on stderr) but inside THIS
    interpreter, so subprocess spies and env observations apply to the hook's
    own work. Returns ``(exit_code, stdout, stderr)``."""
    old_stdin, old_stdout, old_stderr = sys.stdin, sys.stdout, sys.stderr
    sys.stdin = io.StringIO(json.dumps(payload, ensure_ascii=False))
    sys.stdout = io.StringIO()
    sys.stderr = io.StringIO()
    try:
        code = module.main()
        out = sys.stdout.getvalue()
        err = sys.stderr.getvalue()
    finally:
        sys.stdin, sys.stdout, sys.stderr = old_stdin, old_stdout, old_stderr
    return code, out, err


class _SubprocessSpy:
    """Record every argv handed to subprocess.run/Popen (AC1: none may invoke
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
        _check(not offenders, f"no omp_flow.py subprocess may be spawned (AC1): {offenders}")


class _RunCoreSpy:
    """Wrap _omp_core.run_core so the driver can prove the hook's decision came
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


def _dispatch_line(body: dict) -> str:
    return json.dumps({"ompFlowDispatch": body}, separators=(",", ":"))


def _executor_payload(args: argparse.Namespace, prompt: str | None = None) -> dict:
    if prompt is None:
        prompt = (
            _dispatch_line({"version": 1, "role": "executor", "taskId": args.task, "rowId": "A-001"})
            + "\nImplement the driver row."
        )
    return {
        "hook_event_name": "PreToolUse",
        "session_id": args.session,
        "cwd": args.root,
        "tool_name": "Agent",
        "tool_input": {
            "subagent_type": "omp-flow-implement",
            "description": "Implement the assigned row",
            "model": "inherit",
            "prompt": prompt,
        },
    }


def _qbd_fixture_gate(args: argparse.Namespace) -> dict:
    gate = json.loads(
        (Path(args.root) / ".omp-flow" / "tasks" / args.qbd_task / "task.json").read_text(encoding="utf-8")
    )["gates"]["qbd1"]
    _check(gate.get("status") == "prepared", "fixture qbd task has gate qbd1 prepared")
    return gate


def _qbd_payload(args: argparse.Namespace, gate: dict) -> dict:
    prompt = (
        _dispatch_line(
            {
                "version": 1,
                "role": "qbd-auditor",
                "taskId": args.qbd_task,
                "gate": "qbd1",
                "report": gate["report"],
                "evidenceDigest": gate["evidenceDigest"],
            }
        )
        + "\nAudit the prepared gate."
    )
    return {
        "hook_event_name": "PreToolUse",
        "session_id": args.qbd_session,
        "cwd": args.root,
        "tool_name": "Task",
        "tool_input": {
            "subagent_type": "omp-flow-qbd",
            "description": "Audit the prepared gate",
            "model": "inherit",
            "prompt": prompt,
        },
    }


def _assert_allow(stdout_text: str, original_input: dict) -> str:
    envelope = json.loads(stdout_text)
    hso = envelope.get("hookSpecificOutput")
    _check(isinstance(hso, dict), "allow envelope carries hookSpecificOutput")
    _check(hso.get("hookEventName") == "PreToolUse", "envelope echoes the PreToolUse event")
    _check(hso.get("permissionDecision") == "allow", "recognized valid dispatch allows")
    updated = hso.get("updatedInput")
    _check(isinstance(updated, dict), "allow carries updatedInput")
    for field in ("subagent_type", "description", "model"):
        _check(
            updated.get(field) == original_input[field],
            f"updatedInput preserves the native tool_input field {field!r}",
        )
    _check(
        set(updated.keys()) == set(original_input.keys()),
        "updatedInput preserves EVERY native tool_input key (only prompt is replaced)",
    )
    prompt = updated.get("prompt")
    _check(
        isinstance(prompt, str) and prompt.startswith(DISPATCH_MARKER + "\n"),
        "updatedInput prompt starts with the dispatch marker",
    )
    return prompt


def _assert_deny(stdout_text: str) -> str:
    envelope = json.loads(stdout_text)
    hso = envelope.get("hookSpecificOutput")
    _check(isinstance(hso, dict), "deny envelope carries hookSpecificOutput")
    _check(hso.get("permissionDecision") == "deny", "the dispatch was denied")
    reason = hso.get("permissionDecisionReason")
    _check(isinstance(reason, str) and reason.strip() != "", "deny carries a visible reason")
    return reason


def _make_broken_root(base: Path) -> Path:
    """Row B's AC6 technique: a fake root that passes _project_root's existence
    check but whose common package import raises ImportError."""
    scripts = base / ".omp-flow" / "scripts"
    (scripts / "common").mkdir(parents=True)
    (scripts / "omp_flow.py").write_text("# stub core for broken-install simulation\n", encoding="utf-8")
    (scripts / "common" / "__init__.py").write_text('raise ImportError("broken core for test")\n', encoding="utf-8")
    return base


def _child_env(extra: dict | None = None) -> dict:
    env = dict(os.environ)
    for key in IDENTITY_ENV_KEYS:
        env.pop(key, None)
    env.update(extra or {})
    return env


# --- scenarios (each runs in a fresh interpreter via --scenario) -------------


def scenario_dispatch_allow(args: argparse.Namespace) -> None:
    """AC1 (executor dispatch): one process, decision produced by the shim."""
    os.environ["CLAUDE_PROJECT_DIR"] = args.root
    spy = _SubprocessSpy()
    spy.install()
    core_spy = _RunCoreSpy()
    core_spy.install()
    module = _load_hook()
    payload = _executor_payload(args)
    code, out, err = _run_hook_main(module, payload)
    _check(code == 0, f"executor dispatch exits 0 (stderr: {err!r})")
    spy.assert_no_core_spawn()
    _check(
        core_spy.calls == [("claude-dispatch-context", args.session)],
        f"the decision was produced by exactly one in-process run_core call: {core_spy.calls}",
    )
    prompt = _assert_allow(out, payload["tool_input"])
    _check(f"Task ID: {args.task}" in prompt, "handoff prompt names the fixture task")
    _check("# A brief" in prompt, "handoff prompt carries the fixture row brief")
    _check("Implement the driver row." in prompt, "handoff prompt carries the original assignment text")


def scenario_qbd_allow(args: argparse.Namespace) -> None:
    """AC1 (QbD dispatch): one process, decision produced by the shim."""
    os.environ["CLAUDE_PROJECT_DIR"] = args.root
    spy = _SubprocessSpy()
    spy.install()
    core_spy = _RunCoreSpy()
    core_spy.install()
    module = _load_hook()
    gate = _qbd_fixture_gate(args)
    payload = _qbd_payload(args, gate)
    code, out, err = _run_hook_main(module, payload)
    _check(code == 0, f"qbd dispatch exits 0 (stderr: {err!r})")
    spy.assert_no_core_spawn()
    _check(
        core_spy.calls == [("claude-qbd-report", args.qbd_session)],
        f"the decision was produced by exactly one in-process run_core call: {core_spy.calls}",
    )
    prompt = _assert_allow(out, payload["tool_input"])
    _check(gate["report"] in prompt, "qbd handoff prompt names the prepared report path")
    _check(gate["evidenceDigest"] in prompt, "qbd handoff prompt carries the prepared evidence digest")


def scenario_core_error_parity(args: argparse.Namespace) -> None:
    """AC5: a core WorkflowError (descriptor taskId vs active task mismatch)
    denies with the byte-identical reason recorded from the PRE-CHANGE
    subprocess implementation."""
    os.environ["CLAUDE_PROJECT_DIR"] = args.root
    recorded = json.loads(
        (GOLDEN_DIR / "dispatch-task-mismatch-core-error.json").read_text(encoding="utf-8")
    )
    expected = (
        str(recorded["reason"])
        .replace("__GOLDEN_TASK__", args.task)
        .replace("__GOLDEN_SESSION__", args.session)
    )
    module = _load_hook()
    prompt = (
        _dispatch_line({"version": 1, "role": "executor", "taskId": "golden-other-task", "rowId": "A-001"}) + "\nx"
    )
    code, out, err = _run_hook_main(module, _executor_payload(args, prompt))
    _check(code == 0, "a recognized core validation failure exits 0 with a JSON deny")
    reason = _assert_deny(out)
    _check(
        reason == expected,
        f"deny reason byte-equals the recorded subprocess reason: {reason!r} != {expected!r}",
    )
    _check(reason.startswith("[omp-flow] ERROR: "), "reason carries the [omp-flow] ERROR prefix")


def scenario_broken_core(args: argparse.Namespace) -> None:
    """AC6: broken core import -> exit 2 (blocks the spawn), no allow output."""
    loaded = [name for name in sys.modules if name == "common" or name.startswith("common.")]
    _check(not loaded, f"scenario precondition: fresh interpreter without common.*: {loaded}")
    spy = _SubprocessSpy()
    spy.install()
    with tempfile.TemporaryDirectory() as tmp:
        broken_root = _make_broken_root(Path(tmp))
        os.environ["CLAUDE_PROJECT_DIR"] = str(broken_root)
        module = _load_hook()
        payload = _executor_payload(args)
        payload["cwd"] = str(broken_root)
        code, out, err = _run_hook_main(module, payload)
    _check(code == 2, f"a broken core install exits 2 to BLOCK the spawn (got {code})")
    _check(out.strip() == "", "a broken core emits NO stdout decision (never an allow)")
    _check(
        "broken core for test" in err and "core unavailable" in err,
        f"stderr names the CoreUnavailable import failure: {err!r}",
    )
    spy.assert_no_core_spawn()


def scenario_identity_parity(args: argparse.Namespace) -> None:
    """AC9 (both asserts): (a) pointer equality with the subprocess path via the
    explicit-<sha256(sid)[:20]> key; (b) resolve_context_key({}) takes the
    env-var branch after run_core."""
    _check(
        os.environ.get("OMP_FLOW_CONTEXT_ID") is None,
        "scenario precondition: OMP_FLOW_CONTEXT_ID starts UNSET",
    )
    pointer = (
        Path(args.root) / ".omp-flow" / ".runtime" / "sessions" / (_explicit_key(args.session) + ".json")
    )
    _check(
        pointer.is_file(),
        f"scenario precondition: the fixture active-task pointer exists under the subprocess-parity key: {pointer}",
    )
    os.environ["CLAUDE_PROJECT_DIR"] = args.root
    module = _load_hook()
    payload = _executor_payload(args)
    code, out, err = _run_hook_main(module, payload)
    _check(code == 0, f"identity dispatch exits 0 (stderr: {err!r})")
    # (a) part 1: the valid descriptor allows with the fixture task in the handoff.
    prompt = _assert_allow(out, payload["tool_input"])
    _check(f"Task ID: {args.task}" in prompt, "in-process dispatch handoff references the fixture task")
    _check(
        os.environ.get("OMP_FLOW_CONTEXT_ID") == args.session,
        "run_core exported OMP_FLOW_CONTEXT_ID=<raw session_id> in the hook's own process",
    )
    # (a) part 2 -- pointer equality proper: an executor dispatch also allows when
    # NO active task resolves (_check_active_task only denies a MISMATCH for
    # require_selected=False), so the allow alone cannot prove the pointer was
    # read. A taskId-mismatch probe can: its deny reason NAMES the session's
    # resolved active task, which only the explicit-<hash> pointer can supply.
    probe_prompt = (
        _dispatch_line({"version": 1, "role": "executor", "taskId": "golden-other-task", "rowId": "A-001"}) + "\nx"
    )
    probe_code, probe_out, probe_err = _run_hook_main(module, _executor_payload(args, probe_prompt))
    _check(probe_code == 0, f"mismatch probe exits 0 with a JSON deny (stderr: {probe_err!r})")
    probe_reason = _assert_deny(probe_out)
    _check(
        probe_reason
        == f"[omp-flow] ERROR: Descriptor taskId golden-other-task does not match the session's active task {args.task}",
        "the deny reason names EXACTLY the active task written under the "
        f"subprocess-parity explicit-<hash> pointer: {probe_reason!r}",
    )
    # (b) the key resolver, evaluated in this same process after run_core, takes
    # the env-var explicit branch -- not a payload-derived session-<hash> key.
    from common.active_task import resolve_context_key

    key = resolve_context_key({})
    _check(
        key == _explicit_key(args.session),
        f"resolve_context_key({{}}) returns the explicit-<sha256[:20]> env branch key: {key!r}",
    )
    _check(not key.startswith("session-"), "resolved key is NOT a payload-derived session-<hash> key")


def scenario_identity_detector(args: argparse.Namespace) -> None:
    """Proof the AC9 detector trips: with the shim's env-set line REMOVED, the
    observables the positive scenarios assert FLIP. This is the permanent form
    of the 'temporary mutation during development' proof required by the brief:

    - the QbD dispatch that qbd-allow proves ALLOWS with the line intact now
      DENIES ("none is selected"): require_selected=True means a session whose
      pointer key falls back to session-<hash> resolves NO selected task;
    - the executor mismatch probe that identity-parity proves denies WITH the
      pointer's task named now denies WITHOUT it (no active task resolves)."""
    shim_source = (HOOKS_DIR / "_omp_core.py").read_text(encoding="utf-8")
    lines = shim_source.splitlines(keepends=True)
    kept = [line for line in lines if line.strip() != ENV_SET_LINE]
    _check(
        len(kept) == len(lines) - 1,
        f"the shim contains exactly the H1 env-set line to mutate out: {ENV_SET_LINE!r}",
    )
    with tempfile.TemporaryDirectory() as tmp:
        hooks = Path(tmp) / "hooks"
        hooks.mkdir()
        shutil.copyfile(HOOKS_DIR / HOOK_SCRIPT, hooks / HOOK_SCRIPT)
        (hooks / "_omp_core.py").write_text("".join(kept), encoding="utf-8")

        def mutated_run(payload: dict) -> subprocess.CompletedProcess:
            return subprocess.run(
                [sys.executable, "-X", "utf8", str(hooks / HOOK_SCRIPT)],
                input=json.dumps(payload, ensure_ascii=False),
                capture_output=True,
                text=True,
                encoding="utf-8",
                env=_child_env({"CLAUDE_PROJECT_DIR": args.root}),
                cwd=args.root,
                timeout=60,
            )

        # Flip 1: the qbd-allow payload (allow with the line intact) now denies.
        qbd = mutated_run(_qbd_payload(args, _qbd_fixture_gate(args)))
        _check(qbd.returncode == 0, f"mutated-shim qbd dispatch exits 0 with a JSON deny (stderr: {qbd.stderr!r})")
        qbd_reason = _assert_deny(qbd.stdout)
        _check(
            qbd_reason
            == f"[omp-flow] ERROR: QbD dispatch requires the session to have already selected task {args.qbd_task}; none is selected",
            f"without the env-set line NO selected task resolves for the session: {qbd_reason!r}",
        )

        # Flip 2: the identity-parity mismatch probe no longer names an active task.
        probe_prompt = (
            _dispatch_line({"version": 1, "role": "executor", "taskId": "golden-other-task", "rowId": "A-001"}) + "\nx"
        )
        probe = mutated_run(_executor_payload(args, probe_prompt))
        _check(probe.returncode == 0, f"mutated-shim mismatch probe exits 0 (stderr: {probe.stderr!r})")
        probe_reason = _assert_deny(probe.stdout)
        _check(
            "does not match the session's active task" not in probe_reason,
            f"without the env-set line the session resolves NO active task to mismatch: {probe_reason!r}",
        )


def scenario_mirror_identical(args: argparse.Namespace) -> None:
    """Row done condition: template and live .claude mirror are byte-identical."""
    template = (HOOKS_DIR / HOOK_SCRIPT).read_bytes()
    mirror = (MIRROR_DIR / HOOK_SCRIPT).read_bytes()
    _check(template == mirror, f"templates/claude/hooks/{HOOK_SCRIPT} and .claude/hooks/{HOOK_SCRIPT} are byte-identical")
    # The constant DEFINITION is gone (the docstring's timeout note still cites
    # the removed name, so scan for the assignment, not the bare identifier).
    _check(b"CORE_TIMEOUT = " not in template, "the subprocess-era CORE_TIMEOUT constant definition is gone")
    _check(b"import subprocess" not in template, "the hook no longer imports subprocess")


SCENARIO_ORDER = (
    "dispatch-allow",
    "qbd-allow",
    "core-error-parity",
    "broken-core",
    "identity-parity",
    "identity-detector",
    "mirror-identical",
)
SCENARIOS = {
    "dispatch-allow": scenario_dispatch_allow,
    "qbd-allow": scenario_qbd_allow,
    "core-error-parity": scenario_core_error_parity,
    "broken-core": scenario_broken_core,
    "identity-parity": scenario_identity_parity,
    "identity-detector": scenario_identity_detector,
    "mirror-identical": scenario_mirror_identical,
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Unit driver for the in-process dispatch hook (standard "
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
    print("all inject-agent-context scenarios passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
