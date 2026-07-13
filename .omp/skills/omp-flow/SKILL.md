---
name: omp-flow
description: Route project work through the complete omp-flow lifecycle. Use when starting, resuming, classifying, or coordinating work in a repository containing .omp-flow, and before loading any phase-specific omp-flow skill.
---

# OMP-Flow Router

## User Language

Write user-facing conversation, workflow-state explanations, audit summaries,
questions, and handoff narration in the language used by the user in the
current conversation. When the user writes Chinese, respond in Chinese. Keep
code, commands, paths, protocol keys, and established artifact filenames in
their required form; do not translate executable identifiers.

This is the main-session router. It identifies the authoritative workflow state and loads exactly one phase skill. It does not implement rows or manufacture state.

## Start Here

1. Confirm `.omp-flow/config.json`, `.omp-flow/workflow.md`, and `.omp-flow/scripts/omp_flow.py` exist. If not, stop and ask whether to run `omp-flow init --omp`, `--codex`, or both.
2. Run `python .omp-flow/scripts/omp_flow.py workflow state`. Use `python3` only when that is the configured platform command.
3. Trust the Python result and the injected workflow-state block over chat memory.
4. If the command reports no session identity or a stale pointer, repair or select the task explicitly. Never borrow another session's active task.
5. Read `.omp-flow/workflow.md` when the state block or selected phase needs details not present in this router.

## Request Classification

When there is no active task, classify before creating one:

| Request | Action |
|---|---|
| Explanation, discussion, or tiny operation that should not persist | Work outside omp-flow |
| New feature, behavioral change, multi-file fix, research, or durable design work | Ask for task-creation consent |
| Resume an existing task | List tasks and select the explicit task ID |
| User explicitly requests omp-flow | Enter the workflow |

Do not create a task merely because a task could be useful. Once the user consents, use `omp-flow task create "<title>" --slug <slug>` and load `omp-flow-brainstorm`.

## Phase Routing

| Python phase | Required skill | Main responsibility |
|---|---|---|
| `explore` | `omp-flow-brainstorm`, then `omp-flow-research` | Direction, evidence, alternatives, selected synthesis |
| `design` | `omp-flow-design` | PRD, Design, Tier 3 contracts |
| `qbd1` | `omp-flow-qbd` | Independent problem/design audit and human decision |
| `decompose` | `omp-flow-decompose` | Exact topology and row briefs |
| `qbd2` | `omp-flow-qbd` | Independent execution-plan audit and human decision |
| `ready` or `execute` | `omp-flow-execute` | Native implementation/review loop |
| `finish` or `completed` | `omp-flow-finish` | Integration, harvest, commit, archive |

Load `omp-flow-debug` when a command, Hook, agent, test, or gate fails repeatedly or unexpectedly. Load `omp-flow-ui-designer` only for a row with substantial UI work.

## Authority Boundaries

- Python owns lifecycle, session pointers, exact topology validation, Reference provenance, QbD records, Evidence, and archive.
- Skills own main-session procedure and phase transitions.
- Agent definitions own child identity, tools, write boundaries, verification, and final handoff.
- Harness-native `task` owns spawn, models, concurrency, progress, cancellation, IRC, and result delivery.
- Hooks translate platform events and inject context. They do not decide workflow semantics.

Never look for custom `omp_flow_*` tools, a Ralph FSM, `plan.json`, `dependsOn`, or custom model aliases.

## Global Gates

The canonical order is:

```text
brainstorm -> research -> selected synthesis -> design -> QbD 1
           -> exact topology -> QbD 2 -> execute/review -> finish
```

- Investigation precedes design. A skipped Research Gate requires an explicit, persisted reason.
- Design precedes decomposition and implementation.
- Deterministic validation is not QbD.
- QbD model PASS is not human approval.
- Executor success moves a row to review; it is not completion.
- Reviewer PASS must be independent and submitted through Python Evidence.
- Missing state, bindings, briefs, identity, or evidence must fail visibly.

## Main-Session Handoff Contract

Every native task assignment must state:

1. Parent task ID and exact row ID when applicable.
2. Role and bounded objective.
3. Required input artifact paths.
4. Allowed output artifact path or code scope.
5. Verification and completion conditions.
6. Native agent ID when later Evidence submission requires it.

Pass artifact paths instead of pasting accumulated session history. Sub-agents do not spawn workflow sub-agents.

## Red Flags

Stop and correct course when reasoning includes:

| Thought | Required correction |
|---|---|
| "This is simple; start coding" | Classify the request and inspect workflow state first |
| "We can write the missing state file" | Use the Python command that owns it |
| "Research can happen after design" | Return to `explore` unless a valid skip reason exists |
| "The model audit passed, so continue" | Wait for recorded human calibration |
| "The executor tested it, so mark complete" | Dispatch an independent Reviewer |
| "The Hook should infer the missing task" | Select the task or fail visibly |
| "Paste all prior findings into the prompt" | Bind and pass durable artifact paths |

Root row IDs are `A-001`. Dependent IDs encode exact upstream rows, such as `A-A002--003` and `C-A002B001--003`. Never add `dependsOn`, `plan.json`, or `TASK-NNN.json`.
