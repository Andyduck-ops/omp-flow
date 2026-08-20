# OMP-Flow Development Workflow

Full Delivery is the complete path for consequential product work. It carries the reasoning, decision,
assignment, implementation, review, and integration method used by the repository.

## Principles

1. Each task directory is one portable OKF v0.2 Bundle. Markdown Concepts, authored indexes,
   prose, placement, and ordinary relative links carry task meaning.
2. Reality and practice outrank authored theory. Preserve the authority relationship
   `stable dialectical core -> necessary procedural safeguards -> replaceable Skills, cards,
   tests, and Harness surfaces`; delivery may change, but it must not reverse the core or weaken
   the safeguards.
3. A non-trivial Explore starts with a provisional first-principles anchor（第一性锚定）: the
   concrete problem, irreducible outcome, non-sacrificable human boundaries, counter-hypothesis,
   and evidence that would revise it. This is authored direction, not a fixed file, checklist, or
   lifecycle phase; mechanical low-ambiguity work may proceed directly.
4. Contradiction analysis（矛盾分析）identifies the changing conflict that currently governs the
   decision: the principal contradiction（主要矛盾）. Track how practice transforms it; do not let
   a secondary or invented problem displace it merely because that problem has fluent terminology.
5. Brainstorm and research are distinct operations in one Explore spiral. Questions drive
   investigation; practice-led reasoning and practice tests（实践论、实践检验）use repository,
   runtime, user, and other relevant reality to confirm, revise, or falsify provisional knowledge
   before that knowledge returns to implementation, verification, and feedback.
6. Apply concrete-problem analysis（具体问题具体分析）and anti-formalism（反形式主义）:
   choose rigor in proportion to actual consequences and remove ceremony that does not improve a
   real decision, without weakening necessary safeguards.
7. Use the Feynman Technique（费曼技巧）and “do not fool yourself” for important causal claims:
   explain cause and effect in plain language, expose gaps hidden by workflow or solution jargon,
   distinguish evidence from inference and unknowns, and return unsupported claims to evidence or
   human calibration.
8. These anchors are flexible aids with observable work consequences, not required headings,
   teach-back artifacts, question counts, checklists, parser inputs, runtime fields, phases, gates,
   or model-thought scripts. Their wording and delivery remain replaceable as practice changes.
9. Investigation precedes accepted design; design precedes implementation.
10. Agents receive paths and read normal Markdown. OmpFlow does not parse Concept bodies, fixed
    headings, lists, filenames, or arbitrary frontmatter into workflow state.
11. Code owns only irreducible mechanics: session and actor identity, safe paths, locks, atomic
    external side effects, opaque dispatch receipts, and requested directory operations.
12. Harness-native agents, models, dispatch, concurrency, progress, cancellation, and result
    delivery remain native.
13. Missing required entry content or mechanical identity fails visibly. Optional links remain
    best-effort and there is no legacy fallback.

## Knowledge Map

The Bundle root `index.md` is an authored map, not a manifest. A typical large task may contain:

```text
<task>/
├── index.md
├── task.md
├── brainstorm.md
├── research/
├── reference/
├── context/
├── prd.md
├── design.md
├── work/
├── review/
└── qbd/
```

Only the Bundle root, root index, and normal Markdown Concepts are architectural requirements.
Directories and nested indexes exist only when they improve discovery. Concepts have descriptive
paths; persistent filenames do not encode topology or dispatch IDs.

## Normal Flow

```text
provisional first-principles anchor
        ↓
brainstorm Concept ↔ research / Reference Concepts
       confirm / revise / falsify
        ↓
selected synthesis → PRD / Design
        ↓
independent QbD 1 audit → human decision
        ↓
authored work map and bounded work Concepts
        ↓
independent QbD 2 audit → human decision
        ↓
native implementation → linked handoff
        ↓
independent review → linked Review Concept
        ↓
integration → immediate Wiki harvest when already evidenced → commit checkpoint → archive
        ↓
archived-source handoff → `omp-flow-sleep` → zero or more reviewable Candidates
```

This is a normal reasoning direction, not a Python lifecycle. Values, risk tolerance, and
non-negotiable outcomes come from the human before Agent challenge. For evidence-led technical
choices, an Agent may recommend first only when it also gives the strongest counter-case and the
evidence that would overturn the recommendation. Evidence may return Explore to framing, and
material execution findings may return to design and the applicable human gate. Anti-formalism
（反形式主义）means removing work that does not improve a real decision, not weakening mechanical
identity, authorization, data, or irreversible-effect boundaries.

## Semantic and Mechanical Ownership

