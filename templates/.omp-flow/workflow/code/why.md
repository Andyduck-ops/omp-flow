# Why: Recover Code Rationale

Use this optional code layout with `omp-flow-research` when a code decision's origin or continuing
justification matters. The Skill and native assignment remain authoritative. Reuse the assigned
output Concept. Suggested headings are human navigation, not a fixed schema, a new Concept per
invocation, or an approval gate.

## Start with the observed code

Name the question, current revision, and `file:line` anchor. Code shows *what* it does, never *why*
it exists: do not treat current behavior as direct evidence of author intent (*"the code does X so
the author must have wanted X"* is rationalization). If the question embeds a hypothesis (*"I
assume this is for performance?"*), treat that guess as one candidate to test against history, not
a conclusion to confirm.

## Recover provenance and guard against recency bias

1. Trace past the last-touch `git blame` commit (which is often a rename, formatting pass, or
   follow-up tweak) using `git log --follow -p`, `-S`, or `-L` to find the originating decision.
2. Classify each claim's evidence tier explicitly:
   - **Direct:** an explicit author statement in a commit message, PR, issue, doc, or comment citing
     the reason.
   - **Supported:** multiple indirect signals (e.g., PR title, tests added in the same change,
     adjacent commits) converging on one pressure.
   - **Inferred / Speculative:** a plausible reading without explicit record—hedge the phrasing and
     state the reasoning chain or competing hypotheses.
   - **Unknown:** searched and not found. Name specifically what was searched (e.g., *"inspected N
     commits touching `path` and searched issues for `term`; none stated a rationale"*).
3. Look for counter-evidence or conflicting motives (e.g., a defensive guard added after an
   incident vs. a cleanup commit) and surface both rather than flattening messy history into a tidy
   story.

## Test the rationale against today

- Separate three questions: what originally caused the code's shape, what it currently does, and
  whether that constraint still holds today.
- When `why` precedes a planned change, convert the findings into an explicit **Preserve / Change /
  Avoid / Risk** constraint set (including what observation or regression check would permit
  removing a legacy guard or path).

## Suggested output navigation

Adapt or omit sections that do not serve the question:

- **Observed anchor:** current behavior, revision, and `file:line` citations.
- **Provenance and confidence:** Direct and Supported findings vs. Inferred/Competing hypotheses.
- **What remains unknown:** exact sources and queries searched that returned no rationale.
- **Current validity (`Preserve / Change / Avoid / Risk`):** surviving constraints, changed
  conditions, and removal criteria for Main.

Keep facts, inferences, and unknowns explicit throughout. Report material evidence contradicting
the current framing through the assigned output; source recovery does not supply human approval or
choose the next workflow transition.
