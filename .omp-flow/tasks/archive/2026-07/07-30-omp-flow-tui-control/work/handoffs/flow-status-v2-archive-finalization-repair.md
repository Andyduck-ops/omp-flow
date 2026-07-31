---
type: "Handoff"
title: "Flow Status v2 archive-finalization Review repair"
---

# Flow Status v2 archive-finalization Review repair

Status: `DONE`

## Correlation

- operation: `9e57c649320249e6947acf55ac64b9de`
- actor: `executor-flowstatus-v2-archive-finalization-repair`
- predecessor review: `cf267086c2f9432c9896c47d104a5315`
- source:
  [archive-finalization Review](../../review/flow-status-v2-archive-finalization.md)
- repaired predecessor handoff:
  [archive-finalization handoff](flow-status-v2-archive-finalization.md)

## Bounded repair

Only the two findings in the source Review were changed.

### Repository-root code-form fragments

The archive checker now preserves both path and optional fragment for inline code-form
repository-root Wiki references. It URL-decodes each component, confines the normalized path to
`.omp-flow/wiki/`, and sends the fragment through the same `validateHeadingFragment()` and
GitHub-compatible `headingAnchors()` path used by ordinary Markdown links.

The focused adversary parses an encoded missing fragment, proves it becomes
`missing-archive-anchor`, and proves the shared validator rejects it. Fenced examples remain
examples rather than navigational references. The demonstrated historical reference in
`qbd/qbd-1/flowstatus-audit.md` now targets the current `claude-code` heading instead of the
nonexistent `integration-boundary` anchor.

### Current finalization evidence

The older accepted product repair remains required as product evidence. In addition, the checker
always validates the original archive-finalization handoff and its correlated independent Review.
Before review, simulate mode may stage this repair handoff and validates its exact operation,
actor, predecessor Review, and source link when present.

Post-move mode additionally requires both:

- `work/handoffs/flow-status-v2-archive-finalization-repair.md`; and
- `review/flow-status-v2-archive-finalization-repair.md`.

The final Review must carry a usable operation receipt and verdict, link this exact handoff, name
this completed predecessor receipt and actor, use a different reviewer actor, and be `ACCEPTED`.
A missing, stale, uncorrelated, same-actor, or `CHANGES_REQUESTED` final Review cannot certify the
real archive.

This repair did not change product code, copy or archive the Bundle, or commit.

## Verification

- `node tests/flow-status-v2-archive-finalization.test.mjs --mode simulate`
  - PASS: 562 Markdown links, 22 repository-external targets, 104 heading anchors,
    missing-fragment adversary
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks`
  - PASS
- `npm run build`
  - PASS
- `npm test`
  - PASS: archive simulation plus 271 focused checks
- `npm pack --dry-run --json`
  - PASS: 113 entries
- `git diff --check`
  - PASS (only existing line-ending notices)

Fresh independent review should write
`review/flow-status-v2-archive-finalization-repair.md`; the final archive operation must then run:

```text
node tests/flow-status-v2-archive-finalization.test.mjs --mode post-move
```
