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
import { ReferenceDigester } from '../core/reference-digestion.js';
import { SharedContextStore } from '../core/shared-context-store.js';
import { readActiveTaskId } from './active-task.js';

const require = createRequire(import.meta.url);

type RowBoundDispatchRole = 'executor' | 'reviewer' | 'qbd-auditor';
type SupportDispatchRole = 'architect' | 'explore' | 'planner' | 'oracle' | 'researcher';
type DispatchRole = RowBoundDispatchRole | SupportDispatchRole;

type DispatchParams = {
  rowId?: string;
  role: DispatchRole;
  prompt?: string;
  objective?: string;
  taskId?: string;
  localGuidance?: string;
};

type ToolContent = { type: 'text'; text: string };

type ToolResponse = { content: ToolContent[] };

type DispatchToolExecuteContext = {
  sessionManager?: { getSessionId?: () => string | null; taskDepth?: number };
};

type RunSubprocessOptions = {
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
};

type RunSubprocessResult = {
  output: string;
  exitCode: number;
  aborted: boolean;
  abortReason?: string;
};

type RunSubprocess = (opts: RunSubprocessOptions) => Promise<RunSubprocessResult>;

type HostExecutorModule = {
  runSubprocess?: unknown;
};

type HostRuntimeDiagnostics = {
  hasPiExports: boolean;
  hasExecutorExport: boolean;
};

function textResponse(text: string): ToolResponse {
  return { content: [{ type: 'text', text }] };
}

function formatRuntimeDiagnostic(hostRuntime?: HostRuntimeDiagnostics): string {
  if (!hostRuntime) {
    return 'hostRuntime=unknown';
  }
  return `hostRuntime={pi.pi:${hostRuntime.hasPiExports ? 'present' : 'missing'}, executorExport:${hostRuntime.hasExecutorExport ? 'present' : 'missing'}}`;
}

function resolveRunSubprocess(hostExecutorModule?: HostExecutorModule, hostRuntime?: HostRuntimeDiagnostics): RunSubprocess {
  if (typeof hostExecutorModule?.runSubprocess === 'function') {
    return hostExecutorModule.runSubprocess as RunSubprocess;
  }

  try {
    const executorModule = require('@oh-my-pi/pi-coding-agent/task/executor') as HostExecutorModule;
    if (typeof executorModule.runSubprocess === 'function') {
      return executorModule.runSubprocess as RunSubprocess;
    }
  } catch {
    // Fall through to the explicit diagnostic below.
  }

  throw new Error(
    `OMP runtime executor module unavailable. omp_flow_dispatch must run inside an OMP extension host with pi.pi["@oh-my-pi/pi-coding-agent/task/executor"].runSubprocess available. ${formatRuntimeDiagnostic(hostRuntime)}. If pi.pi is missing, update/link OMP runtime plugin support; if executorExport is missing, the OMP runtime does not expose the task executor export required by dispatch.`,
  );
}

function stripCommentOutsideQuotes(value: string): string {
  let quote: 'single' | 'double' | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'" && quote !== 'double') {
      quote = quote === 'single' ? undefined : 'single';
    } else if (char === '"' && quote !== 'single') {
      quote = quote === 'double' ? undefined : 'double';
    } else if (char === '#' && quote === undefined) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
}

function unquoteScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

function splitOutsideQuotes(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let quote: 'single' | 'double' | undefined;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'" && quote !== 'double') {
      quote = quote === 'single' ? undefined : 'single';
    } else if (char === '"' && quote !== 'single') {
      quote = quote === 'double' ? undefined : 'double';
    } else if (char === delimiter && quote === undefined) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function parseToolsField(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    const arrayTools = value
      .map((item) => unquoteScalar(stripCommentOutsideQuotes(item)))
      .filter((item) => item.length > 0);
    return arrayTools.length > 0 ? arrayTools : undefined;
  }

  const withoutComment = stripCommentOutsideQuotes(value.trim());
  const inlineArray = withoutComment.startsWith('[') && withoutComment.endsWith(']')
    ? withoutComment.slice(1, -1)
    : withoutComment;
  const tools = splitOutsideQuotes(inlineArray, ',')
    .map((item) => unquoteScalar(stripCommentOutsideQuotes(item)))
    .filter((item) => item.length > 0);
  return tools.length > 0 ? tools : undefined;
}

