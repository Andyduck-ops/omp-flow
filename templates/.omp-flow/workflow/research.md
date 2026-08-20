# Research Workflow

Research is the route for work whose main product is evidence, explanation, comparison, or a
bounded recommendation. It is complete when the Task has a useful, sourced conclusion; it does not
need to become product implementation.

## Method

1. **Create and frame the Task.** Start with `task create`. State the decision or question, what is
   known, what is uncertain, a provisional explanation, and the observation that would change it.
2. **Acquire evidence.** Read repository sources first when they answer the question. For external
   material, record the exact URL or revision, useful anchors, local interpretation, and caveats in a
   Reference Concept. Keep acquisition separate from the conclusion.
3. **Compare explanations.** Test the provisional explanation against direct observations, examples,
   counterexamples, and competing interpretations. Separate fact, inference, and open question.
4. **Write the synthesis.** State the finding, confidence, applicability boundary, unresolved risk,
   and the evidence that supports each important claim. Link the synthesis to the question and its
   sources so another reader can replay the reasoning.
5. **Choose the next useful result.** Stop with knowledge or a bounded recommendation when that is
   the requested outcome. Continue Research when the evidence is insufficient. Move to Design or
   Full Delivery when the synthesis changes a product contract, architecture, implementation scope,
   or another decision that needs stronger safeguards.

## Research output

The normal output is a linked research, Reference, or synthesis Concept plus a clear disposition.
A proportional independent challenge is useful when the conclusion will guide a consequential
decision; the challenge tests the reasoning rather than replacing the sources.

## Execution

Native Research Work uses the same assignment contract as other Work: Main selects the bounded
objective, `operation start` produces the assignment, and `operation finish` records the result. The
Researcher reads the assigned Bundle and writes the assigned Concept; it does not create workflow
state or dispatch another Agent.
