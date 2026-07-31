---
type: "QbD Audit"
title: "QbD 1: ccstatusline-informed embedded status line"
---

# QbD 1 audit: ccstatusline-informed embedded status line

## Verdict

**FAIL**

The ccstatusline-informed product direction is substantially better aligned with the requested
surface than the retired operator console: one compact default line, a bounded omp-flow segment,
manual coexistence with an existing compositor, honest current Codex asymmetry, and no
transcript/credential/private-API dependency. The [PRD](../../prd.md),
[design](../../design.md), [selected synthesis](../../research/statusline-synthesis.md),
[snapshot contract](../../interfaces/statusline-snapshot-v1.md), and
[segment contract](../../interfaces/statusline-segment-v1.md) nevertheless contain four blocking
contract inconsistencies. They prevent an implementation and its golden tests from proving that
the displayed plan belongs to the current turn, that the one visible bar has unambiguous meaning,
that narrow layouts retain the same facts in the same order, and that both accepted host-payload
shapes cross a closed trust boundary.

This is an independent model verdict, not human calibration or implementation authorization. The
[prior PASS](statusline-audit-2.md) evaluated a superseded revision and cannot approve the current
compositor/profile design.

## Blocking findings

### 1. The snapshot cannot prove the promised exact Codex thread/turn binding

