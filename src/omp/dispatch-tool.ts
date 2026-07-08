import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
// AgentDefinition type from ambient declaration (src/types/oh-my-pi-ambient.d.ts)
// runSubprocess is imported at runtime by OMP; static import breaks tsx test runner
// TODO: task 07-09-omp-import-strategy will resolve this properly
type AgentDefinition = {
  name: string;
  description: string;
  systemPrompt: string;
  source: 'bundled' | 'user' | 'project';
  tools?: string[];
};
import { readCSVRow } from '../core/csv-adapter.js';
import { SharedContextStore } from '../core/shared-context-store.js';
import { readActiveTaskId } from './active-task.js';

type DispatchRole = 'executor' | 'reviewer';

type DispatchParams = {
  rowId: string;
  role: DispatchRole;
  localGuidance?: string;
};

type ToolContent = { type: 'text'; text: string };

type ToolResponse = { content: ToolContent[] };

type DispatchToolExecuteContext = {
  sessionManager?: { getSessionId?: () => string | null };
};

function textResponse(text: string): ToolResponse {
  return { content: [{ type: 'text', text }] };
}

function stripFrontmatter(raw: string): { frontmatter: Record<string, string | string[]>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const fmText = match[1];
  const body = match[2];
  const frontmatter: Record<string, string | string[]> = {};
  const lines = fmText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    // Handle YAML block array: `tools:` followed by `  - item` lines
    if (value === '' && i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) {
      const items: string[] = [];
      for (let j = i + 1; j < lines.length && /^\s+-\s/.test(lines[j]); j++) {
        items.push(lines[j].replace(/^\s+-\s*/, '').trim());
      }
      frontmatter[key] = items;
      i = items.length > 0 ? i + items.length : i;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      // Handle YAML inline array: `tools: [a, b, c]`
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else {
      // Handle scalar (CSV string): `tools: a, b, c`
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body };
}

function parseToolsField(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.length > 0 ? value : undefined;
  const tools = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return tools.length > 0 ? tools : undefined;
}

function loadAgentDefinition(workspaceDir: string, role: string): AgentDefinition {
  const ompAgentPath = path.join(workspaceDir, '.omp', 'agents', `${role}.md`);
  const ompFlowAgentPath = path.join(workspaceDir, '.omp-flow', 'agents', `${role}.md`);

  const agentPath = fs.existsSync(ompAgentPath) ? ompAgentPath : ompFlowAgentPath;
  if (!fs.existsSync(agentPath)) {
    throw new Error(`Agent definition not found for role: ${role}`);
  }

  const raw = fs.readFileSync(agentPath, 'utf-8');
  const { frontmatter, body } = stripFrontmatter(raw);
  const tools = parseToolsField(frontmatter.tools);

  return {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : role,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    systemPrompt: body,
    source: 'project',
    ...(tools && tools.length > 0 ? { tools } : {}),
  };
}

function resolveWorkspacePath(workspaceDir: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').trim();
  if (!normalized) {
    throw new Error('Reference path is empty');
  }
  if (normalized.includes('\0')) {
    throw new Error(`Reference path contains NUL byte: ${relativePath}`);
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized)) {
    throw new Error(`Reference path must be workspace-relative: ${relativePath}`);
  }
  if (path.isAbsolute(normalized)) {
    throw new Error(`Reference path must be relative: ${relativePath}`);
  }

  const workspaceRoot = path.resolve(workspaceDir);
  const absolutePath = path.resolve(workspaceRoot, normalized);
  const relativeToWorkspace = path.relative(workspaceRoot, absolutePath);
  if (relativeToWorkspace === '..' || relativeToWorkspace.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToWorkspace)) {
    throw new Error(`Reference path escapes workspace: ${relativePath}`);
  }
  return absolutePath;
}

function assembleFiveLayerPrompt(
  workspaceDir: string,
  taskId: string,
  rowId: string,
  role: string,
  localGuidance?: string,
): string {
  const taskDir = path.join(workspaceDir, '.omp-flow', 'tasks', taskId);
  const layers: string[] = [];

  const agentDef = loadAgentDefinition(workspaceDir, role);
  layers.push(`─── omp-flow: Role Definition (from agents/${role}.md) ───\n${agentDef.systemPrompt}`);

  const prd = fs.readFileSync(path.join(taskDir, 'prd.md'), 'utf-8');
  const design = fs.readFileSync(path.join(taskDir, 'design.md'), 'utf-8');
  layers.push(`─── omp-flow: Global Context (prd.md + design.md) ───\n${prd}\n\n${design}`);

  const row = readCSVRow(taskId, rowId, workspaceDir);
  if (!row) {
    throw new Error(`CSV row not found: ${rowId}`);
  }

  const curatedBlocks: string[] = [];
  if (row.context) {
    const store = new SharedContextStore(workspaceDir, taskId);
    for (const ref of row.context.split(';').map((s) => s.trim()).filter(Boolean)) {
      const entry = store.get(ref);
      if (!entry) {
        throw new Error(`Context ref not found for ${rowId}: ${ref}`);
      }
      if (entry.type === 'decision' && entry.status !== undefined && entry.status !== 'accepted') {
        throw new Error(`Context decision not accepted for ${rowId}: ${ref} (${entry.status})`);
      }
      const body = fs.readFileSync(path.join(taskDir, 'context', entry.path), 'utf-8');
      curatedBlocks.push(`### ${entry.type}: ${entry.title} (${entry.entryId})\n\n${body}`);
    }
  }

  if (row.reference) {
    for (const refPath of row.reference.split(',').map((s) => s.trim()).filter(Boolean)) {
      const body = fs.readFileSync(resolveWorkspacePath(workspaceDir, refPath), 'utf-8');
      curatedBlocks.push(`### Reference: ${refPath}\n\n${body}`);
    }
  }

  if (curatedBlocks.length > 0) {
    layers.push(`─── omp-flow: Curated Context (ADR / Interface refs) ───\n${curatedBlocks.join('\n\n---\n\n')}`);
  }

  const brief = fs.readFileSync(path.join(taskDir, '.task', `${rowId}.implement.md`), 'utf-8');
  if (!brief.trim()) {
    throw new Error(`Task brief empty: .task/${rowId}.implement.md`);
  }
  layers.push(`─── omp-flow: Task Brief (${rowId}.implement.md) ───\n${brief}`);

  if (localGuidance && localGuidance.trim()) {
    layers.push(`─── omp-flow: Local Guidance (Orchestrator) ───\n${localGuidance}`);
  }

  return layers.join('\n\n');
}

