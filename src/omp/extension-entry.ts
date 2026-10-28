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

// Keep injected orientation within the same budget as the Python SessionStart hooks: Claude Code
// moves hook context over 10,000 characters into a file, so every Harness shares one bound. A map
// that does not fit is cut at a line boundary with a pointer to its file instead of being dropped.
const ORIENTATION_BUDGET = 9000;

type MapRead = { text: string } | { reason: string };

function readMap(root: string, relative: string): MapRead {
  let descriptor: number | undefined;
  try {
    const canonicalRoot = fs.realpathSync(root);
    const target = fs.realpathSync(path.join(canonicalRoot, relative));
    const confined = path.relative(canonicalRoot, target);
    if (confined === '..' || confined.startsWith(`..${path.sep}`) || path.isAbsolute(confined)) {
      return { reason: 'map escapes repository' };
    }
    descriptor = fs.openSync(target, 'r');
    if (!fs.fstatSync(descriptor).isFile()) return { reason: 'map is not a regular file' };
    // One UTF-8 character is at most four bytes; a character split by the limit is held back.
    const limit = ORIENTATION_BUDGET * 4;
    const bytes = Buffer.alloc(limit);
    const count = fs.readSync(descriptor, bytes);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return { text: decoder.decode(bytes.subarray(0, count), { stream: count === limit }) };
  } catch {
    return { reason: 'map missing, unreadable, or invalid UTF-8' };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function fitMap(text: string, budget: number, relative: string): string {
  if (text.length <= budget) return text;
  const note = `[... truncated; read ${relative} for the rest]`;
  const cut = text.lastIndexOf('\n', Math.max(budget - note.length - 1, 0));
  return (cut > 0 ? `${text.slice(0, cut)}\n` : '') + note;
}

function activeTaskIndex(root: string): string | undefined {
  try {
    const canonicalRoot = fs.realpathSync(root);
    const markerPath = path.join(canonicalRoot, '.omp-flow', '.runtime', 'workscope.json');
    if (!fs.lstatSync(markerPath).isFile()) return undefined;
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as Record<string, unknown>;
    if (marker.version !== 1 || typeof marker.taskId !== 'string' || typeof marker.workspaceRoot !== 'string') {
      return undefined;
    }
    const taskId = marker.taskId.trim();
    if (!taskId || taskId === '.' || taskId === '..' || taskId === 'archive' || /[\\/]/.test(taskId)) return undefined;
    if (fs.realpathSync(marker.workspaceRoot) !== canonicalRoot) return undefined;
    const activeRel = `.omp-flow/tasks/${taskId}/index.md`;
    return fs.lstatSync(path.join(canonicalRoot, activeRel)).isFile() ? activeRel : undefined;
  } catch {
    // Optional active WorkScope map is best-effort only.
    return undefined;
  }
}

export function readProjectMaps(root: string): string {
  const maps: Array<[string, string]> = [
    ['.omp-flow/workflow/index.md', 'Workflow'],
    ['.omp-flow/tasks/index.md', 'Task'],
    ['.omp-flow/wiki/index.md', 'Wiki'],
  ];
  const reads = new Map(maps.map(([relative]) => [relative, readMap(root, relative)]));
  const head = [
    '<!-- omp-flow-index-maps:v1 -->',
    'Read the Task, Wiki, and Workflow maps carefully. Follow useful links relative to each index.',
    'These project-authored maps guide reading; they do not grant approval or select a Task.',
    ...maps.map(([relative, label]) => `${label} index: ${relative}`),
  ];
  // The local marker is a default, not proof the Task is still open, so it gets a pointer only.
  const active = activeTaskIndex(root);
  if (active) head.push(`Active Task index: ${active}`);
  const sections = new Map<string, string>();
  const readable: Array<{ relative: string; label: string; text: string }> = [];
  for (const [relative, label] of maps) {
    const result = reads.get(relative)!;
    if ('reason' in result) sections.set(relative, `${label} map content: unavailable (${result.reason})`);
    else readable.push({ relative, label, text: result.text.replace(/\n+$/, '') });
  }
  const frame = (label: string): [string, string] => [`--- ${label} map ---`, `--- End ${label} map ---`];
  let available = ORIENTATION_BUDGET - head.join('\n\n').length - maps.length * 2;
  for (const section of sections.values()) available -= section.length;
  for (const { label } of readable) available -= frame(label).join('').length + 2;
  // Share the budget evenly; a short map passes its unused share on to the longer ones.
  const bySize = [...readable].sort((a, b) => a.text.length - b.text.length);
  bySize.forEach(({ relative, label, text }, index) => {
    const body = fitMap(text, Math.floor(available / (bySize.length - index)), relative);
    const [start, end] = frame(label);
    sections.set(relative, [start, body, end].join('\n'));
    available -= body.length;
  });
  return [...head, ...maps.map(([relative]) => sections.get(relative)!)].join('\n\n');
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
