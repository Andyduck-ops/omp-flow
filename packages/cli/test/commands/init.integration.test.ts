/**
 * Integration tests for the init() command — omp-flow M1 (Claude-only).
 *
 * Runs the real init flow in temp dirs with minimal mocking (figlet, inquirer,
 * child_process python probe). The 18-platform registry stays in the tree for
 * later milestones, but M1 ships the Claude toolchain only: init deploys Claude
 * and hard-fails (`parked`) on any other platform (PRD R10 / AC12). Trellis-only
 * subjects (spec bootstrap, monorepo spec templates, bootstrap/joiner tasks,
 * statusline opt-in, non-claude platforms) are dropped with their removal.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("figlet", () => ({
  default: { textSync: vi.fn(() => "OMP-FLOW") },
}));

vi.mock("inquirer", () => ({
  default: { prompt: vi.fn().mockResolvedValue({}) },
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockReturnValue(""),
}));

import { init } from "../../src/commands/init.js";
import { VERSION } from "../../src/constants/version.js";
import { DIR_NAMES, FILE_NAMES, PATHS } from "../../src/constants/paths.js";
import { execSync } from "node:child_process";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

describe("init() integration (omp-flow M1, Claude-only)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-flow-init-int-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.mocked(execSync).mockClear();
    vi.mocked(execSync).mockImplementation(((cmd: string) => {
      const py = process.platform === "win32" ? "python" : "python3";
      return cmd === `${py} --version` ? "Python 3.11.12" : "";
    }) as typeof execSync);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const exists = (...rel: string[]): boolean =>
    fs.existsSync(path.join(tmpDir, ...rel));

  it("#1 deploys the omp-flow runtime scaffold + Claude toolchain by default", async () => {
    await init({ yes: true });

    // Core workflow structure (omp-flow runtime layout).
    expect(exists(DIR_NAMES.WORKFLOW)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, PATHS.SCRIPTS))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, PATHS.TASKS_ARCHIVE))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, PATHS.RUNTIME_SESSIONS))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, PATHS.SPECS))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, PATHS.KNOWHOW))).toBe(true);

    // Claude is the only platform deployed in M1.
    expect(exists(".claude")).toBe(true);
    expect(exists(".cursor")).toBe(false);
    expect(exists(".codex")).toBe(false);

    // Root instructions file.
    expect(exists(FILE_NAMES.AGENTS)).toBe(true);
  });

  it("#2 deploys the Python control plane + workflow.md + version + hash store", async () => {
    await init({ yes: true });

    expect(
      fs.existsSync(path.join(tmpDir, PATHS.SCRIPTS, "omp_flow.py")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, PATHS.SCRIPTS, "common", "workflow.py")),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE))).toBe(
      true,
    );

    const versionFile = path.join(tmpDir, DIR_NAMES.WORKFLOW, ".version");
    expect(fs.existsSync(versionFile)).toBe(true);
    expect(fs.readFileSync(versionFile, "utf-8").trim()).toBe(VERSION);

    expect(
      fs.existsSync(
        path.join(tmpDir, DIR_NAMES.WORKFLOW, ".template-hashes.json"),
      ),
    ).toBe(true);
  });

  it("#3 deploys the five Claude agents, five hooks, and settings.json", async () => {
    await init({ yes: true });

    for (const agent of [
      "omp-flow-research",
      "omp-flow-architect",
      "omp-flow-qbd",
      "omp-flow-implement",
      "omp-flow-check",
    ]) {
      expect(exists(".claude", "agents", `${agent}.md`)).toBe(true);
    }
    for (const hook of [
      "session-start.py",
      "inject-workflow-state.py",
      "inject-agent-context.py",
      "inject-agent-identity.py",
      "protect-python-owned.py",
    ]) {
      expect(exists(".claude", "hooks", hook)).toBe(true);
    }
    expect(exists(".claude", "settings.json")).toBe(true);
  });

  it("#4 deploys the twelve bundled omp-flow skills", async () => {
    await init({ yes: true });
    for (const skill of [
      "omp-flow",
      "omp-flow-brainstorm",
      "omp-flow-check",
      "omp-flow-debug",
      "omp-flow-decompose",
      "omp-flow-design",
      "omp-flow-execute",
      "omp-flow-finish",
      "omp-flow-implement",
      "omp-flow-qbd",
      "omp-flow-research",
      "omp-flow-ui-designer",
    ]) {
      expect(exists(".claude", "skills", skill, "SKILL.md")).toBe(true);
    }
  });

  it("#5 resolves {{PYTHON_CMD}} in the deployed settings.json", async () => {
    await init({ yes: true });
    const settings = fs.readFileSync(
      path.join(tmpDir, ".claude", "settings.json"),
      "utf-8",
    );
    expect(settings).not.toContain("{{PYTHON_CMD}}");
    expect(() => JSON.parse(settings)).not.toThrow();
  });

  it("#6 ships NO Trellis-shaped artifacts (no bootstrap/joiner task, no workspace, no spec skeleton)", async () => {
    await init({ yes: true });
    // No Trellis workspace / spec skeletons.
    expect(exists(DIR_NAMES.WORKFLOW, "workspace")).toBe(false);
    expect(exists(DIR_NAMES.WORKFLOW, "spec")).toBe(false);
    // The tasks dir exists but carries no auto-created bootstrap/joiner task.
    const tasksDir = path.join(tmpDir, PATHS.TASKS);
    const taskEntries = fs
      .readdirSync(tasksDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "archive");
    expect(taskEntries).toEqual([]);
  });

  it("#7 M1 platform gate: requesting a parked platform fails fast with `parked` (AC12)", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code ?? 0})`);
      }) as never);

    await expect(init({ opencode: true, yes: true })).rejects.toThrow(
      "process.exit(1)",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    const combined = errors.join("\n");
    expect(combined).toContain("parked");
    expect(combined.toLowerCase()).toContain("opencode");
  });
});
