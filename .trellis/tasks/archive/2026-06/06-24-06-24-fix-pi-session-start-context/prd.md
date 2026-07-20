# Fix Pi Trellis SessionStart context

## Goal

Fix issue #355 by making Pi expose stronger Trellis startup context to the model and preserving a manual start fallback.

## Requirements

- Pi must expose Trellis startup context to the model strongly enough for no-task sessions to notice Trellis workflow requirements.
- Pi must retain a user-invocable Trellis start fallback so users can manually bootstrap Trellis when automatic hooks are insufficient.
- The fix must stay scoped to Pi platform integration unless a shared helper change is required and covered by regression tests.
- Existing Pi tool/subagent behavior must remain unchanged.

## Acceptance Criteria

- [x] Generated Pi projects include a `/trellis-start` prompt.
- [x] Pi startup/agent hook context includes the Trellis SessionStart workflow overview, not only a UI notification plus the minimal no-task breadcrumb.
- [x] Existing Pi template tests pass.
- [x] A regression test covers the #355 no-task startup visibility behavior.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
