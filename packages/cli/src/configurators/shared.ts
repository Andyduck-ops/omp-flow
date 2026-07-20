/**
 * Shared utilities for platform configurators.
 *
 * Extracted here to avoid circular dependencies (index.ts imports configurators,
 * configurators cannot import from index.ts).
 */

import type { TemplateContext } from "../types/ai-tools.js";

/**
 * Per-platform configure options threaded from `omp-flow init` flags.
 * Defined here (not in index.ts) so configurators can reference it without
 * a circular import.
 */
export interface PlatformConfigureOptions {
  /**
   * Claude Code only: install the opt-in OmpFlow statusLine
   * (`omp-flow init --with-statusline`). Off by default — see
   * `configureClaude` in `claude.ts`.
   */
  withStatusline?: boolean;
}

/**
 * Module-level resolved Python command, set by the init flow after probing.
 *
 * Windows commonly has Python under one of: `python`, `python3`, `py -3` —
 * which one works varies by installer (python.org / Microsoft Store / py
 * launcher). `init.ts` detects which is available, then calls
 * `setResolvedPythonCommand` so all subsequent template / configurator writes
 * use the resolved value instead of the platform default.
 *
 * If unset (e.g. unit tests bypass init), `getPythonCommandForPlatform` falls
 * back to the static platform default (`python` on Windows, `python3`
 * elsewhere) — preserving legacy behavior.
 */
let resolvedPythonCommand: string | null = null;

export function setResolvedPythonCommand(cmd: string): void {
  const trimmed = cmd.trim();
  resolvedPythonCommand = trimmed || null;
}

/** Test helper — clear the resolved cache between unit tests. */
export function resetResolvedPythonCommand(): void {
  resolvedPythonCommand = null;
}

/**
 * Get the Python command for the host platform.
 *
 * Returns the resolved command if `setResolvedPythonCommand` has been called;
 * otherwise the static platform default — Windows: `python`, others:
 * `python3`. Pass an explicit `platform` arg only for unit tests (it bypasses
 * the resolved cache).
 */
export function getPythonCommandForPlatform(
  platform?: NodeJS.Platform,
): string {
  if (platform === undefined && resolvedPythonCommand) {
    return resolvedPythonCommand;
  }
  const target = platform ?? process.platform;
  return target === "win32" ? "python" : "python3";
}

/**
 * Replace literal `python3` with the resolved Python command, excluding
 * shebang lines.
 *
 * Applied at init/update write time so that all file types (including .py,
 * .md, .toml, .json) get the correct command for the host platform without
 * template-level changes.
 *
 * No-op when the resolved command is `python3` (the template default).
 * Idempotent: running it twice produces the same result.
 */
export function replacePythonCommandLiterals(content: string): string {
  const target = getPythonCommandForPlatform();
  if (target === "python3") return content;
  return content
    .split("\n")
    .map((line) =>
      line.startsWith("#!") ? line : line.replaceAll("python3", target),
    )
    .join("\n");
}

/**
 * Resolve platform-specific placeholders in template content.
 *
 * When called without a context, only resolves {{PYTHON_CMD}} (legacy behavior
 * for settings.json, hooks.json, etc.).
 *
 * When called with a TemplateContext, additionally resolves:
 * - {{CMD_REF:name}}         → platform-specific command reference
 * - {{EXECUTOR_AI}}          → AI executor description
 * - {{USER_ACTION_LABEL}}    → user action label
 * - {{CLI_FLAG}}             → platform cli flag (e.g. "claude", "codex")
 * - {{#FLAG}}...{{/FLAG}}    → conditional include (when FLAG is true)
 * - {{^FLAG}}...{{/FLAG}}    → negated conditional (when FLAG is false)
 *
 * Supported conditional flags: AGENT_CAPABLE, HAS_HOOKS
 */
