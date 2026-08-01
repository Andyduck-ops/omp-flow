---
type: "Work"
title: "Flow Status host parity for Snow and Cursor"
---

# Flow Status host parity for Snow and Cursor

## Objective

Extend the existing closed Flow Status v2 host contract to `snow` and `cursor`, and replace the
read-only Skill's Codex hardcoding with explicit current-Harness evidence while preserving the
existing state shape, scoped CAS/lease behavior, and fail-closed ambiguity rules.

This realizes the Design's Flow Status section and accepted QbD advisory observation 5. It also
supports PRD requirements 5 and 6 without making Flow Status an authored-state inference surface.

## In scope

- TypeScript host type/allowlist and publish/renew/clear CLI validation/help.
- Portable Python receiver/parser host choices and tests for both new values.
- Canonical and tracked project copy of the read-only `flow-status` Skill.
- Runtime-evidence host selection: injected `OMP_FLOW_HOST` is authoritative when valid; Snow may
  be identified by `SNOW_SESSION_ID`; absence or conflicting evidence is unavailable. Harness
  config order is never a current-session signal.
- Existing-host regression coverage plus v2 shape, scope, CAS, renewal, clear, malformed input,
  and cross-host isolation checks for Snow and Cursor.

## Out of scope

- A new Flow Status capability, renderer, state field, cache layout, lifecycle phase, or semantic
  inference path.
- Choosing a host from `.omp-flow/config.json`, newest cache entry, task counts, or Markdown.
- Cursor environment injection or Snow session selection themselves; those belong to the native
  resource work.
- Editing the live deployed `.omp-flow/scripts/**` runtime during this in-flight Bundle.

## Useful inputs

- [Approved Design: Flow Status](../design.md#flow-status)
- [Accepted QbD advice](../qbd/design-audit-2.md), observation 5
- [Snow adapter contract](../research/adapter-contract.md)
- [Cursor adapter research](../research/cursor.md)
- Existing `src/cli/flow-status-semantic-publisher.ts`, `templates/.omp-flow/scripts/common/flow_status.py`,
  `templates/.omp-flow/scripts/omp_flow.py`, and `templates/common/skills/flow-status/SKILL.md`

## Allowed code and output boundary

Implementation may edit only:

- `src/cli/flow-status-semantic-publisher.ts`
- the Flow Status host validation/help branches in `src/cli/index.ts`
- `templates/.omp-flow/scripts/common/flow_status.py`
- Flow Status host argument choices in `templates/.omp-flow/scripts/omp_flow.py`
- `templates/common/skills/flow-status/SKILL.md`
- `.agents/skills/flow-status/SKILL.md`, kept byte-identical to its canonical source
- `templates/common/skills/omp-flow/SKILL.md`
- `.agents/skills/omp-flow/SKILL.md`, `.omp/skills/omp-flow/SKILL.md`, and
  `.claude/skills/omp-flow/SKILL.md`, all kept byte-identical to their canonical source
- focused Flow Status tests under `tests/flow-status*.{py,ts,mjs}` and, only if necessary for CLI
  validation, `tests/init-cli.test.ts`
- expected handoff: `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/flow-status-host-parity.md`

The later CLI integration work may reconcile adjacent `src/cli/index.ts` help text but must not
change this work's host semantics.

## Done conditions

- `snow` and `cursor` are accepted everywhere the closed host set is validated, while unknown
  hosts still fail before mutation.
- Publish, renew, clear, inspect, scope isolation, and CAS behavior are unchanged apart from the
  two accepted host names; the v2 request, publication, snapshot, and error shapes do not grow.
- The read-only Skill selects only from concrete runtime evidence, uses the matching exact session
  identity, and reports ambiguity/unavailability rather than consulting config order or another
  host's cache.
- Existing Claude, Codex, and Oh My Pi sessions remain discoverable from their concrete native
  runtime evidence when `OMP_FLOW_HOST` is absent; Cursor's explicit host remains authoritative,
  and conflicting implicit evidence fails closed.
- `SNOW_SESSION_ID` maps to host `snow`; Cursor uses Hook-injected `OMP_FLOW_HOST=cursor` and the
  same `conversation_id` carried as explicit context.
- Existing Claude, Codex, and Oh My Pi behavior remains covered.

## Focused verification

- `npm test`, with the existing `runFlowStatusV2PublisherTests` path extended by focused
  Snow/Cursor host assertions
- `python -X utf8 tests/flow-status.test.py <temporary-installed-project>`
- `python -X utf8 tests/flow-status-v2.test.py <temporary-installed-project>`
- Contract tests that publish and inspect the same session label under different hosts and prove
  the scopes do not collide.
- Contract tests for valid Snow/Cursor runtime evidence, absent evidence, conflicting evidence,
  all five valid host evidence paths, and combined configuration that never influences
  current-host selection.

## Expected handoff

[Flow Status host-parity handoff](handoffs/flow-status-host-parity.md) must link back here, list
files changed and command results, confirm byte parity of the canonical/deployed Skill, and state
that no v2 shape or semantic inference behavior was added.
