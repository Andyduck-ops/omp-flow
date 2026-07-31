---
type: "Implementation Handoff"
title: "Shared Flow Status review repair"
---

# Shared Flow Status review repair

Status: **DONE**

This repairs every finding in the independent
[shared-core review](../../review/shared-snapshot-and-inspect.md) while retaining the scope of the
[original work Concept](../shared-snapshot-and-inspect.md) and
[implementation handoff](shared-snapshot-and-inspect.md).

## Review findings repaired

### Stable language-neutral observation/write boundary

The canonical CLI now exposes:

```text
omp-flow status observe --host <claude|codex|oh-my-pi> --session <id>
```

It reads exactly one UTF-8 v1 JSON document from stdin, capped at 256 KiB. The document contains
the approved closed `taskSet`, optional `assignment`, optional `progress`, and bounded `attention`
objects. It never accepts command-line JSON or interpolates a shell command. The shared Python
validator binds repository, host, session, task set, assignment, progress, sources, and revisions,
then performs the existing confined atomic cache write and returns a bounded JSON result containing
the validated snapshot and opaque cache key.

Tests exercise both a Claude observation caller and a TypeScript Oh My Pi caller through the real
installed CLI process. The TypeScript test uses `spawnSync` argument arrays plus stdin and contains
no shell interpolation or duplicate validation/cache implementation.

### Closed cache validation

Cache validation now rejects:

- a task-set capability paired with the wrong Harness host;
- an available task set whose bound source is not a connected `hostTaskSet`;
- available membership/source revision mismatch;
- assignment/progress sources with the wrong kind, non-connected state, or wrong revision; and
- unavailable reasons whose bound `hostTaskSet` state is inconsistent (`unsupported`,
  `malformed`, `disconnected`, or connected for `incomplete`/`stale`).

Focused forged-cache fixtures cover cross-host capability, wrong source kind/state/revision, and
inconsistent unavailable state.

### Exact or unambiguous inspection scope

`status inspect` now accepts public `--host` and `--session` arguments, with the existing
environment variables only as fallback. Cache inspection no longer chooses the newest entry.
It succeeds only when the repository plus supplied filters identify exactly one scope; zero
matches return `scope-mismatch` and multiple matches return `ambiguous`.

Tests cover multiple Claude sessions, multiple Harness entries, and a Codex inspection while a
newer Claude cache exists. Codex fails closed instead of reporting Claude data. The managed Codex
Skill explicitly requests `--host codex` and documents optional exact session binding and
ambiguity behavior.

### Closed versioned JSON failures

`status inspect --json` and `status observe` now emit bounded v1 JSON failure responses to stdout
while preserving nonzero exit status. The response includes stable `state`, `reason`, `snapshot`,
and `error.code`/`error.message` fields without requiring stderr scraping.

Real CLI fixtures cover missing cache, corrupt cache, scope mismatch, unsupported, stale,
malformed, disconnected, malformed observation, and explicit observation/session mismatch.

## Changed files

- `templates/.omp-flow/scripts/common/flow_status.py`
- `templates/.omp-flow/scripts/omp_flow.py`
- `templates/common/skills/flow-status/SKILL.md`
- `.agents/skills/flow-status/SKILL.md`
- `.codex/skills/flow-status/SKILL.md`
- `tests/flow-status.test.py`
- `tests/omp-flow.test.ts`

The preceding managed-resource registration in `src/cli/init.ts` remains part of the same shared
core implementation. The live deployed `.omp-flow/scripts/` runtime and unrelated user-modified
`templates/.omp-flow/scripts/common/disposition.py` were not edited.

## Verification

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS
- `npm run build` — PASS
- `npm test` — PASS, 216 focused TypeScript/runtime checks plus
  `PASS: flow-status Python contract checks`
- `npm pack --dry-run` — PASS; canonical runtime module and Skill are included
- `git diff --check` — PASS; only pre-existing Windows LF-to-CRLF warnings were printed
- Manual `status inspect --host codex --json` with no cache — versioned JSON `missing` response on
  stdout with nonzero exit, as required
- Canonical, `.agents`, and `.codex` `flow-status` Skill copies — byte-identical

## Remaining boundary

This repair supplies the single stable adapter-facing process boundary. Harness adapters remain
responsible only for translating their documented native payloads into the approved observation
objects and invoking this boundary. They do not duplicate schema validation or cache storage.
Presentation, ccstatusline rendering, and native footer lifecycle remain in their separately
reviewed work Concepts.

Actor ID: `executor-flowstatus-core-repair`

Dispatch receipt: `3639cbd2318b40f5a198e3bbe8fba2a6`

Review predecessor: `85f9c97f032f4ddca9654e258becd8a2`
