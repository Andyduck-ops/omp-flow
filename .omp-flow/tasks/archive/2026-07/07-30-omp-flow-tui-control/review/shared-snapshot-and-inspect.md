---
type: "Review"
title: "Shared Flow Status snapshot, cache, inspect, and managed Skill review"
---

# Shared Flow Status snapshot, cache, inspect, and managed Skill review

Verdict: **CHANGES_REQUESTED**

This independently reviews the implemented
[shared snapshot and inspect work](../work/shared-snapshot-and-inspect.md) and its linked
[implementation handoff](../work/handoffs/shared-snapshot-and-inspect.md) against the approved
[snapshot](../interfaces/flow-status-snapshot-v1.md),
[source observation](../interfaces/flow-status-source-observation-v1.md), and
[detail surface](../interfaces/flow-status-detail-surface.md) contracts.

## Findings

### BLOCKING — later Harness adapters have no supported observation/write boundary

`common/flow_status.py` exposes `build_snapshot()` and `write_cached_snapshot()` only as Python
imports, while the stable CLI exposes only the read side, `status inspect`. There is no bounded
adapter-facing command or other language-neutral surface that accepts the closed source
observation, validates it, and atomically writes the selected repository/host/session cache entry.

This does not satisfy the authored work map's requirement that Claude and Oh My Pi proceed against
the shared public observation/inspect boundaries. In particular, the TypeScript Oh My Pi extension
cannot use the delivered producer without either duplicating the schema/validation/cache logic or
inventing an ad-hoc Python invocation. Either outcome breaks the approved single validated
snapshot boundary and makes the following adapter work depend on an unreviewed integration
mechanism.

Add one explicit, bounded producer/write surface under the stable runtime boundary. It must accept
the exact closed observation objects without shell interpolation, bind repository/host/session,
apply the existing validator, perform the confined atomic write, and return a bounded structured
result. Exercise the real Claude and TypeScript Oh My Pi callers through that surface; do not
introduce a dispatcher, duplicate schema, or second cache format.

### HIGH — cached-snapshot validation accepts impossible capability/source combinations

`validate_snapshot()` checks that `scope.host` and `taskSet.capability` are individually known, but
does not apply the producer's host/capability discriminator. It also permits an available task set
whose bound `hostTaskSet` source has state `unsupported`, `malformed`, or `disconnected`. A cache
entry is an input boundary, so producer-only checks are insufficient.

A focused probe built a valid Claude snapshot, changed only `scope.host` to `codex`, and
`validate_snapshot()` printed `ACCEPTED_CROSS_HOST_CAPABILITY`. Changing the available task
source's state to `unsupported` likewise printed
`ACCEPTED_AVAILABLE_WITH_UNSUPPORTED_SOURCE`.

Make the cache validator enforce the same closed host/capability pairing as the producer and
require a valid available task set to bind a connected `hostTaskSet` source with the exact current
revision. Apply equivalent kind/state consistency to the unavailable union. Add negative cache
fixtures so a forged or corrupt entry cannot cross a Harness boundary or manufacture
availability.

### HIGH — inspect can select the wrong Harness/session scope

`inspect_cached_snapshot()` treats `host` and `host_session_id` as optional filters and otherwise
chooses the entry with the greatest `cachedAtUnixMs` across every matching repository scope.
`status inspect` supplies those filters only from optional environment variables and offers no
explicit CLI scope arguments or normal runtime-derived host/session binding. With Claude, Codex,
and Oh My Pi entries in the same repository, a direct invocation or managed Codex Skill can
therefore report the newest snapshot from another Harness/session.

Resolve one exact host/session scope through a documented public input and fail closed when it is
absent or ambiguous. Test multiple same-repository Harnesses and sessions, including a Codex
inspection in the presence of a newer Claude cache entry.

### HIGH — `status inspect --json` failures are not JSON

The approved detail contract defines `--json` as a closed versioned inspection response with
bounded degraded errors. On a repository with no cache, the command instead exits 2 and emits only
plain stderr:

```text
[omp-flow] ERROR: Flow Status is unavailable: no cached snapshot
```

Machine consumers cannot distinguish the closed unavailable reasons from parser/process failure
without scraping text. Preserve the nonzero exit where appropriate, but emit the bounded
versioned JSON failure response requested by `--json`. Cover missing cache, corrupt cache,
scope mismatch, unsupported, stale, malformed, and disconnected cases.

## Verification

- Predecessor operation `39460b721c6e4e84979d57dba3cf423a` is completed by
  `executor-flowstatus-core`, points to the linked handoff, and differs from reviewer actor
  `reviewer-flowstatus-core`.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts` — PASS.
- `python -X utf8 templates/.omp-flow/scripts/omp_flow.py --cwd . status inspect --json` — exit 2
  with non-JSON stderr, reproducing the machine-contract failure.
- Focused `validate_snapshot()` mutation probe — reproduced acceptance of both cross-host
  capability and available/unsupported-source combinations.
- `status -h` and `status inspect -h` — only `inspect --json` is exposed; no adapter-facing
  observation/write surface or explicit exact-scope arguments are present.
- `git diff --check` over the tracked shared-work changes — PASS apart from existing Windows
  line-ending warnings.

The implementer's reported compile/build/test/package checks are credible for the paths they
exercise, but the focused tests do not cover the public producer boundary, ambiguous multi-scope
selection, closed cache discriminator failures, or JSON error responses. Green existing tests
therefore do not satisfy the work Concept's full contract scope.

Reviewer actor: `reviewer-flowstatus-core`

Review dispatch receipt: `85f9c97f032f4ddca9654e258becd8a2`

Implementation predecessor: `39460b721c6e4e84979d57dba3cf423a`
