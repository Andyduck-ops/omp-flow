/**
 * omp-flow Codex adapter suite (PRD R7 / AC-R7).
 *
 * Un-parked from the M2 parked stub and re-derived against omp-flow
 * resources. Fixture-only, deterministic, no live Codex binary — the tree under
 * test is produced by the fork's OWN `configureCodex(...)`, so the deployed
 * `.codex/` surface is exactly what `omp-flow init --codex` writes.
 *
 * Covers the seven design (C7) assertions:
 *   1. configureCodex writes exactly 5 `omp-flow-*.toml`; no `trellis-*`.
 *   2. each of the 4 pull agents carries its exact injected pull-context line
 *      (executor/reviewer include `--row`); `omp-flow-qbd.toml` carries none.
 *   3. every agent toml disables `multi_agent` without the unsupported
 *      structured `multi_agent_v2` table.
 *   4. `getAllCodexSkills()` non-empty; `.codex/skills/` has >=1 SKILL.md.
 *   5. config/hooks rebranded; no live `trellis` on the deploy surface.
 *   6. init/update collect symmetry: configureCodex disk === collectTemplates.
 *   7. (pull-handshake fixture) — in `test/omp-flow-codex/pull-handshake.test.ts`.
 * Plus the R1 `detectAgentRole` unit assertion.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { configureCodex } from "../../src/configurators/codex.js";
import { collectPlatformTemplates } from "../../src/configurators/index.js";
import { detectAgentRole } from "../../src/configurators/shared.js";
import {
  getAllCodexSkills,
  getAllAgents,
} from "../../src/templates/codex/index.js";

const EXPECTED_AGENT_NAMES = [
  "omp-flow-architect",
  "omp-flow-check",
  "omp-flow-implement",
  "omp-flow-qbd",
  "omp-flow-research",
];

// The exact injected `omp_flow.py context` command each deployed pull-agent
// toml must contain (dogfood reference test2/.codex/agents/omp-flow-*.toml).
// Planning roles pass --task only; row roles also pass --row. These strings are
// the load-bearing contract from `interface:codex-adapter-contract` §2.
const EXPECTED_PULL_LINE: Record<string, string> = {
  "omp-flow-research":
    'python .omp-flow/scripts/omp_flow.py context --role researcher --task <taskId> --prompt "Research assigned topic"',
  "omp-flow-architect":
    'python .omp-flow/scripts/omp_flow.py context --role architect --task <taskId> --prompt "Architect assigned phase"',
  "omp-flow-implement":
    'python .omp-flow/scripts/omp_flow.py context --role executor --task <taskId> --row <rowId> --prompt "Implement assigned row"',
  "omp-flow-check":
    'python .omp-flow/scripts/omp_flow.py context --role reviewer --task <taskId> --row <rowId> --prompt "Review assigned row"',
};

/** Recursively collect every file path under a directory (posix-joined). */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("omp-flow codex adapter (deployed .codex surface)", () => {
  let root: string;
  let agentsDir: string;
  let skillsDir: string;
  let codexDir: string;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "omp-flow-codex-"));
    // configureCodex logs per-file writes via file-writer; silence for clean
    // test output. The stderr Codex-hooks warning is already VITEST-guarded.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await configureCodex(root);
    } finally {
      logSpy.mockRestore();
    }
    codexDir = path.join(root, ".codex");
    agentsDir = path.join(codexDir, "agents");
    skillsDir = path.join(codexDir, "skills");
  });

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  // --- Assertion 1: exactly 5 omp-flow-* agents, no trellis-* -----------------
  it("deploys exactly the 5 omp-flow-* agent tomls and no trellis-*", () => {
    const files = fs
      .readdirSync(agentsDir)
      .filter((f) => f.endsWith(".toml"))
      .sort();
    expect(files).toEqual(EXPECTED_AGENT_NAMES.map((n) => `${n}.toml`));
    for (const f of files) {
      expect(f.startsWith("trellis-")).toBe(false);
    }
    // getAllAgents() (the template source) must agree with what landed on disk.
    const templateNames = getAllAgents()
      .map((a) => a.name)
      .sort();
    expect(templateNames).toEqual(EXPECTED_AGENT_NAMES);

    const config = fs.readFileSync(path.join(codexDir, "config.toml"), "utf-8");
    const registrations = [
      ...config.matchAll(/^\[agents\.([^\]]+)\]\r?\nconfig_file = "([^"]+)"/gm),
    ]
      .map((match) => ({ name: match[1], configFile: match[2] }))
      .sort((a, b) => a.name.localeCompare(b.name));
    expect(registrations).toEqual(
      EXPECTED_AGENT_NAMES.map((name) => ({
        name,
        configFile: `agents/${name}.toml`,
      })),
    );
    for (const registration of registrations) {
      expect(path.isAbsolute(registration.configFile)).toBe(false);
      expect(fs.existsSync(path.join(codexDir, registration.configFile))).toBe(
        true,
      );
    }
  });

  // --- Assertion 2: per-role injected prelude command; qbd none ---------------
  it("injects the exact per-role omp_flow.py context line into each pull agent (qbd none)", () => {
    for (const [name, expectedLine] of Object.entries(EXPECTED_PULL_LINE)) {
      const content = fs.readFileSync(
        path.join(agentsDir, `${name}.toml`),
        "utf-8",
      );
      expect(content).toContain("## Required: Load OmpFlow Context First");
      expect(content).toContain(expectedLine);
    }
    // executor / reviewer MUST carry --row; researcher / architect MUST NOT.
    expect(EXPECTED_PULL_LINE["omp-flow-implement"]).toContain("--row <rowId>");
    expect(EXPECTED_PULL_LINE["omp-flow-check"]).toContain("--row <rowId>");
    expect(EXPECTED_PULL_LINE["omp-flow-research"]).not.toContain("--row");
    expect(EXPECTED_PULL_LINE["omp-flow-architect"]).not.toContain("--row");

    // qbd is push-at-spawn (gate prepare prompt), NOT a pull agent.
    const qbd = fs.readFileSync(
      path.join(agentsDir, "omp-flow-qbd.toml"),
      "utf-8",
    );
    expect(qbd).not.toContain("omp_flow.py context --role");
    expect(qbd).not.toContain("## Required: Load OmpFlow Context First");
  });

  // --- Assertion 3: deadlock fix on every agent (Codex #240/#241) -------------
  it("disables child multi-agent dispatch without structured multi_agent_v2", () => {
    for (const name of EXPECTED_AGENT_NAMES) {
      const content = fs.readFileSync(
        path.join(agentsDir, `${name}.toml`),
        "utf-8",
      );
      expect(content).toContain("multi_agent = false");
      expect(content).not.toMatch(/\[features\.multi_agent_v2\]/);
      expect(content).toMatch(/must not spawn|do not spawn|must not delegate/i);
    }
  });

  // --- Assertion 4: codex-specific skills deploy non-empty (C6 dir fix) -------
  it("deploys a non-empty .codex/skills/ set (getAllCodexSkills fixed)", () => {
    expect(getAllCodexSkills().length).toBeGreaterThan(0);
    const skillFiles = walk(skillsDir).filter(
      (p) => path.basename(p) === "SKILL.md",
    );
    expect(skillFiles.length).toBeGreaterThan(0);
    expect(skillFiles.length).toBe(getAllCodexSkills().length);

    const sharedSkillNames = new Set(
      fs.readdirSync(path.join(root, ".agents", "skills")),
    );
    const codexSkillNames = fs.readdirSync(skillsDir);
    expect(
      codexSkillNames.filter((name) => sharedSkillNames.has(name)),
    ).toEqual([]);
  });

  // --- Assertion 5: config/hooks rebranded; no live trellis on the surface ----
  it("rebrands config.toml + hooks and leaves no live trellis on the deploy surface", () => {
    const config = fs.readFileSync(path.join(codexDir, "config.toml"), "utf-8");
    expect(config).toMatch(/omp[-_]?flow/i);

    const hooksConfig = fs.readFileSync(
      path.join(codexDir, "hooks.json"),
      "utf-8",
    );
    expect(hooksConfig).toContain("inject-workflow-state.py");

    const sessionStart = fs.readFileSync(
      path.join(codexDir, "hooks", "session-start.py"),
      "utf-8",
    );
    expect(sessionStart).toMatch(/OmpFlow|omp-flow/);

    // No live `trellis` brand/path token anywhere under the deployed .codex/.
    for (const file of walk(codexDir)) {
      const text = fs.readFileSync(file, "utf-8");
      expect(
        /trellis/i.test(text),
        `unexpected live "trellis" token in ${path.relative(root, file)}`,
      ).toBe(false);
    }
  });

  // --- Assertion 6: init/update collect symmetry (0 drift) --------------------
  it("emits byte-identical agent tomls from configureCodex and collectTemplates (0 drift)", () => {
    const collected = collectPlatformTemplates("codex");
    expect(collected).toBeDefined();
    const map = collected as Map<string, string>;
    const agentKeys = [...map.keys()].filter((k) =>
      /^\.codex\/agents\/.*\.toml$/.test(k),
    );
    // Every deployed agent path is represented in the collect map (and v.v.).
    expect(agentKeys.sort()).toEqual(
      EXPECTED_AGENT_NAMES.map((n) => `.codex/agents/${n}.toml`).sort(),
    );
    for (const key of agentKeys) {
      const onDisk = fs.readFileSync(path.join(root, key), "utf-8");
      expect(map.get(key), `collect/configure drift for ${key}`).toBe(onDisk);
    }
  });

  // --- Assertion 7 (row F--002): registered hook script actually deploys ------
  // The deployed hooks.json registers UserPromptSubmit -> inject-workflow-state.py
  // as the codex router's sole per-turn <workflow-state> feed. Before this row
  // that script never shipped (shared-hooks had no .py source), so the command
  // targeted an absent file every turn. Assert it now deploys non-empty and the
  // registered command path resolves to a real file (no dangling reference).
  it("deploys the hooks.json UserPromptSubmit script with no dangling reference", () => {
    interface HookEntry {
      hooks?: { command?: string }[];
    }
    interface HooksJson {
      hooks?: { UserPromptSubmit?: HookEntry[] };
    }
    const hooksJson = JSON.parse(
      fs.readFileSync(path.join(codexDir, "hooks.json"), "utf-8"),
    ) as HooksJson;
    const commands: string[] = (hooksJson.hooks?.UserPromptSubmit ?? [])
      .flatMap((entry) => entry.hooks ?? [])
      .map((h) => h.command ?? "");
    expect(commands.length).toBeGreaterThan(0);

    // Every command must build the known deployed path from the repository
    // root; the script itself must exist and be non-empty (no dangling target).
    for (const command of commands) {
      expect(command).toContain("git','rev-parse','--show-toplevel");
      expect(command).toContain("'.codex'/'hooks'/'inject-workflow-state.py'");
      const deployed = path.join(
        root,
        ".codex",
        "hooks",
        "inject-workflow-state.py",
      );
      expect(
        fs.existsSync(deployed),
        `dangling hook reference: ${deployed}`,
      ).toBe(true);
      expect(fs.statSync(deployed).size).toBeGreaterThan(0);
    }

    // The specific sole registered hook script is the one this row restored.
    const injectPath = path.join(codexDir, "hooks", "inject-workflow-state.py");
    expect(fs.existsSync(injectPath)).toBe(true);
    expect(fs.readFileSync(injectPath, "utf-8").length).toBeGreaterThan(0);
  });

  it("runs the hook locator from a nested non-ASCII git working directory", () => {
    interface HookEntry {
      hooks?: { command?: string }[];
    }
    interface HooksJson {
      hooks?: { UserPromptSubmit?: HookEntry[] };
    }
    const hooksJson = JSON.parse(
      fs.readFileSync(path.join(codexDir, "hooks.json"), "utf-8"),
    ) as HooksJson;
    const command = hooksJson.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.command;
    expect(command).toContain("git','rev-parse','--show-toplevel");
    expect(command).toContain("pathlib.Path(root)");

    const nested = path.join(root, "子目录", "nested");
    fs.mkdirSync(nested, { recursive: true });
    expect(spawnSync("git", ["init"], { cwd: root }).status).toBe(0);
    const result = spawnSync(command as string, {
      cwd: nested,
      shell: true,
      input: "{}",
      encoding: "utf-8",
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it("scopes hook trust guidance and reviewer identity claims honestly", () => {
    const config = fs.readFileSync(path.join(codexDir, "config.toml"), "utf-8");
    expect(config).toContain("codex-cli 0.144.4");
    expect(config).toMatch(/only a matching\s+# trusted hash is runnable/);
    expect(config).toContain("first-seen hash");
    expect(config).toContain("whenever the definition changes");

    const reviewer = fs.readFileSync(
      path.join(agentsDir, "omp-flow-check.toml"),
      "utf-8",
    );
    expect(reviewer).toContain("records that supplied ID");
    expect(reviewer).toContain("does not authenticate its Codex provenance");
  });

  // --- Assertion 8 (row F--002): init/update 0-drift for the codex hooks -------
  it("emits byte-identical codex hook scripts from configureCodex and collectTemplates (0 drift)", () => {
    const map = collectPlatformTemplates("codex") as Map<string, string>;
    const hookKeys = [...map.keys()].filter((k) =>
      /^\.codex\/hooks\/.*\.py$/.test(k),
    );
    // Both the compat session-start.py and the restored inject-workflow-state.py
    // must be represented; inject-workflow-state.py in particular is present.
    expect(hookKeys).toContain(".codex/hooks/inject-workflow-state.py");
    expect(hookKeys.length).toBeGreaterThanOrEqual(2);
    for (const key of hookKeys) {
      const onDisk = fs.readFileSync(path.join(root, key), "utf-8");
      expect(map.get(key), `collect/configure drift for ${key}`).toBe(onDisk);
    }
  });

  // --- R1 unit: detectAgentRole role mapping ----------------------------------
  it("detectAgentRole maps the 4 pull agents and returns null for qbd/unknown", () => {
    expect(detectAgentRole("omp-flow-research")).toBe("researcher");
    expect(detectAgentRole("omp-flow-architect")).toBe("architect");
    expect(detectAgentRole("omp-flow-implement")).toBe("executor");
    expect(detectAgentRole("omp-flow-check")).toBe("reviewer");
    // Accepts the `.toml` suffix form too (filename-keyed).
    expect(detectAgentRole("omp-flow-implement.toml")).toBe("executor");
    // qbd is push-at-spawn: no pull role.
    expect(detectAgentRole("omp-flow-qbd")).toBeNull();
    expect(detectAgentRole("omp-flow-qbd.toml")).toBeNull();
    // Unknown names skip the prelude.
    expect(detectAgentRole("omp-flow-unknown")).toBeNull();
    expect(detectAgentRole("general-purpose")).toBeNull();
  });
});
