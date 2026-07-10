---
name: omp-flow
description: Project workflow using a deterministic Python control plane and Harness-native agents.
---

# OMP-Flow

Use this skill when work should be persisted as an omp-flow task.

## Contract

- Read `.omp-flow/workflow.md`; it is the workflow semantic source.
- Run lifecycle, context, topology, reference, gate, and evidence operations through `.omp-flow/scripts/omp_flow.py`.
- Use Harness-native `task` for sub-agents. Do not look for custom `omp_flow_*` tools.
- Treat `task.json` as lifecycle state and `tasks.csv` exact topology as the only execution DAG.
- Active task is session-scoped under `.omp-flow/.runtime/sessions/`.
- Missing state fails visibly. Never fabricate context, PASS, evidence, or approval.

## Sequence

1. Create or select a task.
2. Brainstorm with the user.
3. Run internal and/or external Research Gate.
4. Digest selected Tier 1 source anchors into task-local Tier 2 reference.
5. Select one `research/90-synthesis-*.md` through `workflow select-synthesis`.
6. Produce PRD, design, and Tier 3 context.
7. Prepare, audit, inspect, and obtain human approval for QbD 1.
8. Create exact-topology rows and matching implementation briefs.
9. Prepare, audit, inspect, and obtain human approval for QbD 2.
10. Start execution, dispatch ready rows, independently review, and submit evidence.
11. Finish only after every row is complete; harvest deliberate durable knowledge and archive.

Root row IDs are `A-001`. Dependent IDs encode exact upstream rows, such as `A-A002--003` and `C-A002B001--003`. Never add `dependsOn`, `plan.json`, or `TASK-NNN.json`.
