---
name: omp-flow-research
description: Investigate repository or external evidence within an omp-flow task Bundle, maintain source provenance as linked Concepts, and synthesize a justified direction.
---

# OMP-Flow Research Gate

## Preconditions

- The assignment identifies the Bundle root, bounded objective, entry Concept, output Concept,
  actor ID, and dispatch receipt.
- The entry contains a usable question or links to the current framing.
- Each independent question has an explicit output path, normally under `research/`.

## Decide Research Scope

For each consequential question, state which provisional anchor assumption, principal
contradiction, or practical decision its answer could change. Research that cannot affect the
framing, a decision, or a verification obligation needs a concrete reason to consume time.

Choose and persist one of:

- **Internal:** repository code, tests, accepted context, history, existing patterns, and applicable durable knowledge discovered through the native `omp-flow-wiki` Skill.
- **External:** primary documentation and mature projects; repository clones are acquired into the
  ignored cache under `.omp-flow/cache/repos/`.
- **Both:** default for consequential architecture or unfamiliar domains.
- **Skip:** only when the user explicitly declines, the change is mechanical inside accepted
  knowledge, or existing evidence is sufficient. Record the concrete reason in a linked Concept.

## Procedure

Before native dispatch, only Main/coordinator may dispatch, correlate operations/receipts, obtain
or record human calibration, and choose a workflow transition. Those coordinator actions are
inapplicable to an already-dispatched Researcher: it must not dispatch or self-redispatch, govern,
calibrate, transition, or selectively reinterpret coordinator clauses. The Researcher still owns
the complete bounded Research responsibility and assigned output: test the framing against
practice, distinguish what evidence proves, does not prove, and merely makes possible, and report a
materially changed principal contradiction as a Brainstorm-return signal rather than protect the
earlier framing.

1. Split uncertainty into independently investigable questions and create descriptive output paths.
2. In Main/coordinator context only, dispatch Harness-native researcher agents when questions can
   be investigated independently. Pass Bundle root, role, objective, entry Concept, exact output
   path, actor ID, receipt, and the no-implementation boundary. Start one operation per native task
   item, then forward its complete returned assignment unchanged with
   `id = actor_id = actorId` and matching descriptor role. The strict v1 `ompFlowDispatch`
   descriptor remains the first non-blank line; do not decorate or reconstruct it.
3. Separate facts, interpretations, counter-evidence, unknowns, and recommendations. Actively seek
   the strongest evidence against the current framing, not only confirmation. Internal claims use
   `file:line`; external claims use stable source URLs and version/date where relevant.
4. Keep investigation in linked research Concepts. Do not copy passages merely to promote them
   between tiers.
5. Acquire useful repositories into the ignored clone cache and record the exact URL, revision,
   useful anchors, interpretation, and local relevance in one task-local Reference Concept.
6. Retain an exact attachment only when links plus revision are materially insufficient.
7. Write one or more synthesis Concepts comparing alternatives, risks, sources, and the justified
   direction. State whether the result confirms, revises, or falsifies the current anchor and what
   practical decision changes. Link the selected synthesis visibly from the Bundle index or
   relevant framing.
8. Recommend returning to Brainstorm when evidence materially changes the problem or principal
   contradiction; the main session updates human-owned framing. Otherwise explain why remaining
   uncertainty does not prevent the next decision and hand the selected synthesis path to design.

## Exit Gate

- Important claims are evidenced or explicitly uncertain.
- Important sources have task-local Reference Concepts or a deliberate reason not to add one.
- One synthesis is visibly selected through authored prose and links.
- The synthesis exposes counter-evidence and its confirm/revise/falsify impact on framing and the
  next decision.
- The synthesis lets an Architect design without reconstructing research from chat.

In Main/coordinator context only, load `omp-flow-design` next. The already-dispatched Researcher
returns the assigned synthesis/output and does not choose or perform that transition.

## Red Flags

- No investigation means no design authority.
- Search snippets and model memory are not primary evidence.
- A cache clone is not task knowledge and is never accepted merely because it exists.
- Do not create paired content/metadata files or ask Python to reconstruct provenance.
- Do not hide disagreement to make the synthesis look complete.
- Do not continue investigation merely to complete an imagined evidence inventory after the
  material decision is supported or falsified.
- Do not require sortable filenames, fixed headings, or a closed Reference manifest.
