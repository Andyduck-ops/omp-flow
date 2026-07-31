---
name: flow-status
description: Inspect the current repository's validated Flow Status snapshot without changing tasks, operations, configuration, or terminal status.
---

# Flow Status

Use this Skill only for read-only Flow Status inspection.

1. Resolve the repository root containing `.omp-flow`.
2. Run the project-local supported inspect surface:

   ```text
   python -X utf8 .omp-flow/scripts/omp_flow.py --cwd <repository-root> status inspect --host codex --json
   ```

   Add `--session <host-session-id>` when the current public Harness surface supplies it. Use
   `python3` instead of `python` where that is the platform command. An absent or ambiguous exact
   scope is unavailable; never fall back to a newer Claude or Oh My Pi cache entry. Do not call
   another status renderer, inspect transcripts, or infer task facts from Markdown.
3. Report the task-set source and freshness, current task, literal assignment role and mapped
   position, task-local progress, and attention exactly when present.
4. If the response is unavailable, stale, clock-uncertain, malformed, disconnected, or
   scope-mismatched, say so. Do not preserve old counts, role, progress, approval, or current-task
   claims as current.

This surface is read-only. Do not use cached status to select or archive a task, start or finish an
operation, approve work, attach to or interrupt an agent, stop a process, edit `tui.status_line`,
or claim that Codex has a persistent third-party footer.