// Pre-compiled regexes for placeholder resolution
const RE_PYTHON_CMD = /\{\{PYTHON_CMD\}\}/g;
const RE_CMD_REF = /\{\{CMD_REF:([\w][\w-]*)\}\}/g;
const RE_EXECUTOR_AI = /\{\{EXECUTOR_AI\}\}/g;
const RE_USER_ACTION_LABEL = /\{\{USER_ACTION_LABEL\}\}/g;
const RE_CLI_FLAG = /\{\{CLI_FLAG\}\}/g;
const RE_BLANK_LINES = /\n{3,}/g;

const CONDITIONAL_FLAGS = ["AGENT_CAPABLE", "HAS_HOOKS"] as const;
const CONDITIONAL_REGEXES = Object.fromEntries(
  CONDITIONAL_FLAGS.map((flag) => [
    flag,
    {
      pos: new RegExp(
        `\\{\\{#${flag}\\}\\}([\\s\\S]*?)\\{\\{/${flag}\\}\\}`,
        "g",
      ),
      neg: new RegExp(
        `\\{\\{\\^${flag}\\}\\}([\\s\\S]*?)\\{\\{/${flag}\\}\\}`,
        "g",
      ),
    },
  ]),
) as Record<(typeof CONDITIONAL_FLAGS)[number], { pos: RegExp; neg: RegExp }>;

export function resolvePlaceholders(
  content: string,
  context?: TemplateContext,
): string {
  let result = replacePythonCommandLiterals(
    content.replace(RE_PYTHON_CMD, getPythonCommandForPlatform()),
  );

  if (!context) return result;

  // Simple substitutions
  result = result.replace(
    RE_CMD_REF,
    (_match, name: string) => `${context.cmdRefPrefix}${name}`,
  );
  result = result.replace(RE_EXECUTOR_AI, context.executorAI);
  result = result.replace(RE_USER_ACTION_LABEL, context.userActionLabel);
  result = result.replace(RE_CLI_FLAG, context.cliFlag);

  // Conditional blocks
  const flagValues: Record<(typeof CONDITIONAL_FLAGS)[number], boolean> = {
    AGENT_CAPABLE: context.agentCapable,
    HAS_HOOKS: context.hasHooks,
  };

  for (const flag of CONDITIONAL_FLAGS) {
    const value = flagValues[flag];
    const { pos, neg } = CONDITIONAL_REGEXES[flag];
    // Reset lastIndex for global regexes reused across calls
    pos.lastIndex = 0;
    neg.lastIndex = 0;
    result = result.replace(pos, value ? "$1" : "");
    result = result.replace(neg, value ? "" : "$1");
  }

  // Clean up blank lines left by removed conditional blocks
  result = result.replace(RE_BLANK_LINES, "\n\n");

  return result;
}

/**
 * Resolve placeholders for files written under `.agents/skills/` (the shared
 * Agent Skills directory consumed by multiple platforms via the upstream
 * `.agents/skills/` workspace alias — Codex, Gemini CLI 0.40+, etc.).
 *
 * Identical to {@link resolvePlaceholders} except that {@link CMD_REF} is
 * rendered in a platform-neutral form (`` `name` (OmpFlow command) ``)
 * instead of substituting a platform-specific prefix. This is the only
 * placeholder that varies between platforms in the auto-triggered skill templates
 * from `common/skills/`, so
 * neutralizing it makes the rendered SKILL.md files byte-identical regardless
 * of which OmpFlow configurator wrote them — eliminating the
 * "last-writer-wins" collision when both Codex and Gemini target
 * `.agents/skills/`.
 *
 * `{{CLI_FLAG}}`, `{{EXECUTOR_AI}}`, `{{USER_ACTION_LABEL}}`, conditionals,
 * and `{{PYTHON_CMD}}` are still resolved from the platform context. The
 * shared skills do not use those placeholders, so they remain platform-
 * neutral. Codex-only skill files (e.g. `omp-flow-continue/SKILL.md`,
 * `omp-flow-finish-work/SKILL.md` written via `resolveAllAsSkillsNeutral`) DO
 * use `{{CLI_FLAG}}` / `{{PYTHON_CMD}}` and resolve to Codex-correct values
 * — no other platform writes those files, so byte-identity is not required.
 */
