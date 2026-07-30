---
name: omp-flow-qbd
description: Coordinate an independent Quality-by-Design audit over linked Bundle Concepts and record the required human calibration as knowledge.
---

# OMP-Flow QbD

## Gate Meaning

- QbD 1 challenges whether the selected problem, requirements, design, sources, and contracts are
  justified.
- QbD 2 challenges whether the authored work map, work Concepts, scope, ordering, and verification
  can realize the approved design.
- The independent auditor applies adversarial judgment. The human calibrates the result. Neither
  replaces the other.

## Procedure

1. Identify the design or work-map entry Concept and an explicit audit output Concept.
2. Start one independent QbD operation with Bundle root, role, bounded objective, entry, output,
   actor ID, and optional predecessor receipt.
3. Dispatch one independent native `qbd-auditor`. Pass the paths and opaque receipt returned by
   the runtime by forwarding the complete returned assignment unchanged. Keep its strict v1
   `ompFlowDispatch` descriptor as the first non-blank line, set native item
   `id = actor_id = actorId`, and use the matching descriptor role. Do not render the Bundle,
   reconstruct the descriptor, or prepend audit prose.
4. Require explicit `PASS`, `FAIL`, or `NEEDS_EVIDENCE`, with blocking findings, evidence anchors, and required remediation.
5. Confirm the promised audit Concept exists, links to what it evaluated, and records material
   findings. Finish the runtime operation with the same actor ID.
6. Present the audit and material findings to the user. Only the user decides calibration.
7. Record the human decision in a linked decision Concept. Do not encode approval as runtime phase.

## Transitions

- QbD 1 human PASS -> load `omp-flow-decompose`.
- QbD 2 human PASS -> load `omp-flow-execute`.
- FAIL, NEEDS_EVIDENCE, or human reject -> return to the owning linked Concepts, repair them, and
  run a fresh independent audit.

## Red Flags

- Never infer human approval from earlier design discussion.
- Never infer a decision from a report or encode it as hidden runtime state.
- Never let the author audit its own output.
- Never parse frontmatter, headings, or verdict words to manufacture workflow state.
