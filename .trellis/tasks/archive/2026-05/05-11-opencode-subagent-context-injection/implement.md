# Implementation Plan

## Steps

- [ ] Add OpenCode sub-agent detection helper for `input.agent`.
- [ ] Make `session-start.js` skip `trellis-implement`, `trellis-check`, and `trellis-research`.
- [ ] Make `inject-workflow-state.js` skip the same Trellis sub-agents.
- [ ] Add JS single-session fallback to `TrellisContext.getActiveTask()`.
- [ ] Add `Active task: <path>` prompt fallback to `inject-subagent-context.js`.
- [ ] Make sub-agent context readers resolve task paths through `ctx.resolveTaskDir()`.
- [ ] Add `<!-- trellis-hook-injected -->` marker to OpenCode injected sub-agent prompts.
- [ ] Add OpenCode regression tests.
- [ ] Update `.trellis/spec/cli/backend/platform-integration.md`.
- [ ] Run targeted tests, lint, and typecheck.

## Validation Commands

```bash
pnpm --filter @mindfoldhq/trellis test -- test/templates/opencode.test.ts
pnpm --filter @mindfoldhq/trellis lint
pnpm --filter @mindfoldhq/trellis typecheck
```

## Rollback

Revert changes to:

- `packages/cli/src/templates/opencode/plugins/inject-subagent-context.js`
- `packages/cli/src/templates/opencode/plugins/session-start.js`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js`
- `packages/cli/src/templates/opencode/lib/trellis-context.js`
- `packages/cli/test/templates/opencode.test.ts`
- `.trellis/spec/cli/backend/platform-integration.md`

