import { describe, expect, it } from "vitest";
import {
  ALL_MANAGED_DIRS,
  CONFIG_DIRS,
  PLATFORM_IDS,
  PLATFORM_MANAGED_DIRS,
  collectPlatformTemplates,
  getInitToolChoices,
  getPlatformManagedPaths,
  getPlatformsWithPythonHooks,
  isManagedPath,
  isManagedRootDir,
  resolveCliFlag,
} from "../../src/configurators/index.js";
import { AI_TOOLS, type AITool } from "../../src/types/ai-tools.js";
import { COPILOT_INSTRUCTIONS_PATH } from "../../src/templates/copilot/index.js";

// =============================================================================
// Derived Constants
// =============================================================================

describe("PLATFORM_IDS", () => {
  it("contains all AI_TOOLS keys", () => {
    const aiToolKeys = Object.keys(AI_TOOLS);
    expect(PLATFORM_IDS).toEqual(expect.arrayContaining(aiToolKeys));
    expect(PLATFORM_IDS).toHaveLength(aiToolKeys.length);
  });
});

describe("CONFIG_DIRS", () => {
  it("has same length as PLATFORM_IDS", () => {
    expect(CONFIG_DIRS).toHaveLength(PLATFORM_IDS.length);
  });

  it("maps to AI_TOOLS configDir values in order", () => {
    for (let i = 0; i < PLATFORM_IDS.length; i++) {
      expect(CONFIG_DIRS[i]).toBe(AI_TOOLS[PLATFORM_IDS[i]].configDir);
    }
  });
});

describe("ALL_MANAGED_DIRS", () => {
  it("starts with .omp-flow", () => {
    expect(ALL_MANAGED_DIRS[0]).toBe(".omp-flow");
  });

  it("contains .omp-flow plus all managed dirs", () => {
    expect(ALL_MANAGED_DIRS).toEqual([
      ".omp-flow",
      ...new Set(PLATFORM_MANAGED_DIRS),
    ]);
  });

  it("has no duplicates", () => {
    const unique = new Set(ALL_MANAGED_DIRS);
    expect(unique.size).toBe(ALL_MANAGED_DIRS.length);
  });
});

// =============================================================================
// isManagedPath — MC/DC + boundary value testing
// =============================================================================

describe("isManagedPath", () => {
  // Positive: sub-path match (startsWith(d + "/") = true, === d = false)
  it("matches platform config sub-paths", () => {
    expect(isManagedPath(".claude/commands/foo.md")).toBe(true);
    expect(isManagedPath(".cursor/rules/bar.md")).toBe(true);
    expect(isManagedPath(".opencode/config.json")).toBe(true);
    expect(isManagedPath(".agents/skills/start/SKILL.md")).toBe(true);
    expect(isManagedPath(".codex/agents/check.toml")).toBe(true);
    expect(isManagedPath(".agent/workflows/start.md")).toBe(true);
    expect(isManagedPath(".kiro/skills/start/SKILL.md")).toBe(true);
    expect(isManagedPath(".devin/workflows/omp-flow-start.md")).toBe(true);
    expect(isManagedPath(".github/prompts/start.prompt.md")).toBe(true);
    expect(isManagedPath(".github/copilot/hooks/session-start.py")).toBe(true);
    expect(isManagedPath(".github/hooks/omp-flow.json")).toBe(true);
    expect(isManagedPath(".pi/extensions/omp-flow/index.ts")).toBe(true);
    expect(isManagedPath(".pi/prompts/omp-flow-continue.md")).toBe(true);
  });

  // Positive: exact match (startsWith(d + "/") = false, === d = true)
  it("matches exact managed directory names", () => {
    expect(isManagedPath(".claude")).toBe(true);
    expect(isManagedPath(".cursor")).toBe(true);
    expect(isManagedPath(".opencode")).toBe(true);
    expect(isManagedPath(".agents/skills")).toBe(true);
    expect(isManagedPath(".codex")).toBe(true);
    expect(isManagedPath(".agent/workflows")).toBe(true);
    expect(isManagedPath(".kiro/skills")).toBe(true);
    expect(isManagedPath(".devin/workflows")).toBe(true);
    expect(isManagedPath(".github/prompts")).toBe(true);
    expect(isManagedPath(".github/hooks")).toBe(true);
    expect(isManagedPath(".omp-flow")).toBe(true);
  });

  // Positive: .omp-flow hardcoded paths
  it("matches .omp-flow sub-paths", () => {
    expect(isManagedPath(".omp-flow/spec")).toBe(true);
    expect(isManagedPath(".omp-flow/tasks/some-task")).toBe(true);
  });

  // Boundary: prefix-similar but NOT a sub-path (no / separator after name)
  it("rejects prefix-similar non-sub-paths", () => {
    expect(isManagedPath(".claude-backup")).toBe(false);
    expect(isManagedPath(".omp-flow-old")).toBe(false);
    expect(isManagedPath(".cursorignore")).toBe(false);
    expect(isManagedPath(".opencode-v2")).toBe(false);
    expect(isManagedPath(".agents/skills-backup")).toBe(false);
    expect(isManagedPath(".codex-backup")).toBe(false);
    expect(isManagedPath(".agent/workflows-backup")).toBe(false);
    expect(isManagedPath(".kiro/skills-backup")).toBe(false);
    expect(isManagedPath(".devin/workflows-backup")).toBe(false);
    expect(isManagedPath(".github/prompts-backup")).toBe(false);
    expect(isManagedPath(".github/copilot-backup")).toBe(false);
    expect(isManagedPath(".github/hooks-backup")).toBe(false);
  });

  // Boundary: empty string
  it("rejects empty string", () => {
    expect(isManagedPath("")).toBe(false);
  });

  // Boundary: path traversal
  it("rejects path traversal", () => {
    expect(isManagedPath("../.claude")).toBe(false);
    expect(isManagedPath("../.omp-flow/spec")).toBe(false);
  });

  // Boundary: unrelated directories
  it("rejects unrelated directories", () => {
    expect(isManagedPath(".vscode")).toBe(false);
    expect(isManagedPath(".git")).toBe(false);
    expect(isManagedPath("node_modules")).toBe(false);
    expect(isManagedPath("src/configurators")).toBe(false);
  });

  // Windows path separator (bug fix verification)
  it("matches Windows-style backslash paths", () => {
    expect(isManagedPath(".claude\\commands\\foo.md")).toBe(true);
    expect(isManagedPath(".omp-flow\\spec\\backend")).toBe(true);
    expect(isManagedPath(".agents\\skills\\start\\SKILL.md")).toBe(true);
    expect(isManagedPath(".codex\\agents\\check.toml")).toBe(true);
    expect(isManagedPath(".agent\\workflows\\start.md")).toBe(true);
    expect(isManagedPath(".kiro\\skills\\start\\SKILL.md")).toBe(true);
    expect(isManagedPath(".devin\\workflows\\omp-flow-start.md")).toBe(true);
    expect(isManagedPath(".github\\prompts\\start.prompt.md")).toBe(true);
    expect(isManagedPath(".github\\copilot\\hooks\\session-start.py")).toBe(
      true,
    );
    expect(isManagedPath(".github\\hooks\\omp-flow.json")).toBe(true);
    expect(isManagedPath(".pi\\extensions\\omp-flow\\index.ts")).toBe(true);
  });

  // Mixed separators
  it("matches mixed separator paths", () => {
    expect(isManagedPath(".claude\\commands/foo.md")).toBe(true);
  });
});

