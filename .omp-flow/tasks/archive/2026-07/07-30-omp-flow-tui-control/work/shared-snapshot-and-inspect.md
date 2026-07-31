# Shared snapshot, cache, inspect CLI, and managed Skill

## Objective

Implement the stdlib-only, read-only FlowStatus projection that validates closed source
observations, derives `FlowStatusSnapshotV1`, stores bounded reconstructable cache entries
atomically, and exposes `omp-flow status inspect [--json]` plus the managed `$flow-status` Skill.

## In scope

- The exact schemas, binding rules, deterministic membership/unit revisions, freshness,
  invalidation, limits, and degraded behavior in
  [snapshot v1](../interfaces/flow-status-snapshot-v1.md) and
  [source observation v1](../interfaces/flow-status-source-observation-v1.md).
- A narrow producer/reader module under the canonical Python runtime template.
- CLI parsing and truthful human/JSON inspect output; no mutation from inspect.
- Ignored, path-confined, atomic cache storage with size/entry/age limits and deletion-safe
  reconstruction.
- The canonical common `flow-status` Skill and its selected Harness deployments, registered by the
  existing managed-resource installer.
- Unit and contract fixtures for deterministic digests, closed discrimination, assignment/task
  binding, stale/clock-uncertain behavior, cache confinement, UTF-8/CJK paths, and bounded output.

## Out of scope

- Reading authored Markdown semantics, inferring lifecycle state, task control, cancellation, or
  native Harness UI.
- Claude/Oh My Pi payload translation, ccstatusline rendering, or user configuration mutation.
- Editing the live deployed `.omp-flow/scripts/` runtime while it coordinates this in-flight task;
  canonical templates and isolated installed-test fixtures are the implementation targets.

## Allowed code and output boundary

- `templates/.omp-flow/scripts/omp_flow.py`
- new or existing modules under `templates/.omp-flow/scripts/common/` except the unrelated
  user-modified `disposition.py`
- `templates/common/skills/flow-status/SKILL.md`
- generated/managed copies at `.agents/skills/flow-status/SKILL.md` and
  `.codex/skills/flow-status/SKILL.md`
- managed resource declarations in `src/cli/init.ts`
- focused tests and fixtures under `tests/`
- handoff: `work/handoffs/shared-snapshot-and-inspect.md`

## Done

- Valid observations yield byte-stable snapshots and invalid/partial observations fail closed or
  become the contractually defined unavailable source without inventing counts.
- Cache reads never refresh source time; over-limit, corrupt, escaped, or mismatched entries are
  rejected within the hot-path budget.
- `status inspect` is useful in text and machine-readable form and remains read-only.
- `$flow-status` calls only the supported inspect surface and makes no persistent Codex-footer
  claim.
- Installer tests prove the new Skill is managed without overwriting modified user copies outside
  existing force semantics.

## Verification

Run focused Python/CLI fixtures through an isolated installed template, TypeScript installer tests,
`python -X utf8 -m compileall -q templates/.omp-flow/scripts`, `npm run build`, `npm test`, and
`git diff --check`.
