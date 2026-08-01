---
type: "QbD"
title: "Snow and Cursor adapter work-map audit"
---

# Snow and Cursor adapter work-map audit

## Audit result

- Verdict: **PASS**
- Risk: **MODERATE residual risk**
- Decision-critical blocking findings: **0**
- Actor ID: `snow_cursor_qbd2`
- Dispatch receipt: `0150f2b90a21415aa30c95e630be4c33`
- Audit scope: the five-work [implementation map](../work/index.md) challenged against the
  human-approved [PRD](../prd.md), [Design](../design.md), current
  [QbD 1 audit](design-audit-2.md), and [QbD 1 human decision](design-decision.md).

`PASS` means the current decomposition has no unresolved finding that makes the approved core
path unrealizable or materially unsafe. It is not human approval and does not authorize execution.

## Decision-critical assessment

No decision-critical blocker remains in the current work map.

The five Concepts collectively own every approved product surface: Snow templates and portable
session recognition, Cursor templates and explicit-context bridge, the closed Flow Status host
extension, shared CLI/managed-resource integration, and released-Harness evidence. Their authored
order is viable: the three disjoint canonical-resource items precede the shared CLI integration,
and released verification consumes an installed build. The only intentional production-file
overlap is `src/cli/index.ts` between Flow Status host parity and CLI integration; the map assigns
semantic ownership to the former and explicit later reconciliation to the latter. Optional overlap
in `tests/init-cli.test.ts` is similarly bounded by the later integration item. This does not
require concurrent edits to the same semantic contract.

The strongest potential material gap is exact Cursor native operation identity. The linked Cursor
research says `subagentStart` exposes a generated `subagent_id` but does not establish that the
caller can choose it before the strict assignment is authored. The Cursor work prohibits invented
IDs, post-hoc receipt rewriting, and unsupported correlation claims, while CLI documentation must
label unsupported exact-dispatch paths unavailable. Consequently a missing pre-dispatch proof can
degrade safely by rejecting or omitting the operation path without mixing actors, receipts, tasks,
or sessions. That preserves the install, shared Skills, Hooks, session isolation, managed-update,
and Flow Status outcomes, so the map is not blocked. The verification asymmetry with Snow remains
an advisory review risk below.

Released-runtime evidence is also not guaranteed on the current machine, especially for Cursor.
The verification Concept explicitly forbids manufacturing a passing result from absent tooling
and requires untested paths to remain unavailable. Absence of a runtime can therefore reduce the
supported capability claim without authorizing unsafe fallback. It does not make the bounded core
implementation unverifiable: fixture, deployed-runtime, ownership, package, and fail-closed tests
remain defined, while real-platform claims require captures.

## Evidence, assumptions, and counter-evidence

### Confirmed evidence

- [Snow native resources](../work/snow-native-resources.md) exclusively owns Snow templates,
  `SNOW_SESSION_ID` recognition in the canonical portable runtime, Snow fixtures, and the explicit
  omit-or-reject boundary for native role paths without exact identity proof. It does not edit the
  live deployed runtime coordinating this Bundle.
- [Cursor native resources](../work/cursor-native-resources.md) exclusively owns Cursor templates,
  requires documented `conversation_id`, rejects empty or conflicting identities, tests two
  isolated contexts through a temporary deployed runtime, and forbids a project-global fallback.
- [Flow Status host parity](../work/flow-status-host-parity.md) owns both canonical and tracked Skill
  copies, the TypeScript and canonical Python closed host sets, and runtime-evidence host selection.
  It explicitly rejects Harness config order and requires absent/conflicting evidence to be
  unavailable.
- [CLI and managed-resource integration](../work/cli-managed-resource-integration.md) follows the
  canonical resources, owns registration/rendering/config/help/update/package/documentation tests,
  and must prove zero writes on argument failure plus unchanged generic hash ownership. It is also
  the named reconciliation point for the shared `src/cli/index.ts` surface.
- [Released-Harness verification](../work/released-harness-verification.md) follows an installed
  artifact, may not repair product source, records provenance and untested combinations, and sends
  implementation defects back to the owning Work rather than silently changing them.
- The work-map coverage table accounts for PRD requirements 1 through 9 and the Design's Flow
  Status extension. The map also carries the QbD 1 advice on Snow card truthfulness, Hook
  precedence disclosure, Cursor lifecycle capture, documented Cursor identity, and runtime-based
  host selection.
- Every Work has an explicit code/output boundary, focused done conditions and commands, and a
  linked handoff destination. The map reserves the full `compileall`, build, test, pack dry-run,
  and `git diff --check` suite for integrated verification.

### Assumptions carried into execution

