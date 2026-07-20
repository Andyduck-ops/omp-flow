import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf-8"));
}

describe("0.2.0 release artifacts", () => {
  it("keeps CLI and core versions synchronized without laptop provenance", () => {
    const cli = readJson("packages/cli/package.json");
    const core = readJson("packages/core/package.json");

    expect(cli.version).toBe("0.2.0");
    expect(core.version).toBe("0.2.0");
    expect(core.publishConfig).toEqual({ access: "public" });
  });

  it("declares the unrelated 0.1.x lineage and fresh init path", () => {
    const manifest = readJson(
      "packages/cli/src/migrations/manifests/0.2.0.json",
    );

    expect(manifest.version).toBe("0.2.0");
    expect(manifest.breaking).toBe(true);
    expect(manifest.recommendMigrate).toBe(true);
    expect(manifest.description).toBeTruthy();
    expect(manifest.changelog).toBeTruthy();
    expect(manifest.migrationGuide).toMatch(/unrelated/);
    expect(manifest.migrationGuide).toMatch(/omp-flow init/);
    expect(manifest.aiInstructions).toBeTruthy();
  });

  it("limits continuity exceptions to the documented foreign releases", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "packages/cli/scripts/check-manifest-continuity.js"),
      "utf-8",
    );

    const match = source.match(/const KNOWN_GAPS = new Set\(\[([^\]]*)\]\);/);
    expect(match).not.toBeNull();
    const gaps = Array.from(match?.[1].matchAll(/"([^"]+)"/g) ?? []).map(
      (item) => item[1],
    );
    expect(gaps).toEqual(["0.1.1", "0.1.2", "0.1.3", "0.1.4", "0.1.5"]);
    expect(source).toContain("unrelated oh-my-pi/maestro");
  });

  it("keeps publication human-only and product-bound", () => {
    const runbook = fs.readFileSync(
      path.join(repoRoot, "docs/RELEASE-0.2.0-runbook.md"),
      "utf-8",
    );

    expect(runbook).toContain("https://github.com/Andyduck-ops/omp-flow.git");
    expect(runbook).toContain("pnpm publish --access public --no-git-checks");
    expect(runbook.indexOf('Set-Location "$ReleaseRepo\\packages\\core"')).toBeLessThan(
      runbook.indexOf('Set-Location "$ReleaseRepo\\packages\\cli"'),
    );
    expect(runbook).toContain("Do not invoke `packages/cli/scripts/release.js`");
    expect(runbook).toContain("Do not force-push");
  });
});
