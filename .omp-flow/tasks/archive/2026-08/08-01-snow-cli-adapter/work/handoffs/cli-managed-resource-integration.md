---
type: "Handoff"
title: "CLI and managed-resource integration implementation"
---

# CLI and managed-resource integration implementation

## Result

Status: **DONE**

This implements [CLI, managed-resource, update, and documentation integration](../cli-managed-resource-integration.md)
against the accepted Snow, Cursor, and Flow Status handoffs. Snow and Cursor now participate in
the existing Harness normalization, CLI selection, exact-owned managed-resource, rendering,
update, package, and documentation seams. No adapter framework, JSON merger, lifecycle store,
identity alias, dispatcher, topology field, or Markdown parser was added.

The existing generic updater passed the focused Snow/Cursor ownership cases without a defect, so
`src/cli/update.ts` was intentionally left unchanged. The pre-existing Snow/Cursor Flow Status
host changes in `src/cli/index.ts` were preserved and reconciled with the new init flags/help.

## Documentation return revision — 2026-08-01

Status: **DONE**

This documentation-only revision applies the accepted return from
[Released-Harness compatibility verification re-review](../reviews/released-harness-verification-2.md)
and the accepted cosmetic advisory in the
[CLI integration review](../reviews/cli-managed-resource-integration.md). It changes only
`README.md` and this handoff; no code, test, template, runtime/session record, Harness
configuration, or capability scope was changed.

The README now:

- identifies the adapter target as the pinned `snow-ai@0.8.24` contract;
- states that the available released `snow-ai@0.7.23` resume payload contains only `messages` and
  `messageCount`, lacks the required native session identity and `cwd`, and is therefore
  unavailable for native session orientation;
- states that `snow-ai@0.8.24` has not yet received released-runtime verification;
- retains the existing unavailable exact-dispatch, bounded-protection, project-over-global,
  Cursor lifecycle, and no-alias/no-post-hoc-receipt capability boundaries; and
- repairs the `.claude/` child prefixes in the project tree now that `.claude/` precedes Snow and
  Cursor siblings.

Focused verification for this revision:

- A PowerShell README assertion check over 11 required capability/boundary anchors — **PASS**.
- A PowerShell local Markdown-link check — **PASS**, 2 README links checked and both targets exist.
- `Select-String -Path README.md -Pattern '[ \\t]+$'` — **PASS**, no trailing whitespace.
- A focused `.claude/` connector assertion — **PASS**, all eight child lines retain the required
  continuing `│   ` prefix.
- `git diff --check -- README.md` — **PASS**, with only the repository line-ending notice.
- `git diff --check` — **PASS** across the current tracked worktree, with only repository
  line-ending notices.
- Final scoped handoff/README whitespace, status, and diff inspection — **PASS**; changes remain
  confined to the promised documentation paths for this revision.

The first `apply_patch` attempt used an absolute path and was rejected by the repository's
path-safety Hook before changing a file. The first combined final-check command had a PowerShell
variable-interpolation parse error and executed no assertions. A later compact wrapper also ended
nonzero because a backtick in its final `rg` expression was consumed by PowerShell; its checks
were split into simpler commands and passed. The same relative patch and corrected checks were
rerun successfully; none of these failed attempts changed project state.

Revision correlation:

- Actor ID: `cli_docs_rework`
- Dispatch receipt: `d2de0a27f4824c52b2a235edb505e099`
- Completed predecessor receipt: `2ac3ba84edf549ffb90c06953a1677a1`
- Predecessor output:
  [Released-Harness compatibility verification re-review](../reviews/released-harness-verification-2.md)
- Unproven done conditions: none within this documentation boundary. Released-runtime behavior
  for `snow-ai@0.8.24` remains unverified and explicitly unavailable as evidence, as documented.

## Files changed

- `src/cli/harness.ts`
- `src/cli/index.ts`
- `src/cli/init.ts`
- `tests/init-cli.test.ts`
- `tests/omp-flow.test.ts`
- `tests/snow-cursor-managed-resources.test.ts`
- `README.md`
- `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/cli-managed-resource-integration.md`

No canonical `templates/snow/**` or `templates/cursor/**` input, live `.omp-flow/scripts/**`
deployment, runtime/session record, Harness configuration, or unrelated concurrent file was
edited by this Work.

## Implemented contract

- The one persisted/interactive normalization order is `omp`, `codex`, `claude`, `snow`,
  `cursor`. Unknown config values fail validation; duplicate and caller-reordered selections
  round-trip without drift.
- `--snow` and `--cursor` are accepted by init parsing, included in help and interactive choices,
  and included in the non-interactive missing-selection error. Conflicting flags, unknown flags,
  and missing non-interactive selection all fail before project writes; the missing-selection
  fixture compares the empty target directory before and after the invocation.
