# FlowStatus implementation map

This map records the landed v1 work and the current revised [PRD](../prd.md),
[Design](../design.md), [root Flow publication v2](../interfaces/flow-status-publication-v2.md),
[semantic publisher v2](../interfaces/flow-status-publisher-v2.md), and
[snapshot v2](../interfaces/flow-status-snapshot-v2.md). The earlier linked
[QbD 1 human approval](../qbd/qbd-1/human-decision.md) applies to v1, not this compatible v2
revision. This is authored navigation and execution guidance, not machine phase state or an exact
dependency graph.

## Work

- [Shared snapshot, cache, inspect CLI, and managed Skill](shared-snapshot-and-inspect.md)
- [Claude task observations and pinned ccstatusline Flow Status capability](claude-ccstatusline.md)
- [Oh My Pi native Flow Status adapter](oh-my-pi-native-status.md)
- [Reversible setup, documentation, and integration verification](setup-docs-and-integration.md)
- [Completion-audit Flow Status repair](completion-audit-repair.md) — current bounded revised Work:
  production main-session semantic builder/publish-renew-clear path; explicit root Task/Flow v2
  publication and v1 compatibility; complete Work catalog and independent-review-accepted Work;
  long-wait lease; meaningful rounds and separate audits; two managed ccstatusline views; plus the already
  accepted Claude guard, fresh setup, truthful readiness, supervisor budgets, stable fixtures,
  archive links, and timing proof. It passed fresh QbD 2 and linked human approval, has now been
  implemented, and awaits independent review.
- [Flow Status v2 implementation handoff](handoffs/flow-status-v2-implementation.md) — linked
  implementation result and verification record for independent review.

## Ordering and parallelism

The shared snapshot work establishes the validated cache and observation/inspect boundaries used
by every Harness. Claude and Oh My Pi work can then proceed in parallel against those public
boundaries. Setup and documentation follow their accepted handoffs so installation claims reflect
what the package actually ships.

Each implementation gets its own linked handoff and independent review. A finding that changes the
approved source, binding, progress, retention, trust, or Harness capability semantics returns to
Design instead of being smuggled into implementation.

The completion-audit repair follows the earlier accepted deliveries and does not inherit their
acceptance. The prior fourth completion-repair PASS predates v2; the first two v2 QbDs are linked
FAILs whose structural and publisher/baseline/lease blockers are repaired in current contracts.
This revised Work passed fresh independent QbD and linked human calibration, and now has its own
implementation handoff. It still requires different-actor review, strict installed verification,
and a fresh completion audit before archive.

## Coverage

The shared work owns PRD R1, R3–R7, R11–R12, and the core parts of R14. Claude work owns R2,
R8–R9, and the Claude portions of R3, R6–R7, R10–R11, and R14. Oh My Pi work owns R2 and the
corresponding native portions of R3, R6–R7, R10–R12, and R14. Setup/integration owns cross-surface
R2 verification, R13, R15, coexistence, removal, package contents, and cross-surface acceptance
verification.
