# Spec Formation Workflow

Spec Formation is the authored route for turning a durable behavior question into a small,
reviewable contract that more than one Task can reuse. It borrows the useful part of spec-driven
practice—observable behavior and progressive clarification—without adding a schema, parser, or
workflow state graph.

## Route cues

- **Use when:** the user explicitly asks for a durable specification; several Tasks need the same
  behavioral rule; or a Wiki spec is absent, stale, or contradicted by current evidence.
- **Do not use when:** the change is one-off with a clear existing contract and verifier (use Lite
  or Full Delivery), evidence/comparison is the main product (Research), or a controlled repeated
  trial is the main question (Experiment).
- **Entry evidence:** the Task `index.md`, useful Brainstorm/Research Concepts, relevant existing
  Wiki links, and accepted human constraints. Read only the smallest coherent context needed.
- **Expected output:** a Task-local `specs/<capability>/spec.md` Concept; after independent review
  and a linked human ruling, a self-contained `.omp-flow/wiki/specs/<capability>/spec.md` Concept
  may be authored and optionally linked from `wiki/specs/index.md`.
- **Verifier and approval:** another reader checks purpose, observable requirements, scenarios,
  boundaries, provenance, and verifier coverage. Human approval explicitly accepts, revises,
  defers, or rejects Wiki promotion. Model `PASS`, file presence, executor success, and opaque
  receipts are evidence/correlation only, never approval.
- **Return/escalation:** changed evidence returns to Brainstorm or Research; material architecture,
  migration, security, or implementation decomposition moves to Design or Full Delivery; unresolved
  material ambiguity gets one concise human question.

## Method

1. **Frame the contract.** Start with the Task Bundle and state the user/problem, scope, and the
   observation that could change the contract. Consult the Wiki conditionally through its root index.
2. **Clarify before writing.** Explore repository evidence and competing interpretations. Keep
   unresolved questions in Brainstorm/Research Concepts rather than hiding them in requirements.
3. **Author the minimum Spec Concept.** State purpose and scope; write externally observable
   SHALL/MUST requirements; give each requirement at least one readable `WHEN ... THEN ...`
   scenario; record non-goals, verifier, approval boundary, provenance, and ordinary links back to
   the Task and evidence. Do not prescribe implementation classes or checkbox task plans.
4. **Review and decide.** A different actor independently checks that a reader can reproduce the
   contract and its limits. Record a linked human decision. An unapproved or rejected draft remains
   Task-local.
5. **Promote deliberately.** Only after approval, author or revise
   `.omp-flow/wiki/specs/<capability>/spec.md` as a self-contained durable Concept. Link it from
   `wiki/specs/index.md` when useful. Duplicate capabilities require an explicit merge/revise
   decision; never overwrite by filename alone.
6. **Choose the next route.** Lite/Full Delivery may consume an approved Wiki spec as entry
   evidence. If implementation architecture or decomposition is material, return to Design; if
   evidence changes behavior boundaries, return to Brainstorm/Research.

## Failure and fallback

- A missing Task index blocks Spec Formation; do not detach a spec from a Bundle.
- A missing Wiki root follows the Wiki bootstrap rule and creates only a minimal index when the
  current authored work explicitly needs it; it never manufactures a spec.
- Missing Workflow index uses the legacy `.omp-flow/workflow.md` only when present; otherwise stop
  with an actionable initialization message.
- Ambiguous intent receives one concise human question rather than a natural-language classifier.
- Incomplete requirements/scenarios or changed evidence return to framing/research; no automatic
  promotion, rollback, or semantic retry occurs.

## Execution and boundaries

The main session selects the Task and starts any native operation. Runtime owns only paths, actor
identity, locks, atomic effects, and opaque receipts. Hooks and persistent instructions may point
to the Task, Workflow, and Wiki indexes but do not parse Markdown, select this route, create a spec,
or infer approval. This Workflow never replaces a Task Bundle, WorkScope, Review, or implementation
Design.
