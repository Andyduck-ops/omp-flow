# Oh My Pi native Flow Status adapter

## Objective

Add a thin, capability-probed Oh My Pi adapter that translates the pinned 17.2.1 structured task
events into the shared observation boundary, contributes one compact native `flow-status` entry,
and registers one read-only `/flow-status` detail command.

## Inputs

- [Oh My Pi design](../design.md#oh-my-pi)
- [Pinned capability research](../research/native-harness-flow-capabilities.md)
- [Fixture provenance](../reference/native-capability-fixtures.md)
- Oh My Pi executable fixture:
  `tests/fixtures/flow-status/oh-my-pi-task-events-v17.2.1.json`

## In scope

- PRD R2 at every native compact, degraded, and detail output: adapter-authored text and separators
  contain no `OMP`, `omp:`, logo, or Bundle shorthand; safe source-owned task text remains allowed.
- Positive capability detection for the exact pinned public surface and truthful unsupported
  behavior for older/unverified installations.
- Translation of complete task arguments and full indexed `TaskToolDetails.progress[]` snapshots;
  concurrent unselected calls remain isolated.
- Native event registration, `ctx.ui.setStatus("flow-status", text)`, semantic-empty removal, and
  one read-only `/flow-status` command over the shared validated snapshot.
- Compact formatting consistent with the approved one-bar/ratio/freshness rules.
- Flat single-task, batch, update/end, mismatch, incomplete progress, unsupported-version,
  capability-absence, stale, and UTF-8 tests.

## Out of scope

- Reconstructing task meaning, introducing a task database, dispatching/cancelling tasks, screen
  scraping, PTY wrapping, or claiming support for unverified OMP versions.
- Editing ccstatusline or Codex configuration.

## Allowed code and output boundary

- `src/omp/extension.ts`
- `src/omp/extension-entry.ts`
- new focused OMP adapter modules under `src/omp/`
- OMP-focused fixtures/tests under `tests/`
- OMP template settings only if public registration requires it
- handoff: `work/handoffs/oh-my-pi-native-status.md`

The shared snapshot implementation is an input. Generic installer ownership remains with the
integration work.

## Done

- Capability-positive 17.2.1 fixtures produce one namespaced status entry and one read-only detail
  command; semantic empty clears only the entry owned by this adapter.
- Full indexed progress is required for authoritative task-local progress and invalid or
  concurrent/unselected events cannot contaminate the selected observation.
- Unsupported or failed probes do not register UI/commands and direct `status inspect` remains the
  only claimed fallback.
- Existing dispatch validation, tool protection, context injection, and user status entries remain
  unchanged.
- Compact, degraded, semantic-empty, and detail fixtures prove the no-injected-branding invariant.

## Verification

Run focused OMP extension tests against pinned flat and batch fixtures, negative capability tests,
`npm run build`, `npm test`, and `git diff --check`.
