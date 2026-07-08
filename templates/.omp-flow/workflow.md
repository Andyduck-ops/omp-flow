# OMP-Flow Development Workflow

## Core Principles
1. **Spec & PRD First**: Every task must be backed by a PRD under `.omp-flow/tasks/TASK-*/prd.md`.
2. **Context Package Contracts**: Subagents receive boundary contracts (`in_scope`, `out_of_scope`).
3. **Ralph 11-State FSM**: Execution steps advance automatically through `.omp-flow/fsm/status.json`.
4. **Self-Reinforcing Harvest**: Gotchas are harvested into `.omp-flow/knowhow/` after task completion.