export function resolvePlaceholdersNeutral(
  content: string,
  context?: TemplateContext,
): string {
  let result = replacePythonCommandLiterals(
    content.replace(RE_PYTHON_CMD, getPythonCommandForPlatform()),
  );

  if (!context) return result;

  // Neutral form for the only collision-causing placeholder
  result = result.replace(
    RE_CMD_REF,
    (_match, name: string) => `\`${name}\` (OmpFlow command)`,
  );
  result = result.replace(RE_EXECUTOR_AI, context.executorAI);
  result = result.replace(RE_USER_ACTION_LABEL, context.userActionLabel);
  result = result.replace(RE_CLI_FLAG, context.cliFlag);

  // Conditional blocks (resolved per platform — none of the auto-triggered
  // shared skills use conditionals, but Codex-only command-as-skill files might in future).
  const flagValues: Record<(typeof CONDITIONAL_FLAGS)[number], boolean> = {
    AGENT_CAPABLE: context.agentCapable,
    HAS_HOOKS: context.hasHooks,
  };

  for (const flag of CONDITIONAL_FLAGS) {
    const value = flagValues[flag];
    const { pos, neg } = CONDITIONAL_REGEXES[flag];
    pos.lastIndex = 0;
    neg.lastIndex = 0;
    result = result.replace(pos, value ? "$1" : "");
    result = result.replace(neg, value ? "" : "$1");
  }

  result = result.replace(RE_BLANK_LINES, "\n\n");

  return result;
}

// ---------------------------------------------------------------------------
// Template wrapping utilities
// ---------------------------------------------------------------------------

/** Skill description registry — maps template name to auto-trigger description. */
const SKILL_DESCRIPTIONS: Record<string, string> = {};

/**
 * Wrap resolved template content with YAML frontmatter for skill format.
 * Used by platforms that use SKILL.md (Codex, Kiro, Qoder, etc.).
 */
export function wrapWithSkillFrontmatter(
  name: string,
  content: string,
): string {
  // Look up description by base name (without omp-flow- prefix)
  const baseName = name.replace(/^omp-flow-/, "");
  const description = SKILL_DESCRIPTIONS[baseName];
  if (!description) {
    throw new Error(
      `Missing skill description for "${baseName}". Add it to SKILL_DESCRIPTIONS in shared.ts.`,
    );
  }
  return `---\nname: ${name}\ndescription: "${description}"\n---\n\n${content}`;
}

/**
 * One-line blurbs shown in a `/` command palette — kept separate from
 * SKILL_DESCRIPTIONS, which is long prose aimed at the skill matcher.
 */
const COMMAND_DESCRIPTIONS: Record<string, string> = {};

/** Wrap resolved command content with YAML frontmatter (name + description). */
export function wrapWithCommandFrontmatter(
  name: string,
  content: string,
): string {
  const baseName = name.replace(/^omp-flow-/, "");
  const description = COMMAND_DESCRIPTIONS[baseName];
  if (!description) {
    throw new Error(
      `Missing command description for "${baseName}". Add it to COMMAND_DESCRIPTIONS in shared.ts.`,
    );
  }
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}`;
}

/**
 * Argument-hint values for commands that accept positional args.
 * Used by OMP platform's YAML frontmatter.
 */
const COMMAND_ARGUMENT_HINTS: Record<string, string> = {};

/**
 * Wrap resolved command content with OMP-style YAML frontmatter.
 * OMP uses `description` (required) + optional `argument-hint`.
 * The leading `# Title` heading from the source template is stripped
 * because OMP's frontmatter replaces its role.
 */
