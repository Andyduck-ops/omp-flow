/**
 * ZCode template module.
 *
 * ZCode (智谱) is an agentic AI coding tool that supports multi-agent
 * collaboration. It stores agents as `.zcode/agents/<name>.md`
 * (Markdown with YAML frontmatter: name, description, color).
 *
 * omp-flow-implement and omp-flow-check use pull-based context injection.
 * omp-flow-research is intentionally standalone: it does not receive the
 * implement/check prelude, and persists findings under the active task's
 * research directory instead.
 */

import { createTemplateReader, type AgentTemplate } from "../template-utils.js";

const { listMdAgents } = createTemplateReader(import.meta.url);

/** Sub-agent definitions (omp-flow-implement, omp-flow-check, omp-flow-research). */
export function getAllAgents(): AgentTemplate[] {
  return listMdAgents();
}
