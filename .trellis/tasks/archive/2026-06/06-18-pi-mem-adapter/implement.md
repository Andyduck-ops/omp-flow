# Implementation Plan: Pi support for `trellis mem`

## Pre-Implementation Checklist

- [x] Research Pi session file layout and semantics.
- [x] Read mem, core SDK, quality, and test specs.
- [ ] Run GitNexus impact analysis before editing each existing symbol touched.
- [ ] Keep all core changes zero-dependency and CLI-free.

## Ordered Steps

1. **Type and path surface**
   - Add `"pi"` to `MemSourceKind`.
   - Add Pi defaults to project aggregation.
   - Add Pi session path helpers in `internal/paths.ts`.

2. **Pi adapter**
   - Create `packages/core/src/mem/adapters/pi.ts`.
   - Implement loose Pi JSONL types.
   - Implement candidate file discovery.
   - Implement session listing with `sameProject` and `inRangeOverlap`.
   - Implement active-branch reconstruction.
   - Implement effective path conversion with compaction support.
   - Implement cleaned dialogue conversion.
   - Implement task boundary collection from `toolCall` and `bashExecution`.

3. **Core orchestration wiring**
   - Update `sessions.ts` imports and dispatchers.
   - Update `projects.ts` by-platform shape.
   - Ensure `readMemContext`, `extractMemDialogue`, and `searchMemSessions` work through existing paths.

4. **CLI wiring**
   - Add `pi` to valid platforms.
   - Update help text and CLI description references.
   - Keep OpenCode degraded warning behavior unchanged.

5. **Tests**
   - Add Pi adapter fixture tests in `packages/core/test/mem/adapters.test.ts` or a dedicated mem Pi adapter test if cleaner.
   - Add Pi phase tests in `packages/core/test/mem/phase.test.ts`.
   - Add public API tests for `platform: "pi"` and project aggregation.
   - Add CLI helper/integration tests for `--platform pi`.

6. **Validation**
   - Run targeted core mem tests.
   - Run targeted CLI mem tests.
   - Run package typecheck/build as needed.
   - Run `detect_changes()` or equivalent GitNexus change detection before finish/commit.

## Validation Commands

```bash
pnpm --filter @mindfoldhq/trellis-core test -- test/mem
pnpm --filter @mindfoldhq/trellis test -- test/commands/mem-helpers.test.ts test/commands/mem-integration.test.ts
pnpm --filter @mindfoldhq/trellis-core build
pnpm --filter @mindfoldhq/trellis typecheck
```

If targeted commands pass quickly, run broader checks:

```bash
pnpm test
pnpm typecheck
```

## Risk Points

- Active branch reconstruction: a linear scan would produce false positives from abandoned branches.
- Compaction: old entries remain in file; extraction must not leak discarded pre-compaction history.
- `turnIndex`: phase events must align with cleaned turns after compaction and branch filtering.
- Session root selection: default root and custom root have different directory shapes.
- Search/extract consistency: `piSearch` must search the same cleaned dialogue returned by `piExtractDialogue`.

## Rollback Plan

All changes should be isolated to `mem` type/platform wiring, one Pi adapter file, CLI platform validation/help, and tests. If a late issue appears, remove `pi` from `VALID_PLATFORMS` and `MemSourceKind` dispatch, leaving the adapter file unreferenced or reverting it entirely.