export function wrapWithOmpFrontmatter(name: string, content: string): string {
  const baseName = name.replace(/^omp-flow-/, "");
  const description = COMMAND_DESCRIPTIONS[baseName];
  if (!description) {
    throw new Error(
      `Missing command description for "${baseName}". Add it to COMMAND_DESCRIPTIONS in shared.ts.`,
    );
  }
  // Strip leading H1 + blank line from template body
  const body = content.replace(/^# [^\n]+\n\n/, "");
  const hint = COMMAND_ARGUMENT_HINTS[baseName];
  const frontmatter = hint
    ? `---\ndescription: ${description}\nargument-hint: ${hint}\n---`
    : `---\ndescription: ${description}\n---`;
  return `${frontmatter}\n\n${body}`;
}

// ---------------------------------------------------------------------------
// Shared configurator helpers
// ---------------------------------------------------------------------------

import path from "node:path";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  type CommonTemplate,
  getBundledSkillTemplates,
  getCommandTemplates,
  getSkillTemplates,
} from "../templates/common/index.js";

/** A resolved template ready to be written to disk. */
export interface ResolvedTemplate {
  name: string;
  content: string;
}

/** A resolved file inside a multi-file skill directory. */
export interface ResolvedSkillFile {
  /** POSIX path relative to the skills root, e.g. "omp-flow-meta/SKILL.md" */
  relativePath: string;
  content: string;
}

/**
 * Filter command templates based on platform capabilities.
 *
 * `start.md` is stripped only on platforms that are BOTH `agentCapable` AND
 * `hasHooks` — those platforms (Claude Code, Cursor, Kiro, Gemini, Qoder,
 * CodeBuddy, Copilot, Droid, Pi) have a SessionStart-style hook that
 * auto-injects the workflow overview, so a user-facing `start` would be
 * redundant.
 *
 * `agentCapable && !hasHooks` platforms (Codex, ZCode, OpenCode, Reasonix)
 * have no such hook (or use an out-of-band plugin), so they need the
 * user-invocable `omp-flow-start` skill / `start.md` command as fallback.
 * Agent-less platforms (Kilo, Antigravity, Devin) also keep `start` since
 * they rely entirely on user-triggered workflows.
 */
function filterCommands(
  templates: CommonTemplate[],
  ctx: TemplateContext,
): CommonTemplate[] {
  if (ctx.agentCapable && ctx.hasHooks) {
    return templates.filter((t) => t.name !== "start");
  }
  return templates;
}

/**
 * Resolve ALL templates as skills with omp-flow- prefix.
 * Used by skill-only platforms (Kiro, Qoder, Codex) where everything is a skill.
 *
 * `start` is filtered out on agent-capable platforms — the session-start hook
 * injects the workflow overview instead.
 */
export function resolveAllAsSkills(ctx: TemplateContext): ResolvedTemplate[] {
  const templates = [
    ...filterCommands(getCommandTemplates(), ctx),
    ...getSkillTemplates(),
  ];
  return templates.map((tmpl) => ({
    name: `omp-flow-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `omp-flow-${tmpl.name}`,
      resolvePlaceholders(tmpl.content, ctx),
    ),
  }));
}

/**
 * Resolve command templates as plain commands (no wrapping).
 * Used by "both" platforms for the user-ritual commands.
 *
 * `start` is filtered out on agent-capable platforms.
 */
export function resolveCommands(ctx: TemplateContext): ResolvedTemplate[] {
  return filterCommands(getCommandTemplates(), ctx).map((tmpl) => ({
    name: tmpl.name,
    content: resolvePlaceholders(tmpl.content, ctx),
  }));
}

/**
 * Resolve the auto-triggered skill templates from `common/skills/` with omp-flow- prefix + SKILL.md frontmatter.
 * Used by "both" platforms for the auto-triggered skills.
 */
export function resolveSkills(ctx: TemplateContext): ResolvedTemplate[] {
  return getSkillTemplates().map((tmpl) => ({
    name: `omp-flow-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `omp-flow-${tmpl.name}`,
      resolvePlaceholders(tmpl.content, ctx),
    ),
  }));
}