export function createDispatchTool(
  workspaceDir: string,
  getMainSessionId: () => string | undefined,
) {
  return {
    name: 'omp_flow_dispatch',
    label: 'OMP-Flow Dispatch',
    defaultInactive: true,
    description: 'Dispatch a sub-agent for a CSV row. Assembles five-layer prompt and spawns via runSubprocess.',
    promptSnippet: 'Dispatch a sub-agent for CSV row {rowId}. Do NOT write the assignment yourself — the tool assembles the full prompt.',
    promptGuidelines: [
      'Use omp_flow_dispatch to delegate work. Pass only rowId and role.',
      'Do NOT write the assignment text yourself. The tool loads .task/{rowId}.implement.md and assembles the full prompt.',
    ],
    parameters: {
      type: 'object' as const,
      properties: {
        rowId: { type: 'string', description: 'CSV row ID (e.g. A-001, C-AB-001)' },
        role: { type: 'string', enum: ['executor', 'reviewer'], description: 'Agent role' },
        localGuidance: { type: 'string', description: 'Optional local guidance (usually empty)' },
      },
      required: ['rowId', 'role'],
    },
    async execute(
      _toolCallId: string,
      input: DispatchParams,
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx?: DispatchToolExecuteContext,
    ): Promise<ToolResponse> {
      const mainSessionId = getMainSessionId();
      const currentSessionId = ctx?.sessionManager?.getSessionId?.() ?? undefined;

      if (!mainSessionId || !currentSessionId) {
        return textResponse('Error: Recursion Guard — session ID unavailable; refusing to dispatch because recursion safety cannot be proven.');
      }

      if (currentSessionId !== mainSessionId) {
        return textResponse(`Error: Recursion Guard — only the main session may call omp_flow_dispatch (currentSession=${currentSessionId}, mainSession=${mainSessionId}). Report completion to orchestrator instead.`);
      }

      let taskId: string;
      try {
        taskId = readActiveTaskId(workspaceDir);
      } catch (error) {
        return textResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }

      const row = readCSVRow(taskId, input.rowId, workspaceDir);
      if (!row) {
        return textResponse(`Error: Row not found: ${input.rowId}`);
      }

      let prompt: string;
      try {
        prompt = assembleFiveLayerPrompt(workspaceDir, taskId, input.rowId, input.role, input.localGuidance);
      } catch (error) {
        return textResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }

      const agent = loadAgentDefinition(workspaceDir, input.role);
      const tier = input.role === 'reviewer' ? 'slow' : 'default';
      const modelOverride = tier === 'default' ? undefined : `pi/${tier}`;
      // Lazy require: OMP runtime provides this module; static import breaks tsx test runner
      // TODO: task 07-09-omp-import-strategy will resolve this properly
      const { runSubprocess } = require('@oh-my-pi/pi-coding-agent/task/executor') as {
        runSubprocess: (opts: {
          cwd: string;
          agent: AgentDefinition;
          task: string;
          context: string;
          role: string;
          index: number;
          id: string;
          signal?: AbortSignal;
          onProgress?: (progress: unknown) => void;
          modelOverride?: string;
          taskDepth: number;
        }) => Promise<{ output: string; exitCode: number; aborted: boolean; abortReason?: string }>;
      };
      const result = await runSubprocess({
        cwd: workspaceDir,
        agent,
        task: prompt,
        context: '',
        role: input.role,
        index: 0,
        id: `${input.rowId}-${Date.now()}`,
        signal,
        onProgress: typeof onUpdate === 'function' ? (progress: unknown) => { onUpdate(progress); } : undefined,
        modelOverride,
        taskDepth: 1,
      });

      if (result.aborted) {
        return textResponse(`Subagent aborted: ${result.abortReason ?? 'unknown'}`);
      }
      return textResponse(result.output);
    },
  };
}

export { assembleFiveLayerPrompt, loadAgentDefinition, stripFrontmatter };
