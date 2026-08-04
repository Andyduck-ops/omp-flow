from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SOURCE_ROOT = Path(__file__).resolve().parents[1]
SESSION_HOOK = SOURCE_ROOT / "templates" / "codex" / "hooks" / "session-start.py"
GUARD_HOOK = SOURCE_ROOT / "templates" / "codex" / "hooks" / "protect-runtime.py"
HOOKS_CONFIG = SOURCE_ROOT / "templates" / "codex" / "hooks.json"


def patch(*directives: str) -> str:
    return "\n".join(("*** Begin Patch", *directives, "*** End Patch"))


class CodexHookTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="omp codex hooks 空格-")
        self.root = Path(self.temp.name) / "repo 空格"
        self.root.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        self.subdir = self.root / "nested dir" / "子目录"
        self.subdir.mkdir(parents=True)
        runtime_dir = self.root / ".omp-flow" / "scripts"
        runtime_dir.mkdir(parents=True)
        (runtime_dir / "omp_flow.py").write_text(
            """import json, os, pathlib, sys
record = pathlib.Path(__file__).parents[1] / 'session-record.json'
record.write_text(json.dumps({
    'argv': sys.argv[1:],
    'thread': os.environ.get('CODEX_THREAD_ID'),
    'override': os.environ.get('OMP_FLOW_CONTEXT_ID'),
}, ensure_ascii=False), encoding='utf-8')
print('task: none\\nmechanical: ready')
""",
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_hook(
        self,
        hook: Path,
        payload: object | str,
        *,
        env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        input_text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        return subprocess.run(
            [sys.executable, "-X", "utf8", str(hook)],
            cwd=self.subdir,
            input=input_text,
            text=True,
            encoding="utf-8",
            capture_output=True,
            env=env,
            check=False,
        )

    def session_payload(self, source: str = "startup") -> dict[str, object]:
        return {
            "hook_event_name": "SessionStart",
            "source": source,
            "session_id": f"thread-{source}",
            "cwd": str(self.subdir),
            "transcript_path": "DO-NOT-READ-secret-transcript",
        }

    def guard_payload(self, command: str, cwd: Path | None = None) -> dict[str, object]:
        return {
            "hook_event_name": "PreToolUse",
            "tool_name": "apply_patch",
            "cwd": str(cwd or self.root),
            "tool_input": {"command": command},
        }

    def assert_deny(self, command: str, cwd: Path | None = None, reason: str | None = None) -> None:
        result = self.run_hook(GUARD_HOOK, self.guard_payload(command, cwd))
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(
            set(output),
            {"hookSpecificOutput"},
        )
        hook_output = output["hookSpecificOutput"]
        self.assertEqual(
            set(hook_output),
            {"hookEventName", "permissionDecision", "permissionDecisionReason"},
        )
        self.assertEqual(hook_output["hookEventName"], "PreToolUse")
        self.assertEqual(hook_output["permissionDecision"], "deny")
        if reason is not None:
            self.assertIn(reason, hook_output["permissionDecisionReason"])

    def assert_allow(self, command: str, cwd: Path | None = None) -> None:
        result = self.run_hook(GUARD_HOOK, self.guard_payload(command, cwd))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_session_sources_reuse_thread_identity_and_remove_override(self) -> None:
        for source in ("startup", "resume", "clear", "compact"):
            with self.subTest(source=source):
                environment = os.environ.copy()
                environment["OMP_FLOW_CONTEXT_ID"] = "wrong-override"
                result = self.run_hook(SESSION_HOOK, self.session_payload(source), env=environment)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(len(result.stdout.splitlines()), 1)
                output = json.loads(result.stdout)
                context = output["hookSpecificOutput"]["additionalContext"]
                self.assertEqual(output["hookSpecificOutput"]["hookEventName"], "SessionStart")
                self.assertIn("omp-flow-runtime-orientation:v1", context)
                self.assertIn("mechanical: ready", context)
                self.assertIn("do not infer Task, Flow", context)
                self.assertNotIn("DO-NOT-READ", result.stdout)
                self.assertLessEqual(len(context), 1200)
                record = json.loads(
                    (self.root / ".omp-flow" / "session-record.json").read_text(encoding="utf-8")
                )
                self.assertEqual(record["thread"], f"thread-{source}")
                self.assertIsNone(record["override"])
                self.assertEqual(record["argv"][-1], "status")

    def test_session_failures_are_bounded_and_fail_soft(self) -> None:
        cases: list[object | str] = [
            "{broken",
            {},
            {**self.session_payload(), "hook_event_name": "Other"},
            {**self.session_payload(), "source": "unknown"},
            {**self.session_payload(), "session_id": ""},
            {**self.session_payload(), "cwd": ""},
            {**self.session_payload(), "cwd": str(Path(self.temp.name) / "missing")},
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                result = self.run_hook(SESSION_HOOK, payload)
                self.assertEqual(result.returncode, 0)
                output = json.loads(result.stdout)
                context = output["hookSpecificOutput"]["additionalContext"]
                self.assertIn("orientation unavailable", context)
                self.assertIn("do not infer workflow state", context)
                self.assertLessEqual(len(context), 300)
                self.assertNotIn("Traceback", result.stderr)

    def test_session_runtime_nonzero_is_fail_soft(self) -> None:
        runtime = self.root / ".omp-flow" / "scripts" / "omp_flow.py"
        runtime.write_text("raise SystemExit(3)\n", encoding="utf-8")
        result = self.run_hook(SESSION_HOOK, self.session_payload())
        self.assertEqual(result.returncode, 0)
        self.assertIn("orientation unavailable", result.stdout)

    def test_session_forwards_selected_task_status_without_interpreting_it(self) -> None:
        runtime = self.root / ".omp-flow" / "scripts" / "omp_flow.py"
        runtime.write_text("print('task: .omp-flow/tasks/selected')\n", encoding="utf-8")
        result = self.run_hook(SESSION_HOOK, self.session_payload("resume"))
        self.assertEqual(result.returncode, 0, result.stderr)
        context = json.loads(result.stdout)["hookSpecificOutput"]["additionalContext"]
        self.assertIn("task: .omp-flow/tasks/selected", context)
        self.assertIn("do not infer Task, Flow", context)

    def test_guard_denies_runtime_add_update_delete_and_moves(self) -> None:
        for command in (
            patch("*** Add File: .omp-flow/.runtime/new.json", "+{}"),
            patch("*** Update File: .omp-flow/.runtime/state.json", "@@"),
            patch("*** Delete File: .omp-flow/.runtime/state.json"),
            patch("*** Update File: .omp-flow/.runtime/state.json", "*** Move to: safe.json", "@@"),
            patch("*** Update File: safe.json", "*** Move to: .omp-flow/.runtime/state.json", "@@"),
            patch("*** Add File: .omp-flow\\.runtime\\windows.json", "+{}"),
            patch("*** Add File: .OMP-FLOW/.RUNTIME/case-normalized.json", "+{}"),
        ):
            with self.subTest(command=command):
                self.assert_deny(command, reason="Runtime coordination is Python-owned")

    def test_guard_allows_ordinary_source_bundle_and_unicode_paths(self) -> None:
        for command in (
            patch("*** Update File: src/cli/init.ts", "@@"),
            patch("*** Add File: .omp-flow/tasks/task one/work/概念.md", "+text"),
            patch("*** Delete File: obsolete.txt"),
            patch("*** Update File: before.txt", "*** Move to: after.txt", "@@"),
            patch("*** Update File: templates/codex/hooks/protect-runtime.py", "@@"),
            patch("*** Update File: safe.txt", "@@", "*** End of File"),
        ):
            with self.subTest(command=command):
                self.assert_allow(command)
        self.assert_allow(
            patch("*** Update File: ..\\..\\src\\cli\\init.ts", "@@"),
            self.subdir,
        )

    def test_guard_denies_malformed_or_unverifiable_paths(self) -> None:
        outside = Path(self.temp.name) / "outside.txt"
        cases = (
            "",
            "*** Begin Patch\n*** End Patch",
            "*** Begin Patch\n*** Begin Patch\n*** Add File: x\n*** End Patch",
            "*** Begin Patch\n*** Add File x\n*** End Patch",
            patch("*** Add File: ", "+x"),
            patch("*** Move to: x"),
            patch("*** Add File: .", "+x"),
            patch("*** Add File: ..", "+x"),
            patch("*** Add File: ../../../escape.txt", "+x"),
            patch(f"*** Add File: {outside}", "+x"),
            patch("*** Add File: C:drive-relative.txt", "+x"),
            patch("*** Add File: C:/absolute.txt", "+x"),
            patch("*** Add File: //server/share.txt", "+x"),
            patch("*** Add File: bad\x00path", "+x"),
        )
        for command in cases:
            with self.subTest(command=repr(command)):
                self.assert_deny(command, reason="Cannot safely verify")

    def test_guard_denies_mixed_safe_and_unknown_directives(self) -> None:
        for unknown in (
            "*** Rename File: .omp-flow/.runtime/hidden.json",
            "*** Unknown Directive: ignored-before-fix",
            "*** Update Files: .omp-flow/.runtime/hidden.json",
        ):
            with self.subTest(unknown=unknown):
                self.assert_deny(
                    patch("*** Update File: safe.txt", "@@", unknown),
                    reason="Cannot safely verify",
                )

    def test_guard_denies_symlink_escape_when_supported(self) -> None:
        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        link = self.root / "escape-link"
        try:
            link.symlink_to(outside, target_is_directory=True)
        except OSError as exc:
            self.skipTest(f"symlink creation unavailable: {exc}")
        self.assert_deny(patch("*** Add File: escape-link/out.txt", "+x"), reason="Cannot safely verify")

    def test_guard_wrong_shape_is_denied(self) -> None:
        cases = (
            "{broken",
            {},
            {**self.guard_payload(patch("*** Add File: safe.txt", "+x")), "tool_name": "shell"},
            {
                "hook_event_name": "PreToolUse",
                "tool_name": "apply_patch",
                "cwd": str(self.root),
                "tool_input": {"patch": patch("*** Add File: safe.txt", "+x")},
            },
        )
        for payload in cases:
            with self.subTest(payload=payload):
                result = self.run_hook(GUARD_HOOK, payload)
                self.assertEqual(result.returncode, 0)
                output = json.loads(result.stdout)
                self.assertEqual(output["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_hook_config_has_exact_native_events_and_commands(self) -> None:
        config = json.loads(HOOKS_CONFIG.read_text(encoding="utf-8"))
        self.assertEqual(set(config), {"description", "hooks"})
        self.assertEqual(set(config["hooks"]), {"SessionStart", "PreToolUse"})
        session_group = config["hooks"]["SessionStart"]
        guard_group = config["hooks"]["PreToolUse"]
        self.assertEqual(len(session_group), 1)
        self.assertEqual(len(guard_group), 1)
        self.assertEqual(session_group[0]["matcher"], "^(startup|resume|clear|compact)$")
        self.assertEqual(guard_group[0]["matcher"], "^apply_patch$")
        for group in (session_group, guard_group):
            self.assertEqual(len(group[0]["hooks"]), 1)
            hook = group[0]["hooks"][0]
            self.assertEqual(hook["type"], "command")
            self.assertIn("git rev-parse --show-toplevel", hook["command"])
            self.assertIn("subprocess.check_output", hook["commandWindows"])

    @unittest.skipUnless(os.name == "nt", "Windows command smoke runs only on Windows")
    def test_windows_commands_launch_from_unicode_subdirectory(self) -> None:
        deployed = self.root / ".codex" / "hooks"
        deployed.mkdir(parents=True)
        shutil.copy2(SESSION_HOOK, deployed / "session-start.py")
        shutil.copy2(GUARD_HOOK, deployed / "protect-runtime.py")
        config = json.loads(HOOKS_CONFIG.read_text(encoding="utf-8"))
        session_command = config["hooks"]["SessionStart"][0]["hooks"][0]["commandWindows"]
        session = subprocess.run(
            session_command,
            cwd=self.subdir,
            input=json.dumps(self.session_payload(), ensure_ascii=False),
            text=True,
            encoding="utf-8",
            capture_output=True,
            shell=True,
            check=False,
        )
        self.assertEqual(session.returncode, 0, session.stderr)
        self.assertIn("omp-flow-runtime-orientation:v1", session.stdout)

        guard_command = config["hooks"]["PreToolUse"][0]["hooks"][0]["commandWindows"]
        guard = subprocess.run(
            guard_command,
            cwd=self.subdir,
            input=json.dumps(
                self.guard_payload(
                    patch("*** Add File: ..\\..\\.omp-flow\\.runtime\\blocked.json", "+{}"),
                    self.subdir,
                ),
                ensure_ascii=False,
            ),
            text=True,
            encoding="utf-8",
            capture_output=True,
            shell=True,
            check=False,
        )
        self.assertEqual(guard.returncode, 0, guard.stderr)
        self.assertEqual(json.loads(guard.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")


if __name__ == "__main__":
    unittest.main()
