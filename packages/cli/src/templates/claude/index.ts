/**
 * Claude Code templates
 *
 * Directory structure:
 *   claude/
 *   ├── agents/         # Sub-agent definitions
 *   ├── hooks/          # Claude-only opt-in hooks (statusline.py)
 *   └── settings.json   # Settings configuration
 *
 * Default hooks come from shared-hooks/ (unified with other platforms).
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

function listFiles(dir: string): string[] {
  try {
    return readdirSync(join(__dirname, dir));
  } catch {
    return [];
  }
}

export const settingsTemplate = readTemplate("settings.json");

export interface AgentTemplate {
  name: string;
  content: string;
}

export interface SettingsTemplate {
  targetPath: string;
  content: string;
}

export function getAllAgents(): AgentTemplate[] {
  const agents: AgentTemplate[] = [];
  const files = listFiles("agents");

  for (const file of files) {
    if (file.endsWith(".md")) {
      const name = file.replace(".md", "");
      const content = readTemplate(`agents/${file}`);
      agents.push({ name, content });
    }
  }

  return agents;
}

/**
 * Get the default Claude hooks as a map of filename → content.
 *
 * Directory-walks `claude/hooks/*.py`, excluding the opt-in `statusline.py`
 * (installed only via `--with-statusline`, and never part of the tracked
 * template set). This is the SINGLE source consumed by BOTH the init writer
 * (`writeClaudeHooks` in configurators/claude.ts) and the update collector
 * (claude `collectTemplates` in configurators/index.ts), so a hook file present
 * in the template tree can never be installed-but-untracked (D3 symmetry).
 */
export function getClaudeHooks(): Map<string, string> {
  const hooks = new Map<string, string>();
  for (const file of listFiles("hooks")) {
    if (file.endsWith(".py") && file !== "statusline.py") {
      hooks.set(file, readTemplate(`hooks/${file}`));
    }
  }
  return hooks;
}

export function getSettingsTemplate(): SettingsTemplate {
  return {
    targetPath: "settings.json",
    content: settingsTemplate,
  };
}

/**
 * Opt-in statusLine hook, installed only via `omp-flow init --with-statusline`.
 *
 * Lives under claude/hooks/ (not shared-hooks/) because `statusLine` is a
 * Claude-only event, and is intentionally NOT part of `collectTemplates` —
 * `omp-flow update` must never force-install it on opted-out projects.
 */
export function getStatuslineHook(): string {
  return readTemplate("hooks/statusline.py");
}
