# Architect: Design a Code Boundary

Use this optional code layout with `omp-flow-design` when a selected synthesis needs a concrete
code interface, data model, or ownership boundary. The Skill, linked decisions, and native
assignment remain authoritative. Reuse the assigned Design/interface output Concept; the headings
below are suggestions, not a mandatory schema or a separate Concept per invocation.

This is design, not implementation. Keep sketches in prose or Concept code blocks. Do not commit
source stubs, placeholder implementations, or an API merely to make the design look executable.
The layout supplies neither automatic sign-off nor permission to bypass human/QbD approval.

## Show callers before signatures

1. Restate the observable problem, binding requirements, non-goals, and evidence from the selected
   synthesis. Name the concrete consequence the design must enable or prevent.
2. Start with realistic caller examples: where the call happens, what information is available,
   the useful result, and the failure the caller must handle. Include a lifecycle or asynchronous
   example only when the target needs one. Do not invent consumers to justify an abstraction.
3. Use those examples to derive the smallest useful public boundary, then sketch signatures or
   messages. Explain each component's causal purpose in plain language. Prefer a deep boundary
   that owns meaningful work and hides internal detail over shallow wrappers or exposed internals.

## Make data and ownership authoritative

- Describe the relevant data shape and the meaning of its fields: required/optional values, units,
  identity, validity, and lifetime where material. Distinguish authoritative state from derived or
  cached views; avoid two competing sources of truth.
- Show access paths from creation or loading through readers, writers, transformations, persistence,
  and disposal. Name the owner allowed to mutate state and the boundary where ownership transfers.
- Assign responsibility for validation, resource acquisition/release, and partial completion.
  Explain ordering or concurrent access only where it affects this design; do not add machinery for
  hypothetical requirements.
- Specify the public contract: inputs, outputs, important invariants, errors, and which failures
  callers handle versus which the boundary prevents. Cover cancellation, cleanup, and side effects
  when applicable, including what remains after failure. Never rely on an unexplained fallback.
- Keep private representation and incidental operations behind the boundary. Explain unavoidable
  compatibility or migration obligations without introducing an unrequested parallel API.

## Compare only material alternatives

Use the research evidence and caller examples to compare alternatives that could change the
selected boundary, correctness, cost, or maintainability. State the relevant trade-off and why the
chosen option solves the observed problem. There is no minimum candidate count, mandatory prototype,
or requirement to manufacture alternatives for a mechanical decision. Record consequential rejected
options and the evidence that would reopen them.

## Plan verification and return signals

Map observable requirements and important invariants to specific checks: caller-level examples,
contract tests, failure/cleanup cases, or other evidence suited to the risk. Separate proposed
commands and expected observations from verification actually performed. Name any material unknown
and its owner; an unresolved blocking decision is not ready for decomposition.

State what observation would invalidate the design or its framing, such as an incompatible caller,
a violated ownership assumption, or an unmet binding constraint. Return that evidence to Main
through the assigned output for further research, framing, or design rather than suppressing it to
preserve the sketch. Main owns transitions and approval; the Architect does not approve its own gate.

## Suggested output navigation

Adapt or omit sections as useful:

- **Problem and caller examples:** observable requirements, constraints, non-goals, and source links.
- **Boundary and data model:** proposed contract, authoritative values, access paths, and ownership.
- **Behavior and invariants:** normal operation, relevant failures, concurrency, and cleanup.
- **Trade-offs:** evidence-led choice, material alternatives, and compatibility obligations.
- **Verification and open decisions:** acceptance checks, return signals, and consequential unknowns.
