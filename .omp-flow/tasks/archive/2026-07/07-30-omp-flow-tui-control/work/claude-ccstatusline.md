# Claude task observations and pinned ccstatusline Flow Status capability

## Objective

Translate supported Claude Code structured task hooks into the shared observation boundary and
provide the approved single Flow Status provider/widget as a reproducible, pinned ccstatusline
capability that reuses ccstatusline's Powerline renderer, editor, themes, layout, and width rules.

## Inputs

- [PRD R2–R3, R6, R8–R11, R14](../prd.md)
- [Claude and ccstatusline design](../design.md#claude-code-one-ccstatusline-extension)
- Pinned Claude executable fixture:
  `tests/fixtures/flow-status/claude-task-events-v2.1.220.json`
- [Fixture provenance](../reference/native-capability-fixtures.md#claude-code)
- [ccstatusline source evidence](../research/ccstatusline.md)

## In scope

- Claude hook handling for successful complete `TaskList` baselines, subsequent TaskCreate/
  TaskUpdate deltas, and invalidation on startup/resume/clear/compact/fork boundaries.
- Session/workspace correlation and closed failure behavior; no transcript or global-session scan.
- One `FlowStatusProvider` and one `FlowStatus` widget kind against the disclosed pinned
  ccstatusline revision.
- Exact full/compact/minimal/semantic-empty formatting, one graphical progress bar, ratio
  compaction, width budgets, Powerline participation, editor/manifest registration, and fixtures.
- The exact first-release distribution: upstream
  `https://github.com/sirmalloc/ccstatusline.git` at
  `83c8ffd551ec700fceeed98fe9ab50de84cb49fa` (`v2.2.27`), transformed only during an isolated
  reproducible build by:
  - `integrations/ccstatusline/flow-status-build.json`
  - `integrations/ccstatusline/build.mjs`
  - `integrations/ccstatusline/patches/ccstatusline-v2.2.27-flow-status-v1.patch`
- The deterministic build runs from a clean pinned clone, verifies the upstream revision before
  applying the reviewed patch, runs the focused upstream build/tests, and produces
  `@omp-flow/ccstatusline@2.2.27-flowstatus.1`. The build advertises
  `flowStatusWidgetV1` and the exact upstream revision through
  `ccstatusline --capabilities --json`. No patch is ever applied to installed code.
- Claude hook and compatible-build tests, including unavailable-before-baseline, partial payload,
  stale cache, CJK width, one/two-line composition, and preservation of existing widgets.
- Output fixtures for full, compact, minimal, degraded, and semantic-empty forms that reject
  adapter-injected `OMP`, `omp:`, logos, and Bundle shorthand while allowing safe source-owned task
  labels.

## Out of scope

- Reimplementing ccstatusline rendering/configuration/theme infrastructure or using Custom Command.
- Shipping an unpinned opaque binary, silently replacing an installed status owner, or claiming
  compatibility with an unverified ccstatusline revision.
- Mutating omp-flow task meaning or controlling native tasks from the status line.

## Allowed code and output boundary

- `templates/claude/settings.json`
- new focused hooks under `templates/claude/hooks/`
- the three exact pinned build/patch files under `integrations/ccstatusline/` named above
- `package.json` package-content declarations only where required to ship that boundary
- Claude/ccstatusline-focused fixtures and tests under `tests/`
- handoff: `work/handoffs/claude-ccstatusline.md`

Shared Python modules and generic installer configuration are inputs, not this work's ownership.

## Done

- A full TaskList baseline produces honest task-set counts; deltas never bootstrap an unknown set,
  and invalidation removes authority until another complete baseline.
- The clean pinned build produces the named package, registers exactly one provider/widget, and
  reports exactly `flowStatusWidgetV1: true` plus the pinned upstream revision from
  `--capabilities --json`; final composed fixtures prove Powerline behavior at supported widths.
- The hot path performs one bounded validated cache read, starts no daemon, executes no arbitrary
  command, and degrades to semantic empty or the contractually defined freshness marker.
- The pinned artifact can be reproduced and verified without modifying a user's existing global
  installation.
- All adapter-authored display variants satisfy PRD R2's no-injected-branding invariant.

## Handoff to setup

The handoff names the generated package/tarball identity and digest, exact upstream/patch
revisions, successful build/test commands, and the captured capability JSON. Setup may install or
select only `@omp-flow/ccstatusline@2.2.27-flowstatus.1` whose probe reports the exact capability
and upstream revision. Anything else is `unsupported`; setup never applies this patch itself.

## Verification

Run hook fixture tests with Python UTF-8 mode, reproduce/apply the patch against the exact pinned
ccstatusline revision and run its focused tests/build, then run the repository build/tests and
`git diff --check`.
