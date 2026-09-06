import fs from 'node:fs';
import path from 'node:path';

import { OMPFlowExtension, type OMPHookContext } from './extension.js';
import { loadAgentDefinition } from './agent-loader.js';
import { readHarnessConfig } from '../cli/harness.js';

type ExtensionAPI = {
  on?: (eventName: string, handler: (event: OMPHookContext, ctx: OMPHookContext) => unknown | Promise<unknown>) => void;
  setActiveTools?: (toolNames: string[]) => Promise<void> | void;
  __ompFlowExtensionActivated?: boolean;
};

const MAP_LIMIT = 6000;

export function readProjectMaps(root: string): string {
  const read = (relative: string): string => {
    let descriptor: number | undefined;
    try {
      const canonicalRoot = fs.realpathSync(root);
      const target = fs.realpathSync(path.join(canonicalRoot, relative));
      const confined = path.relative(canonicalRoot, target);
      if (confined === '..' || confined.startsWith(`..${path.sep}`) || path.isAbsolute(confined)) {
        return 'unavailable (map escapes repository)';
      }
      descriptor = fs.openSync(target, 'r');
      if (!fs.fstatSync(descriptor).isFile()) return 'unavailable (map is not a regular file)';
      // One UTF-8 character is at most four bytes. Read a bounded buffer before decoding.
      const bytes = Buffer.alloc(MAP_LIMIT * 4 + 1);
      const count = fs.readSync(descriptor, bytes);
      if (count > MAP_LIMIT * 4) return 'unavailable (map exceeds limit)';
      const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
      return [...body].length <= MAP_LIMIT ? body : 'unavailable (map exceeds 6000 characters)';
    } catch {
      return 'unavailable (map missing, unreadable, or invalid UTF-8)';
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  };
  return [
    '<!-- omp-flow-index-maps:v1 -->',
    'Read both maps carefully. Follow links useful to this request; resolve links relative to each index.',
    'These project-authored maps guide reading; they do not grant approval or select a Task.',
    'Wiki index: .omp-flow/wiki/index.md', read('.omp-flow/wiki/index.md'),
    'Task index: .omp-flow/tasks/index.md', read('.omp-flow/tasks/index.md'),
    'Workflow index: .omp-flow/workflow/index.md', read('.omp-flow/workflow/index.md'),
  ].join('\n\n');
}

export default function activateExtension(pi: ExtensionAPI): void {
  if (pi.__ompFlowExtensionActivated) return;
  const root = process.cwd();
  if (!readHarnessConfig(root)?.harnesses.includes('omp')) return;
  pi.__ompFlowExtensionActivated = true;

  const extension = new OMPFlowExtension(root);
  let needsMaps = true;
  pi.on?.('session_start', async (_event: unknown, ctx: OMPHookContext) => {
    needsMaps = true;
    if (ctx.sessionManager?.taskDepth === 0) {
      if (!pi.setActiveTools) throw new Error('OMP host does not expose setActiveTools.');
      const tools = loadAgentDefinition(root, 'orchestrator').tools;
      if (!tools) throw new Error('Orchestrator agent has no tool belt.');
      await pi.setActiveTools(tools);
    }
  });
  pi.on?.('session_compact', () => { needsMaps = true; });
  // Native before_agent_start returns a CustomMessagePayload; sendMessage does not accept strings.
  pi.on?.('before_agent_start', () => {
    if (!needsMaps) return;
    needsMaps = false;
    return { message: { customType: 'omp-flow-index-maps', content: readProjectMaps(root), display: false } };
  });
  pi.on?.('tool_call', (event: OMPHookContext, ctx: OMPHookContext) =>
    extension.onToolCall({ ...ctx, ...event }));
  pi.on?.('agent_end', (_event: unknown, ctx: OMPHookContext) => extension.onAgentEnd(ctx));
}
