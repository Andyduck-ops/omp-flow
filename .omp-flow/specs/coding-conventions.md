# Coding Conventions

> **Purpose**: Strict TypeScript standards for all code under `src/`. These rules exist because omp-flow runs inside an AI-agent harness where a single silent type hole or stray dynamic import can derail a multi-agent wave.

---

## Scope

Applies to every `.ts` file under `src/`. Generated artifacts under `.omp-flow/` (`.task/*.json`, `events.jsonl`, `status.json`) are exempt — they are data, not source.

---

## 1. Strict TypeScript

- **No `any`.** Not as a parameter type, not as a return type, not in a generic constraint, not inferred via `as any`.
- **No `as any`.** If you need to narrow a type, write a type guard (see §7).
- **No `// @ts-ignore` / `// @ts-expect-error`** without a comment naming the upstream bug or the planned fix. Unjustified suppressions are forbidden.
- `strict: true` is the floor, not the ceiling. Enable `noUncheckedIndexedAccess` mentally — indexing into an array returns `T | undefined`; handle it.
- `tsconfig.json` baseline: `target: ES2022`, `moduleResolution: NodeNext`, `module: NodeNext`.

```ts
// FORBIDDEN
function load(id: string): any { ... }
const raw = JSON.parse(text) as any;
// ALLOWED
function load(id: string): TaskRecord | undefined { ... }
const raw: unknown = JSON.parse(text);
```

---

## 2. Type-Only Imports

Use `import type` for any import that brings in only types (interfaces, type aliases, enums used as types). This keeps the runtime module graph lean and avoids circular-import surprises under NodeNext.

```ts
// REQUIRED
import type { Artifact, TaskDefinition } from '../core/state.js';
import { UnifiedWorkspaceManager } from '../core/state.js';
```

A mixed import (value + type) is fine as one statement; but if the symbol is **only** used in a type position, it MUST be `import type`.

---

## 3. Static Imports Only

- **No `await import()`.** No dynamic imports anywhere in `src/`.
- All module dependencies are resolved at load time via static `import`. This keeps the wave dispatcher's module graph deterministic — a wave cannot have one agent whose imports load later than another's.
- Import paths MUST carry the `.js` extension (NodeNext requirement): `from '../core/state.js'`, not `from '../core/state'`.

---

## 4. No Tiny Wrapper Functions

Do not create a function whose entire body is a single expression delegating to one other call. Inline it at the call site. Wrappers obscure the data flow and add an indirection the next maintainer must trace.

```ts
// FORBIDDEN
function readState(): OMPFlowWorkspaceState {
  return manager.getState();
}
// Where it would be used:
const state = readState();
// ALLOWED — inline
const state = manager.getState();
```

A wrapper is justified only when it adds a real invariant (validation, caching, defaulting, logging of an error path). "Renaming for readability" is not an invariant — name the variable well instead.

---

## 5. Zero External Runtime Dependencies

`package.json` `"dependencies"` MUST stay empty (or contain only the OMP harness's own runtime, never a third-party library). The only allowed `devDependencies` are the TypeScript compiler and the test runner.

- No `lodash`, no `chalk`, no `zod`, no `ajv`. If you need the behavior, write it inline against the language.
- Node built-ins (`fs`, `path`, `crypto`, `url`) are always available — use them directly.
- If a feature genuinely requires a library, raise it as an architecture decision in `architecture-constraints.md` first. Do not add the dependency and retrofit the spec.

```bash
# Verify before every yield
grep -A20 '"dependencies"' package.json
```

---

## 6. Module Resolution & Target

- `moduleResolution: NodeNext`
- `module: NodeNext`
- `target: ES2022`
- Every relative import ends in `.js` (the NodeNext convention for ESM-style emission).
- No `require()`. No `module.exports`. ESM only.

---

## 7. Error Handling

`catch` variables are `unknown`, never `any` and never untyped. Narrow with a type guard before touching fields.

```ts
// REQUIRED
try {
  await runStep(step);
} catch (err: unknown) {
  if (err instanceof Error) {
    console.error(`step ${step.id} failed: ${err.message}`);
  } else {
    console.error(`step ${step.id} failed: ${String(err)}`);
  }
  throw err; // or recover, explicitly
}
```

- Do not swallow errors silently. A `catch` that does nothing is a bug.
- Do not coerce with `as any` to read `.message`. Use `err instanceof Error`.
- Re-throw unless you have an explicit recovery path. Recovery paths must be commented.

---

## 8. File Naming

- **Files**: `kebab-case.ts` — `wave-planner.ts`, `drift-check-tool.ts`, `context-package.ts`. Multi-word identifiers in a filename are hyphenated, never camelCased.
- **Interfaces & Types**: `PascalCase` — `TaskRecord`, `WavePlan`, `OMPFlowWorkspaceState`.
- **Enums**: `PascalCase` for the enum, `PascalCase` for members.
- **Functions & variables**: `camelCase` — `generateWavePlan`, `checkConvergence`.
- **Constants**: `UPPER_SNAKE_CASE` for true module-level constants; `camelCase` for everything else.

---

## 9. Enforcement

- `npm run build` is the typecheck gate. It MUST pass before any yield.
- Reviewers check this spec via [review-standards.md](./review-standards.md) Finding dimension `maintainability` and `correctness`.
- A violation found in review is at minimum `medium` severity; an `any` that crosses a public API boundary is `high` or `critical`.

---

## Quick Reference

| Rule | One-liner |
|------|-----------|
| No `any` | Use a real type or `unknown` |
| `import type` | For type-only symbols |
| Static imports | No `await import()` |
| No wrappers | Inline one-liners |
| Zero deps | `package.json` deps empty |
| NodeNext + ES2022 | `.js` import suffixes |
| `unknown` errors | Type-guard, never `as any` |
| kebab-case files | `wave-planner.ts` |

---

**Related**: [architecture-constraints.md](./architecture-constraints.md) for *why* these rules exist; [review-standards.md](./review-standards.md) for *how* violations are scored.
