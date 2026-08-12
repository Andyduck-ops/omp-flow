---
name: omp-flow
description: Route project work through an omp-flow task Bundle. Use when starting, resuming, classifying, or coordinating work in a repository containing .omp-flow, and before loading a role-specific omp-flow skill.
---

# OMP-Flow Router

## User Language

Write user-facing conversation, workflow-state explanations, audit summaries,
questions, and handoff narration in the language used by the user in the
current conversation. When the user writes Chinese, respond in Chinese. Keep
code, commands, paths, protocol keys, and established artifact filenames in
their required form; do not translate executable identifiers.

This is the main-session router. It selects the active task Bundle and chooses the next useful
reasoning operation from its linked Concepts. It does not parse Markdown into workflow state,
implement work itself, or manufacture missing knowledge.

## Start Here

1. Confirm `.omp-flow/workflow.md` and `.omp-flow/scripts/omp_flow.py` exist. If not, stop and ask
   whether to initialize the requested Harness adapter.
2. Resolve this session's active task directory through the runtime or select one explicitly.
   Never borrow another session's active task.
3. Open the Bundle root `index.md`. Follow only links useful to the current request.
4. Read `.omp-flow/workflow.md` when the Bundle or requested operation needs details not present
   in this router.
5. Treat a missing root index or required entry Concept as a blocker. Do not fall back to
   `task.json`, CSV/JSONL stores, generated context, or chat reconstruction.

## Request Classification

When there is no active task, classify before creating one:

| Request | Action |
|---|---|
| Explanation, discussion, or tiny operation that should not persist | Work outside omp-flow |
| New feature, behavioral change, multi-file fix, research, or durable design work | Ask for task-creation consent |
| Resume an existing task | List Bundles and select the explicit task directory |
| User explicitly requests omp-flow | Enter the workflow |

Do not create a task merely because a task could be useful. Once the user consents, create the
Bundle, open its root index, and load `omp-flow-brainstorm`. When selecting work or framing a
bounded assignment, preserve the current concrete decision, non-sacrificable human boundary,
revisable principal contradiction（主要矛盾）, and evidence that could change it; do not pre-commit
a hypothetical mechanism merely because it is easy to name. For non-trivial Explore, Brainstorm
first forms a provisional first-principles anchor（第一性锚定）around that concrete problem;
mechanical low-ambiguity work does not need this ceremony.

## Operation Routing

| Bundle need | Required skill | Main responsibility |
|---|---|---|
| Framing or reframing | `omp-flow-brainstorm` | Intent, alternatives, constraints, open questions |
| Evidence needed | `omp-flow-research` | Repository/source investigation and synthesis |
| A direction is selected | `omp-flow-design` | PRD, Design, linked decisions and interfaces |
| Independent challenge needed | `omp-flow-qbd` | Audit Concept and human decision Concept |
| Work needs mapping | `omp-flow-decompose` | Descriptive work Concepts and authored grouping |
| Work is ready | `omp-flow-execute` | Native implementation/review assignments |
| Integrated outcome is ready | `omp-flow-finish` | Integration, harvest, commit, archive |

Load `omp-flow-debug` when a command, Hook, agent, test, or gate fails repeatedly or unexpectedly. Load `omp-flow-ui-designer` only for a row with substantial UI work.

## Authority Boundaries

- The Bundle owns task meaning: framing, sources, provenance, findings, decisions, work, handoffs,
  reviews, audits, and human decisions.
- Python owns only session identity, safe paths, actor/process identity, locks, atomic side
  effects, opaque dispatch receipts, and requested directory operations.
- Skills own reasoning procedure and navigation between linked Concepts.
- Agent definitions own child identity, tools, write boundaries, verification, and final handoff.
- Harness-native `task` owns spawn, models, concurrency, progress, cancellation, IRC, and result delivery.
- Hooks translate platform events and pass paths/identity. They do not decide workflow semantics
  or render a context package.

Never look for custom `omp_flow_*` tools, a Ralph FSM, `plan.json`, `dependsOn`, or custom model aliases.

## Global Gates

The normal direction is:

```text
provisional anchor -> brainstorm <-> research -> selected synthesis -> design -> QbD 1
                                         -> work map -> QbD 2 -> execute/review -> finish
```

- Brainstorm and research are distinct but may alternate whenever practice evidence confirms,
  revises, or falsifies the anchor. A material reframe returns to Brainstorm.
- Investigation precedes design. A skipped investigation requires an explicit, linked reason.
- Design precedes decomposition and implementation.
- QbD model PASS is not human approval.
- An implementation handoff is not independent review.
- Reviewer identity must differ from the completed implementation operation it reviews.
- Missing required entry content, unsafe paths, identity, or native completion fails visibly.

## Semantic Routing

- Before QbD, ensure the authored entry and useful links express the current decision,
  unacceptable consequences, scope, and relevant prior human decisions. Ask the human about
  missing values or risk tolerance; send repository-answerable uncertainty to Research.
- After QbD, present material findings and record human calibration before routing onward. A
  `FAIL` or `NEEDS_EVIDENCE` does not itself authorize repair or a fresh audit.
- Advisory risk, `PASS` residual risk, or risk made non-blocking by removal, disabling, narrowing,
  or safe degradation may be accepted. An unresolved `FAIL` routes only to repair, removal or safe
  degradation, deferral, or stop. Material `NEEDS_EVIDENCE` routes only to evidence, removal or
  safe degradation, deferral, or stop. Do not send the unchanged risky scope to Decompose or
  Execute as "accepted risk".
