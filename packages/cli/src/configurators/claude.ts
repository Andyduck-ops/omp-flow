import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { getClaudeTemplatePath } from "../templates/extract.js";
import { getClaudeHooks } from "../templates/claude/index.js";
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
 * Recursively copy directory, excluding build artifacts and the commands/ +
 * hooks/ dirs (hooks are written from `getClaudeHooks()`; commands, if any,
 * from common templates).
 */
async function copyDirFiltered(
  src: string,
  dest: string,
  skipDirs: string[] = [],
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
 *
 * F1 disposition (M1): the `--with-statusline` opt-in is NOT deployed. The
 * bundled `statusline.py` is Trellis-shaped (reads the removed `.trellis` task
 * layout) and would install broken, so no statusLine hook or settings entry is
 * written. Re-enabling it requires an omp-flow-native rewrite (post-M1).
 */
export async function configureClaude(
  cwd: string,
  _options?: PlatformConfigureOptions,
): Promise<void> {
  const sourcePath = getClaudeTemplatePath();
  const destPath = path.join(cwd, ".claude");
  const ctx = AI_TOOLS["claude-code"].templateContext;

  // Copy platform-specific files (agents, settings) — hooks + commands excluded
  // (hooks come from getClaudeHooks(); commands from common templates).
  await copyDirFiltered(sourcePath, destPath, ["commands", "hooks"]);

  // Claude hook scripts — same source (getClaudeHooks) the update collector reads
  await writeClaudeHooks(path.join(destPath, "hooks"));

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