/**
 * Same as {@link resolveSkills} but uses {@link resolvePlaceholdersNeutral}
 * so the rendered SKILL.md files are byte-identical across any two platforms
 * that target `.agents/skills/`. Use this for shared `.agents/skills/`
 * writes (Gemini); platform-private skill roots should keep
 * {@link resolveSkills}.
 */
export function resolveSkillsNeutral(ctx: TemplateContext): ResolvedTemplate[] {
  return getSkillTemplates().map((tmpl) => ({
    name: `omp-flow-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `omp-flow-${tmpl.name}`,
      resolvePlaceholdersNeutral(tmpl.content, ctx),
    ),
  }));
}

/**
 * Same as {@link resolveAllAsSkills} but uses
 * {@link resolvePlaceholdersNeutral} for the shared common skills. The 2 command
 * templates (continue, finish-work) folded into the skill set still resolve
 * `{{CLI_FLAG}}` / `{{PYTHON_CMD}}` per platform — only Codex writes those
 * files into `.agents/skills/`, so byte-identity isn't required there.
 */
export function resolveAllAsSkillsNeutral(
  ctx: TemplateContext,
): ResolvedTemplate[] {
  const templates = [
    ...filterCommands(getCommandTemplates(), ctx),
    ...getSkillTemplates(),
  ];
  return templates.map((tmpl) => ({
    name: `omp-flow-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `omp-flow-${tmpl.name}`,
      resolvePlaceholdersNeutral(tmpl.content, ctx),
    ),
  }));
}

/**
 * Resolve multi-file built-in skills.
 *
 * Unlike workflow skills, bundled skills already contain their own SKILL.md
 * frontmatter and may include references/assets. They are still rendered
 * through placeholder resolution so init and update get byte-identical output.
 */
export function resolveBundledSkills(
  ctx: TemplateContext,
): ResolvedSkillFile[] {
  return getBundledSkillTemplates().flatMap((skill) =>
    skill.files.map((file) => ({
      relativePath: `${skill.name}/${file.relativePath}`,
      content: resolvePlaceholders(file.content, ctx),
    })),
  );
}

// ---------------------------------------------------------------------------
// Shared configurator write helpers
// ---------------------------------------------------------------------------

/** Collect skill files under a target root for update hash tracking. */
export function collectSkillTemplates(
  skillsRoot: string,
  skills: readonly { name: string; content: string }[],
  bundledSkills: readonly ResolvedSkillFile[] = [],
): Map<string, string> {
  const files = new Map<string, string>();
  for (const skill of skills) {
    files.set(`${skillsRoot}/${skill.name}/SKILL.md`, skill.content);
  }
  for (const skillFile of bundledSkills) {
    files.set(`${skillsRoot}/${skillFile.relativePath}`, skillFile.content);
  }
  return files;
}

/** Write skill directories from resolved templates and bundled skill files. */
export async function writeSkills(
  skillsRoot: string,
  skills: { name: string; content: string }[],
  bundledSkills: readonly ResolvedSkillFile[] = [],
): Promise<void> {
  ensureDir(skillsRoot);
  for (const skill of skills) {
    const skillDir = path.join(skillsRoot, skill.name);
    ensureDir(skillDir);
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      replacePythonCommandLiterals(skill.content),
    );
  }
  for (const skillFile of bundledSkills) {
    const targetPath = path.join(skillsRoot, skillFile.relativePath);
    ensureDir(path.dirname(targetPath));
    await writeFile(
      targetPath,
      replacePythonCommandLiterals(skillFile.content),
    );
  }
}

/** Write agent/droid definition files */
export async function writeAgents(
  agentsDir: string,
  agents: { name: string; content: string }[],
  ext = ".md",
): Promise<void> {
  ensureDir(agentsDir);
  for (const agent of agents) {
    await writeFile(
      path.join(agentsDir, `${agent.name}${ext}`),
      replacePythonCommandLiterals(agent.content),
    );
  }
}

