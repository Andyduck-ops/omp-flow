from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest


SOURCE_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = SOURCE_ROOT / "templates" / ".omp-flow" / "scripts"
CLI = SCRIPTS / "omp_flow.py"

sys.path.insert(0, str(SCRIPTS))
from common import task_store
from common.io import WorkflowError


def concept(title: str, description: str | None = None, *, status: str | None = None, extra: str = "", body: str = "") -> str:
    lines = ["---", f"title: {json.dumps(title)}"]
    if description is not None:
        lines.append(f"description: {json.dumps(description)}")
    if status is not None:
        lines.append(f"status: {json.dumps(status)}")
    if extra:
        lines.append(extra.rstrip("\n"))
    lines.append("---")
    return "\n".join(lines) + f"\n\n# {title}\n\n{body}\n"


class WikiIndexDiagnosticsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="omp-flow-wiki-index-")
        self.outer = Path(self.temporary.name).resolve()
        self.root = self.outer / "repo"
        self.wiki = self.root / ".omp-flow" / "wiki"
        self.tasks = self.root / ".omp-flow" / "tasks"
        self.wiki.mkdir(parents=True)
        self.tasks.mkdir(parents=True)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write(self, relative: str, text: str) -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(text.encode("utf-8"))
        return path

    def cli(self, *args: str, expect: int = 0) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            [sys.executable, "-X", "utf8", str(CLI), "--cwd", str(self.root), *args],
            cwd=self.root,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        self.assertEqual(result.returncode, expect, result.stderr + result.stdout)
        return result

    def index(self, target: str = "all") -> dict:
        return json.loads(self.cli("index", target).stdout)

    def read(self, relative: str) -> str:
        return (self.root / relative).read_text(encoding="utf-8")

    def snapshot(self) -> dict[str, bytes]:
        return {
            path.relative_to(self.root).as_posix(): path.read_bytes()
            for path in sorted(self.root.rglob("*"))
            if path.is_file() and not path.is_symlink()
        }

    # Exported contract ---------------------------------------------------------------

    def test_exported_constants_and_removed_symbols(self) -> None:
        self.assertFalse(hasattr(task_store, "ROOT_COLLAPSED_DOMAINS"))
        self.assertEqual(task_store.BRIEF_FILENAME, "brief.md")
        self.assertEqual(task_store.BRIEF_CHAR_LIMIT, 2_000)
        self.assertEqual(task_store.TASK_MAP_WARN_CHARS, 9_000)
        self.assertEqual(task_store.SILENT_ACTIVE_STATUSES, frozenset({"", "stable", "accepted"}))
        self.assertEqual(task_store.ACTIVE_BADGE_STATUSES, frozenset({"draft", "proposed", "conflict"}))
        self.assertEqual(
            task_store.INACTIVE_STATUSES,
            frozenset({"deprecated", "superseded", "rejected", "archived"}),
        )
        self.assertEqual(
            task_store.KNOWN_STATUSES,
            frozenset({"stable", "accepted", "draft", "proposed", "conflict"}) | task_store.INACTIVE_STATUSES,
        )
        meta = task_store.parse_frontmatter("# Heading only\n")
        self.assertEqual(
            set(meta),
            {
                "type",
                "title",
                "frontmatter_title",
                "description",
                "raw_status",
                "superseded_by",
                "tags",
                "okf_version",
                "frontmatter_error",
            },
        )
        self.assertEqual(meta["raw_status"], "")
        self.assertEqual(meta["title"], "Heading only")
        self.assertEqual(meta["frontmatter_title"], "")
        specs_summary = dict((name, summary) for name, _, summary in task_store.WIKI_DOMAINS)["specs"]
        self.assertIn("explicit human", specs_summary)

    # Root map --------------------------------------------------------------------------

    def test_root_index_lists_domains_only_and_reports_stray_root_files(self) -> None:
        self.write(".omp-flow/wiki/knowhow/a.md", concept("Alpha Concept", "Alpha summary"))
        self.write(".omp-flow/wiki/decisions/d.md", concept("Decision D", "Why D"))
        self.write(".omp-flow/wiki/stray.md", concept("Stray", "Loose file"))
        self.write(".omp-flow/wiki/log.md", "# log\n")

        result = self.index("all")

        root = self.read(".omp-flow/wiki/index.md")
        domains = root.split("## Domains", 1)[1]
        self.assertNotIn("## General", root)
        self.assertNotIn("Alpha Concept", root)
        self.assertNotIn("a.md", root)
        self.assertNotIn("stray.md", root)
        self.assertEqual(root.count("## "), 1)
        self.assertIn(
            "- [Diagnostic & Engineering Knowhow](knowhow/index.md) `[1]` — Reusable root-cause patterns, "
            "CLI/TTY contracts, verification recipes, and operational pitfalls; read when debugging or "
            "verifying similar surfaces.",
            domains,
        )
        self.assertIn("- [Decision Records](decisions/index.md) `[1]` —", domains)
        self.assertIn(
            "Stray Wiki root file '.omp-flow/wiki/stray.md' is outside domain directories and omitted from wiki/index.md",
            result["warnings"],
        )
        self.assertIn(".omp-flow/wiki/knowhow/index.md", result["updated"])
        self.assertIn("- [Alpha Concept](a.md) — Alpha summary", self.read(".omp-flow/wiki/knowhow/index.md"))

    # brief.md --------------------------------------------------------------------------

    def test_brief_missing_produces_no_link_or_warning(self) -> None:
        self.write(".omp-flow/wiki/knowhow/a.md", concept("A", "Alpha"))
        result = self.index("wiki")
        self.assertNotIn("brief.md", self.read(".omp-flow/wiki/index.md"))
        self.assertEqual(result["warnings"], [])

    def test_brief_within_budget_is_linked_before_domains(self) -> None:
        self.write(
            ".omp-flow/wiki/brief.md",
            '---\ntitle: "Counter-default Brief"\ndescription: "Rules agents get wrong"\n---\n\n- Rule one\n',
        )
        self.write(".omp-flow/wiki/knowhow/a.md", concept("A", "Alpha"))
        result = self.index("wiki")
        root = self.read(".omp-flow/wiki/index.md")
        link = "- [Counter-default Brief](brief.md) — Rules agents get wrong"
        self.assertIn(link, root)
        self.assertLess(root.index(link), root.index("## Domains"))
        self.assertEqual(result["warnings"], [])

        self.write(".omp-flow/wiki/brief.md", "- plain brief without frontmatter\n")
        self.index("wiki")
        self.assertIn(
            "- [Wiki Brief](brief.md) — Cross-task counter-default rules and supersessions",
            self.read(".omp-flow/wiki/index.md"),
        )

    def test_brief_budget_counts_crlf_as_one_character(self) -> None:
        # 1,000 lines of "a\r\n" is 3,000 raw chars but exactly 2,000 after CRLF normalization.
        self.write(".omp-flow/wiki/brief.md", "a\r\n" * 1_000)
        self.assertEqual(self.index("wiki")["warnings"], [])

        self.write(".omp-flow/wiki/brief.md", "a\r\n" * 1_000 + "b")
        result = self.index("wiki")
        self.assertEqual(result["warnings"], [".omp-flow/wiki/brief.md is 2001 chars (budget: 2000)"])
        self.assertIn("(brief.md)", self.read(".omp-flow/wiki/index.md"))

    def test_symlinked_brief_is_not_linked_and_is_reported(self) -> None:
        target = self.write(".omp-flow/elsewhere.md", "# Elsewhere\n")
        os.symlink(target, self.wiki / "brief.md")
        result = self.index("wiki")
        self.assertNotIn("brief.md", self.read(".omp-flow/wiki/index.md"))
        self.assertEqual(result["warnings"], [".omp-flow/wiki/brief.md is unavailable (symbolic link)"])

    # Domain index frontmatter fidelity -----------------------------------------------

    def test_domain_index_multiline_metadata_is_preserved_byte_idempotently(self) -> None:
        variants = {
            "single": (
                'title: "Hand Title"\ndescription: "First sentence. Second sentence."\n',
                "Hand Title",
                "First sentence. Second sentence.",
            ),
            "literal": (
                "title: Hand Title\ndescription: |\n  Line one.\n  Line two.\n",
                "Hand Title",
                "Line one.\nLine two.",
            ),
            "folded": (
                "title: >-\n  Folded\n  Title\ndescription: >-\n  Folded one.\n  Folded two.\n",
                "Folded Title",
                "Folded one. Folded two.",
            ),
            "continued": (
                "title: Hand Title\ndescription: Continued first\n  and second line.\n",
                "Hand Title",
                "Continued first and second line.",
            ),
        }
        for name, (frontmatter, title, description) in variants.items():
            with self.subTest(variant=name):
                shutil.rmtree(self.wiki)
                self.write(".omp-flow/wiki/knowhow/a.md", concept("A", "Alpha"))
                self.write(".omp-flow/wiki/knowhow/index.md", f'---\nokf_version: "0.2"\n{frontmatter}---\n\n# old\n')

                self.index("all")
                first = self.snapshot()
                self.index("all")
                self.assertEqual(self.snapshot(), first)

                domain = self.read(".omp-flow/wiki/knowhow/index.md")
                meta = task_store.parse_frontmatter(domain)
                self.assertEqual(meta["frontmatter_title"], title)
                self.assertEqual(meta["description"], description)
                self.assertIsNone(meta["frontmatter_error"])
                self.assertIn(f"title: {json.dumps(title)}", domain)
                self.assertIn(f"# {title}", domain)
                root = self.read(".omp-flow/wiki/index.md")
                single_line = " ".join(description.split())
                self.assertIn(f"- [{title}](knowhow/index.md) `[1]` — {single_line}", root)

    def test_default_domain_metadata_is_not_written_back_as_authored(self) -> None:
        self.write(".omp-flow/wiki/specs/s.md", concept("Spec S", "A spec"))
        self.index("wiki")
        specs = self.read(".omp-flow/wiki/specs/index.md")
        self.assertTrue(specs.startswith('---\nokf_version: "0.2"\n---\n'))
        self.assertIn("explicit human", specs)
        self.assertNotIn("description:", specs)

    def test_unsafe_domain_index_frontmatter_is_refused_without_rewrite(self) -> None:
        cases = {
            "unclosed": '---\ntitle: "T"\ndescription: "D"\n\n# Body\n',
            "nested": '---\ntitle: "T"\ncustom:\n  nested: 1\n---\n',
            "anchor": "---\ntitle: &anchor T\ndescription: D\n---\n",
            "unterminated": '---\ntitle: "T\n---\n',
        }
        for name, text in cases.items():
            with self.subTest(case=name):
                shutil.rmtree(self.wiki)
                self.write(".omp-flow/wiki/knowhow/a.md", concept("A", "Alpha"))
                self.write(".omp-flow/wiki/architecture/b.md", concept("B", "Beta"))
                path = self.write(".omp-flow/wiki/knowhow/index.md", text)
                before = path.read_bytes()

                result = self.cli("index", "all", expect=2)
                self.assertIn("Cannot safely rewrite .omp-flow/wiki/knowhow/index.md", result.stderr)
                self.assertEqual(path.read_bytes(), before)
                self.assertFalse((self.wiki / "index.md").exists())
                self.assertFalse((self.wiki / "architecture" / "index.md").exists())
                with self.assertRaises(WorkflowError):
                    task_store.refresh_wiki_indexes(self.root)
                self.assertEqual(path.read_bytes(), before)

    # Concept frontmatter and status badges -------------------------------------------

    def test_concept_with_nested_provenance_blocks_still_parses(self) -> None:
        text = (
            "---\n"
            'type: "Knowhow"\n'
            'title: "Provenance Concept"\n'
            "sources:\n"
            '  - path: ".omp-flow/tasks/archive/x/index.md"\n'
            "    line: 3\n"
            "generated:\n"
            '  by: "sleep"\n'
            "verified:\n"
            "  - by: reviewer\n"
            'status: "draft"\n'
            'description: "Has provenance blocks"\n'
            "tags: [alpha, beta]\n"
            "---\n\n# Provenance Concept\n"
        )
        meta = task_store.parse_frontmatter(text)
        self.assertEqual(meta["title"], "Provenance Concept")
        self.assertEqual(meta["type"], "Knowhow")
        self.assertEqual(meta["description"], "Has provenance blocks")
        self.assertEqual(meta["raw_status"], "draft")
        self.assertEqual(meta["tags"], ["alpha", "beta"])
        self.assertEqual(meta["frontmatter_error"], "unsupported complex YAML syntax")

        self.write(".omp-flow/wiki/knowhow/p.md", text)
        result = self.index("wiki")
        self.assertEqual(result["warnings"], [])
        self.assertIn(
            "- [Provenance Concept](p.md) `[draft, alpha, beta]` — Has provenance blocks",
            self.read(".omp-flow/wiki/knowhow/index.md"),
        )

    def test_status_transitions_never_feed_old_badges_back(self) -> None:
        path = ".omp-flow/wiki/knowhow/t.md"
        index = ".omp-flow/wiki/knowhow/index.md"
        self.write(path, concept("Transit", "Moves", status="draft"))
        self.index("wiki")
        self.assertIn("- [Transit](t.md) `[draft]` — Moves", self.read(index))

        self.write(path, concept("Transit", "Moves", status="stable"))
        self.index("wiki")
        self.index("wiki")
        self.assertIn("- [Transit](t.md) — Moves\n", self.read(index))
        self.assertNotIn("draft", self.read(index))

        self.write(path, concept("Transit", "Moves", status="accepted"))
        self.index("wiki")
        self.write(path, concept("Transit", "Moves", status="superseded", extra='superseded_by: "knowhow/new.md"'))
        self.index("wiki")
        self.index("wiki")
        text = self.read(index)
        self.assertIn("## Inactive\n\n- [Transit](t.md) `[superseded]` — Moves (→ knowhow/new.md)\n", text)
        self.assertEqual(text.count("(→"), 1)
        self.assertIn("No active Concepts promoted in this domain yet.", text)

    def test_status_badges_and_warnings(self) -> None:
        self.write(".omp-flow/wiki/knowhow/a-omitted.md", concept("Omitted", "no status"))
        self.write(".omp-flow/wiki/knowhow/b-stable.md", concept("Stable", "stable status", status="stable"))
        self.write(".omp-flow/wiki/knowhow/c-accepted.md", concept("Accepted", "accepted status", status="accepted"))
        self.write(".omp-flow/wiki/knowhow/d-draft.md", concept("Draft", "draft status", status="draft"))
        self.write(".omp-flow/wiki/knowhow/e-proposed.md", concept("Proposed", "proposed status", status="proposed"))
        self.write(".omp-flow/wiki/knowhow/f-conflict.md", concept("Conflict", "conflict status", status="conflict"))
        self.write(".omp-flow/wiki/knowhow/g-typo.md", concept("Typo", "typo status", status="superceded"))
        self.write(".omp-flow/wiki/knowhow/h-deprecated.md", concept("Old", "deprecated status", status="deprecated"))
        self.write(".omp-flow/wiki/archive/2026-01-moved/x.md", concept("Archived X"))
        self.write(".omp-flow/wiki/archive/2026-01-moved/y.md", concept("Archived Y", "y", status="rejected"))
        self.write(".omp-flow/wiki/archive/2026-01-moved/z.md", concept("Archived Z", "z", status="weird"))

        result = self.index("wiki")
        knowhow = self.read(".omp-flow/wiki/knowhow/index.md")
        active, inactive = knowhow.split("## Inactive", 1)
        self.assertIn("- [Omitted](a-omitted.md) — no status\n", active)
        self.assertIn("- [Stable](b-stable.md) — stable status\n", active)
        self.assertIn("- [Accepted](c-accepted.md) — accepted status\n", active)
        self.assertIn("- [Draft](d-draft.md) `[draft]` — draft status", active)
        self.assertIn("- [Proposed](e-proposed.md) `[proposed]` — proposed status", active)
        self.assertIn("- [Conflict](f-conflict.md) `[conflict]` — conflict status", active)
        self.assertIn("- [Typo](g-typo.md) `[status:superceded]` — typo status", active)
        self.assertIn("- [Old](h-deprecated.md) `[deprecated]` — deprecated status", inactive)
        self.assertNotIn("unspecified", knowhow)

        archive = self.read(".omp-flow/wiki/archive/index.md")
        self.assertIn("No active Concepts promoted in this domain yet.", archive)
        self.assertIn("- [Archived X](2026-01-moved/x.md) `[archived]`\n", archive)
        self.assertIn("- [Archived Y](2026-01-moved/y.md) `[rejected]` — y", archive)
        self.assertIn("- [Archived Z](2026-01-moved/z.md) `[status:weird]` — z", archive)
        self.assertIn("- [Diagnostic & Engineering Knowhow](knowhow/index.md) `[7]`", self.read(".omp-flow/wiki/index.md"))

        self.assertEqual(
            result["warnings"],
            [
                "Unknown frontmatter status 'superceded' in .omp-flow/wiki/knowhow/g-typo.md",
                "Unknown frontmatter status 'weird' in .omp-flow/wiki/archive/2026-01-moved/z.md",
            ],
        )

    # Links and diagnostics ------------------------------------------------------------

    def test_extract_relative_markdown_links_skips_code_and_schemes(self) -> None:
        text = (
            "---\n"
            "note: [x](frontmatter.md)\n"
            "---\n"
            "[real](real.md) ![img](image.png) [anchor](#top)\n"
            "```\n"
            "[fenced](fenced.md)\n"
            "```\n"
            "~~~~\n"
            "[tilde](tilde.md)\n"
            "~~~\n"
            "still fenced [x](tilde2.md)\n"
            "~~~~\n"
            "`[fake](inline.md)` [`bench/README.md`](label-code.md)\n"
            '[web](https://example.com/x.md) [mail](mailto:a@b.c) [skill](skill:omp-flow) [xd](xd:thing) [t](titled.md "Title")\n'
            "[root](/rooted.md) [drive](C:/drive.md) [angle](<spaced name.md>) [frag](doc.md#part)\n"
        )
        self.assertEqual(
            task_store.extract_relative_markdown_links(text),
            [
                (4, "real.md"),
                (13, "label-code.md"),
                (14, "titled.md"),
                (15, "/rooted.md"),
                (15, "C:/drive.md"),
                (15, "spaced name.md"),
                (15, "doc.md#part"),
            ],
        )

    def test_dangling_link_detection(self) -> None:
        (self.outer / "outside.md").write_text("outside\n", encoding="utf-8")
        self.write(".omp-flow/wiki/knowhow/target.md", concept("Target", "exists", body="## Part"))
        body = "\n".join(
            [
                "[ok](target.md#part)",
                "```",
                "[fence](missing-fence.md)",
                "```",
                "~~~",
                "[tilde](missing-tilde.md)",
                "~~~",
                "`[x](missing-inline.md)`",
                "[`bench/README.md`](missing-label.md)",
                "[outside](../../../../outside.md)",
                "[web](https://example.com/missing.md)",
                "[up](../../tasks/index.md)",
                "[rooted](/missing-root.md)",
            ]
        )
        source = self.write(".omp-flow/wiki/knowhow/links.md", concept("Links", "link checks", body=body))
        self.write(".omp-flow/tasks/index.md", "# Task Map\n")
        line_of = {
            line: number
            for number, line in enumerate(source.read_text(encoding="utf-8").split("\n"), start=1)
        }
        warnings = task_store.inspect_wiki_diagnostics(self.root)
        rel = ".omp-flow/wiki/knowhow/links.md"
        self.assertEqual(
            warnings,
            [
                f"{rel}:{line_of['[`bench/README.md`](missing-label.md)']}: dangling relative link 'missing-label.md'",
                f"{rel}:{line_of['[outside](../../../../outside.md)']}: dangling relative link '../../../../outside.md'",
                f"{rel}:{line_of['[rooted](/missing-root.md)']}: dangling relative link '/missing-root.md'",
            ],
        )

    def test_dangling_symlink_and_brief_links_are_reported(self) -> None:
        os.symlink(self.root / "nowhere.md", self.wiki / "knowhow-link-target.md")
        (self.wiki / "knowhow").mkdir()
        outside = self.outer / "outside-real.md"
        outside.write_text("exists outside the repository\n", encoding="utf-8")
        os.symlink(outside, self.wiki / "knowhow" / "escape.md")
        inside = self.write(".omp-flow/inside.md", "inside\n")
        os.symlink(inside, self.wiki / "knowhow" / "inside-link.md")
        self.write(".omp-flow/wiki/brief.md", "- See [missing](knowhow/gone.md)\n")
        self.write(
            ".omp-flow/wiki/knowhow/a.md",
            concept(
                "A",
                "Alpha",
                body="[dangling](../knowhow-link-target.md)\n[escape](escape.md)\n[inside](inside-link.md)",
            ),
        )
        warnings = task_store.inspect_wiki_diagnostics(self.root)
        self.assertIn(".omp-flow/wiki/brief.md:1: dangling relative link 'knowhow/gone.md'", warnings)
        self.assertTrue(any("a.md:" in item and "../knowhow-link-target.md" in item for item in warnings))
        self.assertTrue(any("a.md:" in item and "'escape.md'" in item for item in warnings))
        self.assertFalse(any("'inside-link.md'" in item for item in warnings))
        # A brief warning group precedes link warnings; brief-local links come first among links.
        self.assertTrue(warnings[0].startswith(".omp-flow/wiki/brief.md:1:"))

    def test_description_and_custom_domain_warnings(self) -> None:
        self.write(".omp-flow/wiki/knowhow/missing.md", concept("Missing Desc"))
        self.write(".omp-flow/wiki/knowhow/repeat.md", concept("Same Words", "same words."))
        self.write(".omp-flow/wiki/playbooks/p.md", concept("Play", "a play"))
        self.write(".omp-flow/wiki/archive/r/old.md", concept("No Desc In Archive"))
        result = self.index("wiki")
        self.assertEqual(
            result["warnings"],
            [
                "Missing frontmatter 'description' in .omp-flow/wiki/knowhow/missing.md",
                "Frontmatter 'description' repeats title in .omp-flow/wiki/knowhow/repeat.md",
                "Custom Wiki domain 'playbooks' is missing frontmatter 'description' in .omp-flow/wiki/playbooks/index.md",
            ],
        )
        self.assertIn("- [Playbooks](playbooks/index.md) `[1]`", self.read(".omp-flow/wiki/index.md"))

        self.write(
            ".omp-flow/wiki/playbooks/index.md",
            '---\ndescription: "Runbooks for recurring operations"\n---\n',
        )
        self.write(".omp-flow/wiki/knowhow/missing.md", concept("Missing Desc", "now described"))
        self.write(".omp-flow/wiki/knowhow/repeat.md", concept("Same Words", "different words"))
        result = self.index("wiki")
        self.assertEqual(result["warnings"], [])
        self.assertIn(
            "- [Playbooks](playbooks/index.md) `[1]` — Runbooks for recurring operations",
            self.read(".omp-flow/wiki/index.md"),
        )

    def test_diagnostics_are_read_only_and_fast(self) -> None:
        self.write(".omp-flow/wiki/brief.md", "- [k](knowhow/c00.md)\n")
        for domain in ("knowhow", "architecture", "philosophy"):
            for number in range(12):
                body = "\n".join(
                    [f"Paragraph {i} with `code` and [link](c{(number + 1) % 12:02d}.md)." for i in range(20)]
                    + ["```", "[fake](nope.md)", "```"]
                )
                self.write(
                    f".omp-flow/wiki/{domain}/c{number:02d}.md",
                    concept(f"{domain} {number}", f"summary {number}", status="stable", body=body),
                )
        before = self.snapshot()
        timings = []
        for _ in range(3):
            started = time.perf_counter()
            warnings = task_store.inspect_wiki_diagnostics(self.root)
            timings.append(time.perf_counter() - started)
        self.assertEqual(warnings, [])
        self.assertEqual(self.snapshot(), before)
        self.assertFalse((self.wiki / "index.md").exists())
        self.assertLess(min(timings), 0.050, f"36-Concept diagnostics took {min(timings) * 1000:.2f}ms")

    # Task maps -------------------------------------------------------------------------

    def make_task(self, task_id: str, title: str, description: str, *, extra: str = "") -> Path:
        bundle = self.tasks / task_id
        self.write(f".omp-flow/tasks/{task_id}/index.md", '---\nokf_version: "0.2"\n---\n\n# x\n')
        self.write(
            f".omp-flow/tasks/{task_id}/task.md",
            f'---\ntype: "Task"\ntitle: {json.dumps(title)}\ndescription: {json.dumps(description)}\n{extra}---\n\n# {title}\n',
        )
        return bundle

    def test_task_map_uses_description_without_title_prefix(self) -> None:
        self.make_task("11-01-alpha", "Alpha Title", "Alpha description only")
        self.make_task("11-02-beta", "Beta Title", "Beta Title")
        task_store.refresh_tasks_index(self.root)
        task_store.refresh_tasks_index(self.root)
        text = self.read(".omp-flow/tasks/index.md")
        self.assertIn("- [11-01-alpha](11-01-alpha/index.md) — Alpha description only\n", text)
        self.assertIn("- [11-02-beta](11-02-beta/index.md) — Beta Title\n", text)
        self.assertNotIn("Alpha Title", text)

    def test_task_map_size_warning(self) -> None:
        self.make_task("11-01-small", "Small", "short")
        self.assertEqual(task_store.refresh_indexes(self.root, "tasks")["warnings"], [])
        for number in range(40):
            self.make_task(f"10-{number:02d}-bulk", f"Bulk {number}", "x" * 250)
        for target in ("all", "tasks", "11-01-small"):
            with self.subTest(target=target):
                result = task_store.refresh_indexes(self.root, target)
                self.assertEqual(set(result), {"target", "updated", "warnings"})
                size = len(self.read(".omp-flow/tasks/index.md"))
                self.assertGreater(size, 9_000)
                self.assertEqual(
                    result["warnings"][-1],
                    f".omp-flow/tasks/index.md is {size} chars (threshold: 9000); "
                    "archive completed tasks to keep startup orientation compact",
                )
        self.assertEqual(task_store.refresh_indexes(self.root, "wiki")["warnings"], [])

    def test_task_bundle_statuses_and_old_badges(self) -> None:
        bundle = self.make_task("11-03-gamma", "Gamma", "gamma work")
        self.write(".omp-flow/tasks/11-03-gamma/work/plain.md", concept("Plain Work", "no status"))
        self.write(".omp-flow/tasks/11-03-gamma/work/done.md", concept("Done Work", "finished", status="DONE"))
        self.write(
            ".omp-flow/tasks/11-03-gamma/work/old.md",
            concept("Old Work", "retired", status="superseded", extra='superseded_by: "work/plain.md"'),
        )
        self.write(".omp-flow/tasks/11-03-gamma/work/bare.md", "# Bare Work\n")
        (bundle / "index.md").write_text(
            "- [Bare Work](work/bare.md) `[draft, type:Foo, status:odd, kept]` — bare desc (→ elsewhere.md)\n",
            encoding="utf-8",
        )
        task_store.refresh_task_bundle_index(self.root, "11-03-gamma")
        task_store.refresh_task_bundle_index(self.root, "11-03-gamma")
        text = self.read(".omp-flow/tasks/11-03-gamma/index.md")
        self.assertIn("- [Plain Work](work/plain.md) — no status\n", text)
        self.assertIn("- [Done Work](work/done.md) `[status:done]` — finished\n", text)
        self.assertIn("- [Bare Work](work/bare.md) `[kept]` — bare desc\n", text)
        self.assertIn("## Inactive\n\n- [Old Work](work/old.md) `[superseded]` — retired (→ work/plain.md)\n", text)
        self.assertNotIn("[]", text)
        self.assertEqual(text.count("(→"), 1)


if __name__ == "__main__":
    unittest.main()
