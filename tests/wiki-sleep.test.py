from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import tempfile
import unittest
from unittest import mock


SOURCE_ROOT = Path(__file__).resolve().parents[1]
CLI = SOURCE_ROOT / "templates" / ".omp-flow" / "scripts" / "omp_flow.py"
SLEEP_SKILL = SOURCE_ROOT / "templates" / "common" / "skills" / "omp-flow-sleep"

sys.path.insert(0, str(SOURCE_ROOT / "templates" / ".omp-flow" / "scripts"))
from common import sleep_store
from common.io import WorkflowError


class WikiSleepTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="omp-flow-wiki-sleep-")
        self.root = Path(self.temporary.name)
        shutil.copytree(SOURCE_ROOT / "templates" / ".omp-flow", self.root / ".omp-flow")
        shutil.copytree(SLEEP_SKILL, self.root / ".agents" / "skills" / "omp-flow-sleep")
        self.git("init", "-q")
        self.git("config", "user.name", "OMP Flow Test")
        self.git("config", "user.email", "omp-flow-test@example.invalid")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def git(self, *args: str) -> str:
        return subprocess.run(
            ["git", *args],
            cwd=self.root,
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=True,
        ).stdout.strip()

    def invoke(self, *args: str) -> dict[str, object] | list[object]:
        result = subprocess.run(
            [sys.executable, "-X", "utf8", str(CLI), "--cwd", str(self.root), *args],
            cwd=self.root,
            text=True,
            encoding="utf-8",
            capture_output=True,
            env={**os.environ, "OMP_FLOW_CONTEXT_ID": "wiki-sleep-test"},
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def capture(self, *args: str) -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(
            [sys.executable, "-X", "utf8", str(CLI), "--cwd", str(self.root), *args],
            cwd=self.root,
            capture_output=True,
            env={**os.environ, "OMP_FLOW_CONTEXT_ID": "wiki-sleep-test"},
            check=False,
        )

    def deny(self, expected: str, *args: str) -> None:
        result = subprocess.run(
            [sys.executable, "-X", "utf8", str(CLI), "--cwd", str(self.root), *args],
            cwd=self.root,
            text=True,
            encoding="utf-8",
            capture_output=True,
            env={**os.environ, "OMP_FLOW_CONTEXT_ID": "wiki-sleep-test"},
            check=False,
        )
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(expected, result.stderr)

    def write_markdown(self, relative: str, title: str) -> None:
        destination = self.root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            f'---\ntype: "Test"\ntitle: "{title}"\n---\n\n# {title}\n',
            encoding="utf-8",
        )

    def test_archive_to_sleep_is_reproducible_confined_and_reviewable(self) -> None:
        created = self.invoke("task", "create", "Sleep source", "--slug", "sleep-source")
        task_id = str(created["taskId"])
        self.git("add", "-A")
        self.git("commit", "-qm", "test: checkpoint Sleep source")

        archived = self.invoke("task", "archive")
        source = archived["sleepSource"]
        self.assertTrue(source["ready"])
        self.assertEqual(source["archivedPath"], archived["archivedTo"])
        self.assertEqual(len(source["sourceCommit"]), 40)
        self.assertEqual(len(source["sourceTree"]), 40)

        actor_id = "sleep-native-測試"
        run_root = self.root / ".omp-flow" / ".runtime" / "sleep" / "runs"
        with mock.patch.object(
            sleep_store,
            "_sleep_assignment",
            side_effect=RuntimeError("renderer failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "renderer failed"):
                sleep_store.start_sleep_run(self.root, str(source["receipt"]), actor_id)
        self.assertEqual(list(run_root.glob("*.json")), [])

        original_assignment = sleep_store._sleep_assignment
        with mock.patch.object(
            sleep_store,
            "atomic_write_json",
            side_effect=OSError("writer failed"),
        ):
            with self.assertRaisesRegex(OSError, "writer failed"):
                sleep_store.start_sleep_run(self.root, str(source["receipt"]), actor_id)
        self.assertEqual(list(run_root.glob("*.json")), [])

        writer_entered = threading.Event()
        release_writer = threading.Event()
        writer_claim = threading.Lock()
        rendered_values: list[str] = []
        written_values: list[dict[str, object]] = []
        original_write = sleep_store.atomic_write_json

        def counted_assignment(value: dict[str, object]) -> str:
            self.assertNotIn("assignment", value)
            assignment = original_assignment(value)
            rendered_values.append(assignment)
            return assignment

        def delayed_first_write(path: Path, value: object) -> None:
            self.assertIsInstance(value, dict)
            written = dict(value)
            self.assertEqual(written["state"], "active")
            self.assertIsInstance(written.get("assignment"), str)
            written_values.append(written)
            with writer_claim:
                first_writer = not writer_entered.is_set()
                if first_writer:
                    writer_entered.set()
            if first_writer:
                self.assertTrue(release_writer.wait(5), "concurrent start did not reach the lock")
            original_write(path, value)

        def attempt_start(attempt_actor_id: str) -> tuple[str, object]:
            try:
                return (
                    "ok",
                    sleep_store.start_sleep_run(
                        self.root,
                        str(source["receipt"]),
                        attempt_actor_id,
                    ),
                )
            except WorkflowError as exc:
                return ("error", str(exc))

        with (
            mock.patch.object(sleep_store, "_sleep_assignment", counted_assignment),
            mock.patch.object(sleep_store, "atomic_write_json", delayed_first_write),
        ):
            with ThreadPoolExecutor(max_workers=2) as executor:
                first = executor.submit(attempt_start, actor_id)
                self.assertTrue(writer_entered.wait(5), "first start did not reach its atomic write")
                second = executor.submit(attempt_start, "concurrent-sleep-actor")
                try:
                    second_result = second.result(timeout=5)
                finally:
                    release_writer.set()
                first_result = first.result(timeout=5)

        self.assertEqual(first_result[0], "ok")
        self.assertEqual(second_result[0], "error")
        self.assertIn("Sleep run is busy", str(second_result[1]))
        self.assertEqual(len(rendered_values), 1)
        self.assertEqual(len(written_values), 1)
        started = first_result[1]
        run = started["run"]
        assignment = str(started["assignment"])
        self.assertEqual(run, written_values[0])
        self.assertEqual(run["assignment"], assignment)
        self.assertEqual(rendered_values[0], assignment)
        self.assertTrue(assignment.endswith("\n"))
        self.assertIn("測試", assignment)
        first_line = next(line for line in assignment.splitlines() if line.strip())
        descriptor = json.loads(first_line)["ompFlowSleep"]
        self.assertEqual(descriptor["receipt"], run["receipt"])
        self.assertEqual(descriptor["sourceReceipt"], source["receipt"])
        self.assertEqual(descriptor["sourceTree"], source["sourceTree"])
        self.assertEqual(descriptor["sourceTask"], archived["archivedTo"])
        self.assertEqual(descriptor["actorId"], actor_id)
        self.assertEqual(
            run["harvesterRevision"],
            hashlib.sha256(
                (self.root / ".agents" / "skills" / "omp-flow-sleep" / "SKILL.md").read_bytes()
            ).hexdigest(),
        )
        self.assertTrue((self.root / str(run["candidateRoot"])).is_dir())

        run_path = run_root / f'{run["receipt"]}.json'
        persisted = json.loads(run_path.read_bytes())
        before_reads = run_path.read_bytes()
        self.assertEqual(persisted, run)
        captured_show = self.capture("sleep", "show", str(run["receipt"]))
        self.assertEqual(captured_show.returncode, 0, captured_show.stderr.decode("utf-8"))
        self.assertTrue(captured_show.stdout.endswith(b"\n"))
        shown = json.loads(captured_show.stdout)
        self.assertEqual(shown["assignment"].encode("utf-8"), assignment.encode("utf-8"))
        matching_list = next(
            value
            for value in self.invoke("sleep", "list")
            if value["receipt"] == run["receipt"]
        )
        self.assertEqual(matching_list["assignment"], assignment)

        installed_store = self.root / ".omp-flow" / "scripts" / "common" / "sleep_store.py"
        installed_source = installed_store.read_text(encoding="utf-8")
        changed_source = installed_source.replace(
            "def _sleep_assignment(",
            "def _sleep_assignment_changed_after_start(",
            1,
        )
        self.assertNotEqual(changed_source, installed_source)
        installed_store.write_text(changed_source, encoding="utf-8")
        try:
            self.assertEqual(
                self.invoke("sleep", "show", str(run["receipt"]))["assignment"],
                assignment,
            )
            self.assertEqual(
                next(
                    value
                    for value in self.invoke("sleep", "list")
                    if value["receipt"] == run["receipt"]
                )["assignment"],
                assignment,
            )
        finally:
            installed_store.write_text(installed_source, encoding="utf-8")
        self.assertEqual(run_path.read_bytes(), before_reads)

        for duplicate_actor in (actor_id, "second-actor"):
            self.deny(
                "Sleep run already exists",
                "sleep",
                "start",
                "--source",
                str(source["receipt"]),
                "--actor-id",
                duplicate_actor,
            )
        runtime_root = self.root / ".omp-flow" / ".runtime"
        runtime_before = sorted(
            path.relative_to(runtime_root).as_posix() for path in runtime_root.rglob("*")
        )
        self.deny(
            "Invalid Sleep receipt",
            "sleep",
            "finish",
            "x/../../traversal-target",
            "--state",
            "completed",
            "--actor-id",
            actor_id,
        )
        runtime_after = sorted(
            path.relative_to(runtime_root).as_posix() for path in runtime_root.rglob("*")
        )
        self.assertEqual(
            runtime_after,
            runtime_before,
            "invalid receipt must be rejected before any lock path is created",
        )
        self.deny(
            "Sleep actor identity mismatch",
            "sleep",
            "finish",
            str(run["receipt"]),
            "--state",
            "completed",
            "--actor-id",
            "wrong-actor",
        )
        self.assertEqual(run_path.read_bytes(), before_reads)
        self.deny(
            "Sleep run receipt output is missing",
            "sleep",
            "finish",
            str(run["receipt"]),
            "--state",
            "completed",
            "--actor-id",
            actor_id,
        )
        self.assertEqual(run_path.read_bytes(), before_reads)

        self.write_markdown(str(run["runOutput"]), "Sleep run receipt")
        candidate_name = "exported-symbol-change-safety.md"
        self.write_markdown(
            f'{run["candidateRoot"]}/{candidate_name}',
            "Exported symbol change safety",
        )
        archived_task = self.root / str(archived["archivedTo"]) / "task.md"
        original = archived_task.read_bytes()
        archived_task.write_bytes(original + b"\nsource drift\n")
        self.deny(
            "Archived Sleep source has drifted",
            "sleep",
            "finish",
            str(run["receipt"]),
            "--state",
            "completed",
            "--actor-id",
            actor_id,
            "--candidate",
            candidate_name,
        )
        self.assertEqual(run_path.read_bytes(), before_reads)
        archived_task.write_bytes(original)

        completed = self.invoke(
            "sleep",
            "finish",
            str(run["receipt"]),
            "--state",
            "completed",
            "--actor-id",
            actor_id,
            "--candidate",
            candidate_name,
        )
        self.assertEqual(completed["state"], "completed")
        self.assertEqual(completed["candidates"], [f'{run["candidateRoot"]}/{candidate_name}'])
        self.assertNotIn("assignment", completed)
        completed_show = self.invoke("sleep", "show", str(run["receipt"]))
        completed_list = next(
            value
            for value in self.invoke("sleep", "list")
            if value["receipt"] == run["receipt"]
        )
        self.assertNotIn("assignment", completed_show)
        self.assertNotIn("assignment", completed_list)
        self.assertNotIn("assignment", json.loads(run_path.read_bytes()))
        for duplicate_actor in (actor_id, "second-actor"):
            self.deny(
                "Sleep run already exists",
                "sleep",
                "start",
                "--source",
                str(source["receipt"]),
                "--actor-id",
                duplicate_actor,
            )
        self.deny(
            "Sleep run is already terminal",
            "sleep",
            "finish",
            str(run["receipt"]),
            "--state",
            "completed",
            "--actor-id",
            actor_id,
        )

        uncheckpointed = self.invoke(
            "task",
            "create",
            "Uncheckpointed source",
            "--slug",
            "uncheckpointed-source",
        )
        self.assertNotEqual(uncheckpointed["taskId"], task_id)
        unavailable = self.invoke("task", "archive")
        self.assertFalse(unavailable["sleepSource"]["ready"])
        self.assertTrue(unavailable["sleepSource"]["reason"])
        self.assertTrue((self.root / str(unavailable["archivedTo"])).is_dir())

    def test_failed_terminal_and_legacy_active_records_do_not_yield_assignment(self) -> None:
        self.invoke("task", "create", "Failed Sleep source", "--slug", "failed-sleep-source")
        self.git("add", "-A")
        self.git("commit", "-qm", "test: checkpoint failed Sleep source")
        failed_archive = self.invoke("task", "archive")
        failed_source = failed_archive["sleepSource"]
        failed_actor = "failed-sleep-actor"
        started = self.invoke(
            "sleep",
            "start",
            "--source",
            str(failed_source["receipt"]),
            "--actor-id",
            failed_actor,
        )
        failed_run = started["run"]
        failed_path = (
            self.root
            / ".omp-flow"
            / ".runtime"
            / "sleep"
            / "runs"
            / f'{failed_run["receipt"]}.json'
        )
        active_bytes = failed_path.read_bytes()
        self.assertEqual(failed_run["assignment"], started["assignment"])
        for duplicate_actor in (failed_actor, "different-failed-actor"):
            self.deny(
                "Sleep run already exists",
                "sleep",
                "start",
                "--source",
                str(failed_source["receipt"]),
                "--actor-id",
                duplicate_actor,
            )
        self.deny(
            "Failed Sleep run cannot claim candidate outputs",
            "sleep",
            "finish",
            str(failed_run["receipt"]),
            "--state",
            "failed",
            "--actor-id",
            failed_actor,
            "--candidate",
            "forbidden.md",
        )
        self.assertEqual(failed_path.read_bytes(), active_bytes)

        failed = self.invoke(
            "sleep",
            "finish",
            str(failed_run["receipt"]),
            "--state",
            "failed",
            "--actor-id",
            failed_actor,
        )
        self.assertEqual(failed["state"], "failed")
        self.assertEqual(failed["candidates"], [])
        self.assertNotIn("assignment", failed)
        self.assertNotIn(
            "assignment",
            self.invoke("sleep", "show", str(failed_run["receipt"])),
        )
        listed_failed = next(
            value
            for value in self.invoke("sleep", "list")
            if value["receipt"] == failed_run["receipt"]
        )
        self.assertNotIn("assignment", listed_failed)
        self.assertNotIn("assignment", json.loads(failed_path.read_bytes()))
        for duplicate_actor in (failed_actor, "different-failed-actor"):
            self.deny(
                "Sleep run already exists",
                "sleep",
                "start",
                "--source",
                str(failed_source["receipt"]),
                "--actor-id",
                duplicate_actor,
            )

        self.invoke("task", "create", "Legacy Sleep source", "--slug", "legacy-sleep-source")
        self.git("add", "-A")
        self.git("commit", "-qm", "test: checkpoint legacy Sleep source")
        legacy_archive = self.invoke("task", "archive")
        legacy_source = legacy_archive["sleepSource"]
        legacy_actor = "legacy-sleep-actor"
        legacy_started = self.invoke(
            "sleep",
            "start",
            "--source",
            str(legacy_source["receipt"]),
            "--actor-id",
            legacy_actor,
        )
        legacy_run = legacy_started["run"]
        legacy_path = (
            self.root
            / ".omp-flow"
            / ".runtime"
            / "sleep"
            / "runs"
            / f'{legacy_run["receipt"]}.json'
        )
        legacy_run.pop("assignment")
        legacy_path.write_text(
            json.dumps(legacy_run, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        legacy_bytes = legacy_path.read_bytes()
        self.assertEqual(
            self.invoke("sleep", "show", str(legacy_run["receipt"])),
            legacy_run,
        )
        listed_legacy = next(
            value
            for value in self.invoke("sleep", "list")
            if value["receipt"] == legacy_run["receipt"]
        )
        self.assertEqual(listed_legacy, legacy_run)
        self.assertEqual(legacy_path.read_bytes(), legacy_bytes)

        terminal_legacy = self.invoke(
            "sleep",
            "finish",
            str(legacy_run["receipt"]),
            "--state",
            "failed",
            "--actor-id",
            legacy_actor,
        )
        self.assertEqual(terminal_legacy["state"], "failed")
        self.assertEqual(terminal_legacy["candidates"], [])
        self.assertNotIn("assignment", terminal_legacy)



    def test_run_lock_excludes_live_holder_and_survives_holder_kill(self) -> None:
        self.invoke("task", "create", "Lock holder source", "--slug", "lock-holder-source")
        self.git("add", "-A")
        self.git("commit", "-qm", "test: checkpoint lock holder source")
        archived = self.invoke("task", "archive")
        source_receipt = str(archived["sleepSource"]["receipt"])
        revision = sleep_store._skill_revision(self.root)
        run_receipt = hashlib.sha256(
            f"{source_receipt}\0{revision}".encode("utf-8")
        ).hexdigest()

        # A live holder excludes any other starter, across processes.
        held = sleep_store._acquire_run_lock(self.root, run_receipt)
        try:
            self.deny(
                "Sleep run is busy",
                "sleep",
                "start",
                "--source",
                source_receipt,
                "--actor-id",
                "sleep-native-test",
            )
        finally:
            sleep_store._release_run_lock(held)

        # A killed holder releases at OS level: no stale lock, no cleanup command.
        child_code = (
            "import sys, time; sys.path.insert(0, {path!r}); "
            "from pathlib import Path; "
            "from common import sleep_store; "
            "sleep_store._acquire_run_lock(Path({root!r}), {receipt!r}); "
            "print('locked', flush=True); time.sleep(60)"
        ).format(
            path=str(SOURCE_ROOT / "templates" / ".omp-flow" / "scripts"),
            root=str(self.root),
            receipt=run_receipt,
        )
        holder = subprocess.Popen(
            [sys.executable, "-X", "utf8", "-c", child_code],
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        try:
            assert holder.stdout is not None
            self.assertEqual(holder.stdout.readline().strip(), "locked")
        finally:
            holder.kill()
            holder.wait(timeout=10)
            if holder.stdout is not None:
                holder.stdout.close()

        started = self.invoke(
            "sleep",
            "start",
            "--source",
            source_receipt,
            "--actor-id",
            "sleep-native-test",
        )
        self.assertEqual(started["run"]["state"], "active")


    @unittest.skipUnless(os.name == "nt", "msvcrt byte-range locking runs only on Windows")
    def test_windows_byte_range_lock_contention(self) -> None:
        # A second handle to the same file is excluded from the locked byte
        # region even within one process; acquire must surface as busy, never
        # as a stray PermissionError, and release must restore availability.
        receipt = "a" * 64
        first = sleep_store._acquire_run_lock(self.root, receipt)
        try:
            with self.assertRaises(WorkflowError) as caught:
                sleep_store._acquire_run_lock(self.root, receipt)
            self.assertIn("Sleep run is busy", str(caught.exception))
        finally:
            sleep_store._release_run_lock(first)
        second = sleep_store._acquire_run_lock(self.root, receipt)
        sleep_store._release_run_lock(second)


if __name__ == "__main__":
    unittest.main()
