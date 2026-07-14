/**
 * OmpFlow workflow templates
 *
 * These are GENERIC templates for user projects.
 * Do NOT use OmpFlow project's own .omp-flow/ directory (which may be customized).
 *
 * Directory structure:
 *   omp-flow/
 *   ├── scripts/
 *   │   ├── __init__.py
 *   │   ├── common/           # Shared utilities (Python control plane)
 *   │   └── *.py              # Main scripts (Python)
 *   ├── workflow.md           # Workflow guide
 *   ├── config.yaml           # OmpFlow configuration
 *   └── gitignore.txt         # .gitignore content
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

// Configuration files
export const workflowMdTemplate = readTemplate("workflow.md");
export const configYamlTemplate = readTemplate("config.yaml");
export const gitignoreTemplate = readTemplate("gitignore.txt");

/**
 * Get all Python control-plane scripts as a map of POSIX-relative path
 * (under `scripts/`) → content.
 *
 * Recursively walks the bundled `scripts/` directory for `*.py` files,
 * excluding `__pycache__`. This is the SINGLE source consumed by BOTH the
 * update/hash collector (`commands/update.ts`) and — via a filesystem copy of
 * the same directory (`createWorkflowStructure` → `copyOmpFlowDir("scripts")`)
 * — the init writer, so a script present in the template tree can never be
 * installed-but-untracked (D3 symmetry — replaces the former hand-maintained
 * list).
 */
export function getAllScripts(): Map<string, string> {
  const scripts = new Map<string, string>();
  const root = join(__dirname, "scripts");

  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "__pycache__") continue;
      const abs = join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(abs).isDirectory()) {
        walk(abs, rel);
      } else if (entry.endsWith(".py")) {
        scripts.set(rel, readFileSync(abs, "utf-8"));
      }
    }
  };

  walk(root, "");
  return scripts;
}

/**
 * Channel runtime agent definitions.
 *
 * OmpFlow M1 ships no channel seed agents (D8): the Python control plane is the
 * only task/agent producer, so nothing is dispatched to `.omp-flow/agents/`.
 * The function is retained (returning an empty map) because `commands/update.ts`
 * still iterates it; that update-side consumer is removed in a separate rebrand
 * row, at which point this export can be deleted.
 */
export function getAllAgents(): Map<string, string> {
  return new Map<string, string>();
}
