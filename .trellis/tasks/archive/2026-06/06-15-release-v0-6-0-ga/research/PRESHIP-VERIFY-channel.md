# Pre-ship verification: bundled trellis-channel skill

Scope: `packages/cli/src/templates/common/bundled-skills/trellis-channel/` and the built copy under `packages/cli/dist/templates/common/bundled-skills/trellis-channel/`.

## Criterion results

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | `SKILL.md` exists with `name: trellis-channel` frontmatter | PASS | `SKILL.md:1-4` — `name: trellis-channel`, single-sentence description starting with "Use Trellis channel ..." |
| 2 | Description is a single sentence | PASS | `SKILL.md:3` — one period, no run-on. |
| 3 | Trigger phrases present | PASS | `SKILL.md:10` enumerates "和 codex/claude 讨论", "brainstorm with another agent", "spawn an implement/check worker", "let agent review", "open an issue board / changelog forum", "look at this thread", "channel is stuck / no output", "progress was truncated", "how do I write that channel command". |
| 4 | `references/` contains exactly the 5 named files | PASS | `ls` returns exactly `command-reference.md`, `forum.md`, `progress-debugging.md`, `workers.md`, `workflows.md` — no extras, no missing entries. |
| 5 | Each reference file is non-trivial (>50 lines) | PASS | Line counts: `workflows.md` 128, `forum.md` 233, `workers.md` 276, `progress-debugging.md` 226, `command-reference.md` 480. All comfortably exceed 50. |
| 6 | Each reference addresses its `SKILL.md` route-table topic | PASS | `workflows.md` covers patterns A-F (peer brainstorm, spawned implement/check, parallel reviewers, one-shot run, forum, takeover). `forum.md` covers forum vs chat, threads, context, title, thread rename, deletion discipline, changelog pattern. `workers.md` covers spawn flags, agent cards, context injection (`--file`/`--jsonl`), names/routing, soft `interrupt`, hard `kill`+`--resume`, OOM guard, inbox APIs. `progress-debugging.md` covers pretty vs `--raw`, stalled-worker triage, progress interpretation, `wait` semantics, "use subcommands, not grep" for `events.jsonl`, storage layout. `command-reference.md` covers every subcommand and flag with `tag-vs-kind` clarification and the `CHANNEL_EVENT_KINDS` whitelist. |
| 7 | No machine-specific content (hardcoded usernames, `channel-threads-*`, `release-ci-only-publishing`) | PASS | `grep` for `taosu`, `/Users/`, `channel-threads-`, `release-ci-only-publishing` returns no hits. Example channel/thread names used in docs (`brainstorm-storage-layer`, `cr-foo`, `cr-feature`, `impl-task`, `design-feedback`, `login-empty-state`, `release-notes`, `release-2026-q1`) are generic illustrations, not private board names. |
| 8 | No "drift vs global skill" framing (per CRITIQUE B2) | PASS | `grep` for "drift vs global", "global skill", "drift" returns one false-positive hit in `workflows.md:37` — the brainstorm round template lists "shared helpers, drift points, release-blocking tests" as code-drift discussion topics. This is unrelated to the removed "drift vs global skill" framing and is correctly retained. |
| 9 | No `@beta` / `@rc` strings in content | FAIL | `progress-debugging.md:197` contains `npm install -g @mindfoldhq/trellis@beta` inside the "Common Failures" table fix column. For a v0.6.0 GA ship, this should be `@mindfoldhq/trellis` (no `@beta` dist-tag). The other `@mindfoldhq/...` hit in `SKILL.md:53` is a package name (`@mindfoldhq/trellis-core`), not a dist-tag, and is fine. |
| 10 | `dist/` copy matches `src/` (build ran, ships in tarball) | PASS | `diff -r src/.../trellis-channel/ dist/.../trellis-channel/` exits 0 — byte-identical file set and contents. |

## Issues to fix before ship

1. `packages/cli/src/templates/common/bundled-skills/trellis-channel/references/progress-debugging.md:197` and its mirror under `packages/cli/dist/...`: replace `@mindfoldhq/trellis@beta` with `@mindfoldhq/trellis` (or `@mindfoldhq/trellis@latest` if a tag must be explicit). After edit, rerun the build so `dist/` re-syncs.

## Summary

The bundled `trellis-channel` skill is structurally correct: `SKILL.md` has valid frontmatter and an intent-routed reference table, all five reference files exist and substantially cover their assigned topics, the `dist/` copy is byte-identical to source, and there is no machine-specific content or "drift vs global skill" framing. The only blocker is one stale `@beta` dist-tag in the install-fix row of `progress-debugging.md:197`, which should be flipped to the stable tag before a v0.6.0 GA cut.
