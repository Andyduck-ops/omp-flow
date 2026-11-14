---
okf_version: "0.2"
---

# Workflow Library

Navigation to the authored routes. How Main chooses and drives a route lives in the `omp-flow`
Router Skill; each route document holds its own cues, output, and approval boundary.

## Workflows

- [Full Delivery](full-delivery.md) — consequential product, contract, identity, architecture, or
  irreversible work; requires design, human decisions, bounded implementation, independent review,
  integration, and archive.
- [Lite](lite.md) — a local reversible change with a known verifier and small decision surface; do
  not use when the change alters a public contract, authorization/identity boundary, persistent data,
  or an irreversible effect.
- [Research](research.md) — evidence, comparison, explanation, or synthesis is the main product;
  move to Design/Full Delivery when the conclusion changes a product contract or implementation.
- [Spec Formation](spec-formation.md) — form a small observable behavior contract for reuse across
  Tasks; promote it to the Wiki only after independent review and explicit human approval.
- [Experiment](experiment.md) — fixed inputs, controlled comparison, repeated trials, and measured
  results, including failures and negative findings; do not use as a substitute for ordinary
  implementation verification.
- [Workflow Maintenance](workflow-maintenance.md) — evidence-led candidate changes to this
  authored library; it proposes a candidate and never promotes production policy automatically.

## Code layouts (optional)

On-demand recipes inside existing Skills for code work; load only the matching one.

- [How](code/how.md) — execution and data/state ownership explanation with `omp-flow-research`.
- [Why](code/why.md) — code history, rationale, and current validity with `omp-flow-research`.
- [Architect](code/architect.md) — caller, interface, and ownership design with `omp-flow-design`.
- [Interrogate](code/interrogate.md) — bounded adversarial code review with `omp-flow-check`.
