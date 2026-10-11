# How: Trace Code Behavior

Use this optional code layout with `omp-flow-research` when the question is how a concrete code
path works. The Skill and native assignment remain authoritative. Write into the assigned output
Concept; a small explanation can be inline there. The headings below are suggested navigation,
not a required schema, a separate Concept per invocation, or a workflow gate.

## Bound the explanation

- Name the question, observed revision, and code anchor: entry point, symbol, or behavior. State
  which decision or assumption the explanation can change.
- Read the implementation and its callers before relying on comments or tests. Follow only the
  dependencies needed to explain the target; do not turn a local question into a repository tour.
- Use useful `file:line` references at that revision for consequential claims. Separate observed
  behavior, inference, and unknowns; a function name is not evidence of what it does.

## Follow behavior and ownership

1. Establish each relevant component's responsibility and boundary. Identify who supplies inputs,
   validates them, calls the next component, and consumes the result.
2. Track data and state: authoritative values, derived copies, mutable fields, persistence, and
   the owner allowed to change each. For resources, identify acquisition, transfer, lifetime, and
   the party responsible for release.
3. Trace an actual normal execution from the caller through significant branches and back to the
   externally visible result. Include asynchronous handoffs and ordering when they affect behavior.
4. Trace relevant error, cancellation, and cleanup paths separately. Show where failure originates,
   how it propagates, which side effects survive, and what is released on partial completion.
   If cancellation is unsupported, say so with evidence; if it was not investigated, say that
   instead. Do not invent a cancellation or cleanup guarantee.
5. Read relevant tests and contracts as supporting evidence. Record commands and results only when
   exercised, and distinguish source-based reasoning from runtime observation.
6. Explain gotchas that change a caller's expectations: hidden mutation, blocking work, ownership
   transfer, ordering, failure after a side effect, or cleanup that depends on the caller. Include
   only those supported by this target, not a generic risk inventory.

## Scale to the question

Keep simple targets in the assigned Concept. For a complex target, identify only slices that can
be investigated independently, with their boundaries and the shared question they answer.
Only Main/coordinator may delegate those slices through the existing native operation contract:
Bundle, role, bounded objective, entry and output Concepts, actor ID, opaque receipt, and predecessor
when required. A dispatched child never spawns or redispatches. There is no fixed worker count or
mandatory decomposition.

## Suggested output navigation

Adapt or omit sections that do not help the reader:

- **Anchor and scope:** question, revision, entry point, and relevant callers.
- **Responsibilities and ownership:** components, important values/resources, writers, and lifetimes.
- **Execution:** normal path and relevant error/cancel/cleanup branches, with code references;
  a small sequence sketch or table is useful only if it clarifies the flow.
- **Gotchas and limits:** surprising behavior, evidence strength, and uninvestigated paths.
- **Conclusion:** the answer, its effect on the decision, and remaining consequential questions.

If observed behavior contradicts the framing or an accepted contract, preserve that evidence and
report the contradiction through the assigned output to Main. An explanation is not authority to
change code, expand scope, or transition the workflow.