- Snow and Cursor resources are ordinary exact-owned groups. The only template substitution added
  is `{{PYTHON_CMD}}` in the two Snow event JSON files and Cursor `hooks.json`; rendered content is
  parsed as JSON and retains project-relative handler paths. Existing files are never merged.
- Snow-only, Cursor-only, combined, and sequential mixed-config installs are covered. Every
  canonical native template is registered exactly once, and unselected native roots are absent.
- Update coverage proves unchanged resources remain unchanged, user deletions are preserved,
  user-modified and foreign JSON are reported as conflicts, forced conflict resolution creates a
  backup and writes the exact rendered template, and no JSON merge occurs.
- `.agents/skills` remains the only Snow/Cursor Skill tree. Neither template/package source nor a
  temporary install contains `.snow/skills`, `.cursor/skills`, or a Cursor rule.
- The normal `npm test` entry now runs the CLI test, the 68-check managed-resource integration
  test, and both accepted native Python Hook suites alongside the Flow Status suite.

## Installed and packaged native resources

Snow (9):

- `.snow/agents/omp-flow-{research,architect,qbd,implement,check}.md`
- `.snow/hooks/onSessionStart.json`
- `.snow/hooks/beforeToolCall.json`
- `.snow/hooks/session-start.py`
- `.snow/hooks/protect-runtime.py`

Cursor (8):

- `.cursor/agents/omp-flow-{research,architect,qbd,implement,check}.md`
- `.cursor/hooks.json`
- `.cursor/hooks/session-start.py`
- `.cursor/hooks/protect-runtime.py`

`npm pack --dry-run --json` reported package `omp-flow@0.2.6`, 137 total files, 184,485 packed
bytes, 851,759 unpacked bytes, and exactly these 17 native template files. It reported no Snow or
Cursor Skill tree and no Cursor rule.

## README capability boundaries passed forward

The README now states these user-visible limits:

> Snow 对同一事件只加载一个 project 文件；非空 project `onSessionStart` 或 `beforeToolCall`
> 会遮蔽同事件的 global rules，而不是与它们组合。

> Snow 0.8.24 没有证明调用方能在 `operation start` 前选择唯一 native execution ID。

> 静态 handler/fixture 不等于 released Cursor lifecycle 证明：真实顶层 shell 的 env 传播、并发
> conversation、reopen/resume、subagent inheritance，以及各 surface 对 write deny 的执行仍未验证，
> 因此这些路径当前不可用，不作为支持能力声明。

> Cursor 的 `subagentStart` 也没有证明调用方可在提交 assignment 前令 native
> `subagent_id = actorId`。

The README also says both Harnesses reuse `.agents/skills`, exact-owned event/Hook JSON is not
merged, Cursor receives no duplicate rule, Snow protection is bounded rather than universal, and
neither Harness uses an alias or post-hoc receipt rewrite to claim exact native dispatch.

## Verification

- Focused managed-resource invocation via `npx tsx -e ...runSnowCursorManagedResourceTests...` —
  **PASS**, 68 checks.
- `npm test` — **PASS**: 511 focused checks; 12 Flow Status Python tests; 8 Snow Python tests;
  11 Cursor Python tests; 3 TAP tests. The normal entry invoked init CLI, managed-resource,
  Snow/Cursor Hook, and Flow Status coverage.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks templates/snow/hooks templates/cursor/hooks`
  — **PASS**.
- `npm run build` — **PASS**, clean TypeScript build.
- `npm pack --dry-run --json` — **PASS**, resource counts and package sizes above; no tarball was
  written.
- `git diff --check` — **PASS**; only repository line-ending notices were emitted.
- `rg -n "[ \\t]+$"` over every implementation-owned code/test/README file — **PASS**, no
  trailing whitespace.

The first integrated `npm test` attempt failed only because the new parity helper counted ignored
`__pycache__`/`.pyc` verification residue as package templates. The helper was corrected to mirror
the package exclusion contract; the focused and full reruns then passed. No product fallback or
warning suppression was introduced.

## Decisions, caveats, and review focus

- The stable Harness order appends Snow and Cursor after the existing three values, preserving
  prior normalization order.
- Resource registration is explicit rather than directory-globbed, while the parity test proves
  the explicit list covers every canonical native file.
- Update behavior is inherited unchanged and proven through its public analysis/execution paths.
- Released Snow/Cursor native lifecycle and exact dispatch remain outside this Work and must not
  be inferred from package presence or fixture success. The linked released-Harness verification
  Work owns any future evidence.
- Implementation success is ready for different-actor independent review; it is not reviewer
  acceptance.

## Correlation

- Actor ID: `cli_integration_implementer`
- Dispatch receipt: `2bee380209ee4f7ba65273d825973d1a`
- Completed predecessor receipt: `2c0c4e6432d145f987f721340b344614`
- Predecessor output: [Flow Status host parity re-review](../reviews/flow-status-host-parity-2.md)
- Unproven done conditions: none within this Work boundary; released-runtime capability remains
  explicitly unavailable as designed.