function stripFrontmatter(raw: string): { frontmatter: Record<string, string | string[]>; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0] !== '---') {
    return { frontmatter: {}, body: normalized };
  }

  const closingLine = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closingLine === -1) {
    return { frontmatter: {}, body: normalized };
  }

  const fmLines = lines.slice(1, closingLine);
  const body = lines.slice(closingLine + 1).join('\n');
  const frontmatter: Record<string, string | string[]> = {};
  const keyPattern = /^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/;

  for (let i = 0; i < fmLines.length; i += 1) {
    const match = fmLines[i].match(keyPattern);
    if (!match) continue;

    const key = match[1];
    const value = stripCommentOutsideQuotes(match[2].trim()).trim();

    if (value === '|' || value === '>') {
      const blockLines: string[] = [];
      for (let j = i + 1; j < fmLines.length; j += 1) {
        if (keyPattern.test(fmLines[j])) break;
        blockLines.push(fmLines[j].replace(/^  /, ''));
        i = j;
      }
      frontmatter[key] = value === '>' ? blockLines.map((line) => line.trim()).join(' ').trim() : blockLines.join('\n').trimEnd();
    } else if (value === '' && i + 1 < fmLines.length && /^\s+-\s/.test(fmLines[i + 1])) {
      const items: string[] = [];
      for (let j = i + 1; j < fmLines.length && /^\s+-\s/.test(fmLines[j]); j += 1) {
        items.push(unquoteScalar(stripCommentOutsideQuotes(fmLines[j].replace(/^\s+-\s*/, ''))));
        i = j;
      }
      frontmatter[key] = items;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = splitOutsideQuotes(value.slice(1, -1), ',')
        .map((item) => unquoteScalar(stripCommentOutsideQuotes(item)))
        .filter((item) => item.length > 0);
    } else {
      frontmatter[key] = unquoteScalar(value);
    }
  }

  return { frontmatter, body };
}

