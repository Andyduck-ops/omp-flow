import { describe, expect, it } from "vitest";
import {
  SHARED_HOOKS_BY_PLATFORM,
  getSharedHookScripts,
  getSharedHookScriptsForPlatform,
  type SharedHookPlatform,
} from "../../src/templates/shared-hooks/index.js";

// D1/D2 (band 3): Trellis's four shared hook scripts — session-start.py,
// inject-workflow-state.py, inject-subagent-context.py,
// inject-shell-session-context.py — are DELETED. omp-flow's Claude hooks own
// workflow-state injection (templates/claude/hooks/*.py); the shared-hooks
// mechanism is kept as a NO-OP so M2 platforms can be re-wired without new
// plumbing. This suite shrinks to the emptied-mechanism assertions: no shared
// hook file survives, so nothing is ever installed via the shared-hooks path.

describe("shared-hooks emptied mechanism (D1)", () => {
  it("ships zero shared-hook scripts (all four Trellis hooks deleted)", () => {
    expect(getSharedHookScripts()).toEqual([]);
  });

  it("never resolves a shared hook for any platform (no-op install path)", () => {
    for (const platform of Object.keys(
      SHARED_HOOKS_BY_PLATFORM,
    ) as SharedHookPlatform[]) {
      expect(getSharedHookScriptsForPlatform(platform)).toEqual([]);
    }
  });

  it("does not distribute the generated statusline.py hook", () => {
    const names = new Set(getSharedHookScripts().map((h) => h.name));
    expect(names.has("statusline.py")).toBe(false);
  });

  it("keeps the mechanism exports live for future (M2) platforms", () => {
    // The registry object + resolver survive (emptied of real files) so a
    // future milestone can re-populate them without re-adding plumbing.
    expect(typeof getSharedHookScripts).toBe("function");
    expect(typeof getSharedHookScriptsForPlatform).toBe("function");
    expect(typeof SHARED_HOOKS_BY_PLATFORM).toBe("object");
  });
});
