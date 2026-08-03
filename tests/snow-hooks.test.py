from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SOURCE_ROOT = Path(__file__).resolve().parents[1]
SNOW_ROOT = SOURCE_ROOT / "templates" / "snow"
SESSION_HOOK = SNOW_ROOT / "hooks" / "session-start.py"
GUARD_HOOK = SNOW_ROOT / "hooks" / "protect-runtime.py"
SESSION_CONFIG = SNOW_ROOT / "hooks" / "onSessionStart.json"
GUARD_CONFIG = SNOW_ROOT / "hooks" / "beforeToolCall.json"
FIXTURES = json.loads(
    (SOURCE_ROOT / "tests" / "fixtures" / "snow" / "hook-cases.json").read_text(
        encoding="utf-8"
    )
)
CONTEXT_ENV_KEYS = (
    "OMP_FLOW_CONTEXT_ID",
    "CODEX_THREAD_ID",
    "CODEX_SESSION_ID",
    "OMP_SESSION_ID",
    "PI_SESSION_ID",
    "SNOW_SESSION_ID",
)


def parse_simple_frontmatter(path: Path) -> tuple[dict[str, object], str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        raise AssertionError(f"missing frontmatter: {path}")
    end = lines.index("---", 1)
    data: dict[str, object] = {}
    index = 1
    while index < end:
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if value == "|":
            index += 1
            block: list[str] = []
            while index < end and (not lines[index] or lines[index].startswith("  ")):
                block.append(lines[index][2:] if lines[index].startswith("  ") else "")
                index += 1
            data[key] = "\n".join(block).rstrip()
            continue
        if value:
            data[key] = value
            index += 1
            continue
        index += 1
        items: list[str] = []
        while index < end and lines[index].startswith("  - "):
            items.append(lines[index][4:])
            index += 1
        data[key] = items
    return data, "\n".join(lines[end + 1 :]).strip()


class SnowHookTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="omp snow hooks 空格-")
        self.root = Path(self.temp.name) / "repo 空格"
        self.root.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        self.subdir = self.root / "nested dir" / "子目录"
        self.subdir.mkdir(parents=True)
        runtime_dir = self.root / ".omp-flow" / "scripts"
        runtime_dir.mkdir(parents=True)
        (runtime_dir / "omp_flow.py").write_text(
            """import json, os, pathlib, sys
record = pathlib.Path(__file__).parents[1] / 'snow-session-record.json'
record.write_text(json.dumps({
    'argv': sys.argv[1:],
    'snow': os.environ.get('SNOW_SESSION_ID'),
    'override': os.environ.get('OMP_FLOW_CONTEXT_ID'),
    'codexThread': os.environ.get('CODEX_THREAD_ID'),
    'codexSession': os.environ.get('CODEX_SESSION_ID'),
    'omp': os.environ.get('OMP_SESSION_ID'),
    'pi': os.environ.get('PI_SESSION_ID'),
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

    def session_payload(self) -> dict[str, object]:
        return {**FIXTURES["session"], "cwd": str(self.subdir)}

    def guard_payload(self, tool: dict[str, object], cwd: Path | None = None) -> dict[str, object]:
        return {**tool, "cwd": str(cwd or self.root), "sessionId": "snow-session-alpha"}

    def test_role_cards_use_snow_frontmatter_and_fail_closed_dispatch(self) -> None:
        expectations = {
            "omp-flow-research.md": ("researcher", "omp-flow-research/SKILL.md"),
            "omp-flow-architect.md": ("architect", "omp-flow-design/SKILL.md"),
            "omp-flow-qbd.md": ("qbd-auditor", "omp-flow-qbd/SKILL.md"),
            "omp-flow-implement.md": ("executor", "omp-flow-implement/SKILL.md"),
            "omp-flow-check.md": ("reviewer", "omp-flow-check/SKILL.md"),
        }
        self.assertEqual(
            {path.name for path in (SNOW_ROOT / "agents").glob("*.md")}, set(expectations)
        )
        for filename, (role_name, skill) in expectations.items():
            with self.subTest(filename=filename):
                frontmatter, body = parse_simple_frontmatter(SNOW_ROOT / "agents" / filename)
                self.assertEqual(set(frontmatter), {"id", "name", "description", "role", "tools"})
                self.assertEqual(frontmatter["id"], filename.removesuffix(".md"))
                self.assertIsInstance(frontmatter["tools"], list)
                role = str(frontmatter["role"])
                self.assertIn(skill, role)
                self.assertIn("first non-blank assignment line", role)
                self.assertIn('{"ompFlowDispatch":{...}}', role)
                self.assertIn(f"role `{role_name}`", role)
                self.assertIn("cannot expose or reserve the unique native execution ID", role)
                self.assertIn("dispatch through this Snow card is unavailable", role)
                self.assertIn("never create a receipt", role)
                self.assertIn("Do not represent this card ID or name as `actorId`", role)
                self.assertEqual(body, "")

    def test_event_files_have_exact_snow_shapes_matchers_and_renderable_commands(self) -> None:
        configs = (
            (SESSION_CONFIG, "onSessionStart", None, "session-start.py"),
            (
                GUARD_CONFIG,
                "beforeToolCall",
                "filesystem-create,filesystem-edit,filesystem-replaceedit",
                "protect-runtime.py",
            ),
        )
        for path, event, matcher, script in configs:
            with self.subTest(path=path.name):
                raw = path.read_text(encoding="utf-8")
                parsed = json.loads(raw)
                self.assertEqual(set(parsed), {event})
                self.assertEqual(len(parsed[event]), 1)
                rule = parsed[event][0]
                self.assertIn("replace same-event global rules", rule["description"])
                if matcher is None:
                    self.assertNotIn("matcher", rule)
                else:
                    self.assertEqual(rule["matcher"], matcher)
                self.assertEqual(len(rule["hooks"]), 1)
                action = rule["hooks"][0]
                self.assertEqual(set(action), {"type", "command", "timeout", "enabled"})
                self.assertEqual(action["type"], "command")
                self.assertTrue(action["enabled"])
                self.assertEqual(action["timeout"], 10000)
                for command_name in FIXTURES["commandVariants"]:
                    rendered = raw.replace("{{PYTHON_CMD}}", command_name)
                    rendered_config = json.loads(rendered)
                    command = rendered_config[event][0]["hooks"][0]["command"]
                    self.assertEqual(command, f"{command_name} .snow/hooks/{script}")
                    self.assertNotIn("sh -c", command)
                    self.assertNotIn("cmd /c", command.lower())

    def test_session_orientation_uses_snow_identity_and_bounded_native_output(self) -> None:
        environment = os.environ.copy()
        environment["OMP_FLOW_CONTEXT_ID"] = "wrong-override"
        environment["CODEX_THREAD_ID"] = "inherited-codex-thread"
        environment["CODEX_SESSION_ID"] = "inherited-codex-session"
        environment["OMP_SESSION_ID"] = "inherited-omp-session"
        environment["PI_SESSION_ID"] = "inherited-pi-session"
        result = self.run_hook(SESSION_HOOK, self.session_payload(), env=environment)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(result.stdout.splitlines()), 1)
        output = json.loads(result.stdout)
        self.assertEqual(set(output), {"additionalContext"})
        context = output["additionalContext"]
        self.assertIn("omp-flow-runtime-orientation:v1", context)
        self.assertIn("mechanical: ready", context)
        self.assertIn("do not infer Task, Flow", context)
        self.assertLessEqual(len(context), 1200)
        record = json.loads(
            (self.root / ".omp-flow" / "snow-session-record.json").read_text(encoding="utf-8")
        )
        self.assertEqual(record["snow"], "snow-session-alpha")
        self.assertIsNone(record["override"])
        self.assertIsNone(record["codexThread"])
        self.assertIsNone(record["codexSession"])
        self.assertIsNone(record["omp"])
        self.assertIsNone(record["pi"])
        self.assertEqual(record["argv"][-1], "status")

    def test_session_malformed_payloads_fail_soft_with_bounded_json(self) -> None:
        cases: list[object | str] = [
            "{broken",
            *FIXTURES["malformed"],
            {**self.session_payload(), "messages": None},
            {**self.session_payload(), "messageCount": -1},
            {**self.session_payload(), "isResume": "false"},
            {**self.session_payload(), "sessionId": "alpha", "session_id": "beta"},
            {**self.session_payload(), "cwd": ""},
            {**self.session_payload(), "cwd": str(Path(self.temp.name) / "missing")},
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                result = self.run_hook(SESSION_HOOK, payload)
                self.assertEqual(result.returncode, 0)
                output = json.loads(result.stdout)
                self.assertEqual(set(output), {"additionalContext"})
                self.assertIn("orientation unavailable", output["additionalContext"])
                self.assertIn("do not infer workflow state", output["additionalContext"])
                self.assertLessEqual(len(output["additionalContext"]), 300)
                self.assertNotIn("Traceback", result.stderr)

    def test_guard_allows_safe_single_and_batch_paths(self) -> None:
        for tool in FIXTURES["safeTools"]:
            with self.subTest(tool=tool):
                result = self.run_hook(GUARD_HOOK, self.guard_payload(tool))
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, "")
                self.assertEqual(result.stderr, "")

    def test_guard_denies_runtime_escape_remote_and_malformed_paths(self) -> None:
        for raw_path in FIXTURES["unsafePaths"]:
            with self.subTest(path=raw_path):
                payload = self.guard_payload(
                    {"toolName": "filesystem-edit", "args": {"filePath": raw_path}}
                )
                result = self.run_hook(GUARD_HOOK, payload)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stdout, "")
                self.assertLessEqual(len(result.stderr), 220)
        for payload in ("{broken", *FIXTURES["malformed"]):
            with self.subTest(payload=payload):
                result = self.run_hook(GUARD_HOOK, payload)
                self.assertEqual(result.returncode, 1)
                self.assertIn("Cannot safely verify", result.stderr)
                self.assertNotIn("Traceback", result.stderr)

    def test_guard_denies_runtime_case_variants_and_symlink_escape(self) -> None:
        result = self.run_hook(
            GUARD_HOOK,
            self.guard_payload(
                {
                    "toolName": "filesystem-create",
                    "args": {"filePath": ".OMP-FLOW/.RUNTIME/state.json"},
                }
            ),
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Runtime coordination is Python-owned", result.stderr)

        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        link = self.root / "escape-link"
        try:
            link.symlink_to(outside, target_is_directory=True)
        except OSError:
            return
        result = self.run_hook(
            GUARD_HOOK,
            self.guard_payload(
                {
                    "toolName": "filesystem-replaceedit",
                    "args": {"filePath": "escape-link/out.py"},
                }
            ),
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Cannot safely verify", result.stderr)

    def test_two_snow_sessions_are_isolated_and_explicit_context_wins(self) -> None:
        deployed = self.root / "deployed"
        shutil.copytree(SOURCE_ROOT / "templates" / ".omp-flow", deployed / ".omp-flow")
        for task_id in ("task-alpha", "task-beta", "task-explicit"):
            task = deployed / ".omp-flow" / "tasks" / task_id
            task.mkdir(parents=True)
            (task / "index.md").write_text('---\nokf_version: "0.2"\n---\n', encoding="utf-8")
        runtime = deployed / ".omp-flow" / "scripts" / "omp_flow.py"

        def run_cli(session_id: str, *args: str, explicit: str | None = None) -> dict[str, object]:
            environment = os.environ.copy()
            for name in CONTEXT_ENV_KEYS:
                environment.pop(name, None)
            environment["CODEX_THREAD_ID"] = "inherited-codex-thread"
            environment["SNOW_SESSION_ID"] = session_id
            if explicit is not None:
                environment["OMP_FLOW_CONTEXT_ID"] = explicit
            result = subprocess.run(
                [sys.executable, "-X", "utf8", str(runtime), "--cwd", str(deployed), *args],
                cwd=deployed,
                env=environment,
                text=True,
                encoding="utf-8",
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            return json.loads(result.stdout)

        first_id, second_id = FIXTURES["sessionIds"]
        first = run_cli(first_id, "task", "select", "task-alpha")
        second = run_cli(second_id, "task", "select", "task-beta")
        self.assertNotEqual(first["contextKey"], second["contextKey"])
        self.assertTrue(str(first["contextKey"]).startswith("snow-"))
        self.assertEqual(run_cli(first_id, "task", "current")["taskId"], "task-alpha")
        self.assertEqual(run_cli(second_id, "task", "current")["taskId"], "task-beta")

        explicit = run_cli(
            first_id,
            "task",
            "select",
            "task-explicit",
            explicit="explicit-snow-context",
        )
        expected = hashlib.sha256(b"explicit-snow-context").hexdigest()[:20]
        self.assertEqual(explicit["contextKey"], f"explicit-{expected}")
        self.assertEqual(run_cli(first_id, "task", "current")["taskId"], "task-alpha")
        self.assertEqual(
            run_cli(first_id, "task", "current", explicit="explicit-snow-context")["taskId"],
            "task-explicit",
        )


if __name__ == "__main__":
    unittest.main()
