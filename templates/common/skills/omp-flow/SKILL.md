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
Bundle, open its root index, and load `omp-flow-brainstorm`.

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
brainstorm <-> research -> selected synthesis -> design -> QbD 1
                       -> work map -> QbD 2 -> execute/review -> finish
```

- Brainstorm and research are distinct but may alternate whenever evidence reframes the question.
- Investigation precedes design. A skipped investigation requires an explicit, linked reason.
- Design precedes decomposition and implementation.
- QbD model PASS is not human approval.
- An implementation handoff is not independent review.
- Reviewer identity must differ from the completed implementation operation it reviews.
- Missing required entry content, unsafe paths, identity, or native completion fails visibly.

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

## Red Flags

Stop and correct course when reasoning includes:

| Thought | Required correction |
|---|---|
| "This is simple; start coding" | Classify the request and inspect workflow state first |
| "We can encode the missing state field" | Improve the relevant Concept or clarify with the user |
| "Research finished, so framing cannot change" | Re-enter brainstorm when evidence changes the question |
| "The model audit passed, so continue" | Wait for recorded human calibration |
| "The implementer tested it, so review is complete" | Dispatch an independent Reviewer |
| "The Hook should infer the missing task or entry" | Select explicit paths or fail visibly |
| "Paste all prior findings into the prompt" | Bind and pass durable artifact paths |

Do not introduce encoded persistent work identifiers, a second dependency graph, or a Markdown
parser. Authored indexes and prose communicate normal order and grouping.