function loadAgentDefinition(workspaceDir: string, role: string): AgentDefinition {
  const agentPath = path.join(workspaceDir, '.omp', 'agents', `${role}.md`);
  if (!fs.existsSync(agentPath)) {
    throw new Error(`Agent definition not found for role ${role}: expected .omp/agents/${role}.md`);
  }

  const raw = fs.readFileSync(agentPath, 'utf-8');
  const { frontmatter, body } = stripFrontmatter(raw);
  const tools = parseToolsField(frontmatter.tools);
  if (!tools || tools.length === 0) {
    throw new Error(`Agent definition for role ${role} must declare non-empty tools frontmatter`);
  }

  return {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : role,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    systemPrompt: body,
    source: 'project',
    tools,
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

type QbdAuditBrief = {
  rowId: string;
  briefFile: string;
};

const QBD_AUDIT_BRIEFS: Record<string, QbdAuditBrief> = {
  QBD1: { rowId: 'QBD1', briefFile: 'QBD1.design-audit.md' },
  'QBD1.design-audit': { rowId: 'QBD1', briefFile: 'QBD1.design-audit.md' },
  'QBD-GLOBAL-AUDIT': { rowId: 'QBD1', briefFile: 'QBD-GLOBAL-AUDIT.md' },
  QBD2: { rowId: 'QBD2', briefFile: 'QBD2.detail-audit.md' },
  'QBD2.detail-audit': { rowId: 'QBD2', briefFile: 'QBD2.detail-audit.md' },
  'QBD-IMPL-AUDIT': { rowId: 'QBD2', briefFile: 'QBD-IMPL-AUDIT.md' },
};

function resolveQbdAuditBrief(taskDir: string, rowId: string): { gateId: string; briefPath: string; briefFile: string } {
  const auditBrief = QBD_AUDIT_BRIEFS[rowId];
  if (!auditBrief) {
    throw new Error(`Unrecognized QbD audit row for qbd-auditor: ${rowId}`);
  }

  const briefPath = path.join(taskDir, '.task', auditBrief.briefFile);
  if (!fs.existsSync(briefPath)) {
    throw new Error(`QbD audit brief missing for ${rowId}: expected .task/${auditBrief.briefFile}`);
  }

  return { gateId: auditBrief.rowId, briefPath, briefFile: auditBrief.briefFile };
}

function assertRequiredTaskFile(taskDir: string, relativePath: string): void {
  const absolutePath = path.join(taskDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required QbD context file missing: ${relativePath}`);
  }
}

function assertQbdContextFiles(taskDir: string, gateId: string): void {
  assertRequiredTaskFile(taskDir, 'prd.md');
  assertRequiredTaskFile(taskDir, 'design.md');
  assertRequiredTaskFile(taskDir, 'context/index.json');
  if (gateId === 'QBD2') {
    assertRequiredTaskFile(taskDir, 'tasks.csv');
  }
}

function isRowBoundRole(role: DispatchRole): role is RowBoundDispatchRole {
  return role === 'executor' || role === 'reviewer' || role === 'qbd-auditor';
}

function buildSupportPrompt(
  workspaceDir: string,
  taskId: string,
  role: SupportDispatchRole,
  prompt: string,
  localGuidance?: string,
): string {
  const agentDef = loadAgentDefinition(workspaceDir, role);
  const taskDir = path.join(workspaceDir, '.omp-flow', 'tasks', taskId);
  const layers: string[] = [];

  layers.push(`--- omp-flow: Role Definition (from .omp/agents/${role}.md) ---\n${agentDef.systemPrompt}`);

  const prdPath = path.join(taskDir, 'prd.md');
  const designPath = path.join(taskDir, 'design.md');
  const prd = fs.existsSync(prdPath) ? fs.readFileSync(prdPath, 'utf-8') : `prd.md missing for active task ${taskId}`;
  const design = fs.existsSync(designPath) ? fs.readFileSync(designPath, 'utf-8') : `design.md missing for active task ${taskId}`;
  layers.push(`--- omp-flow: Active Task Context (${taskId}) ---\n${prd}\n\n${design}`);

  layers.push(`--- omp-flow: Support Assignment (${role}) ---\n${prompt}`);
  if (localGuidance?.trim()) {
    layers.push(`--- omp-flow: Local Guidance (Orchestrator) ---\n${localGuidance.trim()}`);
  }

  return layers.join('\n\n');
}

// Canonical row-bound prompt assembler for omp_flow_dispatch. Keep row-bound executor,
// reviewer, and QbD-auditor launches on this fail-closed path so before_agent_start
// remains limited to support-agent/session metadata injection.
function assembleFiveLayerPrompt(
  workspaceDir: string,
  taskId: string,
  rowId: string,
  role: RowBoundDispatchRole,
  localGuidance?: string,
): string {
  const taskDir = path.join(workspaceDir, '.omp-flow', 'tasks', taskId);
  const layers: string[] = [];

  const agentDef = loadAgentDefinition(workspaceDir, role);
  layers.push(`─── omp-flow: Role Definition (from .omp/agents/${role}.md) ───\n${agentDef.systemPrompt}`);

  let qbdBrief: { gateId: string; briefPath: string; briefFile: string } | undefined;
  if (role === 'qbd-auditor') {
    qbdBrief = resolveQbdAuditBrief(taskDir, rowId);
    assertQbdContextFiles(taskDir, qbdBrief.gateId);
  }

  const prd = fs.readFileSync(path.join(taskDir, 'prd.md'), 'utf-8');
  const design = fs.readFileSync(path.join(taskDir, 'design.md'), 'utf-8');
  layers.push(`─── omp-flow: Global Context (prd.md + design.md) ───\n${prd}\n\n${design}`);

  const row = role === 'qbd-auditor' ? undefined : readCSVRow(taskId, rowId, workspaceDir);
  if (role !== 'qbd-auditor' && !row) {
    throw new Error(`CSV row not found: ${rowId}`);
  }

  const curatedBlocks: string[] = [];
  if (row?.context) {
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

  if (row?.reference) {
    const renderedReferences = new ReferenceDigester(workspaceDir).renderReferencesBlock(row.reference, taskId);
    if (renderedReferences) {
      curatedBlocks.push(renderedReferences);
    } else {
      const legacyReferencePaths = row.reference
        .split(',')
        .map((s) => s.trim())
        .filter((value) => value.length > 0 && !value.startsWith('ref:'));
      for (const refPath of legacyReferencePaths) {
        const body = fs.readFileSync(resolveWorkspacePath(workspaceDir, refPath), 'utf-8');
        curatedBlocks.push(`### Reference: ${refPath}\n\n${body}`);
      }
    }
  }

  if (curatedBlocks.length > 0) {
    layers.push(`─── omp-flow: Curated Context (ADR / Interface refs) ───\n${curatedBlocks.join('\n\n---\n\n')}`);
  }

  const brief = qbdBrief
    ? fs.readFileSync(qbdBrief.briefPath, 'utf-8')
    : fs.readFileSync(path.join(taskDir, '.task', `${rowId}.implement.md`), 'utf-8');
  if (!brief.trim()) {
    throw new Error(qbdBrief ? `QbD audit brief empty: .task/${qbdBrief.briefFile}` : `Task brief empty: .task/${rowId}.implement.md`);
  }
  const briefLabel = qbdBrief ? qbdBrief.briefFile : `${rowId}.implement.md`;
  layers.push(`─── omp-flow: Task Brief (${briefLabel}) ───\n${brief}`);

  if (localGuidance && localGuidance.trim()) {
    layers.push(`─── omp-flow: Local Guidance (Orchestrator) ───\n${localGuidance}`);
  }

  return layers.join('\n\n');
}

