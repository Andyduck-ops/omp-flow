---
type: "Work"
title: "CLI, managed-resource, update, and documentation integration"
---

# CLI, managed-resource, update, and documentation integration

## Objective

Register Snow and Cursor through the existing Harness and managed-resource seams, expose stable
CLI/config selection, verify existing init/update ownership for every new resource, connect the
adapter tests to the standard suite, and document only the capabilities the native work supports.

This realizes PRD requirements 1, 2, 8, and 9 and integrates the resources required by PRD 3 and
4. It is the shared integration point after the canonical Snow and Cursor templates exist.

## In scope

- Add `snow` and `cursor` to the `Harness` union and one stable normalized order.
- Parse `--snow`/`--cursor`, expose interactive choices and help, round-trip config, and reject
  invalid or empty non-interactive selection before any filesystem write.
- Register exact-owned Snow and Cursor resources in `managedResources()` through existing groups;
  extend `{{PYTHON_CMD}}` rendering to their event JSON without a wrapper or JSON merge.
- Prove Snow-only, Cursor-only, combined, and mixed-existing-config installs create exactly core
  plus selected resources.
- Prove update behavior for unchanged, deleted, user-modified, and foreign Snow/Cursor files uses
  existing hash ownership, backup, preservation, and conflict reporting.
- Assert `.agents/skills` is the only Skill tree for Snow/Cursor and that no `.snow/skills`,
  `.cursor/skills`, or duplicate Cursor rule is packaged or installed.
- Register focused Snow/Cursor and Flow Status checks in the normal test entry.
- Update README/package guidance for flags, native paths, shared Skills, session identity,
  Snow project-Hook precedence, and unsupported exact native dispatch/lifecycle paths.

## Out of scope

- A generalized adapter SDK, resource merger, compatibility reader, or second update algorithm.
- Changes to the existing managed-resource ownership semantics merely to accommodate JSON files.
- New Snow/Cursor Skills, a Cursor rule, global Hook handling, a dispatcher, or identity aliases.
- Claiming released-Harness support not established by the linked runtime verification handoff.

## Useful inputs

- [Approved PRD](../prd.md) and [Design](../design.md)
- [Snow resource work](snow-native-resources.md)
- [Cursor resource work](cursor-native-resources.md)
- [Flow Status host work](flow-status-host-parity.md)
- [Accepted QbD advice](../qbd/design-audit-2.md), especially truthful capability and Hook
  precedence disclosure
- Existing `src/cli/{harness,index,init,update}.ts`, `tests/init-cli.test.ts`,
  `tests/omp-flow.test.ts`, and `README.md`

## Allowed code and output boundary

Implementation may edit only:

- `src/cli/harness.ts`
- init flag/help branches in `src/cli/index.ts`, preserving the linked Flow Status host semantics
- `src/cli/init.ts`
- `src/cli/update.ts` only if a focused test exposes a defect in its existing generic ownership
  path; otherwise leave it unchanged
- `tests/init-cli.test.ts`
- `tests/omp-flow.test.ts`
- a focused adapter integration test under `tests/` and fixtures needed only by that test
- `README.md`
- expected handoff: `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/cli-managed-resource-integration.md`

Canonical `templates/snow/**`, `templates/cursor/**`, and portable Flow Status/session files are
inputs, not this work's edit surface.

## Done conditions

- Harness normalization has one documented stable order including all five Harnesses; config
  validation rejects unknown values and round-trips Snow/Cursor without reordering drift.
- CLI flags, interactive defaults/choices, help, and non-interactive errors include Snow/Cursor.
  Conflicting init options, unknown flags, and missing Harness selection produce zero writes.
- Snow-only, Cursor-only, combined, and mixed selections deploy exactly their registered native
  files plus core/universal resources.
- Rendering substitutes the platform Python command in Snow event files and Cursor `hooks.json`
  while preserving valid JSON and project-relative script paths.
- Update tests cover unchanged, deleted, modified, and foreign files for both new native roots and
  prove existing backup/conflict behavior without merge.
- Resource parity covers every canonical template; package inspection contains the native files
  and contains no Snow/Cursor Skill duplicate or Cursor rule.
- README states that Snow project event files shadow same-event global rules, never promises exact
  native dispatch without proof, and labels unverified Cursor resume/subagent lifecycle paths as
  unavailable rather than silently supported.
- No new adapter framework, lifecycle store, topology field, or Markdown parser is introduced.

## Focused verification

- `npm test`, with `runInitCLITests` and the focused adapter managed-resource/update assertions
  invoked by the normal test entry
- `npm run build`
- `npm test`
- `npm pack --dry-run`
- A test-controlled invalid init invocation that snapshots the empty target before/after and proves
  zero writes.

## Expected handoff

[CLI and managed-resource integration handoff](handoffs/cli-managed-resource-integration.md) must
link back here, list exact files changed, report focused and integrated command results, enumerate
the installed/package resource set, and quote the README capability boundaries passed forward to
released-runtime verification and independent review.
