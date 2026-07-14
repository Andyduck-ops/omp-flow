import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  applyPullBasedPreludeMarkdown,
  collectSkillTemplates,
  replacePythonCommandLiterals,
  resolveCommands,
  resolveBundledSkills,
  resolvePlaceholders,
  resolveSkills,
  writeAgents,
  writeSkills,
} from "./shared.js";
import {
  getAllAgents,
  getExtensionTemplate,
  getSettingsTemplate,
} from "../templates/pi/index.js";

function resolvePiCommands(): ReturnType<typeof resolveCommands> {
  const ctx = AI_TOOLS.pi.templateContext;
  const commands = resolveCommands(ctx);
  if (commands.some((command) => command.name === "start")) return commands;

  // Pi has extension hooks, so the shared command resolver filters `start`.
  // Keep a manual fallback because Pi's `session_start` event cannot mutate
  // model context; the strong startup injection happens later at agent start.
  const start = resolveCommands({ ...ctx, hasHooks: false }).find(
    (command) => command.name === "start",
  );
  return start ? [start, ...commands] : commands;
}

export function collectPiTemplates(): Map<string, string> {
  const files = new Map<string, string>();
  const ctx = AI_TOOLS.pi.templateContext;

  for (const command of resolvePiCommands()) {
    files.set(`.pi/prompts/omp-flow-${command.name}.md`, command.content);
  }

  // Skills written under `.pi/skills/` (Pi-owned skill root). Pi can also
  // discover `.agents/skills/` shared with Codex/Gemini; switching is
  // intentionally deferred to a follow-up because Pi has its own skill
  // discovery semantics that aren't covered by this task.
  for (const [filePath, content] of collectSkillTemplates(
    ".pi/skills",
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  for (const agent of applyPullBasedPreludeMarkdown(getAllAgents())) {
    files.set(`.pi/agents/${agent.name}.md`, agent.content);
  }

  files.set(".pi/extensions/omp-flow/index.ts", getExtensionTemplate());

  const settings = getSettingsTemplate();
  files.set(
    `.pi/${settings.targetPath}`,
    resolvePlaceholders(settings.content),
  );

  return files;
}

export async function configurePi(cwd: string): Promise<void> {
  const config = AI_TOOLS.pi;
  const ctx = config.templateContext;
  const configRoot = path.join(cwd, config.configDir);

  ensureDir(path.join(configRoot, "prompts"));
  for (const command of resolvePiCommands()) {
    await writeFile(
      path.join(configRoot, "prompts", `omp-flow-${command.name}.md`),
      command.content,
    );
  }

  // See collectPiTemplates(): Pi keeps a private `.pi/skills/` root for now.
  // Cross-platform `.agents/skills/` adoption is a separate decision.
  await writeSkills(
    path.join(configRoot, "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );
  await writeAgents(
    path.join(configRoot, "agents"),
    applyPullBasedPreludeMarkdown(getAllAgents()),
  );

  ensureDir(path.join(configRoot, "extensions", "omp-flow"));
  await writeFile(
    path.join(configRoot, "extensions", "omp-flow", "index.ts"),
    replacePythonCommandLiterals(getExtensionTemplate()),
  );

  const settings = getSettingsTemplate();
  await writeFile(
    path.join(configRoot, settings.targetPath),
    resolvePlaceholders(settings.content),
  );
}
