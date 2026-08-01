---
type: "Review"
title: "CLI and managed-resource integration review"
---

# CLI and managed-resource integration review

## Findings

### Low — README project-tree connector under `.claude/` is cosmetically stale

[`README.md`](../../../../../README.md) line 199 now makes `.claude/` a non-final top-level sibling
before `.snow/` and `.cursor/`, but lines 200–207 retain the four-space child prefix from when
`.claude/` was the final sibling. Those child lines should use the continuing `│   ` prefix for a
well-formed text tree. This does not misstate any installed path or capability boundary and is not
acceptance-blocking; it is an actionable documentation-polish item.

No blocking or major findings were found.

## Verdict

**PASS with one low-severity documentation advisory.** The current implementation satisfies the
assigned [CLI, managed-resource, update, and documentation integration](../cli-managed-resource-integration.md)
Work and its linked approved Design. All product tests and independent acceptance probes passed;
there is no unresolved substantive finding. No implementation code was repaired during this
review.

## Scope and correlation

- Reviewed Work: [CLI, managed-resource, update, and documentation integration](../cli-managed-resource-integration.md)
- Reviewed handoff: [CLI and managed-resource integration implementation](../handoffs/cli-managed-resource-integration.md)
- Completed implementation predecessor receipt: `2bee380209ee4f7ba65273d825973d1a`
- Implementation actor: `cli_integration_implementer`
- Reviewer actor: `cli_integration_reviewer`
- Review dispatch receipt: `03a1251ab25442b5adae9d8cb9b97359`

The read-only predecessor operation record is `completed`, belongs to Bundle
`08-01-snow-cli-adapter`, names `work/cli-managed-resource-integration.md`, and resolves its output
to the reviewed handoff. The handoff links back to the same Work and records the matching receipt
and actor. The reviewer actor differs from the implementation actor. This reviewer session had no
selected active task, so the session-scoped `operation show` command correctly refused lookup;
the two operation JSON records were inspected read-only without changing runtime/session state.

The actual implementation diff and changed paths match the handoff's boundary:
`src/cli/harness.ts`, init/help branches in `src/cli/index.ts`, `src/cli/init.ts`,
`tests/init-cli.test.ts`, `tests/omp-flow.test.ts`, the new focused
`tests/snow-cursor-managed-resources.test.ts`, and `README.md`. `src/cli/update.ts` is unchanged.
Canonical Snow/Cursor templates and accepted Flow Status changes were treated as reviewed inputs
from their linked predecessor work, not attributed to this implementation. Concurrent worktree
changes outside the Work boundary were excluded from this verdict.

## Contract assessment

- **Harness parsing, config, interactive choice, and help:** PASS. `HARNESSES` defines the one
  persisted/interactive order `omp`, `codex`, `claude`, `snow`, `cursor`; normalization
  deduplicates caller input, config reads reject unknown values, and Snow/Cursor round-trip without
  caller-order drift. CLI flags, interactive choices/defaults, help, and the non-interactive error
  all include the two Harnesses.
- **Fail-before-write behavior:** PASS. Independent empty-directory probes proved that an unknown
  init flag, `--force` plus `--skip-existing`, and a missing non-interactive Harness selection all
  throw their expected visible error while directory snapshots remain exactly `[]` before and
  after.
- **Exact resource registration and rendering:** PASS. Snow registers exactly five agent cards,
  two event JSON files, and two handlers; Cursor registers exactly five agent cards, one
  `hooks.json`, and two handlers. Snow-only, Cursor-only, combined, and sequential mixed installs
  deploy exactly the canonical native files for selected groups. All three JSON resources parse
  after `{{PYTHON_CMD}}` substitution, use the platform Python command, and retain project-relative
  handler paths.
- **Generic update ownership:** PASS. The new tests exercise all 17 resources as unchanged, one
  deleted and one modified file in each native root, foreign Snow/Cursor JSON, forced conflict
  replacement, preservation of user deletions, backups containing the pre-update conflicts, and
  exact template replacement without JSON merge. The behavior uses the unchanged generic
  `analyzeChanges`/`interactiveUpdate` path.
