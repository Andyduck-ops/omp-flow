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
- QbD is a material decision challenge, not an exhaustive search for possible refinement.
  Practice evidence（实践检验）outranks process completeness; anti-formalism（反形式主义）does
  not weaken mechanical authorization, data, false-authority, or irreversible-effect boundaries.

## Procedure

1. Identify the design or work-map entry Concept and an explicit audit output Concept. Through its
   useful links, bind the audit to the current decision, unacceptable consequences, current
   scope/change, and relevant closed findings, residual risks, and human decisions. Do not require
   a fixed audit-brief file or field shape; no prior findings is normal for a first audit.
2. Start one independent QbD operation with Bundle root, role, bounded objective, entry, output,
   actor ID, and optional predecessor receipt.
3. Dispatch one independent native `qbd-auditor`. Pass the paths and opaque receipt returned by
   the runtime by forwarding the complete returned assignment unchanged. Keep its strict v1
   `ompFlowDispatch` descriptor as the first non-blank line, set native item
   `id = actor_id = actorId`, and use the matching descriptor role. Do not render the Bundle,
   reconstruct the descriptor, or prepend audit prose.
4. Require an explicit verdict with these semantics:
   - `FAIL` requires evidence of a critical falsehood, authorization or data violation,
     irreversible harm, or an unrealizable/unverifiable core path for which safe degradation is
     insufficient.
   - `NEEDS_EVIDENCE` applies only when missing evidence prevents judging whether such a material
     consequence exists. Unknowns alone are not blocking.
   - `PASS` means no unresolved blocking finding in the current scope; it may carry advisory
     observations, residual risk, later verification, and deferred recommendations.
5. Require each blocking finding to link evidence through cause -> concrete consequence -> affected
   decision, give the smallest remedy, and explain why hiding, `unavailable`, disabling, narrowing,
   refusal to write, or another safe degradation is insufficient. Findings without that chain are
   advisory.
6. Confirm the promised audit Concept exists, links to what it evaluated, and records material
   findings. Finish the runtime operation with the same actor ID.
7. Present material findings and the applicable governance options to the user. Only the user
   decides calibration; the verdict itself authorizes no repair, re-audit, or forward transition.
8. Record the human decision in a linked decision Concept. Do not encode approval, materiality, or
   risk as runtime phase or parsed state.

## Transitions

- Recorded QbD 1 human PASS -> load `omp-flow-decompose`.
- Recorded QbD 2 human PASS -> load `omp-flow-execute`.
- Advisory risk, `PASS` residual risk, or risk made non-blocking by removal, disabling, narrowing,
  or safe degradation may be accepted and routed onward by the human.
- An unresolved `FAIL` routes only to repair, removal or safe degradation, deferral, or stop.
  Material `NEEDS_EVIDENCE` routes only to evidence, removal or safe degradation, deferral, or
  stop. Do not pass the unchanged risky scope to Decompose/Execute under an accepted-risk label.
- If the human considers changing a non-negotiable boundary, return to Brainstorm/Design and record
  the changed problem definition. When it could change the problem core or a critical consequence,
  use a targeted human-first Grill: human rationale first, then the Agent's strongest counter-case,
  concrete consequences, and lighter degradation; the human confirms, modifies, or abandons it.
- Re-audit only when the recorded human decision requests it or new material evidence/substantive
  change warrants a scoped challenge. Carry forward the prior audit, human decision, closed
  findings, residual risks, and exact change; a fresh actor does not imply a fresh scope.

## Red Flags

- Never infer human approval from earlier design discussion.
- Never infer a decision from a report or encode it as hidden runtime state.
- Never let the author audit its own output.
- Never parse frontmatter, headings, or verdict words to manufacture workflow state.
- Never turn disagreement with a human risk preference into a blocker without a material
  consequence chain, or turn human calibration into a waiver for an unchanged active blocker.
