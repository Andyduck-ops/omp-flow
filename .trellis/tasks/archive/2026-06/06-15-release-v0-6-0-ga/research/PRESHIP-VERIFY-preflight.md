# Preship Verify — Preflight Chain (CHECK 7)

Run date: 2026-06-15
Branch: `feat/v0.6.0-rc`
Working tree: clean (per `git status` at session start)

## Verdict: PASS

All four preflight commands exited 0. Lockstep invariants hold.

## Lockstep Version Invariants

| Field | Value | Expected | OK |
| ----- | ----- | -------- | -- |
| `packages/cli/package.json` `version` | `0.6.0-rc.0` | `0.6.0-rc.0` | yes |
| `packages/core/package.json` `version` | `0.6.0-rc.0` | `0.6.0-rc.0` | yes |
| CLI == Core (lockstep) | match | match | yes |
| `packages/cli/package.json` `dependencies["@mindfoldhq/trellis-core"]` | `workspace:*` | `workspace:*` (rewritten at publish) | yes |

The `workspace:*` spec is the source-of-truth in-tree; `bump-versions.js promote` + `release-preflight verify-packed-cli` confirm that `npm pack` rewrites it to the exact published version (`0.6.0-rc.0` here).

## Command Results

### 1. `node packages/cli/scripts/check-docs-changelog.js --type promote`

- Exit code: `0`
- Tail:
  ```
  ✅ docs-site changelog wired for v0.6.0
  ```

### 2. `node packages/cli/scripts/release-preflight.js check-versions`

- Exit code: `0`
- Tail:
  ```
  ok versions match: @mindfoldhq/trellis-core@0.6.0-rc.0 = @mindfoldhq/trellis@0.6.0-rc.0
  ```

### 3. `node packages/cli/scripts/release-preflight.js verify-packed-cli`

- Exit code: `0`
- Tail:
  ```
  ok versions match: @mindfoldhq/trellis-core@0.6.0-rc.0 = @mindfoldhq/trellis@0.6.0-rc.0
  ok packed CLI pins @mindfoldhq/trellis-core to exact 0.6.0-rc.0.
  ```

### 4. `node packages/cli/scripts/release-preflight.js publish-plan`

- Exit code: `0`
- Tail:
  ```
  ok versions match: @mindfoldhq/trellis-core@0.6.0-rc.0 = @mindfoldhq/trellis@0.6.0-rc.0
  plan for v0.6.0-rc.0 -> npm tag "rc":
    @mindfoldhq/trellis-core@0.6.0-rc.0: skip (already on npm)
    @mindfoldhq/trellis@0.6.0-rc.0:  skip (already on npm)
  ```

## Notes

- `publish-plan` reports both packages as `skip (already on npm)` because the working tree is still at the RC version (`0.6.0-rc.0`) — the rc has been published. This is expected pre-promote. After `pnpm release:promote` bumps both packages to `0.6.0`, the plan will switch to a real publish against the `latest` dist-tag.
- `check-docs-changelog --type promote` validates that `docs-site/changelog/v0.6.0.mdx` (+ zh mirror) exist and are wired into `docs.json`, satisfying success criterion #8 from prd.md.
- `verify-packed-cli` confirms the `workspace:*` -> exact-version rewrite, which is critical for the first dual-package GA promote (prd.md risk #1).

## Outstanding (not in scope for CHECK 7)

The promote-time preflight chain (`check-versions`, `verify-packed-cli`, `publish-plan`) will need to be re-run after `bump-versions.js promote` flips both packages to `0.6.0`. This run only confirms the chain is green against the current RC state.