/** Write the shared hook scripts that `platform` actually registers. */
export async function writeSharedHooks(
  hooksDir: string,
  platform: import("../templates/shared-hooks/index.js").SharedHookPlatform,
): Promise<void> {
  const { getSharedHookScriptsForPlatform } =
    await import("../templates/shared-hooks/index.js");
  ensureDir(hooksDir);
  for (const hook of getSharedHookScriptsForPlatform(platform)) {
    await writeFile(
      path.join(hooksDir, hook.name),
      replacePythonCommandLiterals(hook.content),
    );
  }
}

/** A pair of agent name and file content, shared by agent transforms. */
export interface AgentContent {
  name: string;
  content: string;
}

interface MarkdownFrontmatterSections {
  body: string;
  frontmatter: string;
}

function splitMarkdownFrontmatter(
  content: string,
): MarkdownFrontmatterSections | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return null;
  }

  return {
    frontmatter: match[1],
    body: content.slice(match[0].length),
  };
}

function mapLegacyToolToCopilot(tool: string): string[] {
  switch (tool) {
    case "Read":
      return ["read"];
    case "Write":
    case "Edit":
      return ["edit"];
    case "Glob":
    case "Grep":
      return ["search"];
    case "Bash":
      return ["execute"];
    // Generic MCP wildcard — used by omp-flow-research to opt into "any MCP
    // tool the user has configured" without locking the source template to a
    // specific provider. Claude Code parses wildcards as glob-match-at-runtime
    // (no silent agent-registration skip if nothing matches), so this is the
    // safe default; explicit `mcp__exa__*` names would silent-skip the agent
    // when the Exa MCP server is absent (#302).
    case "mcp__*":
      return ["web", "exa/*", "chrome-devtools/*"];
    case "mcp__exa__web_search_exa":
    case "mcp__exa__get_code_context_exa":
      return ["web", "exa/*"];
    case "mcp__chrome-devtools__*":
      return ["chrome-devtools/*"];
    case "Skill":
      return [];
    default:
      return [];
  }
}

function normalizeCopilotMarkdownAgentFrontmatter(content: string): string {
  const sections = splitMarkdownFrontmatter(content);
  if (!sections) {
    return content;
  }

  const frontmatter = sections.frontmatter.split(/\r?\n/);
  const body = sections.body;
  const normalized: string[] = [];

  for (const line of frontmatter) {
    if (!line.startsWith("tools:")) {
      normalized.push(line);
      continue;
    }

    const legacyTools = line
      .slice("tools:".length)
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    const tools = [...new Set(legacyTools.flatMap(mapLegacyToolToCopilot))];

    normalized.push("tools:");
    for (const tool of tools) {
      normalized.push(`  - ${tool}`);
    }
  }

  return `---\n${normalized.join("\n")}\n---\n${body}`;
}

export function normalizeCopilotMarkdownAgents(
  agents: readonly AgentContent[],
): AgentContent[] {
  return agents.map((agent) => ({
    ...agent,
    content: normalizeCopilotMarkdownAgentFrontmatter(agent.content),
  }));
}

// ---------------------------------------------------------------------------
// Pull-based sub-agent prelude (for class-2 / PULL platforms whose harness has
// no PreToolUse(Agent)/CollabAgentSpawn hook and so cannot PUSH task context
// into a sub-agent the way the Claude claude-dispatch-context hook does: codex.
//
// The sub-agent must PULL its bound, freeze-checked context itself by shelling
// out to `omp_flow.py context --role <role> …`. This injector prepends that
// "load context first" step to the codex agent's developer_instructions. It is
// a PURE ADDITION wired only into the codex configurator + codex collect path;
// the Claude adapter is PUSH and does not use it.
//
// Role-keyed for the 4 pull roles. qbd is NOT a pull agent: it receives the
// self-contained `gate prepare` prompt at spawn, so detectAgentRole returns
// null for omp-flow-qbd and it gets no prelude.
// ---------------------------------------------------------------------------