- If the human considers changing a non-negotiable boundary, return to Brainstorm/Design. When the
  change could alter the problem core or a critical consequence, use a targeted human-first Grill:
  obtain the human's value/risk rationale, then give the strongest counter-case, consequences, and
  a lighter degradation. The human confirms, modifies, or abandons the change.
- Re-audit only after human calibration calls for it or new material evidence/substantive change
  warrants a scoped challenge. Carry forward closed findings, accepted residual risk, the prior
  decision, and the exact change; do not reopen settled observations merely because the actor is
  fresh.
- These semantic judgments stay in authored Concepts. Mechanical identity, safe-path, receipt,
  and assignment failures remain fail-closed and are never downgraded by materiality.

## Main-Session Handoff Contract

Every native assignment must state:

1. Task Bundle root.
2. Role and bounded objective.
3. Most relevant entry Concept path.
4. Allowed output Concept path and/or code scope.
5. Native actor ID.
6. Opaque dispatch receipt and predecessor receipt when correlation matters.
7. Verification and completion conditions.

Use `operation start` with explicit `task`, `entry`, `role`, `actor-id`, `objective`, `output`, and
optional `predecessor`. It is the sole producer of the executable assignment: forward its complete
returned `assignment` string unchanged as the native task item's assignment. The strict v1
`ompFlowDispatch` JSON must remain the first non-blank line; do not parse, reserialize, prepend
prose, append instructions, infer fields, or drop fields.

Set the native item `id` to the returned operation's `actor_id`/descriptor `actorId`, and select
the role matching the descriptor `role`. For a batch, create one independent operation per item
and preserve each `(id = actorId, role, assignment)` tuple without mixing or reusing receipts.
Predecessor and predecessor-output correlation, including review, must come from that item's
operation-produced descriptor. `operation finish` binds the same actor ID. Sub-agents do not spawn
workflow sub-agents.

## Root Task / Flow Status publication

The main session is the sole semantic publisher for the selected root Task and its reversible
Flow orientation. `$flow-status` and the read-only `flow-status` Skill never publish, renew, or
clear. Do not ask Python, an adapter, a provider, or a Hook to infer these facts from Markdown,
directories, roles, receipts, prompts, transcripts, Git, or native task counts.

Use only the installed closed stdin commands:

```text
omp-flow flow-status publish --host <claude|codex|oh-my-pi|snow|cursor> --session <id> --actor-id <id>
omp-flow flow-status renew   --host <claude|codex|oh-my-pi|snow|cursor> --session <id> --actor-id <id>
omp-flow flow-status clear   --host <claude|codex|oh-my-pi|snow|cursor> --session <id> --actor-id <id>
```

Construct explicit `RootFlowSemanticInputV2` from the authored Concepts already read by the main
session. Publish:

1. after initial Bundle selection and authored orientation are known;
2. before every semantic position/focus, meaningful Explore reframe, independent audit attempt
   or calibration, Work-set revision, current Work, Review/Rework round, Integrate, Wiki, or
   Finish change is displayed or awaited;
3. after reading a current handoff and different-actor Review, with the complete current Work
   catalog—not only the current Work—so the production builder can derive acceptance;
4. before backtrack, reopen, or resume work continues; and
5. before Finish completion-audit/check/commit/archive work.

`Flow 1..9` is reversible orientation: Explore, Design, QbD 1, Decompose, QbD 2, Execute,
Integrate, Wiki, Finish. Explore Round increases only for meaningful evidence-driven reframing;
QbD 1, QbD 2, and completion-audit attempts are separate; Review/Rework rounds are per current
Work. Resume alone increments nothing. Accepted Work requires the current-revision handoff plus
an explicit different-actor accepted Review.

At the beginning and end of every main-session control turn, and before each native wait, inspect
the current lease. When no semantic change is pending and at most 300,000 ms remain, revalidate
the exact selected Task, host session, actor, publication revision, source revision, and lease,
then call `renew` with `semanticAssertion: "unchanged"`. Bound wait polling so control returns at
least once every 300,000 ms while work is active. Native observations, cache reads, status
renders, and child agents never renew.

Call `clear` on selection change, task clear, session end, Harness disconnect, publisher
shutdown, archive, user removal, or Flow Status removal. Resume publishes a fresh lease in the
new session; it never copies an old cache. If a publish/renew/clear command fails, report the
closed failure and leave the prior projection unchanged—never manufacture replacement meaning.

## Red Flags

Stop and correct course when reasoning includes:

| Thought | Required correction |
|---|---|
| "This is simple; start coding" | Classify the request and inspect workflow state first |
| "We can encode the missing state field" | Improve the relevant Concept or clarify with the user |
| "Research finished, so framing cannot change" | Re-enter brainstorm when evidence changes the question |
| "The model audit passed, so continue" | Wait for recorded human calibration |
| "The audit failed, so start another audit" | Present options and wait for a recorded human decision |
| "The user accepted the blocker" | Repair, safely degrade, remove, defer, or stop the unchanged dangerous scope |
| "The implementer tested it, so review is complete" | Dispatch an independent Reviewer |
| "The Hook should infer the missing task or entry" | Select explicit paths or fail visibly |
| "Paste all prior findings into the prompt" | Bind and pass durable artifact paths |

Do not introduce encoded persistent work identifiers, a second dependency graph, or a Markdown
parser. Authored indexes and prose communicate normal order and grouping.
