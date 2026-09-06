from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load_hook(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem + path.parent.parent.name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DynamicIndexInjectionTests(unittest.TestCase):
    def test_all_native_session_hooks_inject_bounded_map_bodies(self) -> None:
        with tempfile.TemporaryDirectory(prefix="omp dynamic maps ") as directory:
            root = Path(directory)
            task_index = ".omp-flow/tasks/index.md"
            task_path = root / task_index
            task_path.parent.mkdir(parents=True)
            (root / ".omp-flow" / "wiki").mkdir(parents=True)
            (root / ".omp-flow" / "wiki" / "index.md").write_text(
                "# Wiki map\n\n- [Topic](topic.md)\n", encoding="utf-8"
            )
            task_path.write_text("# Task map\n\n- [Work](work.md)\n", encoding="utf-8")
            workflow_path = root / ".omp-flow" / "workflow" / "index.md"
            workflow_path.parent.mkdir(parents=True)
            workflow_path.write_text("# Route map\n\n- [Lite](lite.md)\n", encoding="utf-8")
            for relative in (
                "templates/codex/hooks/session-start.py",
                "templates/claude/hooks/session-start.py",
                "templates/snow/hooks/session-start.py",
                "templates/cursor/hooks/session-start.py",
            ):
                module = load_hook(ROOT / relative)
                context = module._orientation(root, "session-alpha")
                self.assertIn("# Wiki map", context)
                self.assertIn("# Task map", context)
                self.assertIn("# Route map", context)
                self.assertIn("Read the Task, Wiki, and Workflow maps carefully", context)
                self.assertLess(len(context), 12000)

                # Reload the Workflow map; no cached body or semantic state is involved.
                workflow_path.write_text("# Changed route", encoding="utf-8")
                self.assertIn("# Changed route", module._orientation(root, "session-alpha"))
                workflow_path.write_text("界" * 6000, encoding="utf-8")
                self.assertIn("界" * 6000, module._orientation(root, "session-alpha"))
                workflow_path.write_text("界" * 6001, encoding="utf-8")
                self.assertIn("Workflow map content: unavailable", module._orientation(root, "session-alpha"))
                workflow_path.write_bytes(b"\xff")
                self.assertIn("Workflow map content: unavailable", module._orientation(root, "session-alpha"))
                workflow_path.unlink()
                self.assertIn("Workflow map content: unavailable", module._orientation(root, "session-alpha"))
                workflow_path.write_text("# Route map\n\n- [Lite](lite.md)\n", encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