export type PullRole = "researcher" | "architect" | "executor" | "reviewer";

/** The exact `omp_flow.py context` invocation each pull role must run.
 *  Planning roles (researcher, architect) pass --task only; row roles
 *  (executor, reviewer) also pass --row. <taskId>/<rowId> stay as literal
 *  placeholder tokens — the sub-agent substitutes the IDs Main passed in its
 *  dispatch prompt.
 */
function pullContextCommand(role: PullRole): string {
  const base = "python .omp-flow/scripts/omp_flow.py context";
  switch (role) {
    case "researcher":
      return `${base} --role researcher --task <taskId> --prompt "Research assigned topic"`;
    case "architect":
      return `${base} --role architect --task <taskId> --prompt "Architect assigned phase"`;
    case "executor":
      return `${base} --role executor --task <taskId> --row <rowId> --prompt "Implement assigned row"`;
    case "reviewer":
      return `${base} --role reviewer --task <taskId> --row <rowId> --prompt "Review assigned row"`;
  }
}

/** Build the omp-flow "load context first" prelude block for a pull role.
 *  Emits the literal `python …` command (matching the Claude template and the
 *  dogfood tomls). Does NOT call replacePythonCommandLiterals — the downstream
 *  configurator applies that transform to the whole agent body at write time,
 *  and it is a no-op on `python` (only rewrites `python3`); a second internal
 *  call would be redundant and risk a double-transform diff.
 */
export function buildPullBasedPrelude(role: PullRole): string {
  return `## Required: Load OmpFlow Context First

This platform does NOT auto-inject task context via hook. Before doing anything else you MUST load your bound context yourself. Run (substitute the IDs from your dispatch prompt):

${pullContextCommand(role)}

If the command fails or returns empty context, STOP. Do not proceed from repository guesses.

---

`;
}

/** Insert prelude into a TOML agent (codex `developer_instructions`).
 *  Splice the prelude immediately after the opening `developer_instructions =
 *  """` line so it lands at the TOP of the instructions, before the Identity
 *  Guard ("load context first" ordering). If the anchor is absent, return the
 *  content unchanged (safe no-op).
 */
export function injectPullBasedPreludeToml(
  content: string,
  role: PullRole,
): string {
  const prelude = buildPullBasedPrelude(role);
  // Match: developer_instructions = """  followed by newline
  const re = /(developer_instructions\s*=\s*""")(\r?\n)/;
  if (!re.test(content)) {
    return content;
  }
  return content.replace(re, `$1$2${prelude}`);
}

/** Best-effort detect the pull role from a codex agent filename
 *  ("omp-flow-implement.toml" → "executor"). Returns null for omp-flow-qbd
 *  (fed the prepared-gate prompt at spawn, not a pull prelude) and any unknown
 *  name — they skip the prelude.
 */
export function detectAgentRole(name: string): PullRole | null {
  const base = name.replace(/\.toml$/, "");
  switch (base) {
    case "omp-flow-research":
      return "researcher";
    case "omp-flow-architect":
      return "architect";
    case "omp-flow-implement":
      return "executor";
    case "omp-flow-check":
      return "reviewer";
    default:
      return null;
  }
}

/** Shared transform: given a list of codex agents, prepend the pull-based
 *  prelude to each pull-role agent (qbd/unknown pass through unchanged). Used
 *  by BOTH the codex configurator (init-time write) and the codex collect path
 *  (update-time hash comparison) so the two code paths always agree on what is
 *  on disk (the init/collect-symmetry lesson).
 */
export function applyPullBasedPreludeToml(
  agents: readonly AgentContent[],
): AgentContent[] {
  return agents.map((a) => {
    const role = detectAgentRole(a.name);
    if (!role) return { ...a };
    return {
      ...a,
      content: injectPullBasedPreludeToml(a.content, role),
    };
  });
}
