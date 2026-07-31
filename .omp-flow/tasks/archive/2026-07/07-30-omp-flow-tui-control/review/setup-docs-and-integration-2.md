---
type: "Review"
title: "Final Flow Status setup and integration repair review"
---

# Final Flow Status setup and integration repair review

Verdict: **CHANGES_REQUESTED**

This independently re-reviews the
[setup, documentation, and integration work](../work/setup-docs-and-integration.md), the prior
[CHANGES_REQUESTED review](setup-docs-and-integration.md), and the linked
[repair handoff](../work/handoffs/setup-docs-and-integration-repair.md).

Repair predecessor `e58fd7f34f0e4194b0f35c27e477a990` is completed by
`executor-flowstatus-integration-repair`, resolves to the required repair handoff, and differs
from this final reviewer actor.

## Findings

### Medium — a preparation failure leaks an atomic-commit temporary file

`atomicCommitFilesSync()` prepares every replacement temporary file before entering the
`try/catch/finally` that cleans prepared files and rolls back committed targets. If preparation of
a later target fails, an earlier temporary file remains on disk. This contradicts the repaired
work's no-residue requirement and can leave a temporary copy of settings or ownership content.

An independent compiled-module probe supplied two changes:

1. a valid first target; and
2. a second target whose parent path was an existing regular file.

Preparation failed before any rename, and the result was:

```json
{
  "preparationFailed": true,
  "preparationResidue": [
    ".first.json.29292.1785441265092.commit-0.tmp"
  ]
}
```

The tracked tests inject failures only after the first or second rename, so they do not exercise
this earlier failure boundary.

Required repair: establish cleanup ownership before preparing the first temporary file, prepare
incrementally inside the protected `try/finally`, and add an injected or naturally failing
second-prepare test proving that all earlier temporary files are removed while every target
retains its prior complete state.

### Medium — doctor can report an unpinned configured renderer as ready

When explicit compatible binary/config paths are supplied, `claudeStatusOwnerFromPath()` still
accepts either the exact expected command **or** any command recognized by
`isDocumentedCcstatuslineCommand()`. Consequently, a configured:

```text
npx -y ccstatusline@latest
```

is combined with the separately probed pinned binary/package and reported as `ready`, even though
the configured renderer is not that binary and may not contain `flowStatusWidgetV1`.
`configureFlowStatus()` correctly rejects the same existing command because it is not the exact
supported command, so doctor and setup disagree.

An independent compiled-module probe with exact compatible probe metadata and the unpinned
configured command returned:

```json
{
  "doctorOwner": "ccstatusline",
  "doctorSetup": "ready"
}
```

The new foreign-command fixture closes the prior substring case but does not cover this
documented-yet-unpinned owner shape.

Required repair: when an expected pinned command is supplied, readiness must require that exact
command. A generic documented ccstatusline command may be classified as a ccstatusline owner for
discovery, but it must remain `manual-compatible-build-required` or `unsupported`, never `ready`
from another executable's probe. Add doctor/setup consistency fixtures for `ccstatusline`,
`npx -y ccstatusline@latest`, and another absolute ccstatusline command.

## Prior finding status

### Explicit reversible setup — substantially implemented

The repair adds explicit `setup|update`, project/user scope, exact package/capability/revision
gates, line/position selection, dry-run and confirmation, an exact canonical widget, ownership,
idempotent move/update, and exact removal. Source tests cover confirmation-required, dry-run,
confirmed setup, repeat setup, move, project removal, wrong package, foreign owner, and one
user-scope setup. No product mutation occurred during this review.

The remaining doctor inconsistency above prevents this closure from being accepted as exact.

### Atomic settings and ownership — post-rename rollback implemented, preparation cleanup incomplete

The same-directory writer uses exclusive temporary files, file sync, rename, best-effort directory
sync, and reverse-order rollback. Injected post-rename tests pass for first- and second-rename
failures. The preparation-stage leak above leaves the no-residue closure incomplete.

### Closed owner parsing — substring case closed, pinned-command discrimination incomplete

The old `includes("ccstatusline")` heuristic is removed, and
`foreign-renderer --label ccstatusline` is correctly rejected. Generic documented command
acceptance still creates the false-ready case described above.

### Installed cross-surface fixture — materially expanded

Source inspection confirms that the packed fixture now installs the real patched ccstatusline
artifact, exercises confirmed/repeated setup and exact removal, renders Claude compact/full/
minimal/degraded/ASCII/unknown-width/semantic-empty cases, compares shared task/progress facts
with Oh My Pi compact output, checks truthful unavailable Codex detail, and enforces no branding
and deadlines. The Windows workflow installs Bun, builds the pinned patch, and runs the source
suite and installed fixture sequentially.

The installed fixture was not redundantly replayed after the two focused compiled-module failures:
neither a successful render replay nor the existing post-rename injected seam can close those
failures.

## Package, documentation, and boundaries

- README and Wiki now document the explicit compatible-build acquisition, dry-run/confirmation,
  scoped setup/update/removal, exact paths, capability limits, Codex on-demand-only behavior, and
  removal caveats.
- The checked-in Windows workflow is a real `windows-latest` job with a job timeout and sequential
  source/build/installed steps.
- Package registration includes the new compiled atomic/setup implementation and reviewed
  ccstatusline acquisition resources.
- The live deployed `.omp-flow/scripts/` runtime was not edited by this repair. The unrelated
  pre-existing `templates/.omp-flow/scripts/common/disposition.py` change remains outside this
  work.

## Independent verification

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm run build` — PASS.
- `npm test` — PASS, including Flow Status Python and Claude hook contracts and **261 focused
  checks**.
- Compiled `atomicCommitFilesSync()` second-target preparation-failure probe — FAIL: one prepared
  `.tmp` file remained.
- Compiled `inspectFlowStatusSetup()` probe with configured
  `npx -y ccstatusline@latest` plus a separately supplied compatible binary/package — FAIL:
  `statusOwner: "ccstatusline"` and `setup: "ready"`.
- Source inspection of the packed fixture, Windows workflow, setup/remove implementation,
  ownership format, README, and Wiki — completed; no additional blocking finding recorded.

Reviewer actor: `reviewer-flowstatus-integration-final`

Review dispatch receipt: `e6e3461924834b468e5f97b443deb830`

Repair predecessor: `e58fd7f34f0e4194b0f35c27e477a990`
