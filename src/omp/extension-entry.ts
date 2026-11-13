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

// Every part is injected whole: the maps are the cheapest global view and the Router holds Main's
// working rules. OMP delivers the message without a size cap, so nothing is shared or truncated.
const ROUTER = '.agents/skills/omp-flow/SKILL.md';
const READ_LIMIT = 1_000_000;
// The optional brief is the one bounded part: a few counter-default conclusions pushed at startup.
const WIKI_BRIEF = '.omp-flow/wiki/brief.md';
const BRIEF_CHAR_LIMIT = 2_000;

type MapRead = { text: string } | { reason: string };
type BriefRead = { present: false } | { present: true; text: string } | { present: true; reason: string };

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
    const bytes = Buffer.alloc(READ_LIMIT + 1);
    const count = fs.readSync(descriptor, bytes);
    if (count > READ_LIMIT) return { reason: `larger than ${READ_LIMIT} bytes; read ${relative} directly` };
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count)) };
  } catch {
    return { reason: 'map missing, unreadable, or invalid UTF-8' };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

// Mirrors the Python hooks' _read_optional_brief so all five Harnesses render the same brief.
function readOptionalBrief(root: string): BriefRead {
  let descriptor: number | undefined;
  let raw: Buffer;
  try {
    // lstat each part before opening, so a symlink is never followed and a FIFO is never opened.
    let current = fs.realpathSync(root);
    let status: fs.Stats | undefined;
    for (const part of ['.omp-flow', 'wiki', 'brief.md']) {
      current = path.join(current, part);
      status = fs.lstatSync(current);
      if (status.isSymbolicLink()) return { present: true, reason: 'brief must not be a symlink' };
      // A file where a directory belongs is unavailable on every platform (Windows reports it as missing).
      if (part !== 'brief.md' && !status.isDirectory()) return { present: true, reason: 'brief unavailable' };
    }
    if (!status?.isFile()) return { present: true, reason: 'brief is not a regular file' };
    descriptor = fs.openSync(current, 'r');
    const buffer = Buffer.alloc(READ_LIMIT + 1);
    let count = 0;
    for (let read = -1; read !== 0 && count < buffer.length; count += read) {
      read = fs.readSync(descriptor, buffer, count, buffer.length - count, null);
    }
    if (count > READ_LIMIT) {
      return { present: true, reason: `larger than ${READ_LIMIT} bytes; read ${WIKI_BRIEF} directly` };
    }
    raw = buffer.subarray(0, count);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { present: false };
    return { present: true, reason: 'brief unavailable' };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  let decoded: string;
  try {
    // ignoreBOM keeps a leading BOM as Python's utf-8 codec does, so code-point counts agree.
    decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
  } catch {
    return { present: true, reason: 'invalid UTF-8' };
  }
  const normalized = decoded.replace(/\r\n/g, '\n');
  // Count code points, not UTF-16 units, to match Python len(str) on astral characters.
  const codePoints = Array.from(normalized);
  if (codePoints.length <= BRIEF_CHAR_LIMIT) return { present: true, text: normalized.replace(/\n+$/, '') };
  const prefix = codePoints.slice(0, BRIEF_CHAR_LIMIT).join('');
  const newlineIndex = prefix.lastIndexOf('\n');
  const capped = newlineIndex > 0 ? prefix.slice(0, newlineIndex) : prefix;
  const warning = `[WARNING: ${WIKI_BRIEF} exceeds ${BRIEF_CHAR_LIMIT} chars (actual: ${codePoints.length}); `
    + 'remainder omitted at startup. Run Sleep or trim brief.md and move detail into domain Concepts.]';
  return { present: true, text: `${capped}\n${warning}` };
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
  const head = [
    '<!-- omp-flow-index-maps:v1 -->',
    "Follow the omp-flow Router below as Main's working rules. Read the Workflow, Task, and Wiki maps that follow and open useful links relative to each index.",
    'These project-authored maps guide reading; they do not grant approval or select a Task.',
    ...maps.map(([relative, label]) => `${label} index: ${relative}`),
  ];
  const brief = readOptionalBrief(root);
  if (brief.present) head.push('text' in brief ? `Wiki brief: ${WIKI_BRIEF}` : `Wiki brief: unavailable (${brief.reason})`);
  // The local marker is a default, not proof the Task is still open, so it gets a pointer only.
  const active = activeTaskIndex(root);
  if (active) head.push(`Active Task index: ${active}`);
  const section = (relative: string, title: string): string => {
    const result = readMap(root, relative);
    if ('reason' in result) return `${title} content: unavailable (${result.reason})`;
    return [`--- ${title} ---`, result.text.replace(/\n+$/, ''), `--- End ${title} ---`].join('\n');
  };
  const briefSection = !brief.present ? [] : 'text' in brief
    ? [['--- Wiki brief ---', brief.text, '--- End Wiki brief ---'].join('\n')]
    : [`Wiki brief content: unavailable (${brief.reason})`];
  return [
    ...head,
    section(ROUTER, 'Router Skill'),
    ...maps.flatMap(([relative, label]) => [...(label === 'Wiki' ? briefSection : []), section(relative, `${label} map`)]),
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