// =============================================================================
// isManagedRootDir
// =============================================================================

describe("isManagedRootDir", () => {
  it("matches all platform config dirs", () => {
    for (const dir of CONFIG_DIRS) {
      expect(isManagedRootDir(dir)).toBe(true);
    }
  });

  it("matches .omp-flow", () => {
    expect(isManagedRootDir(".omp-flow")).toBe(true);
  });

  it("matches shared agent skills layer", () => {
    expect(isManagedRootDir(".agents/skills")).toBe(true);
  });

  it("matches copilot discovery hooks root", () => {
    expect(isManagedRootDir(".github/hooks")).toBe(true);
  });

  it("matches copilot prompt root", () => {
    expect(isManagedRootDir(".github/prompts")).toBe(true);
  });

  it("rejects sub-paths (not a root dir)", () => {
    expect(isManagedRootDir(".claude/commands")).toBe(false);
    expect(isManagedRootDir(".omp-flow/spec")).toBe(false);
  });

  it("rejects unrelated directories", () => {
    expect(isManagedRootDir(".vscode")).toBe(false);
    expect(isManagedRootDir(".git")).toBe(false);
    expect(isManagedRootDir("src")).toBe(false);
  });
});

// =============================================================================
// resolveCliFlag — boundary value testing
// =============================================================================

