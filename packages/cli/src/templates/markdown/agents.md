<!-- OMP-FLOW:START -->
# omp-flow Instructions

These instructions are for AI assistants working in this project.

This project is managed by omp-flow. The working knowledge you need lives under `.omp-flow/`:

- `.omp-flow/workflow.md` — development phases, when to create tasks, skill routing
- `.omp-flow/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.omp-flow/workspace/` — per-developer journals and session traces
- `.omp-flow/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If an omp-flow command is available on your platform (e.g. `/omp-flow:finish-work`, `/omp-flow:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable omp-flow skills
- `.codex/agents/` — optional custom subagents

Managed by omp-flow. Edits outside this block are preserved; edits inside may be overwritten by a future `omp-flow update`.

<!-- OMP-FLOW:END -->
