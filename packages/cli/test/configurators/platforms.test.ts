import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  getConfiguredPlatforms,
  configurePlatform,
  PLATFORM_IDS,
} from "../../src/configurators/index.js";
import { AI_TOOLS } from "../../src/types/ai-tools.js";
import { setWriteMode } from "../../src/utils/file-writer.js";

// M1 ships the Claude toolchain only. The 18-platform registry stays in the
// tree for later milestones, so platform DETECTION (getConfiguredPlatforms) is
// still exercised across every configDir; but deploy behavior is asserted for
// Claude only (every other platform is parked, its methodology resources
// deleted, and init hard-fails on it — PRD R10). Prelude + statusline assertions
// are dropped with their subjects (D2 / F1).

const BUNDLED_SKILL_NAMES = [
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
];
const CLAUDE_AGENTS = [
  "omp-flow-research",
  "omp-flow-architect",
  "omp-flow-qbd",
  "omp-flow-implement",
  "omp-flow-check",
];
const CLAUDE_HOOKS = [
  "session-start.py",
  "inject-workflow-state.py",
  "inject-agent-context.py",
  "inject-agent-identity.py",
  "protect-python-owned.py",
];

// =============================================================================
// getConfiguredPlatforms — detects existing platform directories
// =============================================================================

describe("getConfiguredPlatforms", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-flow-platforms-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty set when no platform dirs exist", () => {
    expect(getConfiguredPlatforms(tmpDir).size).toBe(0);
  });

  it("detects .claude directory as claude-code", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude"));
    expect(getConfiguredPlatforms(tmpDir).has("claude-code")).toBe(true);
  });

  it("detects .cursor directory as cursor", () => {
    fs.mkdirSync(path.join(tmpDir, ".cursor"));
    expect(getConfiguredPlatforms(tmpDir).has("cursor")).toBe(true);
  });

  it("detects .codex directory as codex", () => {
    fs.mkdirSync(path.join(tmpDir, ".codex"), { recursive: true });
    expect(getConfiguredPlatforms(tmpDir).has("codex")).toBe(true);
  });

  it(".agents/skills alone does NOT detect as codex (shared standard)", () => {
    fs.mkdirSync(path.join(tmpDir, ".agents", "skills"), { recursive: true });
    expect(getConfiguredPlatforms(tmpDir).has("codex")).toBe(false);
  });

  it("detects legacy .windsurf/workflows directory as devin (back-compat)", () => {
    fs.mkdirSync(path.join(tmpDir, ".windsurf", "workflows"), {
      recursive: true,
    });
    expect(getConfiguredPlatforms(tmpDir).has("devin")).toBe(true);
  });

  it("detects multiple platforms simultaneously", () => {
    for (const id of PLATFORM_IDS) {
      fs.mkdirSync(path.join(tmpDir, AI_TOOLS[id].configDir), {
        recursive: true,
      });
    }
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.size).toBe(PLATFORM_IDS.length);
    for (const id of PLATFORM_IDS) {
      expect(result.has(id)).toBe(true);
    }
  });

  it("ignores unrelated directories", () => {
    fs.mkdirSync(path.join(tmpDir, ".vscode"));
    fs.mkdirSync(path.join(tmpDir, ".git"));
    expect(getConfiguredPlatforms(tmpDir).size).toBe(0);
  });
});

// =============================================================================
// configurePlatform — Claude deploy (the only M1 platform)
// =============================================================================

describe("configurePlatform (claude-code, M1)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-flow-configure-"));
    setWriteMode("force");
  });

  afterEach(() => {
    setWriteMode("normal");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const exists = (rel: string): boolean =>
    fs.existsSync(path.join(tmpDir, ...rel.split("/")));

  it("creates the .claude directory", async () => {
    await configurePlatform("claude-code", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(true);
  });

  it("deploys the five Claude agents", async () => {
    await configurePlatform("claude-code", tmpDir);
    for (const agent of CLAUDE_AGENTS) {
      expect(exists(`.claude/agents/${agent}.md`)).toBe(true);
    }
  });

  it("deploys the five Claude hooks and NOT the opt-in statusline", async () => {
    await configurePlatform("claude-code", tmpDir);
    for (const hook of CLAUDE_HOOKS) {
      expect(exists(`.claude/hooks/${hook}`)).toBe(true);
    }
    expect(exists(".claude/hooks/statusline.py")).toBe(false);
  });

  it("deploys all twelve bundled omp-flow skills", async () => {
    await configurePlatform("claude-code", tmpDir);
    for (const skill of BUNDLED_SKILL_NAMES) {
      expect(exists(`.claude/skills/${skill}/SKILL.md`)).toBe(true);
    }
  });

  it("deploys settings.json with the {{PYTHON_CMD}} placeholder resolved", async () => {
    await configurePlatform("claude-code", tmpDir);
    expect(exists(".claude/settings.json")).toBe(true);
    const settings = fs.readFileSync(
      path.join(tmpDir, ".claude", "settings.json"),
      "utf-8",
    );
    expect(settings).not.toContain("{{PYTHON_CMD}}");
    expect(() => JSON.parse(settings)).not.toThrow();
  });

  it("ships zero slash-commands in M1 (empty command registry, D4)", async () => {
    await configurePlatform("claude-code", tmpDir);
    // The command mechanism is kept but empty (D4): no command files are written,
    // even if an empty commands/ directory is created by the writer scaffold.
    const commandsDir = path.join(tmpDir, ".claude", "commands");
    const commandFiles = fs.existsSync(commandsDir)
      ? fs
          .readdirSync(commandsDir, { recursive: true })
          .filter((f) => String(f).endsWith(".md"))
      : [];
    expect(commandFiles).toEqual([]);
  });
});
