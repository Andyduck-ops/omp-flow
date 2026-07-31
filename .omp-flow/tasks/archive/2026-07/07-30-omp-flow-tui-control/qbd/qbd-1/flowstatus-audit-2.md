---
type: "QbD Audit"
title: "QbD 1: repaired Harness-native FlowStatus"
---

# QbD 1 audit: repaired Harness-native FlowStatus

## Verdict

**FAIL**

The repair resolves most blockers in the
[prior audit](flowstatus-audit.md). The selected
[synthesis](../../research/flowstatus-synthesis.md) and
Wiki direction at `.omp-flow/wiki/architecture/harness-flow-statusline.md` now reject Custom
Command, consistently use `flow-status`, and describe the current Oh My Pi limitation. The
[PRD](../../prd.md) and [design](../../design.md) now distinguish a retention-guaranteed
single-widget second line from best-effort one-line placement. The
[detail-surface contract](../../interfaces/flow-status-detail-surface.md) closes the managed Codex
Skill and direct CLI behavior. Task-set availability, ephemeral membership, literal role mapping,
and assignment/progress producer inputs also have dedicated interface Concepts.

Three current blockers remain. The native capability descriptions still do not establish the
exact public observations needed to produce an available task set, membership digest
canonicalization and progress/assignment revision equality are not fully closed, the normalized
snapshot type still admits role/position combinations forbidden by the mapping, and the PRD
outcome still promises ambient cross-Harness status that its own first-release capability rules
explicitly do not provide.

This is an independent model verdict, not human calibration or implementation authorization.

## Current blockers

### 1. Available task-set and progress production is not yet deterministic end to end

