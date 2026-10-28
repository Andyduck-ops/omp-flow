# How: Trace Code Behavior

Use this optional code layout with `omp-flow-research` when the question is how a concrete code
path works. The Skill and native assignment remain authoritative. Write into the assigned output
Concept; a small explanation can be inline there. The headings below are suggested navigation,
not a required schema, a separate Concept per invocation, or a workflow gate.

## Bound the explanation

- Name the question (including placement, ownership, or layering questions such as *"where should
  this live?"* or *"which module owns this?"*), observed revision, and code anchor. State which
  decision or assumption the explanation can change.
- Build a working mental model for a senior engineer—not an annotated source transcript. Follow
  only the dependencies needed to answer the question.
- Cite `file:line` at the observed revision for consequential claims. Separate observed behavior,
  inference, and unknowns; a function name or comment is not proof of runtime behavior.

## Follow behavior and ownership

1. State each component's responsibility and boundary using concrete `Component.method()` prose
   (say *"`UserService` calls `AuthClient.refresh()`"*, not *"the service delegates to the
   client"*). Identify who supplies inputs, validates them, and consumes the result.
2. Track authoritative state, derived copies, mutable fields, persistence, and resource lifetimes
   (who acquires, transfers, and releases each resource).
3. Walk the normal execution path from trigger through decision points and data transformations to
   the externally visible result. Use prose rather than pseudocode; include a Mermaid diagram only
   when multiple components or stage transformations interact and prose alone would obscure the
   flow.
4. Trace relevant error, cancellation, and cleanup paths separately: where failure originates,
   which side effects survive, and what is released on partial completion. State explicitly if
   cancellation or cleanup is unsupported or uninvestigated.
5. Call out target-specific gotchas that violate caller expectations (hidden mutation, ordering
   traps, partial-failure residue, or caller-owned cleanup), skipping generic risk lists.

## Scale to the question

Keep narrow questions in a single pass. For a cross-cutting subsystem, split only into independent
slices with clear boundaries; Main/coordinator alone dispatches slices under the native operation
contract and reconciles contradictions against the code directly.

## Suggested output navigation

Adapt or omit sections that do not serve the question:

- **Anchor and overview:** question, revision, entry point, and 1-paragraph purpose/boundary summary.
- **Responsibilities and state ownership:** key types/components, authoritative writers, and lifetimes.
- **How it works:** normal flow and error/cancel/cleanup branches with `file:line` citations.
- **Gotchas and conclusion:** non-obvious pitfalls, effect on the pending decision, and open gaps.

If observed behavior contradicts the framing or an accepted contract, preserve that evidence and
report the contradiction through the assigned output to Main. An explanation is not authority to
change code, expand scope, or transition the workflow.
