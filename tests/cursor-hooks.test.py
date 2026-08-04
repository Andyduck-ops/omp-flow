from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SOURCE_ROOT = Path(__file__).resolve().parents[1]
CURSOR_TEMPLATE = SOURCE_ROOT / "templates" / "cursor"
SESSION_HOOK = CURSOR_TEMPLATE / "hooks" / "session-start.py"
GUARD_HOOK = CURSOR_TEMPLATE / "hooks" / "protect-runtime.py"
HOOKS_CONFIG = CURSOR_TEMPLATE / "hooks.json"
FIXTURES = SOURCE_ROOT / "tests" / "fixtures" / "cursor"
RUNTIME_TEMPLATE = SOURCE_ROOT / "templates" / ".omp-flow" / "scripts"


def fixture_text(name: str, replacements: dict[str, str] | None = None) -> str:
    text = (FIXTURES / name).read_text(encoding="utf-8")
    for marker, value in (replacements or {}).items():
        text = text.replace(marker, value)
    return text


def fixture_json(name: str, replacements: dict[str, str] | None = None) -> dict[str, object]:
    value = json.loads(fixture_text(name, replacements))
    if not isinstance(value, dict):
        raise AssertionError(f"fixture {name} must contain one JSON object")
    return value


class CursorHookTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="omp cursor hooks 空格-")
        self.root = Path(self.temp.name) / "repo 空格"
        self.root.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        runtime_dir = self.root / ".omp-flow" / "scripts"
        runtime_dir.mkdir(parents=True)
        (runtime_dir / "omp_flow.py").write_text(
            """import json, os
print(json.dumps({
    'active': None,
    'context': os.environ.get('OMP_FLOW_CONTEXT_ID'),
    'host': os.environ.get('OMP_FLOW_HOST'),
}, ensure_ascii=False))
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
        cwd: Path | None = None,
        env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        input_text = (
            payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        )
        return subprocess.run(
            [sys.executable, "-X", "utf8", str(hook)],
            cwd=cwd or self.root,
            input=input_text,
            text=True,
            encoding="utf-8",
            capture_output=True,
            env=env,
            check=False,
        )

    def session_payload(
        self,
        name: str = "session-start-valid.json",
        *,
        root: Path | None = None,
    ) -> dict[str, object]:
        return fixture_json(
            name,
            {"{{WORKSPACE_ROOT}}": str(root or self.root).replace("\\", "\\\\")},
        )

    def test_session_start_exports_documented_identity_and_bounded_orientation(self) -> None:
        result = self.run_hook(SESSION_HOOK, self.session_payload())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(result.stdout.splitlines()), 1)
        output = json.loads(result.stdout)
        self.assertEqual(
            output["env"],
            {
                "OMP_FLOW_CONTEXT_ID": "cursor-conversation-alpha",
                "OMP_FLOW_HOST": "cursor",
            },
        )
        context = output["additional_context"]
        self.assertIn("omp-flow-runtime-orientation:v1", context)
        self.assertIn('"context": "cursor-conversation-alpha"', context)
        self.assertIn('"host": "cursor"', context)
        self.assertIn("do not infer Task, Flow", context)
        self.assertNotIn("DO-NOT-READ", result.stdout)
        self.assertLessEqual(len(context), 1200)

    def test_session_start_rejects_malformed_empty_missing_and_mismatched_identity(self) -> None:
        cases: list[object | str] = [
            fixture_text("session-start-malformed.json"),
            self.session_payload("session-start-empty.json"),
            {"hook_event_name": "sessionStart", "workspace_roots": [str(self.root)]},
            self.session_payload("session-start-mismatch.json"),
            {**self.session_payload(), "hook_event_name": "SessionStart"},
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                result = self.run_hook(SESSION_HOOK, payload)
                self.assertEqual(result.returncode, 0, result.stderr)
                output = json.loads(result.stdout)
                self.assertNotIn("env", output)
                self.assertIn("No task was selected", output["additional_context"])
                self.assertLessEqual(len(output["additional_context"]), 240)
                self.assertNotIn("Traceback", result.stderr)

    def test_session_start_keeps_explicit_context_when_orientation_is_unavailable(self) -> None:
        (self.root / ".omp-flow" / "scripts" / "omp_flow.py").write_text(
            "raise SystemExit(3)\n", encoding="utf-8"
        )
        result = self.run_hook(SESSION_HOOK, self.session_payload())
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["env"]["OMP_FLOW_CONTEXT_ID"], "cursor-conversation-alpha")
        self.assertIn("orientation unavailable", output["additional_context"])

    def test_pre_tool_use_denies_runtime_writes_for_known_native_shapes(self) -> None:
        runtime_path = self.root / ".omp-flow" / ".runtime" / "state.json"
        base = fixture_json(
            "pre-tool-use-runtime.json",
            {
                "{{WORKSPACE_ROOT}}": str(self.root).replace("\\", "\\\\"),
                "{{RUNTIME_PATH}}": str(runtime_path).replace("\\", "\\\\"),
            },
        )
        cases = (
            base,
            {**base, "tool_name": "StrReplace"},
            {
                **base,
                "tool_name": "Delete",
                "tool_input": {"path": ".omp-flow/.runtime/state.json"},
            },
        )
        for payload in cases:
            with self.subTest(tool=payload["tool_name"]):
                result = self.run_hook(GUARD_HOOK, payload)
                self.assertEqual(result.returncode, 0, result.stderr)
                output = json.loads(result.stdout)
                self.assertEqual(output["permission"], "deny")
                self.assertIn("Runtime coordination is Python-owned", output["user_message"])
                self.assertEqual(output["user_message"], output["agent_message"])

    def test_pre_tool_use_allows_safe_known_writes_and_ignores_other_tools(self) -> None:
        safe = fixture_json(
            "pre-tool-use-safe.json",
            {
                "{{WORKSPACE_ROOT}}": str(self.root).replace("\\", "\\\\"),
                "{{SAFE_PATH}}": str(self.root / "src" / "safe.py").replace("\\", "\\\\"),
            },
        )
        cases = (
            safe,
            {**safe, "tool_name": "Write", "tool_input": {"file_path": "src/safe.py"}},
            {**safe, "tool_name": "Delete", "tool_input": {"path": "src/safe.py"}},
        )
        for payload in cases:
            with self.subTest(tool=payload["tool_name"]):
                result = self.run_hook(GUARD_HOOK, payload)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout), {"permission": "allow"})

        read_payload = {**safe, "tool_name": "Read"}
        result = self.run_hook(GUARD_HOOK, read_payload)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_pre_tool_use_denies_unverifiable_known_write_paths(self) -> None:
        base = {
            "conversation_id": "cursor-conversation-alpha",
            "hook_event_name": "preToolUse",
            "workspace_roots": [str(self.root)],
            "tool_name": "Write",
        }
        cases: list[object | str] = [
            "{broken",
            base,
            {**base, "tool_input": {}},
            {**base, "tool_input": {"file_path": "../escape.txt"}},
            {
                **base,
                "tool_input": {"file_path": "safe.txt", "path": "different.txt"},
            },
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                result = self.run_hook(GUARD_HOOK, payload)
                self.assertEqual(result.returncode, 0, result.stderr)
                output = json.loads(result.stdout)
                self.assertEqual(output["permission"], "deny")
                self.assertIn("Cannot safely verify", output["agent_message"])

    def test_hooks_json_is_version_one_exact_owned_and_renders_both_python_commands(self) -> None:
        raw = HOOKS_CONFIG.read_text(encoding="utf-8")
        rendering = fixture_json("command-rendering.json")
        for platform, python_command in (
            ("posix", rendering["posix_python"]),
            ("windows", rendering["windows_python"]),
        ):
            with self.subTest(platform=platform):
                rendered = json.loads(raw.replace("{{PYTHON_CMD}}", str(python_command)))
                self.assertEqual(set(rendered), {"version", "hooks"})
                self.assertEqual(rendered["version"], 1)
                self.assertEqual(set(rendered["hooks"]), {"sessionStart", "preToolUse"})
                self.assertEqual(
                    rendered["hooks"]["sessionStart"][0]["command"],
                    f"{python_command} -X utf8 {rendering['session_script']}",
                )
                guard = rendered["hooks"]["preToolUse"][0]
                self.assertEqual(
                    guard["command"],
                    f"{python_command} -X utf8 {rendering['guard_script']}",
                )
                self.assertEqual(guard["matcher"], "Write|StrReplace|Delete")
                self.assertTrue(guard["failClosed"])
                self.assertNotIn("subagentStart", rendered["hooks"])

    def test_rendered_native_command_launches_from_project_root(self) -> None:
        deployed = self.root / ".cursor" / "hooks"
        deployed.mkdir(parents=True)
        shutil.copy2(SESSION_HOOK, deployed / "session-start.py")
        shutil.copy2(GUARD_HOOK, deployed / "protect-runtime.py")
        python_command = "python" if os.name == "nt" else "python3"
        config = json.loads(
            HOOKS_CONFIG.read_text(encoding="utf-8").replace("{{PYTHON_CMD}}", python_command)
        )
        command = config["hooks"]["sessionStart"][0]["command"]
        result = subprocess.run(
            command,
            cwd=self.root,
            input=json.dumps(self.session_payload(), ensure_ascii=False),
            text=True,
            encoding="utf-8",
            capture_output=True,
            shell=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads(result.stdout)["env"]["OMP_FLOW_CONTEXT_ID"],
            "cursor-conversation-alpha",
        )

    def test_subagent_start_fixture_uses_pre_spawn_fields_without_claiming_caller_binding(self) -> None:
        fixture = fixture_json("subagent-start.json")
        assignment = fixture["task"]
        self.assertIsInstance(assignment, str)
        descriptor = json.loads(assignment.splitlines()[0])["ompFlowDispatch"]
        self.assertEqual(fixture["hook_event_name"], "subagentStart")
        self.assertEqual(fixture["subagent_model"], "inherit")
        self.assertFalse(fixture["is_parallel_worker"])
        self.assertNotEqual(fixture["subagent_id"], descriptor["actorId"])
        self.assertNotIn("actorId", fixture)
        self.assertNotIn("model", fixture)
        self.assertNotIn("is_background", fixture)
        config = json.loads(HOOKS_CONFIG.read_text(encoding="utf-8"))
        self.assertNotIn("subagentStart", config["hooks"])

    def test_agent_cards_use_cursor_contract_and_link_role_skills(self) -> None:
        cards = {
            "omp-flow-research.md": "omp-flow-research/SKILL.md",
            "omp-flow-architect.md": "omp-flow-design/SKILL.md",
            "omp-flow-qbd.md": "omp-flow-qbd/SKILL.md",
            "omp-flow-implement.md": "omp-flow-implement/SKILL.md",
            "omp-flow-check.md": "omp-flow-check/SKILL.md",
        }
        for filename, skill in cards.items():
            with self.subTest(card=filename):
                text = (CURSOR_TEMPLATE / "agents" / filename).read_text(encoding="utf-8")
                _, frontmatter, body = text.split("---", 2)
                fields = {
                    key.strip(): value.strip()
                    for line in frontmatter.splitlines()
                    if ":" in line
                    for key, value in [line.split(":", 1)]
                }
                self.assertEqual(set(fields), {"name", "description", "model", "readonly"})
                self.assertEqual(fields["model"], "inherit")
                # Every role writes its assigned Concept/handoff, so none is Cursor-readonly.
                self.assertEqual(fields["readonly"], "false")
                self.assertIn('strict-v1\n`{"ompFlowDispatch":{...}}`', body)
                self.assertIn("`bundle`", body)
                self.assertIn("`output`", body)
                self.assertIn("`actorId`", body)
                self.assertIn("`receipt`", body)
                self.assertIn(skill, body)
                self.assertIn("Do not spawn workflow subagents", body)
                self.assertIn("operation path unavailable", body)

        self.assertFalse((CURSOR_TEMPLATE / "rules").exists())
        self.assertFalse((CURSOR_TEMPLATE / "skills").exists())

    def test_two_conversation_ids_select_isolated_tasks_through_explicit_context(self) -> None:
        isolation_root = Path(self.temp.name) / "isolation repo 空格"
        isolation_root.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=isolation_root, check=True)
        flow = isolation_root / ".omp-flow"
        shutil.copytree(RUNTIME_TEMPLATE, flow / "scripts")
        isolation = fixture_json("conversation-isolation.json")["conversations"]
        self.assertIsInstance(isolation, list)
        for item in isolation:
            task_dir = flow / "tasks" / item["task"]
            task_dir.mkdir(parents=True)
            (task_dir / "index.md").write_text(
                '---\nokf_version: "0.2"\n---\n', encoding="utf-8"
            )

        runtime = flow / "scripts" / "omp_flow.py"
        session_envs: list[dict[str, str]] = []
        for item in isolation:
            payload = {
                "conversation_id": item["conversation_id"],
                "session_id": item["conversation_id"],
                "hook_event_name": "sessionStart",
                "workspace_roots": [str(isolation_root)],
            }
            output = json.loads(
                self.run_hook(SESSION_HOOK, payload, cwd=isolation_root).stdout
            )
            environment = os.environ.copy()
            environment.update(output["env"])
            session_envs.append(environment)

        def select(index: int) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                [
                    sys.executable,
                    "-X",
                    "utf8",
                    str(runtime),
                    "--cwd",
                    str(isolation_root),
                    "task",
                    "select",
                    isolation[index]["task"],
                ],
                cwd=isolation_root,
                env=session_envs[index],
                text=True,
                encoding="utf-8",
                capture_output=True,
                check=False,
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(select, range(2)))
        for result in results:
            self.assertEqual(result.returncode, 0, result.stderr)

        currents: list[dict[str, object]] = []
        for environment in session_envs:
            result = subprocess.run(
                [
                    sys.executable,
                    "-X",
                    "utf8",
                    str(runtime),
                    "--cwd",
                    str(isolation_root),
                    "task",
                    "current",
                ],
                cwd=isolation_root,
                env=environment,
                text=True,
                encoding="utf-8",
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            currents.append(json.loads(result.stdout))

        self.assertEqual(
            [current["taskId"] for current in currents],
            [item["task"] for item in isolation],
        )
        self.assertNotEqual(currents[0]["contextKey"], currents[1]["contextKey"])

        no_context = os.environ.copy()
        for key in (
            "OMP_FLOW_CONTEXT_ID",
            "CODEX_THREAD_ID",
            "CODEX_SESSION_ID",
            "OMP_SESSION_ID",
            "PI_SESSION_ID",
            "SNOW_SESSION_ID",
        ):
            no_context.pop(key, None)
        result = subprocess.run(
            [
                sys.executable,
                "-X",
                "utf8",
                str(runtime),
                "--cwd",
                str(isolation_root),
                "task",
                "current",
            ],
            cwd=isolation_root,
            env=no_context,
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIsNone(json.loads(result.stdout)["taskId"])


if __name__ == "__main__":
    unittest.main()
