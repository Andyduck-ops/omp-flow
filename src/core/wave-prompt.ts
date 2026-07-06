import type { TaskDefinition, TaskSummary } from './state.js';

/**
 * Wave Prompt Builder - Assembles structured prompts for wave executor
 * subagents from a TaskDefinition. Modeled after Maestro's buildDelegatePrompt.
 */

/**
 * Build a structured prompt string for a wave executor subagent.
 *
 * Sections:
 *  - Task header (id + title)
 *  - Purpose statement (success = all convergence criteria pass)
 *  - Scope
 *  - Action
 *  - Files (path → target: change)
 *  - Read First
 *  - Implementation Steps
 *  - Convergence Criteria (checkbox list, MUST verify all)
 *  - Prior Wave Summaries (taskId (status) + summary)
 *  - Project Specs (raw content)
 *  - Guidance Specification path (optional)
 *  - Rules (read-first discipline, verify convergence, no commit, stay in scope)
 */
export function buildWavePrompt(
  taskDef: TaskDefinition,
  priorSummaries: TaskSummary[],
  specsContent: string,
  guidancePath?: string,
): string {
  const lines: string[] = [];

  lines.push(`## Task: ${taskDef.id} — ${taskDef.title}`);
  lines.push('');
  lines.push(
    `PURPOSE: Implement ${taskDef.id}: ${taskDef.title}; success = all convergence criteria pass`,
  );
  lines.push('');

  // Scope
  lines.push('### Scope');
  lines.push(taskDef.scope || '(unspecified)');
  lines.push('');

  // Action
  lines.push('### Action');
  lines.push(taskDef.action || '(unspecified)');
  lines.push('');

  // Files
  lines.push('### Files');
  if (taskDef.files.length > 0) {
    for (const f of taskDef.files) {
      lines.push(`- ${f.path} → ${f.target}: ${f.change}`);
    }
  } else {
    lines.push('(none specified)');
  }
  lines.push('');

  // Read First
  lines.push('### Read First');
  if (taskDef.readFirst.length > 0) {
    for (const f of taskDef.readFirst) {
      lines.push(`- ${f}`);
    }
  } else {
    lines.push('(none specified)');
  }
  lines.push('');

  // Implementation Steps
  lines.push('### Implementation Steps');
  if (taskDef.implementation.length > 0) {
    for (const s of taskDef.implementation) {
      lines.push(`- ${s}`);
    }
  } else {
    lines.push('(none specified)');
  }
  lines.push('');

  // Convergence Criteria
  lines.push('### Convergence Criteria (MUST verify all)');
  if (taskDef.convergence.criteria.length > 0) {
    for (const c of taskDef.convergence.criteria) {
      lines.push(`- [ ] ${c}`);
    }
  } else {
    lines.push('- [ ] (no criteria defined)');
  }
  lines.push('');

  // Prior Wave Summaries
  lines.push('## Prior Wave Summaries');
  if (priorSummaries.length > 0) {
    const blocks = priorSummaries.map(
      (s) => `### ${s.taskId} (${s.status})\n${s.summary}`,
    );
    lines.push(blocks.join('\n\n'));
  } else {
    lines.push('(none — this is the first wave)');
  }
  lines.push('');

  // Project Specs
  lines.push('## Project Specs');
  lines.push(specsContent && specsContent.trim().length > 0 ? specsContent : '(none)');
  lines.push('');

  // Guidance Specification (optional)
  if (guidancePath) {
    lines.push('## Guidance Specification');
    lines.push(`Read: ${guidancePath}`);
    lines.push('');
  }

  // Rules
  lines.push('## Rules');
  lines.push("- Read all 'Read First' files before touching anything");
  lines.push('- Verify ALL convergence criteria after implementation');
  lines.push('- Do NOT commit — report completion with summary');
  lines.push(`- Stay within scope: ${taskDef.scope || '(unspecified)'}`);

  return lines.join('\n');
}
