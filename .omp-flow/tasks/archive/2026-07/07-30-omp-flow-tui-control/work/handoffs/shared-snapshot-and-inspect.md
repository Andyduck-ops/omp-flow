---
type: "Implementation Handoff"
title: "Shared Flow Status snapshot, cache, inspect, and managed Skill"
---

# Shared Flow Status snapshot, cache, inspect, and managed Skill

Status: **DONE**

This implements [the bounded shared core work](../shared-snapshot-and-inspect.md) against the
approved [snapshot](../../interfaces/flow-status-snapshot-v1.md),
[source observation](../../interfaces/flow-status-source-observation-v1.md), and
[detail surface](../../interfaces/flow-status-detail-surface.md) contracts.

## Delivered

- Added a stdlib-only canonical `common/flow_status.py` producer/reader with closed field
  discrimination, bounds, exact role/position mapping, complete-membership counts and deterministic
  SHA-256 membership digest, task/assignment/progress/source binding, freshness handling, and
  attention filtering.
- Added the ignored, path-confined `.omp-flow/.runtime/flow-status/` cache with atomic replacement,
  one entry per repository/host/session scope, a maximum of eight entries, 24-hour eviction,
  corrupt/oversized/over-limit rejection, and deletion-safe reconstruction. Reads do not update
  cached or source timestamps.
- Preserved the existing `omp-flow status` behavior and added read-only
  `omp-flow status inspect [--json]`. Stale and clock-uncertain inspection structurally removes
  task-set/current/progress authority instead of returning old facts as current.
- Added the canonical `flow-status` Skill and byte-identical project copies for `.agents` and
  `.codex`. It uses only the supported inspect surface, makes no persistent Codex-footer claim,
  and owns no control action.
- Registered the new canonical Python module and the narrowly selected Skill resources in the
  existing managed installer. Normal init preserves a modified Skill; existing force semantics
  intentionally restore the managed copy.
- Added isolated installed-template contract tests for deterministic UTF-8 digests, closed
  discrimination, cross-host capability rejection, current/assignment/progress binding,
  stale/clock-uncertain/unsupported degradation, read-only cache access, CJK paths, cache bounds,
  CLI JSON, Skill placement, idempotent preservation, and force replacement.

## Changed files

- `templates/.omp-flow/scripts/common/flow_status.py`
- `templates/.omp-flow/scripts/omp_flow.py`
- `templates/common/skills/flow-status/SKILL.md`
- `.agents/skills/flow-status/SKILL.md`
- `.codex/skills/flow-status/SKILL.md`
- `src/cli/init.ts`
- `tests/flow-status.test.py`
- `tests/omp-flow.test.ts`

The live deployed `.omp-flow/scripts/` runtime was not edited. The unrelated user-modified
`templates/.omp-flow/scripts/common/disposition.py` was not touched.

## Verification

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS
- `npm run build` — PASS
- `npm test` — PASS, 215 focused TypeScript/runtime checks; the installed-template run also reports
  `PASS: flow-status Python contract checks`
- `npm pack --dry-run` — PASS; package listing contains
  `templates/.omp-flow/scripts/common/flow_status.py` and
  `templates/common/skills/flow-status/SKILL.md`
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were printed

## Decisions and remaining boundary

The producer accepts the approved closed observation objects directly rather than defining another
durable observation envelope. It persists only the aggregate snapshot and membership digest, never
the ephemeral member list. Cache data remains presentation-only and cannot authorize mutation.

Claude and Oh My Pi native payload translation, ccstatusline rendering, OMP footer/command
registration, setup UI, and README availability claims remain outside this work Concept and must
land through their separately reviewed adapter work. Until an adapter calls the producer, a fresh
installation truthfully returns that no cached Flow Status snapshot is available.

Actor ID: `executor-flowstatus-core`

Dispatch receipt: `39460b721c6e4e84979d57dba3cf423a`
