# Why: Recover Code Rationale

Use this optional code layout with `omp-flow-research` when a code decision's origin or continuing
justification matters. The Skill and native assignment remain authoritative. Reuse the assigned
output Concept. Suggested headings are human navigation, not a fixed schema, a new Concept per
invocation, or an approval gate.

## Start with the observed code

Name the question, current revision, and precise code anchor using `file:line`. Describe the
behavior or constraint that actually exists before asking why it exists. Separate an explanatory
question from a proposed change; historical research does not authorize implementation.

## Recover useful provenance

1. Follow repository history to the change that introduced the relevant behavior or constraint.
   A blame result is a lead, not necessarily the originating decision: follow moves, rewrites, and
   earlier changes when they matter.
2. Record exact commit hashes, PR/issue URLs, or relevant incident/decision records and the passages
   that support the explanation. Distinguish what each source says from what the diff demonstrates.
   Follow the Research Skill's source/Reference guidance; avoid duplicating existing provenance.
3. Reconstruct the pressures at the time: observed failures, caller needs, compatibility, operating
   conditions, or other evidenced constraints. Establish chronology when it changes the explanation.
4. Identify alternatives actually considered and the stated reasons for choosing or rejecting them.
   A present-day alternative is not evidence that the original author considered it. Mark any causal
   interpretation without direct support as inference.
5. Look for counter-evidence: later corrections, changed requirements, exceptions, or an incident
   that weakens the apparent rationale. Do not protect an attractive historical story from facts.

Use only sources useful to the question; there is no required source count or fan-out. When history,
an issue, or an incident record is missing or inaccessible, record the gap and its effect on the
conclusion. Missing provenance means the original motive is unknown, not that it was sensible,
accidental, or malicious. Do not invent author intent or insist on unavailable sources to fill a
checklist.

## Test the rationale against today

- Compare the original pressures with current code, callers, tests, requirements, and operating
  conditions. Identify which constraints still apply and which have evidence of changing.
- Keep three claims distinct: what caused the decision, what the implementation currently does,
  and whether retaining it is justified now. Evidence for one does not automatically prove another.
- State what evidence would permit removal or simplification: for example, disappearance of a
  supported caller or a regression check showing the old failure no longer occurs. Identify the
  compatibility, safety, or ownership obligations that would still need a bounded approved change.
- If current validity cannot be determined, say what remains unknown and which observation would
  change the decision. Recommend investigation or a return to framing/design when warranted;
  do not quietly turn this explanation into a redesign or a removal patch.

## Suggested output navigation

Adapt or omit sections that do not serve this question:

- **Observed anchor:** current behavior, revision, and code citations.
- **Provenance:** exact sources, chronology, and the claims each supports.
- **Original pressures and alternatives:** documented rationale versus inferred explanations.
- **Current validity:** surviving constraints, changed conditions, and counter-evidence.
- **Removal conditions and gaps:** evidence needed for a new decision, unknowns, and a bounded
  recommendation to Main.

Keep facts, inferences, and unknowns explicit throughout. Report material evidence contradicting
the current framing through the assigned output; source recovery does not supply human approval or
choose the next workflow transition.
