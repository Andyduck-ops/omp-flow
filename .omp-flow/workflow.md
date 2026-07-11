# OMP-Flow Development Workflow

## Principles

1. Investigation precedes design; design precedes implementation.
2. Project files preserve evidence and decisions; chat is not the source of truth.
3. tasks.csv exact topology is the only executable DAG.
4. Harness-native agents, models, dispatch, progress, and cancellation remain native.
5. Python owns deterministic workflow state, context, validation, and evidence writes.
6. Missing required state fails visibly; no fabricated fallback or PASS.

## Phase Index

    Explore   -> brainstorm -> internal/external research -> reference digestion
              -> hypothesis/validation -> selected 90-synthesis
    Design    -> PRD + Design + Tier 3 context -> validation -> QbD 1 -> human gate
    Decompose -> exact-topology tasks.csv + row briefs -> validation -> QbD 2 -> human gate
    Execute   -> topology-ready native task wave -> independent review/evidence -> repeat
    Finish    -> integration check -> spec/knowhow harvest -> commit -> archive

Task creation seeds the complete directory/template structure, but creates no concrete CSV rows, row briefs, audits, verdicts, approvals, or PASS state.

## Workflow State Blocks

[workflow-state:no_task]
No active omp-flow task for this session. Discuss and classify the request first. Create a task only after the user agrees that the work should enter the project workflow.
[/workflow-state:no_task]

[workflow-state:explore]
Stay in exploration. Capture user direction in brainstorm.md; persist internal/external research under research/; digest selected Tier 1 anchors into reference/; finish with a selected research/90-synthesis-* that records the evidence or an explicit Research Gate skip rationale. Do not implement.
[/workflow-state:explore]

[workflow-state:design]
Build PRD, Design, and accepted context from the selected synthesis. Pass deterministic gate validation, then prepare and dispatch QbD 1 through the Harness-native auditor. Do not create executable rows before QbD 1 and human calibration pass.
[/workflow-state:design]

[workflow-state:qbd1]
QbD 1 is active. Use the prepared bounded evidence and exact qbd/qbd-1/audit-NNN.md path. Inspect the report through Python. PASS waits for a human decision; FAIL or NEEDS_EVIDENCE returns to investigation/design.
[/workflow-state:qbd1]

[workflow-state:decompose]
Create tasks.csv rows using exact topology IDs and matching .task/{fullId}.implement.md briefs. Bind Tier 2 reference and Tier 3 context explicitly. Validate grammar, dependency references, cycles, derived waves, and taskMd paths before QbD 2.
[/workflow-state:decompose]

[workflow-state:qbd2]
QbD 2 is active. Audit tasks.csv, every row brief, bindings, verification commands, and exact DAG. PASS waits for human calibration; approval freezes topology and changes phase to ready.
[/workflow-state:qbd2]

[workflow-state:ready]
Both gates are approved and topology is frozen. Run task start through the Python control plane before implementation.
[/workflow-state:ready]

[workflow-state:execute]
Select topology-ready rows through Python. OMP pushes context into native task assignments; Codex custom agents pull the same context from Python and may run inline when native collaboration is unavailable. Executor completion moves a row to review, not completed. Independent reviewer PASS evidence is required before dependents unlock.
[/workflow-state:execute]

[workflow-state:finish]
All rows are complete. Run final integration verification, deliberately update specs/knowhow when durable knowledge exists, commit through the Harness Git workflow, then mark complete and archive. Never invent a default learning.
[/workflow-state:finish]

[workflow-state:completed]
The task is complete and may be archived. Archive clears every session pointer targeting this task.
[/workflow-state:completed]

[workflow-state:stale]
The active session points to a missing or archived task. Clear or select a valid task explicitly; do not infer from another session.
[/workflow-state:stale]

## Artifact Ownership

