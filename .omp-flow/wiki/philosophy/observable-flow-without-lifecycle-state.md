---
type: "Working Philosophy"
title: "Observable methodology without lifecycle state"
description: "Make one selected task Bundle and its current reasoning work legible without turning authored knowledge into a machine lifecycle."
---

# Observe the task people mean

The primary object in Flow Status is one selected root task Bundle, for example
`07-30-omp-flow-tui-control`. It is the project initiative the session is working on, not one
member of a native Harness task list and not one implementation work item.

The status line should answer two questions in order:

1. **What initiative is this terminal working on?**
2. **Where is that initiative's methodology currently focused, and what useful bounded measure
   exists there?**

That distinction prevents the ambiguous `Tasks 0/6` presentation from making a native task-set
count look like the identity or progress of the root Bundle.

The preferred two-row shape is:

```text
 Task · 07-30-omp-flow-tui-control  Sonnet 4  ctx 38%  main +5 
 Flow 6/9 · Execute  Work 4/13 ████░░░░░░░░░  Review · Round 2 
```

The first row identifies the selected root task and keeps native, already useful model, context,
and Git information. A friendly title may replace the full task ID under width pressure only when
an owning source explicitly supplies it. The display does not parse `task.md` to manufacture one.

The second row presents methodology orientation and phase-specific detail. It contains at most one
graphical bar, and that bar always remains next to its label and ratio.

# One Explore spiral, not a false handoff

[The workflow](../../../templates/.omp-flow/workflow.md) defines Brainstorm and Research as
distinct reasoning activities in one Explore spiral. Questions drive investigation; evidence may
reframe the question; reframing drives more investigation. Showing them as sequential completed
phases would hide the most valuable part of the method.

The candidate visible positions are therefore:

| Position | Visible name | What may expand beside it |
|---|---|---|
| 1/9 | Explore | Brainstorm or Research focus, meaningful Explore round, an explicit question or source measure |
| 2/9 | Design | PRD, design, decision, or interface work with an explicit local measure |
| 3/9 | QbD 1 | Independent design-audit attempt, verdict, blockers, or human calibration |
| 4/9 | Decompose | Authored work map and the bounded Work set it establishes |
| 5/9 | QbD 2 | Independent work-map audit attempt, verdict, blockers, or human calibration |
| 6/9 | Execute | Accepted Work progress, current Work, Implement/Review focus, and review or rework round |
| 7/9 | Integrate | Explicit integration and verification checks |
| 8/9 | Wiki | Deliberate durable knowledge harvest |
| 9/9 | Finish | Remaining completion, commit, and archive work |

These numbers are an orientation vocabulary for the normal reasoning direction. They are not an
irreversible state machine and must not be presented as proof that a percentage of the initiative
is complete. New evidence can move the current focus from Execute back to Design or Explore, and a
failed audit can reopen its owning knowledge.

`Wiki` names the deliberate completion-time knowledge harvest. It does not imply that the Wiki can
only be consulted or improved at position 8; durable knowledge may inform decisions throughout
the task.

# Count meaningful iterations

Iteration counts are useful only when their increment boundary has methodological meaning.
Messages, prompts, tool calls, file writes, elapsed time, and directory changes are not rounds.

## Explore rounds

An Explore round begins when the initiative adopts a materially new framing or reopens exploration
because evidence, audit, review, or implementation invalidated the prior synthesis. Brainstorm and
Research may alternate many times inside one round without incrementing it.

```text
 Flow 1/9 · Explore  Round 3 · Research  Sources 5/8 █████░░░ 
```

Typical durable reasons for a new round are:

- external evidence overturns an important assumption;
- the problem or success criteria are materially reframed;
- QbD or implementation returns the task to exploration; or
- an already selected synthesis is deliberately reopened.

## QbD attempts

Each fresh independent audit is one attempt. QbD 1 and QbD 2 keep separate attempt counts because
they challenge different subjects. A PASS does not imply human approval.

```text
 Flow 3/9 · QbD 1  Attempt 3 · PASS  ⚠ Input 
```

Completion audits or later repair audits should retain their own explicit scope rather than being
folded into a misleading global QbD counter.

## Review and rework rounds

Review rounds are scoped to one bounded Work item. Each fresh independent review of that Work is
one round. `CHANGES_REQUESTED` leads to repair and a later review round; only an accepted current
review makes the Work eligible to count as accepted.

```text
 Flow 6/9 · Execute  Work 4/13 ████░░░░░░░░░  Review · Round 2 
```

Executor completion alone does not advance the accepted numerator. This makes the visible Work
measure represent reviewed delivery rather than optimistic activity.

# Let the useful denominator own the bar