The new
[source observation union](../../interfaces/flow-status-source-observation-v1.md#task-set-union)
correctly represents `available` versus `unsupported`, `incomplete`, `stale`, `malformed`, and
`disconnected`. It bounds the ephemeral member list, requires an explicit complete set, validates
the current task against membership, stores only aggregate counts plus a digest, and discards the
list. The snapshot correctly removes current task and progress when the set is unavailable.

The remaining gap is between a real Harness event stream and that closed observation. The three
capability descriptions are requirements in prose, not exact versioned native mappings:

- `claudeTaskSetV1` names “documented task/subagent lifecycle events” but does not identify the
  accepted event names, payload fields, continuity/completeness marker, revision, or terminal-state
  translation. The linked repository research explicitly says the currently configured Claude
  hooks do not establish progress or stop observations.
- `ompTaskBatchV1` similarly refers to “supported events” without the exact batch-completeness and
  terminal-result contract. The current extension evidence establishes dispatch interception, not
  a complete result stream.
- `codexPlanV1` names the exact `turn/plan/updated` source and statuses, but the source observation
  does not retain the current thread/turn scope used to reject a same-session plan from a different
  turn.

An implementation can therefore make an available fixture pass by constructing the normalized
observation directly without proving that the installed Harness supplied a complete current set.
Unsupported behavior is honest, but it does not establish the positive source required for the
product's task counts.

Two normalized equalities are also underspecified:

- `membershipDigest` is described as a hash of “ordered normalized `(taskId,state)` pairs,” but
  the canonical member order, serialization, hash algorithm, encoding, and digest shape are not
  defined. Independent producers can emit different digests for the same membership.
- `ProgressObservation.assignmentId` is nullable, while the design invalidates progress on
  assignment mismatch and acceptance criterion 5 tests a wrong assignment. The contract does not
  state the conditional invariant that it must equal the current assignment when one exists and
  must be null only when no assignment is current. `unitSetRevision` is validated at producer
  input but is absent from `TaskProgress`; no rule requires `sourceRevision` to change whenever the
  unit set or denominator changes.

Required remediation:

- for every capability claimed positive in v1, pin the public Harness/API revision and exact native
  event or response fields, scope identities, completeness/continuity signal, state mapping, and
  invalidation rules; leave capabilities without that evidence explicitly unsupported;
- include exact Codex thread/turn binding in the source observation or narrow `codexPlanV1` to a
  contract that proves it equivalently;
- define deterministic membership digest canonicalization, algorithm, encoding, and bounds; and
- close the assignment/progress conditional equality and either retain `unitSetRevision` in the
  snapshot or require a source revision change whenever the unit set or denominator changes.

### 2. The normalized snapshot still admits forbidden role/position values

The literal input vocabulary and table are now correct:
[`executor`](../../interfaces/flow-status-source-observation-v1.md#exact-methodology-labels) maps
to Implement; reviewer, researcher, architect, `qbd-auditor`, and planner have one exact label; and
`explore`, `oracle`, and `orchestrator` are presentation-neutral. Unknown native roles are
malformed.

The output contract does not encode that same closure.
[`CurrentAssignment`](../../interfaces/flow-status-snapshot-v1.md#envelope) types `role` as an
arbitrary string and allows methodology positions `Framing` and `Integrate`, although neither can
be produced by the v1 table. It also permits any listed role to pair with any position. Prose says
the producer uses the table, but a closed snapshot validator or fixture cannot derive that
constraint from the declared union.

This leaves acceptance criterion 4 vulnerable to precisely the normalization ambiguity the first
audit identified: for example, an `executor`/`Integrate` or `oracle`/`Research` snapshot fits the
shown serialized type even though both are forbidden.

Required remediation:

- type `role` as the exact v1 literal union;
- remove unreachable `Framing` and `Integrate` positions unless exact input roles are added and
  justified; and
- make validation enforce the complete role-to-position pair as a discriminated union or
  equivalent table refinement, including neutral and unknown-role fixtures.

### 3. The PRD outcome still overclaims ambient Codex and Oh My Pi presentation

The repaired synthesis and adapter contracts are truthful:

- Claude owns the ambient visual surface through the ccstatusline widget;
- current Codex has no third-party persistent footer and supplies only the managed
  `$flow-status` on-demand Skill; and
- the currently owned Oh My Pi API supplies neither status nor command registration, so direct
  `omp-flow status inspect` is its only designed detail path.

The [PRD outcome](../../prd.md#outcome) nevertheless says that while working in Claude Code, Codex,
or Oh My Pi a developer can “glance at the Harness's normal status surface” and see the flow
facts. [R1](../../prd.md#r1--shared-facts-native-presentation) likewise groups Codex and Oh My Pi
under native presentation adapters without stating that neither has an ambient first-release
surface. Those claims conflict with
[R10](../../prd.md#r10--codex-and-oh-my-pi-capability-gating) and acceptance criteria 12–13.
An explicitly invoked Skill or direct CLI inspection is truthful drill-down, but it is not a
persistent glanceable status surface.

Required remediation:

- narrow the first-release outcome to ambient Claude/ccstatusline presentation plus on-demand Codex
  Skill and Oh My Pi CLI detail; or
- supply positive public native status evidence and a newly audited adapter contract before
  claiming ambient parity.

The current negative-capability behavior itself should remain unchanged.

## Reassessed areas with no current blocker

### Selected direction and presentation fit

The current synthesis, design, and Wiki consistently select one native ccstatusline
widget/provider and explicitly reject Custom Command because of its full-payload, inherited
environment, and shell-execution boundary. The current artifacts consistently use
`$flow-status` and direct `omp-flow status inspect`; stale `$omp-flow-status` naming no longer
appears in the selected direction.

The guaranteed profile places exactly one Flow Status widget on its own second line, allowing
ccstatusline to allocate the measured line width directly to it. One-line placement is explicitly
best-effort. The compaction order first converts graphical progress to a ratio and preserves
blocking attention, task-local progress ratio, then task-set ratio as the final atomic facts.
Unknown width uses a tested 20-column ASCII budget, and final-composition fixtures cover the
complete pinned ccstatusline output rather than only widget text. This closes the prior retention
blocker without creating a parallel renderer.

### Meaning and ownership

Task-set completion and current-task progress have separate labels, sources, revisions, and
denominators. Context, cost, duration, tokens, Git, receipts, elapsed time, filenames, and Markdown
cannot move either measure. Methodology labels describe only the explicit current assignment and
do not assert lifecycle phase, prior completion, next work, QbD PASS, acceptance, or human
approval.

Built-in examples inject no `OMP`, `omp:`, logo, Bundle shorthand, or command prefix. The widget
reuses ccstatusline's existing manifest, editor, Powerline themes, flex layout, separator repair,
and semantic-empty line suppression; no branded parallel UI or general plugin framework is
introduced.

### Detail, installation, security, and portability

The Codex Skill contract now fixes its canonical source, project deployment paths, invocation,
read-only command, discovery, idempotence, conflict handling, and exact-owner removal. Current Oh
My Pi negative capability is explicit and testable, with no false `/flow-status` fallback.

Cache, source, input/output, freshness, deadline, scope-count, eviction, UTF-8, display-column,
ASCII, and Windows requirements are bounded. Presentation remains read-only and cannot authorize
control. The hot path excludes Markdown parsing, transcript/todo/account/credential access,
Keychain, private APIs, network, arbitrary commands, inherited-environment shell execution, and
durable semantic history.

README currently makes no Flow Status availability claim, while the Wiki explicitly labels the
architecture as pre-implementation. That satisfies the present documentation-truthfulness gate.

## Gate

Repair the three current blockers in the source/snapshot contracts and PRD outcome, then dispatch a
fresh independent QbD 1 audit. A later model PASS will still require an explicit linked human
decision before decomposition.