describe("resolveCliFlag", () => {
  it("resolves all known flags to correct platform IDs", () => {
    for (const id of PLATFORM_IDS) {
      const flag = AI_TOOLS[id].cliFlag;
      expect(resolveCliFlag(flag)).toBe(id);
    }
  });

  it("returns undefined for unknown flag", () => {
    expect(resolveCliFlag("unknown")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(resolveCliFlag("")).toBeUndefined();
  });

  it("returns undefined for flag with -- prefix", () => {
    expect(resolveCliFlag("--claude")).toBeUndefined();
    expect(resolveCliFlag("--cursor")).toBeUndefined();
  });

  it("is case-sensitive", () => {
    expect(resolveCliFlag("Claude")).toBeUndefined();
    expect(resolveCliFlag("CLAUDE")).toBeUndefined();
    expect(resolveCliFlag("Cursor")).toBeUndefined();
  });

  it("does not match platform IDs directly (claude-code != claude)", () => {
    // "claude-code" is the AITool ID, "claude" is the cliFlag
    expect(resolveCliFlag("claude-code")).toBeUndefined();
  });
});

// =============================================================================
// getInitToolChoices
// =============================================================================

describe("getInitToolChoices", () => {
  const choices = getInitToolChoices();

  it("returns one entry per platform", () => {
    expect(choices).toHaveLength(PLATFORM_IDS.length);
  });

  it("each entry has required fields", () => {
    for (const choice of choices) {
      expect(choice).toHaveProperty("key");
      expect(choice).toHaveProperty("name");
      expect(choice).toHaveProperty("defaultChecked");
      expect(choice).toHaveProperty("platformId");
      expect(typeof choice.key).toBe("string");
      expect(typeof choice.name).toBe("string");
      expect(typeof choice.defaultChecked).toBe("boolean");
    }
  });

  it("each key roundtrips through resolveCliFlag", () => {
    for (const choice of choices) {
      expect(resolveCliFlag(choice.key)).toBe(choice.platformId);
    }
  });

  it("[CR#3] key is a CliFlag (matches AI_TOOLS cliFlag values)", () => {
    const validFlags = Object.values(AI_TOOLS).map((t) => t.cliFlag);
    for (const choice of choices) {
      expect(validFlags).toContain(choice.key);
    }
  });
});

// =============================================================================
// getPlatformsWithPythonHooks
// =============================================================================

describe("getPlatformsWithPythonHooks", () => {
  const result = getPlatformsWithPythonHooks();

  it("returns only platforms with hasPythonHooks: true", () => {
    for (const id of result) {
      expect(AI_TOOLS[id].hasPythonHooks).toBe(true);
    }
  });

  it("includes all platforms with hasPythonHooks: true", () => {
    const expected = PLATFORM_IDS.filter((id) => AI_TOOLS[id].hasPythonHooks);
    expect(result).toEqual(expected);
  });

  it("returns a subset of PLATFORM_IDS", () => {
    for (const id of result) {
      expect(PLATFORM_IDS).toContain(id);
    }
  });
});

// =============================================================================
// collectPlatformTemplates — path consistency
// =============================================================================

// M1 ships the Claude toolchain only; every other platform is parked (init
// hard-fails on it, PRD R10). Its collectTemplates may legitimately throw
// (its methodology resources were deleted). So the platform-registry
// invariants are re-derived against Claude — the sole live platform.
describe("collectPlatformTemplates (claude-only, M1)", () => {
  const BUNDLED_SKILLS = [
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

  it("does not throw for claude-code", () => {
    expect(() => collectPlatformTemplates("claude-code")).not.toThrow();
  });

  it("returns a non-empty Map for claude-code", () => {
    const result = collectPlatformTemplates("claude-code");
    expect(result).toBeInstanceOf(Map);
    expect(result!.size).toBeGreaterThan(0);
  });

  it("all claude paths are under the .claude configDir", () => {
    const result = collectPlatformTemplates("claude-code")!;
    const managedPaths = getPlatformManagedPaths("claude-code");
    for (const [filePath] of result) {
      expect(
        managedPaths.some(
          (m) => filePath === m || filePath.startsWith(m + "/"),
        ),
      ).toBe(true);
    }
  });

  it("returned Map keys never contain a backslash (POSIX-only hash keys)", () => {
    const result = collectPlatformTemplates("claude-code")!;
    for (const [filePath] of result) {
      expect(filePath).not.toMatch(/\\/);
    }
  });

  it("tracks all twelve bundled omp-flow skills", () => {
    const result = collectPlatformTemplates("claude-code")!;
    for (const skill of BUNDLED_SKILLS) {
      expect(
        result.has(`.claude/skills/${skill}/SKILL.md`),
        `claude tracks bundled skill ${skill}`,
      ).toBe(true);
    }
  });

  it("tracks the five Claude agents", () => {
    const result = collectPlatformTemplates("claude-code")!;
    for (const agent of CLAUDE_AGENTS) {
      expect(result.has(`.claude/agents/${agent}.md`)).toBe(true);
    }
  });

  it("tracks the five Claude hooks (dir-walk symmetry, D3)", () => {
    const result = collectPlatformTemplates("claude-code")!;
    for (const hook of CLAUDE_HOOKS) {
      expect(result.has(`.claude/hooks/${hook}`)).toBe(true);
    }
    // statusline.py is opt-in and NOT tracked by default.
    expect(result.has(".claude/hooks/statusline.py")).toBe(false);
  });

  it("tracks the Claude settings.json", () => {
    const result = collectPlatformTemplates("claude-code")!;
    expect(result.has(".claude/settings.json")).toBe(true);
  });

  it("ships zero slash-commands in M1 (empty command registry, D4)", () => {
    const result = collectPlatformTemplates("claude-code")!;
    for (const key of result.keys()) {
      expect(key.startsWith(".claude/commands/")).toBe(false);
    }
  });
});
