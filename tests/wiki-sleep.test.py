from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import re
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
        self.root = Path(self.temporary.name).resolve()
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

    def write_concept(
        self,
        relative: str,
        title: str,
        *,
        status: str | None = None,
        body: str = "",
    ) -> Path:
        destination = self.root / ".omp-flow" / "wiki" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        status_line = "" if status is None else f'status: "{status}"\n'
        destination.write_text(
            f'---\ntitle: "{title}"\ndescription: "About {title.lower()} here"\n'
            f"{status_line}---\n\n# {title}\n\n{body}",
            encoding="utf-8",
        )
        return destination

    def symlink(self, link: Path, target: Path) -> None:
        link.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.symlink(target, link)
        except (OSError, NotImplementedError) as exc:
            self.skipTest(f"symlinks unavailable: {exc}")

    def archive_source(self, slug: str) -> tuple[str, dict[str, object]]:
        created = self.invoke("task", "create", f"Source {slug}", "--slug", slug)
        task_id = str(created["taskId"])
        self.git("add", "-A")
        self.git("commit", "-qm", f"test: checkpoint {slug}")
        archived = self.invoke("task", "archive", task_id, "--workspace", str(self.root))
        self.assertTrue(archived["sleepSource"]["ready"], archived["sleepSource"])
        return task_id, archived

    def start_run(self, archived: dict[str, object], actor_id: str) -> tuple[dict[str, object], Path]:
        source = archived["sleepSource"]
        started = self.invoke(
            "sleep", "start", "--source", str(source["receipt"]), "--actor-id", actor_id
        )
        run = started["run"]
        run_path = (
            self.root / ".omp-flow" / ".runtime" / "sleep" / "runs" / f'{run["receipt"]}.json'
        )
        return run, run_path

    def deny_finish(
        self,
        run: dict[str, object],
        run_path: Path,
        active_bytes: bytes,
        expected: str,
        *wiki: str,
        actor_id: str = "dream-actor",
    ) -> None:
        arguments = ["sleep", "finish", str(run["receipt"]), "--state", "completed", "--actor-id", actor_id]
        for value in wiki:
            arguments.extend(["--wiki", value])
        self.deny(expected, *arguments)
        self.assertEqual(run_path.read_bytes(), active_bytes, expected)

    def finish(self, run: dict[str, object], *wiki: str, actor_id: str = "dream-actor") -> dict[str, object]:
        arguments = ["sleep", "finish", str(run["receipt"]), "--state", "completed", "--actor-id", actor_id]
        for value in wiki:
            arguments.extend(["--wiki", value])
        return self.invoke(*arguments)

    def test_archive_to_sleep_is_reproducible_confined_and_reviewable(self) -> None:
        created = self.invoke("task", "create", "Sleep source", "--slug", "sleep-source")
        task_id = str(created["taskId"])
        self.git("add", "-A")
        self.git("commit", "-qm", "test: checkpoint Sleep source")

        archived = self.invoke("task", "archive", task_id, "--workspace", str(self.root))
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

        def counted_assignment(value: dict[str, object], diagnostics: list[str]) -> str:
            self.assertNotIn("assignment", value)
            assignment = original_assignment(value, diagnostics)
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
        self.assertEqual(first_line, assignment.split("\n", 1)[0])
        descriptor = json.loads(first_line)["ompFlowSleep"]
        self.assertEqual(
            set(descriptor),
            {
                "version",
                "sourceReceipt",
                "sourceTask",
                "sourceCommit",
                "sourceTree",
                "entry",
                "wikiRoot",
                "wikiIndex",
                "wikiBrief",
                "runOutput",
                "actorId",
                "receipt",
                "harvesterRevision",
            },
        )
        self.assertEqual(descriptor["version"], 2)
        self.assertEqual(descriptor["wikiRoot"], ".omp-flow/wiki")
        self.assertEqual(descriptor["wikiIndex"], ".omp-flow/wiki/index.md")
        self.assertEqual(descriptor["wikiBrief"], ".omp-flow/wiki/brief.md")
        self.assertTrue(assignment.endswith("\nWiki diagnostics: none\n"))
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
        self.assertFalse((self.root / ".omp-flow" / "sleep" / "candidates").exists())
        self.assertFalse((self.root / ".omp-flow" / "sleep" / "index.md").exists())
        self.assertTrue((self.root / ".omp-flow" / "sleep" / "runs").is_dir())

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
        candidate_name = "knowhow/exported-symbol-change-safety.md"
        self.write_concept(candidate_name, "Exported symbol change safety", status="draft")
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
            "--wiki",
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
            "--wiki",
            candidate_name,
        )
        self.assertEqual(completed["state"], "completed")
        self.assertEqual(completed["wikiOutputs"], [f".omp-flow/wiki/{candidate_name}"])
        self.assertNotIn("candidates", completed)
        knowhow_index = (self.root / ".omp-flow" / "wiki" / "knowhow" / "index.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("(exported-symbol-change-safety.md) `[draft]`", knowhow_index)
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
        unavailable = self.invoke(
            "task",
            "archive",
            str(uncheckpointed["taskId"]),
            "--workspace",
            str(self.root),
        )
        self.assertFalse(unavailable["sleepSource"]["ready"])
        self.assertTrue(unavailable["sleepSource"]["reason"])
        self.assertTrue((self.root / str(unavailable["archivedTo"])).is_dir())

    def test_failed_terminal_and_legacy_active_records_do_not_yield_assignment(self) -> None:
        failed_created = self.invoke(
            "task", "create", "Failed Sleep source", "--slug", "failed-sleep-source"
        )
        self.git("add", "-A")
        self.git("commit", "-qm", "test: checkpoint failed Sleep source")
        failed_archive = self.invoke(
            "task",
            "archive",
            str(failed_created["taskId"]),
            "--workspace",
            str(self.root),
        )
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
            "Failed Sleep run cannot claim Wiki outputs",
            "sleep",
            "finish",
            str(failed_run["receipt"]),
            "--state",
            "failed",
            "--actor-id",
            failed_actor,
            "--wiki",
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
        self.assertEqual(failed["wikiOutputs"], [])
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

        legacy_created = self.invoke(
            "task", "create", "Legacy Sleep source", "--slug", "legacy-sleep-source"
        )
        self.git("add", "-A")
        self.git("commit", "-qm", "test: checkpoint legacy Sleep source")
        legacy_archive = self.invoke(
            "task",
            "archive",
            str(legacy_created["taskId"]),
            "--workspace",
            str(self.root),
        )
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
        self.assertEqual(terminal_legacy["wikiOutputs"], [])
        self.assertNotIn("assignment", terminal_legacy)



    def test_assignment_truncates_wiki_diagnostics_and_list_is_time_ordered(self) -> None:
        for index in range(30):
            path = self.root / ".omp-flow" / "wiki" / "knowhow" / f"bare-{index:02d}.md"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(f"# Bare {index}\n", encoding="utf-8")
        _, archived = self.archive_source("diagnostic-source")
        run, run_path = self.start_run(archived, "dream-actor")
        assignment = str(run["assignment"])
        warnings = sleep_store.inspect_wiki_diagnostics(self.root)
        self.assertGreater(len(warnings), 25)
        block = assignment.split(f"Wiki diagnostics ({len(warnings)}):\n", 1)
        self.assertEqual(len(block), 2, assignment)
        listed = block[1].splitlines()
        self.assertEqual(listed[:25], [f"- {warning}" for warning in warnings[:25]])
        self.assertEqual(
            listed[25:],
            [f"- ... and {len(warnings) - 25} more (run omp_flow.py index wiki)"],
        )
        self.assertTrue(assignment.endswith("\n"))
        self.assertEqual(json.loads(run_path.read_bytes())["assignment"], assignment)

        runs_root = self.root / ".omp-flow" / ".runtime" / "sleep" / "runs"
        for receipt, created in (
            ("f" * 64, "2020-01-01T00:00:00+00:00"),
            ("0" * 64, "2020-02-01T00:00:00+00:00"),
            ("a" * 64, "2020-01-01T00:00:00+00:00"),
        ):
            (runs_root / f"{receipt}.json").write_text(
                json.dumps({"receipt": receipt, "createdAt": created, "state": "failed"}),
                encoding="utf-8",
            )
        order = [value["receipt"] for value in self.invoke("sleep", "list")]
        self.assertEqual(order, ["a" * 64, "f" * 64, "0" * 64, run["receipt"]])

    def test_finish_gates_specs_new_concepts_wiki_outputs_and_changed_brief(self) -> None:
        task_id, archived = self.archive_source("dream-source")
        archived_to = str(archived["archivedTo"])
        archived_sub = archived_to.removeprefix(".omp-flow/")
        wiki = self.root / ".omp-flow" / "wiki"
        self.write_concept("specs/verifiable-claim.md", "Verifiable claim", body="Claims cite proof.\n")
        self.write_concept("knowhow/stable.md", "Stable rule", status="stable", body="Rule one.\n")
        self.write_concept("knowhow/draft-then.md", "Draft rule", status="draft", body="Maybe.\n")
        self.write_concept("knowhow/demoted.md", "Demoted rule", status="stable", body="Rule two.\n")
        self.write_concept("archive/old.md", "Old rule", status="deprecated", body="Old.\n")
        linked = self.write_concept(
            "knowhow/linked.md",
            "Linked rule",
            status="accepted",
            body=f"See [the task](../../tasks/{task_id}/index.md).\n\n## Heading\n\nBody.\n",
        )
        self.symlink(wiki / "knowhow" / "pre-alias.md", Path("stable.md"))
        run, run_path = self.start_run(archived, "dream-actor")
        persisted = json.loads(run_path.read_bytes())
        self.assertEqual(
            sorted(persisted["preExistingTrustedWiki"]),
            ["knowhow/demoted.md", "knowhow/linked.md", "knowhow/stable.md", "specs/verifiable-claim.md"],
        )
        self.assertIn("knowhow/stable.md", persisted["preExistingTrustedWiki"])
        self.assertIn("knowhow/linked.md", persisted["preExistingTrustedWiki"])
        self.assertIn("specs/verifiable-claim.md", persisted["preExistingTrustedWiki"])
        self.assertNotIn("knowhow/draft-then.md", persisted["preExistingTrustedWiki"])
        self.assertNotIn("knowhow/pre-alias.md", persisted["preExistingTrustedWiki"])
        self.assertNotIn("archive/old.md", persisted["preExistingWikiDigests"])
        self.assertIn("knowhow/pre-alias.md", persisted["preExistingWikiPaths"])
        self.assertIsNone(persisted["preExistingBriefSha256"])
        active = run_path.read_bytes()
        deny = lambda expected, *wiki_args: self.deny_finish(run, run_path, active, expected, *wiki_args)
        run_output = self.root / str(run["runOutput"])

        # A7: an in-repository symlink is rejected even though resolve() lands inside the repo.
        self.symlink(run_output, (wiki / "knowhow" / "stable.md").resolve())
        deny("Symbolic link is not allowed")
        run_output.unlink()
        self.write_markdown(str(run["runOutput"]), "Sleep run receipt")

        # specs/ is frozen by specsDigest.
        spec = wiki / "specs" / "verifiable-claim.md"
        spec_bytes = spec.read_bytes()
        spec.write_bytes(spec_bytes + b"\nAmended.\n")
        deny("Sleep must not change .omp-flow/wiki/specs/")
        spec.write_bytes(spec_bytes)
        added_spec = self.write_concept("specs/new-spec.md", "New spec", status="draft")
        deny("Sleep must not change .omp-flow/wiki/specs/")
        added_spec.unlink()

        # --wiki outputs stay inside editable Wiki Concepts.
        deny("Wiki output escapes", "../outside.md")
        deny("not a Sleep-editable Concept", "knowhow/index.md")
        deny("not a Sleep-editable Concept", "specs/verifiable-claim.md")
        deny("not a Sleep-editable Concept", "archive/old.md")
        deny("Wiki output Markdown not found", "knowhow/missing.md")
        deny("Duplicate Wiki output", "knowhow/stable.md", "knowhow/./stable.md")
        deny("Symbolic link is not allowed", "knowhow/pre-alias.md")

        # New Concepts may not self-seal, even when not claimed through --wiki.
        for status in ("stable", None, "accepted"):
            fresh = self.write_concept("knowhow/new.md", "New rule", status=status)
            deny("must start with status")
            fresh.unlink()
        fresh_link = wiki / "knowhow" / "new-alias.md"
        self.symlink(fresh_link, Path("stable.md"))
        deny("New Wiki symbolic link is not allowed")
        fresh_link.unlink()

        # brief.md budget, confinement, and trust gate.
        brief = wiki / "brief.md"
        brief.write_text("[Stable](knowhow/stable.md)\n" + "x" * 2_000, encoding="utf-8")
        deny("characters")
        brief.unlink()
        self.symlink(brief, Path("knowhow") / "stable.md")
        deny("Symbolic link is not allowed")
        brief.unlink()
        self.write_concept("knowhow/new-draft.md", "New draft", status="draft", body="Candidate.\n")
        self.write_concept("decisions/new-adr.md", "New ADR", status="accepted", body="Decided.\n")
        for target, expected in (
            ("knowhow/missing.md", "missing Wiki Concept"),
            ("../outside.md", "escapes"),
            ("/etc/passwd", "escapes"),
            ("archive/old.md", "not an active Wiki domain Concept"),
            ("knowhow/index.md", "not an active Wiki domain Concept"),
            ("knowhow/pre-alias.md", "Symbolic link is not allowed"),
            ("knowhow/new-draft.md", "stable or accepted before"),
            ("decisions/new-adr.md", "stable or accepted before"),
        ):
            brief.write_text(f"- Rule: [target]({target})\n", encoding="utf-8")
            deny(expected)
        brief.write_text("- An unsupported claim with no link\n", encoding="utf-8")
        deny("must link every rule")
        # R1/R2: a changed brief may name a run-created draft only as a checked inline link target,
        # so every other syntax or prose mention that resolves to it is refused, even beside a
        # trusted inline link, and the error names the offending path.
        for unchecked in (
            "- Also [unverified][d]\n\n[d]: knowhow/new-draft.md\n",
            '- Also <a href="knowhow/new-draft.md">unverified</a>\n',
            '- Also <img src="knowhow/new-draft.md">\n',
            "- Also [unverified][d]\n\n[d]:\n  knowhow/new-draft.md\n",
            "- Also [unverified][d]\n\n- [d]: knowhow/new-draft.md\n",
            "- Also [unverified][d]\n\n> [d]: knowhow/new-draft.md\n",
            "- Also [unverified][a\\]b]\n\n[a\\]b]: knowhow/new-draft.md\n",
            '- Also <a href\n="knowhow/new-draft.md">unverified</a>\n',
            "- Also [unverified\n  rule](knowhow/new-draft.md)\n",
            "- Also [a [b] c](knowhow/new-draft.md)\n",
            "- Also ![x](knowhow/new-draft.md)\n",
            '- Also <a href="knowhow/new-draft&#46;md">unverified</a>\n',
            "- Also [unverified][d]\n\n[d]: knowhow/new-draft%2Emd\n",
            "- Also <knowhow/new-draft.MD>\n",
            "- Also see:knowhow/new-draft.md\n",
            "- Also e.g.:knowhow/new-draft.md\n",
            "- Also mailto knowhow/new-draft.md\n",
            '- Also <a href="knowhow/new-draft.m&#9;d">x</a>\n',
            '- Also <a href="knowhow/new-draft.m\nd">x</a>\n',
            # R3-a: the draft resolved from the repository root, from above the Wiki, from the
            # Wiki root's parent, or as an absolute path is the same untrusted Concept.
            "- Also see .omp-flow/wiki/knowhow/new-draft.md\n",
            "- Also see `.omp-flow/wiki/knowhow/new-draft.md`\n",
            "- Also [unverified][d]\n\n[d]: .omp-flow/wiki/knowhow/new-draft.md\n",
            "- Also see ../wiki/knowhow/new-draft.md\n",
            "- Also [unverified][d]\n\n[d]: ../wiki/knowhow/new-draft.md\n",
            "- Also see wiki/knowhow/new-draft.md\n",
            f"- Also see {self.root.as_posix()}/.omp-flow/wiki/knowhow/new-draft.md\n",
            f"- Also see {self.root.resolve().as_posix()}/.omp-flow/wiki/knowhow/new-draft.md\n",
            # R3-b: underscore emphasis renders the path in italics, so its trailing _ ends it.
            "- Also _knowhow/new-draft.md_\n",
        ):
            brief.write_text(f"- Prefer [stable](knowhow/stable.md)\n{unchecked}", encoding="utf-8")
            deny("(.omp-flow/wiki/knowhow/new-draft.md) outside a checked inline [text](target) link")
        spaced = self.write_concept("new knowhow/stable.md", "Spaced draft", status="draft", body="Draft.\n")
        brief.write_text(
            "- Prefer [stable](knowhow/stable.md)\n- Also [d]\n\n[d]: <new knowhow/stable.md>\n",
            encoding="utf-8",
        )
        deny("names 'new knowhow/stable.md' (.omp-flow/wiki/new knowhow/stable.md) outside")
        spaced.unlink()
        spaced.parent.rmdir()

        promoted = wiki / "knowhow" / "draft-then.md"
        promoted_bytes = promoted.read_bytes()
        promoted.write_bytes(promoted_bytes.replace(b'status: "draft"', b'status: "stable"'))
        brief.write_text("- Rule: [promoted](knowhow/draft-then.md)\n", encoding="utf-8")
        deny("stable or accepted before")
        promoted.write_bytes(promoted_bytes)

        demoted = wiki / "knowhow" / "demoted.md"
        demoted_bytes = demoted.read_bytes()
        demoted.write_bytes(demoted_bytes.replace(b'status: "stable"', b'status: "draft"'))
        brief.write_text("- Rule: [demoted](knowhow/demoted.md)\n", encoding="utf-8")
        deny("status changed")
        demoted.write_bytes(demoted_bytes)

        # A5(a): repairing the inbound link to the just-archived Task keeps the trusted digest,
        # while any other body change in the same page is rejected.
        linked_bytes = linked.read_bytes()
        repaired = linked_bytes.replace(
            f"../../tasks/{task_id}/index.md".encode("utf-8"),
            f"../../{archived_sub}/index.md".encode("utf-8"),
        )
        self.assertNotEqual(repaired, linked_bytes)
        # R1-b: an external URL query and inline code that mention href=/src= name no .md path.
        brief.write_text(
            "---\ntitle: \"Brief\"\n---\n\n"
            "- Rule: [linked](knowhow/linked.md#heading) ([src](https://example.com/?src=x))\n"
            "- Spec: [claim](specs/verifiable-claim.md); set `href=` never.\n"
            # R2-b: a filename as link text, prose about project files, and a real URL that ends
            # in a draft path name no untrusted Wiki Concept.
            "- See [stable.md](knowhow/stable.md); update AGENTS.md and README.md with it.\n"
            "- Mirror https://example.com/knowhow/new-draft.md and mailto:knowhow/new-draft.md.\n",
            encoding="utf-8",
        )
        linked.write_bytes(repaired + b"\nUnreviewed new claim.\n")
        deny("beyond archived-Task link repair")
        linked.write_bytes(repaired)

        completed = self.finish(
            run, "knowhow/linked.md", "brief.md", "knowhow/new-draft.md", "decisions/new-adr.md"
        )
        self.assertEqual(completed["state"], "completed")
        self.assertEqual(
            completed["wikiOutputs"],
            [
                ".omp-flow/wiki/knowhow/linked.md",
                ".omp-flow/wiki/brief.md",
                ".omp-flow/wiki/knowhow/new-draft.md",
                ".omp-flow/wiki/decisions/new-adr.md",
            ],
        )
        self.assertNotIn("assignment", completed)
        knowhow_index = (wiki / "knowhow" / "index.md").read_text(encoding="utf-8")
        self.assertIn("(new-draft.md) `[draft]`", knowhow_index)
        self.assertIn("[Brief](brief.md)", (wiki / "index.md").read_text(encoding="utf-8"))

    def test_unchanged_human_brief_is_fast_path_but_its_targets_are_frozen(self) -> None:
        wiki = self.root / ".omp-flow" / "wiki"
        stable = self.write_concept("knowhow/stable.md", "Stable rule", status="stable", body="Rule.\n")
        legacy = self.write_concept("knowhow/legacy.md", "Legacy rule", body="Human rule.\n")
        brief = wiki / "brief.md"
        brief.write_text(
            "- Prefer [the stable rule](knowhow/stable.md)\r\n"
            "- Keep [the legacy rule](knowhow/legacy.md#legacy-rule)\r\n",
            encoding="utf-8",
            newline="",
        )
        _, archived = self.archive_source("human-brief-source")
        run, run_path = self.start_run(archived, "dream-actor")
        self.assertIsNotNone(json.loads(run_path.read_bytes())["preExistingBriefSha256"])
        active = run_path.read_bytes()
        deny = lambda expected, *wiki_args: self.deny_finish(run, run_path, active, expected, *wiki_args)
        self.write_markdown(str(run["runOutput"]), "Sleep run receipt")

        # A5(b): brief.md untouched, but its stable target gains an unreviewed paragraph.
        stable_bytes = stable.read_bytes()
        stable.write_bytes(stable_bytes + b"\nSmuggled claim.\n")
        deny("beyond archived-Task link repair", "knowhow/stable.md")
        stable.write_bytes(stable_bytes)

        legacy_bytes = legacy.read_bytes()
        # Match either line ending: write_text emits CRLF on Windows.
        deprecated = re.sub(rb"---(\r?\n)(\r?\n)#", rb'status: "deprecated"\1---\1\2#', legacy_bytes, count=1)
        self.assertNotEqual(deprecated, legacy_bytes)
        legacy.write_bytes(deprecated)
        deny("no longer an active Concept")
        legacy.write_bytes(legacy_bytes)

        # A5(c): the untouched human brief linking a status-less Concept takes the zero-edit path.
        completed = self.finish(run)
        self.assertEqual(completed["state"], "completed")
        self.assertEqual(completed["wikiOutputs"], [])


    def test_run_lock_excludes_live_holder_and_survives_holder_kill(self) -> None:
        lock_created = self.invoke(
            "task", "create", "Lock holder source", "--slug", "lock-holder-source"
        )
        self.git("add", "-A")
        self.git("commit", "-qm", "test: checkpoint lock holder source")
        archived = self.invoke(
            "task",
            "archive",
            str(lock_created["taskId"]),
            "--workspace",
            str(self.root),
        )
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
