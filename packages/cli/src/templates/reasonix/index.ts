/**
 * Reasonix template module.
 *
 * Reasonix (DeepSeek-Reasonix) is a DeepSeek-native AI coding agent.
 * It stores skills as `.reasonix/skills/<name>/SKILL.md` (Markdown + frontmatter).
 *
 * Subagent skills (omp-flow-implement, omp-flow-check) use `runAs: subagent`
 * frontmatter so Reasonix spawns them as isolated subagent loops.
 */

import { createTemplateReader, type AgentTemplate } from "../template-utils.js";

const { listMdAgents } = createTemplateReader(import.meta.url);

/** Subagent skill definitions (omp-flow-implement, omp-flow-check). */
export function getAllAgents(): AgentTemplate[] {
  return listMdAgents();
}