- **Package and duplication boundaries:** PASS. Package dry-run contains exactly 17 Snow/Cursor
  template files and no `templates/snow|cursor/(skills|rules)` entry. A real tarball installed into
  an isolated temporary project initialized with `--snow --cursor` exited 0, persisted exactly
  `snow,cursor`, installed all 17 native files, and produced no `.snow/skills`, `.cursor/skills`,
  or `.cursor/rules` path. `.agents/skills` remains the shared Skill tree.
- **Flow Status preservation:** PASS. The integration edit reconciles only init flags/help with
  the previously accepted five-host revision. The integrated publisher/runtime suites retain the
  exact closed host set and pass all Snow/Cursor host-parity, detail/Wave-only, and v1 regression
  checks; no new semantic field or selection inference appears in this Work.
- **README capability truthfulness:** PASS. The README discloses Snow project-over-global
  same-event precedence and bounded protection, keeps Snow exact receipt-bound dispatch
  unavailable, keeps released Cursor lifecycle/enforcement paths unavailable, and rejects aliases,
  post-hoc receipts, duplicate Skills, a Cursor rule, and JSON merging. The sole README finding is
  the cosmetic tree connector above.

## Independent verification

- `npm run build` — **PASS**, TypeScript compilation completed with exit 0.
- Focused `npx tsx -e` invocation of `runSnowCursorManagedResourceTests` using an async IIFE —
  **PASS**, 68 checks. An initial invocation used top-level `await` under tsx's CJS eval mode and
  did not execute the test; the corrected IIFE invocation is the reported product result.
- Independent `runCLI` empty-target probe for `init --unknown`,
  `init --snow --force --skip-existing`, and non-TTY `init` with no Harness — **PASS**. All three
  returned the expected error and exact before/after directory snapshots were unchanged.
- `npm test` — **PASS** in 140.4 seconds: 511 focused checks; 12 Flow Status Python tests; 8 Snow
  Python tests; 11 Cursor Python tests; and 3 TAP tests. The normal entry invoked CLI init,
  managed-resource integration, accepted Snow/Cursor Hook suites, and Flow Status coverage.
- `npm pack --dry-run --json` with entry filtering — **PASS**: package `omp-flow@0.2.6`, 137 files,
  184,580 packed bytes, 851,930 unpacked bytes, exactly 17 Snow/Cursor native files, and zero
  Snow/Cursor Skill/rule duplicates.
- Packed-artifact smoke using `npm pack --pack-destination <temp>`, isolated `npm install`, and
  `node <temp>/node_modules/omp-flow/bin/omp-flow.js init --snow --cursor --skip-existing` from an
  isolated project — **PASS**, exit 0, config `snow,cursor`, exactly 17 native files, and no
  Harness-local Skill/rule path.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks
  templates/snow/hooks templates/cursor/hooks` with `PYTHONPYCACHEPREFIX` outside the workspace —
  **PASS**, exit 0.
- `git diff --check` — **PASS**, exit 0; only repository Windows line-ending notices were emitted.
- `rg -n '[ \\t]+$'` over all implementation-owned code/test/README paths — **PASS**, no matches.
- Scoped `git status --short --untracked-files=all` after verification — **PASS**, no live
  `.snow`, `.cursor`, `.omp-flow/.template-hashes.json`, or `.omp-flow/config.json` review residue.

One first packed smoke invocation accidentally inherited the repository cwd rather than the
temporary project. It was not treated as product evidence. Its exact 17 deployed test files, new
hash file, and two config additions were identified immediately, removed, and the pre-test tracked
config was restored; scoped Git checks then proved no residue before the corrected isolated smoke.

## Acceptance and residual boundary

The Work is accepted for integration. The low README connector advisory may be fixed as ordinary
documentation polish without reopening the implementation contract. Released Snow/Cursor native
lifecycle and exact native operation correlation remain outside this Work and must stay unavailable
unless the separate released-Harness verification supplies the required evidence.
