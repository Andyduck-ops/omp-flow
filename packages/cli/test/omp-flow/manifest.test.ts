/**
 * AC7 deploy-manifest lock (PRD R7 / row C-001).
 *
 * Runs the fork's OWN default `init({ claude: true })` — no `--with-statusline` — into a
 * clean sandbox, walks the produced tree, and asserts the sorted relative file manifest
 * equals the committed fixture `fixtures/expected-manifest.json` (seeded from a first real
 * sandbox run, then locked). This locks the DEFAULT Claude deploy surface: any addition,
 * removal, or rename of a deployed file fails CI until the fixture is deliberately
 * regenerated.
 *
 * Per design decision D-G the fixture is the no-`--with-statusline` surface; the statusline
 * opt-in file (`.claude/hooks/statusline.py` + `settings.statusLine`) is asserted separately
 * by the A-001 smoke test and MUST NOT appear here, keeping this baseline stable regardless
 * of the opt-in.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { init } from "../../src/commands/init.js";

const FIXTURE = fileURLToPath(
  new URL("./fixtures/expected-manifest.json", import.meta.url),
);

/** Sorted, POSIX-separated relative manifest of every file under `root` (excluding .git). */
function walkManifest(root: string): string[] {
  const out: string[] = [];
  const recurse = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dir === root && entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) recurse(full);
      else out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  recurse(root);
  return out.sort();
}

describe("AC7 default init --claude deploy manifest (locked to committed fixture)", () => {
  let root: string;
  let manifest: string[];

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "omp-flow-manifest-"));
    fs.mkdirSync(path.join(root, ".git"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      // Faithful default `omp-flow init --claude` (no --with-statusline).
      await init({ claude: true, yes: true });
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
    manifest = walkManifest(root);
  }, 120_000);

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("matches the committed expected-manifest fixture exactly", () => {
    const expected = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as string[];
    expect(manifest).toEqual(expected);
  });

  it("locks a non-empty deploy surface (guards against an empty/self-referential fixture)", () => {
    expect(manifest.length).toBeGreaterThan(0);
    expect(manifest).toContain(".claude/settings.json");
    expect(manifest).toContain(".omp-flow/scripts/omp_flow.py");
  });

  it("baseline is statusline-free (opt-in only, per design D-G)", () => {
    expect(manifest).not.toContain(".claude/hooks/statusline.py");
    const fixtureRaw = fs.readFileSync(FIXTURE, "utf8");
    expect(fixtureRaw).not.toContain("statusline.py");
  });
});
