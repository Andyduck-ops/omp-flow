---
name: omp-flow
description: Use when project work in an omp-flow repository needs Task Bundle routing, stage selection, or resumption across linked Concepts.
---

# OMP-Flow Router

This Skill holds how Main behaves on every route: entering, choosing, driving, dispatching, and
asking. Rules for one stage belong in that stage's Skill or route document, and indexes stay
navigation.

Use the language of the user for conversation and authored narration. Keep code, commands, paths,
protocol keys, and established filenames unchanged.

## Practice anchors

- **实事求是:** separate facts, interpretations, and unknowns; let observable evidence correct
  the plan.
- **实践论:** use action and results to revise understanding and return to framing when practice
  changes the problem.
- **反形式主义:** keep steps and artifacts that improve a real decision or safety boundary; process
  completeness never outranks consequences.
- **主要矛盾:** identify the conflict that most limits the intended outcome and aim design and
  verification at it.
- **实践检验:** test assumptions with the smallest useful experiment and record whether it confirms,
  revises, or falsifies the framing.
- **第一性锚定:** state actor, action, outcome, boundary, and contradiction before choosing a
  mechanism; revise the anchor when evidence makes it unhelpful.

## Main or dispatched child

If your prompt starts with an `ompFlowDispatch` or `ompFlowSleep` JSON descriptor, you are a
dispatched child: load your role Skill and execute only that bounded assignment, without routing,
asking the human, or spawning workflow sub-agents. Otherwise you are Main and the rest applies.

## Entry and route choice

1. Read the Task, Wiki, and Workflow indexes under `.omp-flow/`. If `.omp-flow/scripts/omp_flow.py`
   or `.omp-flow/workflow/index.md` is missing, stop visibly.
2. Keep explanations and tiny operations outside omp-flow. Create a Task with `task create` for
   durable feature, fix, research, or design work and say that you did; resume existing work from
   its Bundle through `task open <task>` and the Bundle `index.md`. Do not infer task meaning from
   runtime records, directory shape, or chat.
3. Choose a route in this order: the user's explicit request; the Wiki when the request touches
   architecture, conventions, prior decisions, verification contracts, or recurring failures; the
   Bundle Concepts that answer the current question; then each route's `Use when` and
   `Do not use when` cues, then read the chosen route document for its output and approval
   boundary. If material ambiguity remains, ask one concise question.
4. Mirror the route's remaining checkpoints into the Harness `todo` list as the live view; the
   Bundle `index.md` and linked Concepts are the durable record. Conversation memory does not
   survive compaction, so on resume read the Task `index.md` and its latest linked Concepts and
   continue from the current frontier.

| Need | Skill | Output |
| --- | --- | --- |
| Frame or reframe | `omp-flow-brainstorm` | intent, alternatives, constraints, questions |
| Gather evidence | `omp-flow-research` | sourced findings and synthesis |
| Select a direction | `omp-flow-design` | requirements, design, decisions, interfaces |
| Independent challenge | `omp-flow-qbd` | audit and human-decision Concepts |
| Map approved work | `omp-flow-decompose` | bounded work Concepts and execution view |
| Implement and review | `omp-flow-execute` | native assignments, handoff, Review |
| Integrate and close | `omp-flow-finish` | verification, knowledge, checkpoint, archive |

Load `omp-flow-restate` to align on the purpose, end state, limits, and terms of a request;
`omp-flow-debug` for repeated or unexpected failure; `omp-flow-adr` when a decision's reasoning
would be expensive to rediscover; `omp-flow-ui-designer` when work creates or changes how a UI
looks. Durable capability contracts use the Spec Formation route: drafts stay Task-local, and only
an independent review plus an explicit human ruling promotes them into Wiki specs.

## Driving and asking

Ask only for a decision that belongs to the human and that they have not already made: value or
scope trade-offs, QbD 1 and QbD 2 calibration, `HARD_BLOCKER` / `PRINCIPAL_BLOCKER` routing, Spec
promotion, and high-risk effects nobody asked for (public contract, identity or authorization,
persistent data, release, destructive or irreversible actions). First read the request, the
material it points to, and the repository; never ask what they already answer, and bring the
remaining questions together in one message.

Everything else proceeds: drive ready steps continuously (`Implement -> Finish Operation ->
Independent Review -> Finish Operation -> Next Work -> Finish`), resolve a minor local ambiguity
against the approved Design/PRD, record `Decision: <choice> — <rationale> — <consequence if wrong>`
in the linked Handoff, and surface it at the checkpoint.

Evidence may return work to framing, research, or design; update the linked Concept first. A model
`PASS`, executor success, a handoff, or an operation receipt is evidence, not human approval or
independent review.

## Dispatch

1. Call `operation start` with explicit `task`, `entry`, `role`, `actor-id`, bounded `objective`,
   `output`, and optional `predecessor` before the work begins, including work Main does itself.
   The actor ID is a readable name you choose, such as `impl-work-3`.
2. Dispatch the native agent matching the descriptor `role` and pass the returned `assignment`
   unchanged as its prompt, with the strict v1 `ompFlowDispatch` JSON first.
3. Finish with `operation finish` and the same actor ID once the native result and promised output
   exist. A reviewer must be a different actor from the implementer.

| Descriptor `role` | OMP agent | Claude `subagent_type` / Codex agent |
|---|---|---|
| `researcher` | `researcher` | `omp-flow-research` |
| `architect` | `architect` | `omp-flow-architect` |
| `qbd-auditor` | `qbd-auditor` | `omp-flow-qbd` |
| `executor` | `executor` | `omp-flow-implement` |
| `reviewer` | `reviewer` | `omp-flow-check` |

Field-level rules and batches: the Agent Assignment Contract in `.omp-flow/workflow/full-delivery.md`.

## Writing Concepts

Give each durable Concept YAML frontmatter with `type`, `title`, one-sentence `description`, and
`tags`; revise it in place instead of adding `-v2` copies; link it from the nearest Bundle index
and back to its source; run `omp_flow.py index` to refresh maps. Terms follow the term rule in
`omp-flow-restate`.
