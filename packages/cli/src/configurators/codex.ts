import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import {
  getAllAgents,
  getAllCodexSkills,
  getAllHooks,
  getConfigTemplate,
  getHooksConfig,
} from "../templates/codex/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  resolvePlaceholders,
  resolveAllAsSkillsNeutral,
  resolveBundledSkills,
  writeSkills,
  replacePythonCommandLiterals,
  applyPullBasedPreludeToml,
} from "./shared.js";

/**
 * Configure Codex by writing:
 * - .agents/skills/ — shared skills from common source
 * - .codex/skills/ — Codex-specific skills (platform-specific templates)
 * - .codex/agents/, hooks/, hooks.json, config.toml — platform-specific
 */
export async function configureCodex(cwd: string): Promise<void> {
  // Shared skills from common source → .agents/skills/
  // Uses the neutral placeholder resolver so the auto-triggered skill templates
  // from `common/skills/` render to the
  // same bytes regardless of which platform writes them — required because
  // Gemini CLI 0.40+ also targets `.agents/skills/` (last-writer-wins is
  // safe when both writers produce identical output).
  const sharedSkillsRoot = path.join(cwd, ".agents", "skills");
  await writeSkills(
    sharedSkillsRoot,
    resolveAllAsSkillsNeutral(AI_TOOLS.codex.templateContext),
    resolveBundledSkills(AI_TOOLS.codex.templateContext),
  );

  const codexRoot = path.join(cwd, ".codex");

  // Codex-specific skills (platform-specific) → .codex/skills/
  const codexSkillsRoot = path.join(codexRoot, "skills");
  ensureDir(codexSkillsRoot);

  for (const skill of getAllCodexSkills()) {
    const skillDir = path.join(codexSkillsRoot, skill.name);
    ensureDir(skillDir);
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      replacePythonCommandLiterals(skill.content),
    );
  }

  // Custom agents → .codex/agents/
  const codexAgentsRoot = path.join(codexRoot, "agents");
  ensureDir(codexAgentsRoot);

  // Codex is a class-2 (pull-based) platform: PreToolUse only fires for Bash
  // and CollabAgentSpawn hook is not implemented (#15486). Sub-agents must
  // load OmpFlow context themselves via the prelude injected here.
  // applyPullBasedPreludeToml injects the per-role pull block into agent.content
  // BEFORE replacePythonCommandLiterals runs (transform order: inject → rewrite;
  // the injected literal uses `python`, so the rewrite is a no-op on it). The
  // update/collect path in ./index.ts wraps the SAME source list identically so
  // both emit byte-identical tomls (0 drift). The pulled context is FREEZE-ONLY
  // (design D2): it inherits Claude's per-row verify_row_frozen/status guarantee
  // but NOT the push-path session/active-task cross-check.
  for (const agent of applyPullBasedPreludeToml(getAllAgents())) {
    await writeFile(
      path.join(codexAgentsRoot, `${agent.name}.toml`),
      replacePythonCommandLiterals(agent.content),
    );
  }

  // Hooks → .codex/hooks/
  const hooksDir = path.join(codexRoot, "hooks");
  ensureDir(hooksDir);

  // Codex-specific hook files (session-start.py + inject-workflow-state.py).
  // hooks.json registers UserPromptSubmit -> inject-workflow-state.py; that
  // script ships from templates/codex/hooks/ (NOT the shared-hooks path — its
  // codex allowlist entry is [], the single source of truth), so getAllHooks()
  // is the only writer and the registered command resolves to a real file.
  for (const hook of getAllHooks()) {
    await writeFile(
      path.join(hooksDir, hook.name),
      replacePythonCommandLiterals(hook.content),
    );
  }

  // Hooks config → .codex/hooks.json
  await writeFile(
    path.join(codexRoot, "hooks.json"),
    resolvePlaceholders(getHooksConfig()),
  );

  // codex-cli 0.144.4 discovers unmanaged hooks as enabled unless explicitly
  // disabled, but only a matching trusted hash is runnable. First-seen and
  // modified definitions therefore require review through `/hooks`. This is a
  // version-scoped release contract, not a claim about older/newer runtimes.
  if (!process.env.VITEST && !process.env.OMP_FLOW_QUIET) {
    process.stderr.write(
      "⚠️  OmpFlow's Codex adapter is tested with codex-cli 0.144.4. " +
        "Use `/hooks` to review the first-seen UserPromptSubmit hook hash and " +
        "review it again after changes; only a matching trusted hash runs.\n",
    );
  }

  // Config → .codex/config.toml
  const config = getConfigTemplate();
  await writeFile(
    path.join(codexRoot, config.targetPath),
    replacePythonCommandLiterals(config.content),
  );
}
