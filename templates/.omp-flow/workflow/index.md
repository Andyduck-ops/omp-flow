---
okf_version: "0.2"
---

# Workflow Library

Create a new Workflow Task with `task create`; resume existing work from its linked Bundle.
The library is an authored map for a human/agent
reader; it is not a classifier, route registry, or lifecycle state machine. Choose a route in this
order:

1. Follow the user's explicit workflow/path request when it is clear.
2. When the request touches architecture, conventions, prior decisions, verification contracts, or
   recurring failures, follow the persistent pointer to `.omp-flow/wiki/index.md` and read only
   useful topics. Wiki consultation is conditional, not a requirement for every Task.
3. Read the Task Bundle `index.md` and the Concepts that answer the current question.
4. Use each route's `Use when`, `Do not use when`, entry evidence, output, verifier/approval, and
   return cues below. If material ambiguity remains, ask one concise human question rather than
   inventing a category.

Artifacts, a model `PASS`, executor success, and an operation receipt are evidence or correlation;
none is human approval by itself. A route may return to framing, research, or design when evidence
changes the decision.

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

The links are authored navigation. Workflow documents guide reasoning and evidence; Runtime and
Harnesses continue to own session, assignment, actor identity, execution, and atomic side effects.
