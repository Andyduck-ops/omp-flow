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

**Baseline note (correction):** M1's row G reduced cli failures 46→7 but did not
reach 0; the remaining residuals were git-subprocess parallel-load timeout flakes
plus 2 cross-platform test bugs (now fixed by M2 row F-001). The honest
Windows-host baseline is: the seq lock flake + git-subprocess parallel-load
timeout flakes (all pass in isolation).

## M2 — deferred findings cleanup  ✅ DELIVERED

M2 delivered on branch `m1-claude-rebase`, 6 rows, commits `0be6e89`..`ad9e5e6`.
Each M2 row resolves (or formally accepts) one M1-deferred finding.

| Commit | Row | Finding | Resolution |
|--------|-----|---------|------------|
| `0be6e89` | A-001 | #2 statusline | RESOLVED — rebrand + control-plane API drift fix + opt-in deploy restored |
| `9ba1d56` | B-001 | #4 template-fetcher | RESOLVED — hardcoded `mindfold-ai/marketplace` default excised |
| `0cc259c` | C-001 | #3 AC7 fixture | RESOLVED — expected-manifest fixture + test locks the deploy surface |
| `5121a88` | D-001 | #5 cosmetic | RESOLVED — `mkdtemp` prefix renamed to `omp-flow-core-test-` |
| `ad9e5e6` | F-001 | NEW cross-platform | RESOLVED — POSIX-hardcoded tests made platform-aware |
| — | E-A001B001C001D001--001 | #1 seq flake | ACCEPTED + documented (unchanged; no code masking) |

- **Finding #2 statusline (A-001, `0be6e89`)** — RESOLVED. Rebranded
  `statusline.py` trellis→omp-flow AND fixed the control-plane API drift (was
  calling the old `resolve_active_task(..., platform=)` / `active.task_path` API
  outside any guard → would crash on an active task once rebranded; now uses
  `resolve_active_task(repo, payload)` + `active.task_id`, wrapped fail-open).
  Restored the `--with-statusline`-gated deploy with `settings.statusLine`
  byte-parity to `preserveExistingClaudeStatusLine`; statusline stays opt-in
  (excluded from `getClaudeHooks`, not `update`-tracked). Executing smoke test
  proves no crash.

- **Finding #4 template-fetcher (B-001, `9ba1d56`)** — RESOLVED. Excised the
  hardcoded `mindfold-ai/marketplace` default (`TEMPLATE_INDEX_URL` deleted);
  `fetchTemplateIndex` no-ops to `[]` when no source; non-native workflow id with
  no source silently falls back to native; explicit
  `--registry`/`--workflow-source` unchanged.

- **Finding #3 AC7 fixture (C-001, `0cc259c`)** — RESOLVED. Added
  `packages/cli/test/omp-flow/fixtures/expected-manifest.json` (seeded from a real
  `init --claude` run) + `manifest.test.ts` locking the default deploy surface
  (statusline excluded, opt-in).

- **Finding #5 cosmetic (D-001, `5121a88`)** — RESOLVED. Renamed the
  `trellis-core-test-` mkdtemp prefix to `omp-flow-core-test-`.

- **NEW — cross-platform test portability (F-001, `ad9e5e6`)** — RESOLVED
  (discovered during M2 integration verify). Two inherited tests were
  POSIX-hardcoded though the production code was already cross-platform-correct:
  `upgrade.test.ts` expected `npm`/`which omp-flow` but win32 emits
  `cmd.exe …`/`where omp-flow`; `mem-helpers.test.ts` expected a raw POSIX cwd
  though `mem.ts` uses `path.resolve`. Fixed the TESTS to derive expectations from
  `process.platform` / `path.resolve` (test-only; production untouched).
  **Durable lesson: cross-platform Node test assertions must derive expected
  paths/commands from `process.platform` / `path.resolve` / `path.join`, never
  hardcode one OS's form.**

- **Finding #1 seq flake (E-A001B001C001D001--001)** — ACCEPTED + documented
  (unchanged). Inherited Windows lock-contention flake in `seq.test.ts >
  "strictly monotonic seqs under concurrent appends"`; `lock.ts` byte-identical to
  `bde902c`. Not masked. A future upstream sync could adopt backoff+jitter (à la
  `proper-lockfile`); out of scope here.

**M2 acceptance (verified by the E integration row + independent review):**
`pnpm build` green; full suite 1052 tests, 0 failures attributable to any
M2-edited file; the only failures are inherited git-subprocess/parallel-load
timeout flakes (`template-fetcher.test.ts`,
`init-uninstall-overdelete.integration.test.ts` — both pass in isolation) + the
seq lock flake. AC-FROZEN intact (LICENSE unchanged; `Copyright (C) 2026 Mindfold
LLC` preserved; linear history; no upstream push).

## Beyond M2

- Additional harness adapters (M1/M2 are Claude Code only; codex/opencode/etc. are
  parked with `parked` + milestone skip reasons in the test suite).
- OMP extension packaging.
- npm publish (the npm name `omp-flow` has a pre-existing `0.1.5` on the registry;
  publish remains a non-goal to date).
- Potential upstream sync adopting `lock.ts` backoff+jitter (à la
  `proper-lockfile`) to retire the inherited seq lock-contention flake.