export function createDispatchTool(
  workspaceDir: string,
  getMainSessionId: () => string | undefined,
  hostExecutorModule?: HostExecutorModule,
  hostRuntime?: HostRuntimeDiagnostics,
) {
  return {
    name: 'omp_flow_dispatch',
    label: 'OMP-Flow Dispatch',
    defaultInactive: true,
    description: 'Dispatch an omp-flow sub-agent. Row-bound roles get canonical five-layer assembly; support roles get role plus active task context.',
    promptSnippet: 'Dispatch an omp-flow sub-agent. Use rowId for executor/reviewer/qbd-auditor; use prompt or objective for support roles.',
    promptGuidelines: [
      'Use omp_flow_dispatch to delegate all omp-flow subagent work. Do not use native task.',
      'For executor, reviewer, and qbd-auditor pass rowId and role; the tool assembles the full row prompt.',
      'For architect, explore, planner, oracle, and researcher pass role plus prompt or objective.',
    ],
    parameters: {
      type: 'object' as const,
      properties: {
        rowId: { type: 'string', description: 'CSV row ID or QbD audit row (QBD1/QBD2) for row-bound roles' },
        role: { type: 'string', enum: ['executor', 'reviewer', 'qbd-auditor', 'architect', 'explore', 'planner', 'oracle', 'researcher'], description: 'Agent role' },
        prompt: { type: 'string', description: 'Support-role assignment prompt' },
        objective: { type: 'string', description: 'Support-role objective, used when prompt is omitted' },
        taskId: { type: 'string', description: 'Optional task ID override for support roles' },
        localGuidance: { type: 'string', description: 'Optional local guidance (usually empty)' },
      },
      required: ['role'],
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
      const currentTaskDepth = ctx?.sessionManager?.taskDepth;

      if (!currentSessionId) {
        return textResponse('Error: Recursion Guard — session ID unavailable; refusing to dispatch because recursion safety cannot be proven.');
      }

      if (typeof currentTaskDepth === 'number' && currentTaskDepth > 0) {
        return textResponse(`Error: Recursion Guard — only the main session may call omp_flow_dispatch (currentSession=${currentSessionId}, taskDepth=${currentTaskDepth}). Report completion to orchestrator instead.`);
      }

      if (!mainSessionId && currentTaskDepth !== 0 && currentTaskDepth !== undefined) {
        return textResponse('Error: Recursion Guard — main session ID unavailable; refusing to dispatch because recursion safety cannot be proven.');
      }

      let taskId: string;
      try {
        taskId = input.taskId || readActiveTaskId(workspaceDir);
      } catch (error) {
        return textResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (isRowBoundRole(input.role) && !input.rowId) {
        return textResponse(`Error: rowId is required for row-bound role ${input.role}`);
      }

      if (isRowBoundRole(input.role) && input.role !== 'qbd-auditor') {
        const row = readCSVRow(taskId, input.rowId!, workspaceDir);
        if (!row) {
          return textResponse(`Error: Row not found: ${input.rowId}`);
        }
      }

      let prompt: string;
      try {
        if (isRowBoundRole(input.role)) {
          prompt = assembleFiveLayerPrompt(workspaceDir, taskId, input.rowId!, input.role, input.localGuidance);
        } else {
          const supportPrompt = input.prompt || input.objective;
          if (!supportPrompt?.trim()) {
            return textResponse(`Error: prompt or objective is required for support role ${input.role}`);
          }
          prompt = buildSupportPrompt(workspaceDir, taskId, input.role, supportPrompt, input.localGuidance);
        }
      } catch (error) {
        return textResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }

      const agent = loadAgentDefinition(workspaceDir, input.role);
      const tier = input.role === 'reviewer' || input.role === 'qbd-auditor' || input.role === 'architect' ? 'slow' : 'default';
      const modelOverride = tier === 'default' ? undefined : `pi/${tier}`;

      let runSubprocess: RunSubprocess;
      try {
        runSubprocess = resolveRunSubprocess(hostExecutorModule, hostRuntime);
      } catch (error) {
        return textResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }

      let result: RunSubprocessResult;
      try {
        result = await runSubprocess({
          cwd: workspaceDir,
          agent,
          task: prompt,
          context: '',
          role: input.role,
          index: 0,
          id: `${input.rowId ?? input.role}-${Date.now()}`,
          signal,
          onProgress: typeof onUpdate === 'function' ? (progress: unknown) => { onUpdate(progress); } : undefined,
          modelOverride,
          taskDepth: 1,
        });
      } catch (error) {
        return textResponse(`Error: Subagent dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (result.aborted) {
        return textResponse(`Subagent aborted: ${result.abortReason ?? 'unknown'}`);
      }
      return textResponse(result.output);
    },
  };
}

export { assembleFiveLayerPrompt, loadAgentDefinition, parseToolsField, stripFrontmatter };