The graphical bar is adaptive, but its semantics are not.

- During Explore or Design, it may show an explicitly authored or source-owned local measure such
  as `Sources 5/8` or `Checks 3/5`.
- During QbD, attempt number is historical effort, not progress. A bar appears only if the audit
  has a separate stable bounded measure.
- After Decompose establishes a complete Work set, Execute normally gives the bar to accepted
  Work, such as `Work 4/13`.
- Integrate, Wiki, or Finish may use a bounded check or harvest measure when the owning source
  explicitly supplies its denominator.
- When there is no honest denominator, the bar is omitted. Flow position, round, attempt, and age
  must never be relabelled as percentage completion.

There is at most one bar because two competing graphical measures make the footer harder to scan.
Additional facts remain labelled ratios or short state labels.

Width degradation preserves meaning:

```text
full     Flow 6/9 · Execute | Work 4/13 [bar] | Claude Hook | Review · Round 2
compact  F6/9 · Execute     | Work 4/13       | Review 2
minimal  F6/9               | W4/13           | Review 2
```

The first row may shorten an explicitly supplied friendly task label, and optional native detail
may compact according to the host. Attention requiring input, recovery, or inspection survives
longer than decorative prose. A missing or stale source produces omission or a clear degraded
state, not old confident progress.

# Keep source ownership explicit

The display is a projection, not the record of truth.

| Visible fact | Durable or mechanical owner |
|---|---|
| Selected root task ID | Session/runtime task selection and confined Bundle path |
| Task purpose, title, framing, rounds, audit meaning, Work intent, decisions | Authored Bundle Concepts |
| Current Flow focus and a safe friendly label | Explicit orchestrator/Harness publication after interpreting the Bundle |
| Native task activity, actor progress, waiting, failure | Harness-native structured observations |
| QbD attempt and verdict | Fresh independent audit Concept plus explicit human decision where required |
| Accepted Work numerator | Current linked handoff and independent accepted Review, explicitly published for display |
| Progress denominator | The source that owns the complete bounded set |
| Wave, ordering, concurrency, dependencies | Authored work map interpreted by the orchestrator and native Harness |

Durable Bundle Concepts remain the auditable record. The runtime may preserve session selection,
identity, locks, atomic side effects, and opaque operation receipts. Harness observations may feed
a fresh display snapshot. None of those layers should scrape Markdown headings, infer state from
directory names, count receipts as semantic progress, or copy task meaning into a lifecycle
database or hidden Evidence ledger.

The orchestrator can read authored Concepts and explicitly publish a display fact. That is
different from teaching Python or an adapter to parse Markdown into phase, verdict, dependency, or
completion state.

# Keep Wave in detail, not the default footer

Wave grouping is valuable for dispatch order, concurrency, and dependency-aware coordination.
It usually does not answer either of the footer's primary questions. Showing `W2/4` by default
would spend scarce width on scheduling topology while hiding the selected initiative or current
Work.

Wave belongs in drill-down detail or a temporary execution view when it materially explains why
work is waiting. The normal footer prefers root Task, Flow focus, accepted Work progress, current
Work, review state, and actionable attention.

# Use the record to improve the method

Meaningful Explore rounds, separate QbD attempts, and per-Work review/rework rounds can expose
recurring system weaknesses at knowledge-harvest time:

- repeated Explore reopening may reveal premature synthesis;
- repeated QbD findings may reveal missing source or interface expectations;
- repeated Work review rounds may reveal weak decomposition or acceptance criteria; and
- long gaps between implementation and acceptance may reveal review coordination problems.

The task Bundle records the concrete history and reasons. The Wiki should retain only evidenced,
reusable patterns after deliberate harvest. No always-on telemetry database is needed to obtain
that learning.

# Current implementation boundary

Flow Status v2 implements this model through an explicit main-session publisher, a closed portable
receiver, one scoped cache envelope, and two ccstatusline views. Root Task/Flow authority has a
10–15 minute lease; only the semantic publisher may renew it, and selection/session shutdown
explicitly clears it. Harness-native task observations remain useful but are stored and rendered
only as the separately labelled `nativeActivity` branch.

The Claude integration adds a narrow TaskUpdate authorization boundary for the five managed
omp-flow agents. It binds one agent to one fresh complete TaskList member and accepts only bounded
progress updates; it does not turn Claude tasks into workflow state. Stock Codex remains a
read-only detail surface, and Oh My Pi owns only its `flow-status` status key/command.

The durable rationale remains this page. Concrete publication schemas, setup ownership, renderer
pinning, and verification evidence live in the
[archived TUI Flow Status task](../../tasks/archive/2026-07/07-30-omp-flow-tui-control/index.md)
and its linked Concepts.
