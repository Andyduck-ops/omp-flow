from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest


SOURCE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE_ROOT / "templates" / ".omp-flow" / "scripts"))

from common.io import WorkflowError  # noqa: E402
from common.operation_store import (  # noqa: E402
    create_operation,
    finish_operation,
    read_operation,
)


class OperationStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="omp operation store 空格-")
        self.repo = Path(self.temp.name) / "repo 空格"
        self.task_id = "08-03-contract-test"
        self.task = self.repo / ".omp-flow" / "tasks" / self.task_id
        (self.task / "work").mkdir(parents=True)
        (self.task / "work" / "entry.md").write_text("# Work\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def create(
        self,
        *,
        role: str,
        actor: str,
        output: str,
        predecessor: str | None = None,
        require_external_receipt: bool = False,
    ) -> dict[str, object]:
        return create_operation(
            self.repo,
            self.task_id,
            entry_path="work/entry.md",
            role=role,
            actor_id=actor,
            output_path=output,
            predecessor=predecessor,
            require_external_receipt=require_external_receipt,
        )

    def write_output(self, relative_path: str) -> None:
        target = self.repo / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("# Output\n", encoding="utf-8")

    def test_completed_operation_requires_declared_output(self) -> None:
        output = f".omp-flow/tasks/{self.task_id}/work/missing-handoff.md"
        operation = self.create(
            role="executor",
            actor="implementer",
            output=output,
            require_external_receipt=True,
        )

        with self.assertRaisesRegex(WorkflowError, "Operation output does not exist"):
            finish_operation(
                self.repo,
                str(operation["id"]),
                state="completed",
                actor_id="implementer",
                external_receipt="native-result",
            )

        self.assertEqual(read_operation(self.repo, str(operation["id"]))["state"], "active")
        self.assertFalse((self.repo / ".omp-flow" / ".runtime" / "receipts").exists())
        failed = finish_operation(
            self.repo,
            str(operation["id"]),
            state="failed",
            actor_id="implementer",
        )
        self.assertEqual(failed["state"], "failed")

    def test_review_requires_completed_implementation_predecessor(self) -> None:
        research_output = f".omp-flow/tasks/{self.task_id}/work/research.md"
        self.write_output(research_output)
        research = self.create(role="researcher", actor="researcher", output=research_output)
        finish_operation(
            self.repo,
            str(research["id"]),
            state="completed",
            actor_id="researcher",
        )

        with self.assertRaisesRegex(WorkflowError, "completed implementation operation"):
            self.create(
                role="reviewer",
                actor="reviewer",
                output=f".omp-flow/tasks/{self.task_id}/work/review.md",
                predecessor=str(research["id"]),
            )

    def test_review_requires_independent_actor_and_file_output(self) -> None:
        handoff = f".omp-flow/tasks/{self.task_id}/work/handoff.md"
        self.write_output(handoff)
        implementation = self.create(role="executor", actor="implementer", output=handoff)
        finish_operation(
            self.repo,
            str(implementation["id"]),
            state="completed",
            actor_id="implementer",
        )

        review_output = f".omp-flow/tasks/{self.task_id}/work/review.md"
        with self.assertRaisesRegex(WorkflowError, "actor must differ"):
            self.create(
                role="reviewer",
                actor="implementer",
                output=review_output,
                predecessor=str(implementation["id"]),
            )

        review = self.create(
            role="reviewer",
            actor="reviewer",
            output=review_output,
            predecessor=str(implementation["id"]),
        )
        (self.repo / review_output).mkdir(parents=True)
        with self.assertRaisesRegex(WorkflowError, "Review output must be a file"):
            finish_operation(
                self.repo,
                str(review["id"]),
                state="completed",
                actor_id="reviewer",
            )

        (self.repo / review_output).rmdir()
        self.write_output(review_output)
        completed = finish_operation(
            self.repo,
            str(review["id"]),
            state="completed",
            actor_id="reviewer",
        )
        self.assertEqual(completed["state"], "completed")


if __name__ == "__main__":
    unittest.main()
