/**
 * Discover channel runtime agent names referenced by a workflow.md body.
 *
 * Channel-driven workflows tell the main session to run
 * `omp-flow channel spawn --agent <name>`, which loads `.omp-flow/agents/<name>.md`
 * via `packages/cli/src/commands/channel/agent-loader.ts`. If a workflow
 * references an agent name that is not on disk, the spawn call fails at
 * runtime. We surface that mismatch eagerly (at `omp-flow init --workflow` /
 * `omp-flow workflow --template` time) so users can run `omp-flow update` before
 * the first spawn.
 *
 * Detection is intentionally lexical — we accept false positives over
 * shipping a markdown parser. We pick names from two surface forms:
 *
 *   1. `--agent <name>` flag on a `omp-flow channel spawn ...` command
 *   2. `.omp-flow/agents/<name>.md` literal path reference
 *
 * Both forms gate on the same `SAFE_AGENT_NAME` charset that `agent-loader.ts`
 * enforces, so the discovered set is always loader-compatible.
 */

import fs from "node:fs";
import path from "node:path";

import { PATHS, DIR_NAMES } from "../constants/paths.js";

/**
 * Mirror of `SAFE_AGENT_NAME` in `commands/channel/agent-loader.ts`.
 * Names outside this charset cannot be loaded, so we silently ignore them.
 */
const SAFE_AGENT_NAME_CHARS = "A-Za-z0-9._-";

const AGENT_FLAG_RE = new RegExp(
  `--agent[\\s=]+([${SAFE_AGENT_NAME_CHARS}]+)`,
  "g",
);
const AGENT_PATH_RE = new RegExp(
  `\\.omp-flow/agents/([${SAFE_AGENT_NAME_CHARS}]+)\\.md`,
  "g",
);

/**
 * Extract the set of `.omp-flow/agents/<name>.md` agent names that the given
 * workflow body references. Result is sorted and deduplicated.
 */
export function collectReferencedAgents(workflowContent: string): string[] {
  const found = new Set<string>();
  for (const re of [AGENT_FLAG_RE, AGENT_PATH_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(workflowContent)) !== null) {
      const name = m[1];
      if (name) found.add(name);
    }
  }
  return [...found].sort();
}

/**
 * Of the agent names referenced by the workflow, return those that do not
 * exist under `<cwd>/.omp-flow/agents/`.
 */
export function collectMissingAgents(
  cwd: string,
  workflowContent: string,
): string[] {
  const referenced = collectReferencedAgents(workflowContent);
  if (referenced.length === 0) return [];
  const agentsRoot = path.join(cwd, `${DIR_NAMES.WORKFLOW}/agents`);
  return referenced.filter((name) => {
    const file = path.join(agentsRoot, `${name}.md`);
    const nested = path.join(agentsRoot, name, "AGENT.md");
    return !fs.existsSync(file) && !fs.existsSync(nested);
  });
}