| Information | Owner |
|---|---|
| Task purpose, framing, sources, provenance, findings, alternatives | Bundle Concepts |
| Requirements, design, decisions, interfaces, work intent and grouping | Bundle Concepts |
| Handoffs, reviews, audits, human decisions, navigation | Bundle Concepts |
| Active task for one session, safe path confinement | Runtime |
| Native actor/process identity and opaque dispatch receipt | Runtime/Harness |
| Locks, duplicate side-effect prevention, atomic create/archive | Runtime |

## How to work this path

### 1. Frame the problem

Create the Task and write the desired outcome in concrete terms. Name the human boundary that cannot
be traded away, the consequence that matters most, the current principal contradiction, and a
counter-hypothesis. Define what observation would change the framing. This gives later research and
design a question to answer instead of a solution to defend.

### 2. Explore through practice

Use Brainstorm to expose assumptions, alternatives, and unresolved questions. Use Research and
Reference Concepts to acquire repository or external evidence with provenance. Compare evidence
against the counter-hypothesis and record what is fact, inference, and unknown. A synthesis is ready
when it states the problem, evidence, applicability boundary, and decision it supports. If evidence
changes the problem, return to framing.

### 3. Design and calibrate

Turn the selected synthesis into requirements, interfaces, acceptance evidence, and a bounded Design.
State the smallest useful product behavior, major non-goals, failure consequences, and the boundary
between authored meaning and mechanical runtime work. An independent QbD 1 audit challenges the
framing, sources, requirements, design, and interfaces. The human decides whether to proceed, revise,
defer, safely degrade, or stop; an audit verdict alone is not approval.

### 4. Decompose and assign

Translate the approved Design into a descriptive work map and bounded Work Concepts. Each Work names
its objective, allowed code or document scope, entry Concepts, output boundary, acceptance evidence,
and dependencies in authored prose. QbD 2 checks that the map can realize the Design and that each
boundary is executable. Main starts each native operation separately and forwards its complete
assignment unchanged to the matching Harness role.

### 5. Implement and review

The Implementer reads the assigned Work and useful Design links, changes only the bounded surface,
runs the real verifier, and writes a linked handoff containing files, commands, results, decisions,
and caveats. A different Reviewer reads the Work, handoff, real diff, and relevant design evidence,
then writes a Review Concept with findings and verdict. A material finding returns to the Work or
Design for repair and another independent review.

### 6. Integrate and finish

Integration checks the accepted behavior across the changed boundary and resolves review findings.
When the evidence is already reusable, harvest it into the project Wiki through the Wiki Skill.
Create the requested commit checkpoint, then archive the Bundle only after operations are complete and
navigation remains valid. The archived source receipt is the input to Sleep, which may produce
reviewable Candidates without promoting them to project knowledge.

Runtime records live under ignored `.omp-flow/.runtime/`. External repository clones live under
the ignored acquisition cache `.omp-flow/cache/repos/`. Neither is portable task knowledge.

## Source Acquisition

An external clone is a read-only acquisition cache. A task-local Reference Concept records the
exact upstream URL and revision, useful anchors, local interpretation, caveats, and links to the
question or decision it informs. Exact attachments are optional and justified only when the
revision plus links are insufficient.

Do not copy findings merely to promote them between tiers. Do not create paired content and
metadata files, a Reference selector grammar, or a mandatory Reference index.

## Agent Assignment Contract

Every native assignment explicitly supplies:

1. task Bundle root;
2. role and bounded objective;
3. most relevant entry Concept;
4. allowed output Concept path and/or code scope;
5. native actor ID;
6. opaque dispatch receipt and optional predecessor receipt;
7. verification and completion conditions.

The operation interface is path based:

```text
operation start  task entry role actor-id objective output [predecessor]
operation show   receipt
operation list   [task]
operation finish receipt actor-id state [external-receipt]
```

`operation start` returns the Bundle, entry, output boundary, and opaque receipt used by the native
assignment. `operation finish` binds the same actor ID. A review predecessor must be a completed
implementation operation, and the reviewer actor must differ from its implementer.

### Executable native dispatch

`operation start` is the sole producer of the executable assignment. Forward its complete
`assignment` string to the native task item unchanged. Its strict v1 `ompFlowDispatch` JSON
descriptor must remain the first non-blank line: do not parse, reserialize, summarize, prepend
prose, append instructions, drop fields, or reconstruct any part of it.

For every native task item, set the item `id` to the returned operation's `actor_id` (the
descriptor's `actorId`), select the native role that matches the descriptor `role`, and set the
item assignment to that exact returned string. A mismatch fails closed before the child starts.

A batch repeats the complete sequence independently for each item: one `operation start`, one
returned assignment, and one matching `(id = actorId, role, assignment)` tuple. Never reuse an
operation, receipt, actor/assignment pair, or shared rewritten prompt across batch items.
Implementation predecessors and review correlation travel in each operation-produced descriptor,
including predecessor output; callers do not add, infer, or remove them.

