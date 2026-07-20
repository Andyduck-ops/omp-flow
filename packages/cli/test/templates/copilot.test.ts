import { describe, it } from "vitest";

// PARKED (parked: M2) — the copilot platform is not shipped in omp-flow M1 (Claude-only).
// Its Trellis-shaped tests were removed here; the platform registry + configurator remain
// in the tree and will be re-derived against omp-flow resources when copilot is un-parked at
// M2. Originals: `git show bde902c:packages/cli/test/templates/copilot.test.ts`.
// See design.md Verification (test disposition) + PRD R9/R10.
describe.skip("copilot platform [parked: M2 — non-claude platform, not shipped in omp-flow M1]", () => {
  it.skip("re-derive against omp-flow resources at M2", () => {});
});
