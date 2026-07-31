---
type: "Review"
title: "Flow Status v2 archive finalization review"
---

# Flow Status v2 archive finalization review

Verdict: **CHANGES_REQUESTED**

## Subject and correlation

This independent review is limited to the reopened
[completion audit](../completion.md), the linked
[archive-finalization handoff](../work/handoffs/flow-status-v2-archive-finalization.md), its
deterministic checker, and the repaired archive-sensitive documentation.

- review operation: `cf267086c2f9432c9896c47d104a5315`
- reviewer actor: `reviewer-flowstatus-v2-archive-finalization`
- completed predecessor: `d76ca52ea0d246b399190458f278ef95`
- predecessor actor: `executor-flowstatus-v2-archive-finalization`
- predecessor output:
  `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/flow-status-v2-archive-finalization.md`

The runtime records prove that the predecessor is completed, the actors differ, and this Review
is bound to the supplied output. I inspected the checker, the repaired Wiki/Bundle references,
the exact active and dated archive paths, and the stable fixture tier. I ran the independent
simulate and normal repository gates. I did not modify product code or documentation.

## Findings

### High — repository-root code-form heading fragments are discarded, allowing a real broken anchor to pass

The checker correctly resolves fragments from ordinary inline Markdown links, but
`repositoryRootMarkdownReferences()` captures only the `.md` path and drops its optional
`#fragment` (`tests/flow-status-v2-archive-finalization.test.mjs:98-101`). Its audit loop then
checks only `fs.existsSync(targetPath)` and never calls `headingAnchors()` for those repository-root
references (`lines 189-195`).

This is not theoretical. The Bundle contains:

```text
.omp-flow/wiki/architecture/harness-flow-statusline.md#integration-boundary
```

at `qbd/qbd-1/flowstatus-audit.md:90`, while the target Wiki currently has no
`Integration boundary` heading or explicit `integration-boundary` anchor. The independent
simulate run nevertheless reports:

```text
PASS: archive simulate; 557 Markdown links, 22 repository-external targets, 103 anchors
```

Thus the reported repository-external/anchor coverage is a false green against the explicit
requirement to validate every repository-external Markdown target and linked
GitHub-compatible heading anchor. Preserve and decode the fragment for code-form repository-root
references, validate it with the same GitHub-compatible slug set, and repair or deliberately
retarget the stale reference. Add a focused adversary proving a missing code-form fragment fails.

### High — final-mode evidence is hard-coded to the prior product repair, not the archive-finalization handoff and Review

The checker requires only:

- `work/handoffs/flow-status-v2-repair-2.md`; and
- `review/flow-status-v2-implementation-3.md`

at `tests/flow-status-v2-archive-finalization.test.mjs:268-277`. It does not require the current
archive-finalization handoff, its operation correlation, or this independent archive-finalization
Review. After the actual move, `--mode post-move` could therefore pass with the finalization
handoff absent or uncorrelated and with its Review missing or `CHANGES_REQUESTED`, as long as the
older product Review remains accepted.

The older product handoff/Review are valid implementation evidence, but they are no longer the
latest finalization handoff/Review boundary named by this operation. Make final mode require
`work/handoffs/flow-status-v2-archive-finalization.md` and its linked different-actor accepted
Review, while retaining the product repair evidence if desired. The normal pre-review simulate
path may distinguish staged evidence from the final post-move requirement; it must not let the
post-move gate certify stale evidence.

## Positive evidence

- The checker maps the active physical Bundle to the exact logical dated destination
  `.omp-flow/tasks/archive/2026-07/07-30-omp-flow-tui-control` without copying a second authored
  Bundle, and its mode preconditions reject simultaneous active/archive copies.
- All 11 identified depth-sensitive Wiki references in the completion blocker are now
  repository-root code-form paths.
- Both durable Wiki pages contain exactly one dated archive backlink and no active-task backlink.
- The five historical fixture references name `tests/fixtures/flow-status/`, both stable JSON
  payloads exist, and the Bundle contains no copied JSON payload tier.
- Ordinary Bundle-local/repository-external inline links and their 103 captured fragments pass
  the simulated archived-depth resolution. The first finding is limited to the separate
  code-form repository-root fragment path.

## Independent commands and results

Passed:

- `node tests/flow-status-v2-archive-finalization.test.mjs --mode simulate` —
  557 Markdown links, 22 repository-external targets, 103 captured anchors
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks`
- `npm run build`
- `npm test` — archive simulate plus `PASS: 271 focused checks`
- `npm pack --dry-run --json` — 113 entries
- `git diff --check` — exit 0, line-ending warnings only

Not executed:

- `--mode post-move`, because the Bundle is intentionally still active and the real atomic
  archive is outside this reviewer operation. Static inspection confirms the mode maps the same
  logical paths to the moved tree and does not create a copy, but the stale final-evidence
  requirement above prevents acceptance of that mode's contract.

## Scope and preservation

- No product code, documentation, task placement, archive move, or commit was changed by this
  reviewer.
- The product implementation remains accepted by
  [Flow Status v2 second bounded repair review](flow-status-v2-implementation-3.md); these
  findings concern only the archive-finalization checker.
- Existing unrelated user changes and ignored runtime/cache state remain untouched.

## Required repair boundary

Return only the archive-finalization boundary to an executor:

1. preserve and validate repository-root code-form heading fragments and repair the demonstrated
   stale `integration-boundary` target; and
2. make final post-move evidence require the archive-finalization handoff and its linked accepted
   independent Review instead of certifying only the previous product repair.

Then rerun simulate/full gates and obtain a fresh different-actor archive-finalization Review
before recording completion or moving the Bundle.
