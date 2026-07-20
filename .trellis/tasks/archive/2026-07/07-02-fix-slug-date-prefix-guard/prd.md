# PRD: Guard `task.py create` against date-prefixed `--slug`

Upstream issue: https://github.com/mindfold-ai/Trellis/issues/377 (Makonike)

## Problem

`task.py create` builds the task directory as `f"{MM-DD}-{slug}"` with no
validation on `--slug`. Passing an existing task directory name (or any
date-prefixed value) as `--slug` silently produces a doubled prefix:
`07-02-07-02-example-task`. Common trigger: humans or scripts copy a task id
into `--slug` (help text says only "Task slug"; `--parent` examples use full
dir names, inviting the confusion).

## Requirements

1. Slug starting with **today's** `MM-DD-` prefix → strip it, print a warning
   (`warning: --slug should not include the MM-DD prefix; normalized to "..."`),
   continue with the canonical name.
2. Slug starting with a **different valid** `MM-DD-` date prefix → fail with an
   actionable error telling the user to pass only the slug body.
   Valid = month 01-12, day 01-31; e.g. `13-45-foo` is NOT a date prefix and
   passes through untouched.
3. Unprefixed slugs and title-derived slugs: behavior unchanged.
4. Collision checks (active + archived) keep operating on the final canonical
   directory name.
5. `--slug` help text updated to state the date prefix must not be included.

## Scope

- Source of truth: `packages/cli/src/templates/trellis/scripts/common/task_store.py`
  (create path) + `packages/cli/src/templates/trellis/scripts/task.py` (help text).
- Mirror the same edit into this repo's installed copies under `.trellis/scripts/`
  (dogfood copy) so behavior matches until the next `trellis update`.
- Regression tests in `packages/cli/test/` following the existing
  run-python-in-temp-repo pattern: unprefixed / today-prefixed / other-date-prefixed.

## Acceptance Criteria

- [ ] `create "T" --slug example-task` → `MM-DD-example-task` (unchanged)
- [ ] `create "T" --slug <today>-example-task` → `MM-DD-example-task` + warning, exit 0
- [ ] `create "T" --slug 01-01-example-task` (not today) → error, exit 1, no dir created
- [ ] Full CLI test suite passes
