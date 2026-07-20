/**
 * Regression: omp/pi extension source naming aligned on `omp-flow` (row G-001).
 *
 * The M1 rebrand left the SOURCE extension dirs named `extensions/trellis/`
 * while `templates/omp/index.ts` and `templates/pi/index.ts` already call
 * `readTemplate("extensions/omp-flow/index.ts.txt")`. The mismatch made
 * `getExtensionTemplate()` throw ENOENT, aborting `omp-flow init`/`update`
 * whenever the omp or pi platform was configured (both `collectOmpTemplates()`
 * and `collectPiTemplates()` invoke it). The fix renames the source dirs to
 * `extensions/omp-flow/` so the readTemplate calls resolve.
 *
 * This test pins BOTH platforms (omp AND pi) so a future rename regression is
 * caught for either, and exercises the collect paths that were aborting.
 */

import { describe, it, expect } from "vitest";
import { getExtensionTemplate as getOmpExtensionTemplate } from "../../src/templates/omp/index.js";
import { getExtensionTemplate as getPiExtensionTemplate } from "../../src/templates/pi/index.js";
import { collectOmpTemplates } from "../../src/configurators/omp.js";
import { collectPiTemplates } from "../../src/configurators/pi.js";

describe("extension template resolution (omp/pi source naming)", () => {
  it("omp getExtensionTemplate() resolves without ENOENT", () => {
    expect(() => getOmpExtensionTemplate()).not.toThrow();
    expect(getOmpExtensionTemplate().length).toBeGreaterThan(0);
  });

  it("pi getExtensionTemplate() resolves without ENOENT", () => {
    expect(() => getPiExtensionTemplate()).not.toThrow();
    expect(getPiExtensionTemplate().length).toBeGreaterThan(0);
  });

  it("omp collect path emits the omp-flow extension key without throwing", () => {
    let files: Map<string, string> | undefined;
    expect(() => {
      files = collectOmpTemplates();
    }).not.toThrow();
    expect(files?.has(".omp/extensions/omp-flow/index.ts")).toBe(true);
    expect(
      files?.get(".omp/extensions/omp-flow/index.ts")?.length,
    ).toBeGreaterThan(0);
  });

  it("pi collect path emits the omp-flow extension key and settings reference it", () => {
    let files: Map<string, string> | undefined;
    expect(() => {
      files = collectPiTemplates();
    }).not.toThrow();
    expect(files?.has(".pi/extensions/omp-flow/index.ts")).toBe(true);
    // Deployed pi settings.json must point at the omp-flow extension path,
    // not the stale `trellis` name.
    const settings = files?.get(".pi/settings.json") ?? "";
    expect(settings).toContain("./extensions/omp-flow/index.ts");
    expect(settings).not.toContain("./extensions/trellis/index.ts");
  });
});