| Artifact | Owner | Purpose |
|---|---|---|
| brainstorm.md | Main/human | Raw direction, alternatives, convergence |
| research/*.md | Research roles | Internal/external evidence, comparison, validation, synthesis |
| reference/* + metadata | Python | Tier 2 source slices with provenance |
| context/* | Architect | Accepted ADR, interface, brief, finding contracts |
| prd.md and design.md | Architect | Committed requirements and technical design |
| qbd/qbd-1/* and qbd/qbd-2/* | Auditor/Python/human | Numbered audits and decisions |
| tasks.csv | Architect content, Python state writes | Exact row DAG/index |
| .task/{fullId}.implement.md | Architect | Canonical row brief |
| .task/{fullId}.review.md | Reviewer | Independent findings and test evidence |
| verdict JSON and evidence.csv | Python | Structured review result and append history |

## Exact Topology

    A-001                current A-001, no dependencies
    A-A002--003          current A-003, depends on A-002
    C-A002B001--003      current C-003, depends on A-002 and B-001

- Root ID is Unit-Seq.
- Dependent ID is Unit-DependencyRefs--Seq; each dependency ref is encoded as A002.
- Unit is one uppercase letter and Seq is three digits in schema v1.
- The full ID names every row artifact.
- wave is derived from exact dependencies and must match Python validation.
- Parent/child task trees do not encode row dependencies.
- New tasks never add dependsOn or plan.json.

## Agent Routing

The `omp-flow` router skill reads Python workflow state and loads exactly one phase skill:

| Phase | Main-session skill |
|---|---|
| explore | omp-flow-brainstorm, then omp-flow-research |
| design | omp-flow-design |
| qbd1 or qbd2 | omp-flow-qbd |
| decompose | omp-flow-decompose |
| ready or execute | omp-flow-execute |
| finish or completed | omp-flow-finish |

`omp-flow-debug` handles unexpected failures. `omp-flow-implement` and `omp-flow-check` shape one bounded row in native agents or an explicitly selected inline mode; they do not replace the main router.

| Work | Agent or mode |
|---|---|
| Brainstorm and user calibration | Main plus brainstorm skill |
| Internal/external investigation | researcher through the selected Harness adapter |
| PRD/Design/context/decomposition | architect |
| QbD 1/QbD 2 | qbd-auditor through native dispatch |
| Row implementation | OMP executor push adapter; Codex implement pull adapter or inline |
| Row review | reviewer independent of executor |
| Complex diagnosis | oracle/explore as needed |

Sub-agents do not spawn workflow sub-agents. OMP project agent frontmatter controls child tools and native model slots. No custom omp-flow model aliases are required.

## Portable Commands

    python .omp-flow/scripts/omp_flow.py status
    python .omp-flow/scripts/omp_flow.py task create "Title"
    python .omp-flow/scripts/omp_flow.py task current
    python .omp-flow/scripts/omp_flow.py workflow select-synthesis --path research/90-synthesis-001-handoff.md
    python .omp-flow/scripts/omp_flow.py context --role architect
    python .omp-flow/scripts/omp_flow.py reference digest-file ...
    python .omp-flow/scripts/omp_flow.py topology validate
    python .omp-flow/scripts/omp_flow.py gate prepare qbd1
    python .omp-flow/scripts/omp_flow.py gate inspect qbd1
    python .omp-flow/scripts/omp_flow.py gate decide qbd1 --decision pass --note "..."
    python .omp-flow/scripts/omp_flow.py topology ready --role executor
    python .omp-flow/scripts/omp_flow.py evidence submit ...
    python .omp-flow/scripts/omp_flow.py task finish
    python .omp-flow/scripts/omp_flow.py task archive

On systems where Python 3 is exposed as python3, use python3.

## Guardrails

1. Research reports and synthesis are not PRD/Design.
2. Deterministic validation is not QbD.
3. QbD model PASS is not human approval.
4. Executor success is not reviewer PASS.
5. Row completion requires current PASS evidence.
6. Exact topology and row artifact names freeze after QbD 2 human approval.
7. Legacy state is diagnosed explicitly and never merged silently into the new DAG.
8. Harness Hooks translate events; they do not own workflow semantics.
