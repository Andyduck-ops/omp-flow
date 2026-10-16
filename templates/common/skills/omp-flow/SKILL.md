---
name: omp-flow
description: Route project work through an omp-flow task Bundle and its linked Concepts.
---

# OMP-Flow Router

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

## Entry and maps

1. Read the Task, Wiki, and Workflow indexes under `.omp-flow/tasks/`, `.omp-flow/wiki/`, and
   `.omp-flow/workflow/`. Use their ordinary links to find relevant knowledge and the applicable route.
2. Confirm `.omp-flow/scripts/omp_flow.py` and `.omp-flow/workflow/index.md`. If either is missing,
   stop visibly.
3. Open a Bundle through the canonical `task open <task> [--workspace <path>]` command when a
   WorkScope is needed, then use `task show <task> [--workspace <path>]` and the Bundle `index.md`.
   Follow only links useful to the request; do not infer task meaning from runtime records,
   directory shape, task counts, or chat.
4. If no task is active, keep explanations and tiny operations outside omp-flow; ask for task
   creation consent before durable feature, fix, research, or design work.

For a non-trivial Explore, record a provisional anchor before broad Research. Preserve the concrete
decision, non-negotiable human boundary, principal contradiction, and evidence that could revise
them. Mechanical low-ambiguity work may proceed directly. Do not pre-commit a mechanism merely
because it is easy to name.

## Bundle index stewardship

The Bundle root `index.md` is the live map for that Task. When a role creates, renames, moves, or
retires a Concept, it updates the nearest useful Bundle index in the same change with an ordinary
relative link and a short purpose. Before handoff, verify the entry Concept links to the new output
and that the output links back to its source. Do not enumerate every leaf or invent links merely to
make the map look complete; an intentionally unlinked scratch file remains outside the durable
navigation. Finish checks the entry → work → handoff → review path before archive.

## Route by need

| Need | Skill | Output |
| --- | --- | --- |
| Frame or reframe | `omp-flow-brainstorm` | intent, alternatives, constraints, questions |
| Gather evidence | `omp-flow-research` | sourced findings and synthesis |
| Select a direction | `omp-flow-design` | requirements, design, decisions, interfaces |
| Independent challenge | `omp-flow-qbd` | audit and human-decision Concepts |
| Map approved work | `omp-flow-decompose` | bounded work Concepts and execution view |
| Implement and review | `omp-flow-execute` | native assignments, handoff, Review |
| Integrate and close | `omp-flow-finish` | verification, knowledge, checkpoint, archive |

Load `omp-flow-debug` for repeated or unexpected command, Hook, agent, runtime, or product failure;
load `omp-flow-ui-designer` only for substantial UI work. Follow each selected Skill's ordinary
links for detailed governance and role duties.

Use the Spec Formation route in `workflow/index.md` for durable capability contracts. Drafts remain
Task-local; only an independent review plus an explicit human ruling can promote them into Wiki specs.

For Full Delivery, the authored direction is Brainstorm ↔ Research → Design → QbD 1 → Decompose →
QbD 2 → Execute/Review → Finish. Other routes follow their own verification and approval boundaries.
This is guidance, not a phase machine. Evidence may return work to framing
or design, and a material reframe updates the linked Concept before proceeding.

## Decision boundaries

The Bundle owns purpose, evidence, requirements, design, work, handoffs, reviews, audits, and human
decisions. Python owns only safe paths, identity, locks, atomic effects, operation receipts, and
requested directory moves. Skills own reasoning; Harnesses own native task execution and progress.
Do not add a lifecycle database, Markdown parser, second dispatcher, encoded dependency graph, or
machine phase state.

Investigation precedes design unless an authored reason records why accepted knowledge is sufficient.
QbD is an independent challenge; model `PASS` and executor success are not human approval. Present
material findings for human calibration before routing onward. An unresolved `FAIL` or material
`NEEDS_EVIDENCE` must be repaired, narrowed, safely degraded, deferred, removed, or stopped before
the unchanged scope proceeds. A reviewer must be a different actor from the implementation it
reviews; a handoff is not a Review.

## Operation contract

For every native assignment, call `operation start` with explicit `task`, `entry`, `role`,
`actor-id`, bounded `objective`, `output`, and optional `predecessor`. Forward its complete returned
`assignment` unchanged as the native task item. Keep the strict v1 `ompFlowDispatch` JSON first;
never parse, reserialize, prepend, append, infer, or drop fields. Set native item `id` to the
returned `actor_id`/`actorId` and use its descriptor role. Finish with the same actor ID. Sub-agents
do not spawn workflow sub-agents.

The entry must remain inside the Bundle; the explicit output may name a repository code scope or
Bundle Concept. A missing Concept, unsafe
path, identity mismatch, incomplete predecessor, or missing native completion is a visible failure.
Runtime correlation is mechanical; it does not parse authored Markdown or manufacture semantic
approval.

When work resumes, follow ordinary links from the Work Concept to its latest handoff, Review, and
applicable Design or decision. A repair handoff names the addressed finding and focused checks; a
different actor re-reviews the repaired scope. Repeated or contradictory findings need a human
ruling before another operation.

## Route returns

- Return to Brainstorm when evidence changes the problem, intended outcome, human boundary, or
  principal contradiction.
- Return to Research when a consequential claim lacks repository or primary external evidence.
- Return to Design when an approved direction cannot satisfy a requirement or verification path.
- Return to the owning Work or Design when implementation or integration exposes a contradiction.
- Re-audit only after human calibration requests it or a substantive scoped change warrants it.

Keep facts, interpretations, counter-evidence, decisions, and unknowns distinct in authored
Concepts. A selected direction is not implementation authorization; a completed implementation is
not independent acceptance. The applicable role Skill defines its own exit evidence and output
shape, while this Router only chooses the next useful route.

## Map maintenance

Update a Task or Wiki index when the work adds, renames, moves, or retires a useful discovery link.
Preserve ordinary links and free Markdown; do not require exhaustive leaf traversal, reverse-link
closure, hash manifests, or a fixed heading/schema. Keep the handoff linked to its Work Concept and record
changed files, commands/results, decisions, caveats, actor ID, and receipt.

Give every durable Concept parseable YAML frontmatter with `type`, `title`, one-sentence
`description`, and concise `tags: [...]` (plus optional `status: "draft" | "stable" | "deprecated"`).
Revise an existing Concept in place when the same decision, work item, or review evolves instead of
multiplying `-v2` or `-reaudit` duplicates. Run `python3 -X utf8 .omp-flow/scripts/omp_flow.py index`
(or let `task create`, `operation finish`, and `task archive` refresh Task maps) so frontmatter
remains the single source of truth for directory indexes.