The receiving agent reads the entry Concept and follows only useful links. Missing required entry
content blocks the assignment; missing optional links do not. Never substitute generated XML,
row JSON, JSONL manifests, `context/index.json`, rendered Reference slices, or accumulated chat.

## Role Entry Points

| Work | Entry and output |
|---|---|
| Brainstorm | framing Concept; update the assigned framing output |
| Research | question/framing Concept; write a bounded research or Reference Concept |
| Design | selected synthesis; write linked PRD, Design, decisions, and interfaces |
| QbD | design or authored work-map Concept; write one independent audit Concept |
| Implementation | descriptive work Concept; change bounded code and write linked handoff |
| Review | same work Concept, linked handoff, and changed code; write Review Concept |

Sub-agents do not spawn workflow sub-agents. OMP project agent frontmatter controls child tools;
Codex and Claude use their native agent definitions. Hooks pass mechanical identity and paths;
they do not render task meaning.

## Work and Review

`work/index.md`, when useful, communicates normal ordering and parallel groups in authored prose.
The main session interprets that view and uses the Harness to dispatch non-conflicting work. Do
not add an exact-topology filename grammar, `dependsOn`, `plan.json`, or another machine DAG.

An implementer writes or updates the promised handoff Concept and links it back to its work. An
independent reviewer reads the work, handoff, real diff, and useful design links, then writes a
Review Concept that states its subject, findings, commands/results, and verdict in readable
language. Python does not parse or duplicate that judgment into a row status or Evidence ledger.

## QbD and Human Decisions

QbD 1 challenges the problem, selected synthesis, requirements, design, sources, and interfaces.
QbD 2 challenges whether the work map and each bounded work Concept can realize the approved
design. The auditor writes only the assigned audit Concept. A model PASS is not human approval.

An audit is scoped to the current decision, unacceptable consequences, current change, and linked
prior human decisions. A blocking finding must connect evidence through a concrete consequence to
the decision, state the smallest remedy, and explain why hiding, disabling, narrowing scope,
`unavailable`, or another safe degradation is insufficient. `FAIL` requires evidence of a critical
falsehood, authorization or data violation, irreversible harm, or an unrealizable core path.
`NEEDS_EVIDENCE` applies only when missing evidence prevents judging such a consequence. Other
uncertainty and craft improvement are advisory; `PASS` may carry them as residual risk or later
verification.

The human decision is a linked Concept and determines the next action; a verdict never authorizes
an automatic repair or fresh audit. Advisory risk, `PASS` residual risk, or risk made non-blocking
by safe degradation may be accepted. An unresolved `FAIL` may only be repaired, removed or safely
degraded, deferred, or stopped. Material `NEEDS_EVIDENCE` may only receive evidence, removal or
safe degradation, deferral, or stop. Neither can enter implementation unchanged under an
"accepted risk" label.

If the human considers changing a non-negotiable boundary, return to Brainstorm/Design and record
the changed problem definition. When necessary, use a targeted, human-first Grill: the human
states the value and risk rationale, then the Agent supplies the strongest counter-case,
consequences, and a lighter degradation. A re-audit is a human-calibrated, scoped response to new
material evidence or substantive change; it inherits closed findings and prior decisions instead
of reopening them by default. Do not encode approval, materiality, or risk as runtime phase, gate
pointer, digest, parsed frontmatter, or Hook inference.

## Completion and Archive

Finish only after accepted work has current linked independent reviews and integration checks
satisfy the PRD. Use the native `omp-flow-wiki` Skill when evidence already supports immediate
promotion; temporary task reasoning remains in the Task Bundle.

Archive is an explicit directory operation. It is blocked while runtime operations are active and
preserves relative navigation. A committed Task checkpoint lets Archive issue a source commit/tree
and opaque archived-source receipt. Finish forwards that receipt to the native `omp-flow-sleep`
Skill; it never reconstructs an assignment from the moved path. Sleep creates reviewable Candidate
Concepts but cannot grant Wiki authority. Git is the authored history; runtime/session data and
acquisition caches remain ignored.

## Guardrails

1. Do not translate retired JSON/CSV/JSONL schemas one-for-one into Markdown.
2. Do not parse authored Markdown into phase, topology, status, dependency, gate, or verdict state.
3. Do not require fixed headings, list shapes, filename grammars, or link closure.
4. Do not reconstruct a context package or silently read a legacy store when an entry is missing.
5. Do not let an implementer provide its own independent review.
6. Do not treat a cache clone as accepted task knowledge.
7. Do not archive because native agents merely returned success.
8. Preserve unrelated user changes and report failed commands honestly.
9. Do not turn authored values, risk, materiality, an Explore anchor, or audit calibration into
   runtime state, a fixed Concept shape, or an exhaustive model thought process.
