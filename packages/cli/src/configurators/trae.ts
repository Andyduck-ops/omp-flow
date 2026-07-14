import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  resolvePlaceholders,
  resolveCommands,
  resolveSkills,
  resolveBundledSkills,
  wrapWithCommandFrontmatter,
  writeSkills,
  writeAgents,
  writeSharedHooks,
  applyPullBasedPreludeMarkdown,
} from "./shared.js";
import { getAllAgents, getSettingsTemplate } from "../templates/trae/index.js";

/**
 * Configure Trae IDE (pull-based class-2 platform).
 *
 * Trae is a class-2 platform: hooks fire on SessionStart +
 * UserPromptSubmit in the main session, but cannot inject sub-agent
 * prompts. Sub-agents use a pull-based prelude to load context themselves.
 *
 * Directory structure created:
 *   .trae/
 *   ├── commands/      # Slash commands (omp-flow-*.md with frontmatter)
 *   ├── skills/        # Skill definitions
 *   ├── agents/        # Sub-agent definitions with pull-based prelude
 *   ├── hooks/         # Shared Python hook scripts
 *   └── hooks.json     # Hook event registration
 */
export async function configureTrae(cwd: string): Promise<void> {
  const config = AI_TOOLS.trae;
  const ctx = config.templateContext;
  const configRoot = path.join(cwd, config.configDir);

  // 1. Commands — slash commands with frontmatter
  const commandsDir = path.join(configRoot, "commands");
  ensureDir(commandsDir);
  for (const cmd of resolveCommands(ctx)) {
    const name = `omp-flow-${cmd.name}`;
    await writeFile(
      path.join(commandsDir, `${name}.md`),
      wrapWithCommandFrontmatter(name, cmd.content),
    );
  }

  // 2. Skills
  await writeSkills(
    path.join(configRoot, "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );

  // 3. Agents — with pull-based prelude (class-2 pattern)
  await writeAgents(
    path.join(configRoot, "agents"),
    applyPullBasedPreludeMarkdown(getAllAgents()),
  );

  // 4. Shared hooks — Python scripts
  await writeSharedHooks(path.join(configRoot, "hooks"), "trae");

  // 5. Hook configuration — register hook events
  const settings = getSettingsTemplate();
  await writeFile(
    path.join(configRoot, settings.targetPath),
    resolvePlaceholders(settings.content),
  );
}
