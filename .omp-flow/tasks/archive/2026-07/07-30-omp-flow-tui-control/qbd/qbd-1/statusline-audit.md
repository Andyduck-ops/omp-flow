---
type: "QbD Audit"
title: "QbD 1: omp-flow embedded status line"
---

# QbD 1 audit: omp-flow embedded status line

## Verdict

**FAIL**

The revised product direction correctly responds to the user: the primary Claude surface is a
compact embedded status line, not the retired full-screen console, and the design keeps authored
meaning, mechanical receipts, native work progress, context pressure, and attention conceptually
separate. The Claude host shape is supported by its documented command status-line contract.

However, the current PRD and design cannot yet satisfy their own cross-Harness acceptance criteria.
They promise a Codex `/omp` surface that the cited current Codex extension model does not establish,
and snapshot v1 leaves the live-observation, freshness, and scope contracts too incomplete to prove
that a rendered bar or cached action hint is safe. These are QbD 1 blockers, not implementation
details. This model verdict is not human calibration or implementation authorization.

## Blocking findings

### 1. The promised Codex `/omp` product surface is not supported by the cited host contract

The [PRD outcome](../../prd.md#outcome), [R6](../../prd.md#r12--read-only-status-and-native-drill-down),
[R8](../../prd.md#r10--codex-and-oh-my-pi-capability-gating), and
[acceptance criterion 9](../../prd.md#acceptance-criteria) require an in-Harness `/omp` command and
say it “remains usable” when persistent footer embedding is unavailable. The
[design product shape](../../design.md#product-shape) and
[Codex adapter](../../design.md#codex-and-oh-my-pi-adapters) likewise treat `/omp` as an available
host surface.

Current official Codex documentation establishes built-in slash commands, including
`/statusline`, whose picker persists an ordered set of built-in identifiers to `tui.status_line`.
It does not establish arbitrary third-party footer items or an arbitrary plugin-owned `/omp`
command. The documented legacy custom-prompt path is explicitly deprecated and uses the
`/prompts:<name>` namespace; reusable skills use their own invocation surface. See the
[Codex CLI slash-command documentation](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli)
and the Bundle's own [status-line synthesis evidence boundary](../../research/statusline-synthesis.md#evidence-boundaries-and-residual-risks).

This makes the design asymmetric in a different way than it claims: it truthfully refuses to fake
a Codex footer, but then assumes another unsupported native command. Consequently, the first
release cannot deliver the PRD's “while working in ... Codex” glance-and-drill-down outcome as
written.

Required remediation:

- Name a documented, installable current Codex extension surface and use its real invocation
  semantics, or explicitly remove/narrow the Codex `/omp` promise and its acceptance criterion.
- Add an acceptance fixture that starts from an unmodified supported Codex installation and proves
  discovery/invocation of the chosen surface. Capability probing cannot manufacture a surface that
  the host does not expose.

### 2. Snapshot v1 is not a complete implementable contract for live facts

The [snapshot envelope](../../interfaces/statusline-snapshot-v1.md#closed-envelope) references
`ActivityObservation`, `AttentionObservation`, and `SourceHealth`, but the interface defines those
only in prose. It does not close their fields, identifiers, bounds, health-to-observation
correlation, or unknown-field behavior. The same document requires a “current scope/revision” for
progress while providing no independently authoritative current scope/revision against which the
renderer can check the producer's claim.

This blocks deterministic validation of malformed, unbound, scope-changed, attention-ordering, and
source-health fixtures promised by the
[design verification section](../../design.md#verification-strategy). It also leaves multiple observations
from the same Harness unable to identify which health record governs which progress/activity fact.

Required remediation:

- Complete the normative v1 schemas for activity, attention, and source health, including closed
  discriminants, correlation keys, numeric/string/count limits, and fail-closed behavior.
- Define how the renderer obtains and compares the authoritative repository, session, native
  target, scope, and revision identities. A source's self-asserted `scope` and `revision` are not
  sufficient evidence that the observation still belongs to the current render.

### 3. No source-owned native progress contract proves the meaning of either eligible work bar

The [design progress selection](../../design.md#flowstatussnapshot-v1) permits `nativePlan` and
`nativeTaskGroup`, while the
[snapshot progress measure](../../interfaces/statusline-snapshot-v1.md#progress-measures) carries
generic numbers and labels. Neither artifact defines the Harness-specific observation contract
that owns group membership, terminal/completed semantics, plan revision, or denominator stability.

This is material because Claude's documented status-line stdin supplies session, model, context,
cost, workspace, and related host facts, but not a native plan/task-group denominator; see
[Claude's available status-line data](https://code.claude.com/docs/en/statusline#available-data).
Codex's built-in footer also does not supply an omp-flow work denominator. The assembler therefore
has no justified first-release source from which it can accept either bar without risking a locally
reconstructed percentage.

Required remediation:

- For every eligible work-bar kind in the first release, identify the public Harness producer and
  define its source-owned scope, revision, membership/completion semantics, observation trigger,
  and invalidation behavior.
- Remove any eligible kind for which that contract cannot be evidenced. A release with honest
  receipt counts, activity, and context but no work bar is preferable to an unowned denominator,
  though it would require recalibrating the user's stated progress-bar outcome.

### 4. Freshness and bounded hot-path safety are stated but not yet testable

The [freshness/cache design](../../design.md#producer-and-cache) leaves the future-skew tolerance,
adapter TTL bounds, snapshot size, per-scope cache bound, and behavior after host clock rollback
undefined. The [installation design](../../design.md#installation-coexistence-and-removal) also proposes
Claude command composition without specifying the prior-command timeout, stdout/stderr byte and
line bounds, stdin fan-out behavior, or Windows shell/quoting contract. “Trusted,” “bounded,” and
“where safe” are not executable thresholds.

Those omissions prevent the promised deadline, staleness, Windows, coexistence, and corrupt/hostile
fixture tests from proving the requirements rather than merely exercising examples.

Required remediation:

- Specify numerical input/output/cache/TTL/skew/deadline bounds and the exact cold/warm test
  conditions.
- Define a platform-neutral composition contract, including one captured stdin payload, child
  deadlines, output truncation, failure isolation, quoting/path handling, and exact restoration
  ownership on Windows and POSIX hosts.

## Non-blocking strengths

- [R2](../../prd.md#r6--honest-task-set-and-task-local-progress),
  [R5](../../prd.md#r6--honest-task-set-and-task-local-progress), and
  the [progress measure](../../interfaces/statusline-snapshot-v1.md#progress-measures) correctly keep
  receipt counts out of work-progress bars and label context separately.
- The [control safety rules](../../interfaces/statusline-snapshot-v1.md#cache-and-action-safety) correctly
  make snapshots display-only and require live adapter revalidation before mutation.
- The cache is explicitly reconstructable presentation state rather than task meaning, and the
  design rejects Markdown parsing, workflow phase inference, semantic ledgers, and receipt mutation.
  No omp-flow ownership violation is required by the selected direction.
- Width tiers, line limits, ASCII fallback, and display-column truncation give compactness a sound
  test direction once the remaining normative limits are supplied.

## Gate

Repair the linked PRD, design, synthesis if its product promise changes, and snapshot interface,
then run a fresh independent QbD 1 audit. Human calibration is required after that audit before
decomposition.