The design says the only first-release work bar is a live Codex
`turn/plan/updated` measure scoped to the exact `(threadId, turnId)`, and the snapshot contract says
a `codexPlan` is accepted only when bound to the current Codex thread/turn. The plan measure carries
`threadId` and `turnId`, but
[`RenderScope`](../../interfaces/statusline-snapshot-v1.md#closed-envelope) carries only repository,
host, host session, selected task, and receipt digest. `SourceHealth` also lacks a current native
thread/turn binding. There is therefore no contract field against which the renderer or assembler
can test the claimed equality. A fresh plan from another turn in the same host session can satisfy
the written schema.

The same envelope duplicates selected-task identity as `task.id` and
`renderScope.selectedTaskId` without stating their required equality. That leaves a second
identity ambiguity in the most important retained segment.

Required remediation:

- add a closed native render binding, or an equivalent source-specific scope, that supplies the
  current Codex `threadId` and `turnId`;
- require exact equality among that binding, the live source, and every `codexPlan`, and define
  behavior when the host cannot establish a current turn;
- state the invariant between `task.id` and `renderScope.selectedTaskId`; and
- add wrong-thread, wrong-turn, missing-current-turn, session-reuse, and task-identity mismatch
  fixtures.

### 2. The one-bar rule, examples, and context denominator disagree

The [progress selector](../../design.md#flowstatussnapshot-v1) says a fresh `codexPlan`
wins and `contextBudget` becomes only a compact numeric fact when work progress exists. The compact
and standard examples in both the design and
[synthesis](../../research/statusline-synthesis.md#intended-visible-effect) instead draw a
graphical `ctx` bar while also showing `3/5`. Those examples make context look like the selected
bar even though a qualifying work measure is present, and they never demonstrate the requested
work-progress bar. [PRD acceptance criterion 2](../../prd.md#acceptance-criteria) requires three of
five progress units, but does not resolve whether that means a graphical bar, a ratio, or both.

In addition, the [`contextBudget`](../../interfaces/statusline-snapshot-v1.md#progress-measures)
union fixes `total: 100` but never defines whether `current` means context used, context remaining,
or pressure after normalization. A label such as `ctx 42%` and its fill direction are therefore
not portable or testable across host fields with opposite orientation.

Required remediation:

- normatively define context orientation, numerator, fill direction, rounding, and source-field
  mapping;
- choose one exact visual rule: when a valid Codex plan exists, show the work bar and at most a
  numeric context fact; otherwise allow the context bar;
- repair every compact, standard, expanded, narrow, Unicode, and ASCII example to follow that
  rule; and
- make acceptance fixtures assert both the selected bar kind and the absence of a second bar.

### 3. Profile and width-retention priorities are not canonical

The PRD's [R4](../../prd.md#r9--two-powerline-lines) retains compact model/Git/context before
activity and operation counts. The synthesis's
[status-line content budget](../../research/statusline-synthesis.md#status-line-content-budget)
does the opposite. The design then requires the shortest action hint to survive its fourth
compaction step, while the compact and wide examples omit that hint and the PRD priority list does
not place it. These are not merely visual-order differences: at 80, 60, and unknown width they
produce different decisions about whether host identity, activity, operations, or an action hint
is removed.

Consequently, the promised golden tests cannot have one authoritative expected output, and the
claim that compact mode will not feel crowded is not falsifiable from the current artifacts.

Required remediation:

- define one normative retention matrix covering segment eligibility and priority for
  `compact`, `standard`, and `expanded`;
- place the action hint explicitly, including whether it may disappear at narrow widths;
- define the retained facts and line allocation at 160, 120, 100, 80, 60, and unknown columns;
- make the PRD, synthesis, design examples, `+N` counting rule, and golden-test expectations refer
  to that same matrix; and
- preserve semantic priority independently from left/right visual placement.

### 4. Host-payload acceptance is not yet a deterministic closed contract

The segment contract has a good default-deny intent: a minimal `SegmentInputV1` rejects unknown
fields, while a ccstatusline Custom Command payload allowlists only
`workspace.current_dir`, `session_id`, and `terminal_width` and ignores private fields. It does not,
however, define how the parser distinguishes the two shapes or which branch wins for a hybrid
payload. Without a discriminator and precedence rule, unknown-field behavior is
implementation-dependent.

The standalone path is less closed. The
[input and trust-boundary design](../../design.md#source-ownership-and-binding) permits documented
model, width, context, cost, and duration fields, but no interface specifies their exact JSON paths,
types, length/range bounds, normalization, presence states, or context orientation. Repository/Git
presentation input is likewise described in prose rather than as a bounded normalized value.
This leaves the full renderer unable to prove the same closed-input and redaction guarantees that
the omp-only segment promises.

Required remediation:

- define an explicit discriminator and precedence rule for minimal v1 versus ccstatusline-style
  input, including hybrid and future-field fixtures;
- add a closed standalone host-presentation input contract with exact allowlisted fields, bounds,
  normalized meanings, and presence/error behavior;
- define the normalized bounded Git presentation result separately from task meaning;
- state which raw input bytes or parsed fields may reach logs, caches, errors, and debug output;
  and
- retain the current prohibition on transcript reads, account/credential discovery, private
  usage calls, network access, and arbitrary child-command execution.

## Non-blocking assessments

### Product fit and coexistence

The default one-line shape, conditional second line only for `expanded`, bounded `--segment`
output, whole-segment removal before truncation, separator repair, and optional cost/duration are
appropriate responses to the crowding concern. The design correctly treats
[ccstatusline research](../../research/ccstatusline.md) as presentation evidence rather than a
semantic dependency. An occupied Claude `statusLine` remains byte-for-byte unchanged, manual
composition is explicit, and uninstall ownership is narrow.

### Current Codex limitation

The design no longer promises an unsupported third-party Codex footer. It truthfully reports
persistent parity unavailable, leaves `tui.status_line` unchanged, and routes omp-flow detail
through `$omp-flow-status` or the direct inspector. This asymmetry is a product limitation, not a
design defect.

### Ownership, cache, and action safety

No lifecycle database, Markdown parser, inferred phase, approval state, or receipt-derived overall
percentage is introduced. Snapshot and Git caches are bounded, expiring, reconstructable, and
display-only. Warm/cold/deadline targets, maximum input/output sizes, and Windows verification are
specific enough for implementation planning. Cached output does not authorize attach, interrupt,
stop, or receipt mutation.

These strengths remain valid, but they do not compensate for the blocking scope, denominator,
priority, and input-contract gaps above.

## Gate

Return the four blockers to the owning synthesis, PRD, design, and interface Concepts. After the
artifacts agree and the new fixtures are specified, run a fresh independent QbD 1 audit. Only a
fresh model verdict followed by an explicit linked human decision can authorize decomposition.