- The existing generic managed-resource renderer and updater need extension/registration but no
  semantic rewrite; the CLI work permits `src/cli/update.ts` changes only if a focused test exposes
  a defect.
- Sequential execution will preserve Flow Status semantics when the later CLI integration edits
  adjacent `src/cli/index.ts` branches and will reconcile any necessary shared test-fixture change.
- A released Snow and/or Cursor runtime may be unavailable on one or more claimed platforms. Such
  absence narrows documentation claims instead of satisfying the real-platform matrix.
- Independent review will evaluate the current handoff revision of each Work; a downstream
  verification result that exposes a product defect returns to the owning Work and is not treated
  as acceptance of the earlier revision.

### Strongest counter-evidence

- [Cursor research](../research/cursor.md) establishes native `subagent_id` visibility at
  `subagentStart`, but not a caller-selected identity before assignment submission. The released
  verification matrix names exact Snow operation correlation explicitly while its Cursor matrix
  concentrates on session lifecycle. A reviewer could therefore receive strong session evidence
  without an equally explicit Cursor operation-correlation result.
- The CLI documentation handoff necessarily precedes released-runtime verification. Its done
  conditions correctly label unverified Cursor resume/subagent paths unavailable, but later
  positive or negative evidence can make that text stale until the CLI work is revised and
  reviewed again.
- Flow Status and CLI integration both permit edits in `src/cli/index.ts`, and may both touch
  `tests/init-cli.test.ts`. Parallel execution without respecting the authored handoff order would
  create an avoidable reconciliation risk, although the current map already assigns the later
  integration owner.

### Accepted risk and closed findings

- The human accepted QbD 1's moderate residual risk and approved decomposition without changing
  the Design. Snow role paths may be omitted or made visibly unavailable when exact identity is
  unprovable; Cursor lifecycle paths may remain unavailable without released-runtime proof.
- Snow project Hook files shadow same-event global rules. Global Hook merging remains outside
  scope, and the work map carries user-visible disclosure plus exact-file ownership rather than
  adding composition machinery.
- No duplicate Snow/Cursor Skill tree, generalized Harness identity framework, custom dispatcher,
  lifecycle state, generated context, receipt alias, or Markdown semantic parser is authorized.

## Advisory observations

1. **Make Cursor exact-dispatch disposition explicit in its handoff and released verification.**
   The Cursor Work already forbids false correlation, but its done conditions should be read as
   requiring each native role path to record either a pre-dispatch `native item ID = actorId`
   proof or explicit unavailability/omission. The released matrix should capture this alongside
   Snow identity, rather than treating `subagentStart` fixture coverage as identity proof. This is
   non-blocking because visible rejection or omission is an approved safe degradation.

2. **Respect the authored shared-file order during execution and review.** Flow Status host parity
   should land before CLI integration reconciles `src/cli/index.ts` and any shared init test. The
   integration reviewer should inspect the resulting combined semantics, not only the last textual
   diff. This is a coordination refinement; ownership and later reconciliation are already stated.

3. **Close the documentation loop after real-runtime evidence.** If released verification changes
   any supported/unavailable claim, return the smallest README/package correction to CLI
   integration and independently review that current revision before integration acceptance. The
   verification Work already authorizes this return path, so the observation clarifies the done
   boundary rather than adding scope.

4. **Keep integrated verification attached to the final current revisions.** The Work-level
   focused commands are sufficient for bounded handoffs, while the work-map's complete
   `compileall`, build, test, pack dry-run, and `git diff --check` set should be run only after any
   verification-driven rework has landed. Earlier green results should not stand in for the final
   integrated tree.

## Residual risk

The main residual risk is capability overstatement across a multi-work handoff: static Cursor
cards or fixture-successful Hooks could be mistaken for proven native operation/lifecycle support,
and released evidence can invalidate documentation authored one Work earlier. The mapped
fail-closed rules, explicit unavailability language, return-to-owner path, and final integrated
verification contain material harm. The remaining risk is therefore moderate and reviewable, not
a blocker to execution after human calibration.

## Exact next decision

The human must choose one of these options:

1. **Approve QbD 2 PASS and proceed to Execute**, accepting the moderate residual risk and carrying
   the four advisory review conditions into implementation, handoffs, and independent reviews.
2. **Revise the work map before Execute**, most narrowly by making Cursor exact-identity evidence
   and post-runtime documentation reconciliation explicit done conditions; then decide whether the
   change warrants another scoped challenge.
3. **Narrow or defer one Harness or one native capability**, preserving the remaining approved
   work and its fail-closed boundaries.
4. **Stop the task** without implementation.

No option is selected by this model verdict.
