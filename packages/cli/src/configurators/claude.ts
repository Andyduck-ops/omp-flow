import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { getClaudeTemplatePath } from "../templates/extract.js";
import { getClaudeHooks, getStatuslineHook } from "../templates/claude/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  resolvePlaceholders,
  resolveCommands,
  resolveSkills,
  resolveBundledSkills,
  writeSkills,
  replacePythonCommandLiterals,
  type PlatformConfigureOptions,
} from "./shared.js";

const EXCLUDE_PATTERNS = [
  ".d.ts",
  ".d.ts.map",
  ".js",
  ".js.map",
  ".ts", // TypeScript source — dev-only; not part of user-shipped templates
  "__pycache__",
];

function shouldExclude(filename: string): boolean {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (filename.endsWith(pattern) || filename === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * Inject the opt-in `statusLine` block into the settings.json template.
 * Runs BEFORE resolvePlaceholders so `{{PYTHON_CMD}}` resolves through the
 * normal path. The flag-off path never calls this — default output stays
 * byte-identical.
 *
 * Mirrors `preserveExistingClaudeStatusLine` (update.ts) exactly: parse →
 * assign (key lands at the END of the object) → stringify(null, 2) + "\n".
 * Byte-parity matters: `omp-flow update` re-derives the expected settings.json
 * via that preserve step, so any divergence (e.g. a different key position)
 * makes update flag a phantom settings.json change on every fresh opted-in
 * project.
 */
function injectStatusLine(content: string): string {
  const settings = JSON.parse(content) as Record<string, unknown>;
  settings.statusLine = {
    type: "command",
    command: "{{PYTHON_CMD}} .claude/hooks/statusline.py",
  };
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/**
 * Recursively copy directory, excluding build artifacts and the commands/ +
 * hooks/ dirs (hooks are written from `getClaudeHooks()`; commands, if any,
 * from common templates).
 */
async function copyDirFiltered(
  src: string,
  dest: string,
  skipDirs: string[] = [],
  withStatusline = false,
): Promise<void> {
  ensureDir(dest);

  for (const entry of readdirSync(src)) {
    if (shouldExclude(entry) || skipDirs.includes(entry)) {
      continue;
    }

    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      await copyDirFiltered(srcPath, destPath);
    } else {
      let content = readFileSync(srcPath, "utf-8");
      if (entry === "settings.json") {
        if (withStatusline) {
          content = injectStatusLine(content);
        }
        content = resolvePlaceholders(content);
      }
      await writeFile(destPath, replacePythonCommandLiterals(content));
    }
  }
}

/**
 * Write the Claude hook scripts to `.claude/hooks/`.
 *
 * Reads the SAME source (`getClaudeHooks()`, a directory walk of
 * `templates/claude/hooks/*.py` excluding the opt-in `statusline.py`) that the
 * claude `collectTemplates` closure reads for `omp-flow update`, so the init
 * writer and the update collector can never drift (D3 symmetry). Replaces the
 * former shared-hooks path — the Claude hooks parse Claude-specific payloads
 * and are delivered per-platform.
 */
async function writeClaudeHooks(hooksDir: string): Promise<void> {
  ensureDir(hooksDir);
  for (const [name, content] of getClaudeHooks()) {
    await writeFile(
      path.join(hooksDir, name),
      replacePythonCommandLiterals(content),
    );
  }
}

/**
 * Configure Claude Code:
 * - agents/, settings.json from platform-specific templates
 * - hooks/ from `getClaudeHooks()` (per-platform; the five omp-flow Claude
 *   hooks parse Claude-specific payloads)
 * - commands/omp-flow/ — slash commands (omp-flow ships none in M1; loop inert)
 * - skills/<name>/SKILL.md — bundled workflow skills (12 in M1)
 * - with `withStatusline`: opt-in statusline.py hook + `statusLine` settings
 *   entry (off by default; `omp-flow init --with-statusline`). The bundled
 *   `statusline.py` is omp-flow-native (reads the `.omp-flow` task layout and
 *   fails open on control-plane drift). It stays OUT of `getClaudeHooks()`, so
 *   `omp-flow update` never force-installs it on opted-out projects.
 */
export async function configureClaude(
  cwd: string,
  options?: PlatformConfigureOptions,
): Promise<void> {
  const sourcePath = getClaudeTemplatePath();
  const destPath = path.join(cwd, ".claude");
  const ctx = AI_TOOLS["claude-code"].templateContext;
  const withStatusline = options?.withStatusline === true;

  // Copy platform-specific files (agents, settings) — hooks + commands excluded
  // (hooks come from getClaudeHooks(); commands from common templates).
  await copyDirFiltered(sourcePath, destPath, ["commands", "hooks"], withStatusline);

  // Claude hook scripts — same source (getClaudeHooks) the update collector reads
  await writeClaudeHooks(path.join(destPath, "hooks"));

  // Opt-in statusLine hook (Claude-only event; not part of getClaudeHooks() and
  // not in the update collector, so `omp-flow update` never force-installs it).
  if (withStatusline) {
    await writeFile(
      path.join(destPath, "hooks", "statusline.py"),
      replacePythonCommandLiterals(getStatuslineHook()),
    );
  }

  // Slash commands (omp-flow ships none in M1; the loop is inert but kept as a
  // mechanism for future commands).
  const commandsDir = path.join(destPath, "commands", "omp-flow");
  ensureDir(commandsDir);
  for (const cmd of resolveCommands(ctx)) {
    await writeFile(path.join(commandsDir, `${cmd.name}.md`), cmd.content);
  }

  // Auto-trigger workflow skills + multi-file built-in (bundled) skills.
  await writeSkills(
    path.join(destPath, "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );
}
