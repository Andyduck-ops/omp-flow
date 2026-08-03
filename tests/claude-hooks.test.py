from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SOURCE_ROOT = Path(__file__).resolve().parents[1]
GUARD_HOOK = SOURCE_ROOT / "templates" / "claude" / "hooks" / "protect-runtime.py"


class ClaudeHookTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="omp claude hooks 空格-")
        self.root = Path(self.temp.name) / "repo 空格"
        self.root.mkdir()

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_guard(self, raw_path: str) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment["CLAUDE_PROJECT_DIR"] = str(self.root)
        return subprocess.run(
            [sys.executable, "-X", "utf8", str(GUARD_HOOK)],
            cwd=self.root,
            env=environment,
            input=json.dumps(
                {
                    "tool_name": "Write",
                    "tool_input": {"file_path": raw_path},
                }
            ),
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=False,
        )

    def assert_denied(self, raw_path: str) -> None:
        result = self.run_guard(raw_path)
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        hook_output = output["hookSpecificOutput"]
        self.assertEqual(hook_output["permissionDecision"], "deny")
        self.assertIn("Runtime coordination is Python-owned", hook_output["permissionDecisionReason"])

    def test_guard_denies_runtime_path_case_variants(self) -> None:
        for raw_path in (
            ".omp-flow/.runtime/state.json",
            ".OMP-FLOW/.RUNTIME/state.json",
            str(self.root / ".OmP-FlOw" / ".RuNtImE" / "state.json"),
        ):
            with self.subTest(path=raw_path):
                self.assert_denied(raw_path)

    def test_guard_allows_ordinary_and_component_prefix_paths(self) -> None:
        for raw_path in (
            ".omp-flow/tasks/example/work/note.md",
            ".omp-flow/.runtime-backup/state.json",
            "src/runtime.py",
        ):
            with self.subTest(path=raw_path):
                result = self.run_guard(raw_path)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
