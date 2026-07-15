# omp-flow — Milestone Ledger

This fork rebases the omp-flow methodology onto the Trellis framework
(upstream `Andyduck-ops/Trellis` v0.6.6 @ `bde902c`). Framework = platform /
release vehicle; omp-flow = methodology product. See `COPYRIGHT` for the
upstream attribution that MUST be preserved.

## M1 — Claude-first omp-flow on the fork  ✅ DELIVERED

Branch `m1-claude-rebase`, 7 commits on `bde902c`:

| Commit | Row | Delivered |
|--------|-----|-----------|
| `e32c45b` | B | Full mechanical rebrand `trellis`→`omp-flow` across `src/**` (paths, call sites, env vars, markers) |
| `005f8d3` | C | Migration-manifest + release-tooling reset |
| `a4e386e` | D | Removed pull-prelude machinery; emptied platform registries |
| `1cb46c6` | E | Claude configurator deploy wiring on dir-walk symmetry + M1 platform gate (non-claude flags park with exit 1) |
| `5b5f9ad` | F | Replaced the Trellis methodology templates with the omp-flow Python control plane (13 py, workflow.md 12-block, 12 skills, 5 agents, 5 hooks, settings.json) |
| `638fb7d` | G | Test-suite disposition (keep/rewrite/delete/park) + ported the fixture-driven parity suite |
| `a01c1f0` | I | Rebrand of the M1-active deploy-time content templates (config.yaml framework-only, agents.md markers, guides) |

**Acceptance (verified):** `pnpm build` green · `pnpm --dir packages/cli exec
vitest run test/omp-flow` = 14/14 parity green · row H final integration gate
PASS (independent reviewer adversarially reproduced AC3/AC4/AC6/AC10/AC12/AC13
+ F5 on the deploy surface; `init --claude` deploys a byte-identical toolchain,
`update` reports 0 drift, doctor ok).

## M2 — deferred backlog (documented, not yet owned)

Each item has an evidence anchor. None blocks M1.

1. **AC11 `packages/core/test/channel/seq.test.ts` — "strictly monotonic seqs
   under concurrent appends" flake.** Inherited Windows lock-contention flake;
   `packages/core/src/channel/internal/store/lock.ts` is byte-identical to
   `bde902c` and the test is rebrand-only. Independently reproduced 3/3 by the H
   reviewer. **Not an omp-flow regression** — monitor / raise upstream; do not
   patch omp-flow to mask it.

2. **`packages/cli/src/templates/claude/hooks/statusline.py` retains ~30
   `trellis` refs.** It is opt-in (`--with-statusline`), NOT deployed by default
   in M1, and is deliberately excluded from `getClaudeHooks()` and the AC3
   allowlist. M2: rebrand it or retire the opt-in.

3. **Missing AC7 expected-manifest fixture** under `packages/cli/test/omp-flow/`
   (interface `fork-resource-mapping` row 35). G follow-up: add an
   expected-manifest fixture so the deploy manifest is locked by a test.

4. **`packages/cli/src/.../template-fetcher.ts:19` hardcodes the
   `mindfold-ai/marketplace` default fetch URL** (Band-1 R2 deviation). `init`
   attempts an upstream fetch and falls back to blank when offline. M2: repoint
   to an omp-flow-owned source or make the default offline-first.

5. **Cosmetic:** `packages/core/test/channel/setup.ts:12` still uses the
   `mkdtemp` prefix `trellis-core-test-`; the npm name `omp-flow` has a
   pre-existing `0.1.5` on the registry (npm publish is an M1 non-goal).

## Beyond M2

- Additional harness adapters (M1 is Claude Code only; codex/opencode/etc. are
  parked with `parked` + milestone skip reasons in the test suite).
- OMP extension packaging.
