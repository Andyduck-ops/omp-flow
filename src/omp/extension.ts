import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface OMPHookContext {
  prompt?: string;
  systemPrompt?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  toolArgs?: Record<string, unknown>;
  subagentRole?: string;
  subagentId?: string;
  messages?: unknown[];
  block?: boolean;
  reason?: string;
  sessionManager?: { getSessionId?: () => string | null; taskDepth?: number };
}

const CONTEXT_MARKER = '<!-- omp-flow-workflow-state -->';
const PYTHON_OWNED_PATHS = [
  /^\.omp-flow\/config\.json$/,
  /^\.omp-flow\/tasks\/[^/]+\/task\.json$/,
  /^\.omp-flow\/tasks\/[^/]+\/tasks\.csv$/,
  /^\.omp-flow\/tasks\/[^/]+\/evidence\.csv$/,
  /^\.omp-flow\/tasks\/[^/]+\/\.task\/[^/]+\.verdict\.json$/,
  /^\.omp-flow\/tasks\/[^/]+\/qbd\/qbd-[12]\/(?:[^/]+\/)*audit-[^/]*\.md$/,
  /^\.omp-flow\/tasks\/[^/]+\/qbd\/qbd-[12]\/human-decision-\d{3}\.md$/,
  /^\.omp-flow\/\.runtime\/sessions\/[^/]+\.json$/,
];

function resolvePythonCommand(): string {
  return process.platform === 'win32' ? 'python' : 'python3';
}

function normalizeRole(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/^omp-flow[-_]/, '').replace(/^omp[-_]/, '');
  const aliases: Record<string, string> = {
    task: 'executor',
    implement: 'executor',
    executor: 'executor',
    check: 'reviewer',
    review: 'reviewer',
    reviewer: 'reviewer',
    research: 'researcher',
    researcher: 'researcher',
    architect: 'architect',
    architecture: 'architect',
    planner: 'planner',
    plan: 'planner',
    explore: 'explore',
    oracle: 'oracle',
  };
  return aliases[normalized] ?? null;
}

function extractRole(input: Record<string, unknown>): string | null {
  for (const key of ['agent', 'subagent_type', 'subagentType', 'agent_type', 'agentType', 'role', 'name']) {
    const role = normalizeRole(input[key]);
    if (role) return role;
  }
  return null;
}

function extractAssignment(input: Record<string, unknown>): string {
  const value = input.assignment ?? input.prompt ?? input.message ?? input.task ?? input.objective;
  return typeof value === 'string' ? value : '';
}

function replaceAssignment(input: Record<string, unknown>, assignment: string): void {
  if ('assignment' in input || !('prompt' in input)) input.assignment = assignment;
  else input.prompt = assignment;
}

function extractRow(input: Record<string, unknown>, assignment: string): string | undefined {
  for (const key of ['rowId', 'row_id', 'row', 'id']) {
    const value = input[key];
    if (typeof value === 'string' && /^(?:[A-Z]-(?:[A-Z]\d{3})+--\d{3}|[A-Z]-\d{3})$/.test(value.trim())) {
      return value.trim();
    }
  }
  return assignment.match(/\b(?:[A-Z]-(?:[A-Z]\d{3})+--\d{3}|[A-Z]-\d{3})\b/)?.[0];
}

function normalizeWorkspacePath(workspaceDir: string, value: string): string {
  if (!value || value.includes('\0') || /^[a-z]+:\/\//i.test(value)) {
    throw new Error('Invalid workspace path: ' + value);
  }
  const absolute = path.resolve(workspaceDir, value);
  const relative = path.relative(workspaceDir, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes workspace: ' + value);
  }
  return relative.replace(/\\/g, '/').toLowerCase();
}

export class OMPFlowExtension {
  private readonly workspaceDir: string;
  private injectContext = false;

  constructor(workspaceDir: string = process.cwd()) {
    this.workspaceDir = workspaceDir;
  }

  public setSendMessage(_fn: (msg: string, opts?: Record<string, unknown>) => void): void {
    // Native task/job delivery owns follow-up messages.
  }

  private python(args: string[], input: string, ctx: OMPHookContext): string {
    const script = path.join(this.workspaceDir, '.omp-flow', 'scripts', 'omp_flow.py');
    if (!fs.existsSync(script)) {
      throw new Error('Missing omp-flow Python core: ' + script + '. Run omp-flow init/update.');
    }
    const sessionId = ctx.sessionManager?.getSessionId?.() ?? undefined;
    const env = { ...process.env, ...(sessionId ? { OMP_FLOW_CONTEXT_ID: sessionId } : {}) };
    return execFileSync(resolvePythonCommand(), ['-X', 'utf8', script, '--cwd', this.workspaceDir, ...args], {
      cwd: this.workspaceDir,
      input,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      env,
    }).trim();
  }

  private currentTask(ctx: OMPHookContext): string {
    const raw = this.python(['task', 'current'], '', ctx);
    const value = JSON.parse(raw) as { taskId?: unknown; stale?: unknown };
    if (typeof value.taskId !== 'string' || value.taskId.length === 0 || value.stale === true) {
      throw new Error('No valid active omp-flow task for this session.');
    }
    return value.taskId;
  }

  private assembleContext(ctx: OMPHookContext, role: string, taskId: string, assignment: string, rowId?: string): string {
    const args = ['context', '--role', role, '--task', taskId];
    if (rowId) args.push('--row', rowId);
    const result = this.python(args, assignment, ctx);
    if (!result) throw new Error('Python returned empty context for role ' + role);
    return result;
  }

  public onSessionStart(ctx: OMPHookContext): OMPHookContext {
    this.injectContext = true;
    return ctx;
  }

  public onSessionCompact(ctx: OMPHookContext): OMPHookContext {
    this.injectContext = true;
    return ctx;
  }

  public onContext(ctx: OMPHookContext): OMPHookContext {
    if (!this.injectContext) return ctx;
    this.injectContext = false;
    const existing = JSON.stringify(ctx.messages ?? []);
    if (existing.includes(CONTEXT_MARKER) || ctx.prompt?.includes(CONTEXT_MARKER)) return ctx;
    const state = this.python(['workflow', 'state'], '', ctx);
    return {
      ...ctx,
      messages: [...(ctx.messages ?? []), { role: 'user', content: CONTEXT_MARKER + '\n' + state }],
    };
  }

  public onToolCall(ctx: OMPHookContext): OMPHookContext {
    const input = ctx.input ?? ctx.toolArgs ?? {};
    if (ctx.toolName?.toLowerCase() === 'bash' && ctx.sessionManager?.taskDepth === 0) {
      const sessionId = ctx.sessionManager.getSessionId?.();
      if (sessionId) {
        const bashInput = input as Record<string, unknown>;
        const currentEnv = bashInput.env;
        if (currentEnv !== undefined && (typeof currentEnv !== 'object' || currentEnv === null || Array.isArray(currentEnv))) {
          return { ...ctx, block: true, reason: 'Blocked: bash env must be an object for omp-flow session tunneling.' };
        }
        const env = { ...(currentEnv as Record<string, unknown> | undefined) };
        if (typeof env.OMP_FLOW_CONTEXT_ID !== 'string' || env.OMP_FLOW_CONTEXT_ID.length === 0) {
          env.OMP_FLOW_CONTEXT_ID = sessionId;
        }
        bashInput.env = env;
        if (ctx.input) ctx.input = bashInput;
        if (ctx.toolArgs) ctx.toolArgs = bashInput;
      }
    }
    if (ctx.toolName?.toLowerCase() === 'task') {
      const taskInput = input as Record<string, unknown>;
      const topRole = extractRole(taskInput);
      const batch = Array.isArray(taskInput.tasks) ? taskInput.tasks : null;
      try {
        if (batch) {
          const recognized = batch.some(item =>
            !!item && typeof item === 'object' && !!(extractRole({ ...taskInput, ...(item as Record<string, unknown>) }) ?? topRole)
          );
          if (!recognized) return ctx;
          const taskId = this.currentTask(ctx);
          taskInput.tasks = batch.map(item => {
            if (!item || typeof item !== 'object') return item;
            const next = { ...(item as Record<string, unknown>) };
            const role = extractRole({ ...taskInput, ...next }) ?? topRole;
            if (!role) return next;
            const assignment = extractAssignment(next);
            const row = extractRow(next, assignment);
            replaceAssignment(next, this.assembleContext(ctx, role, taskId, assignment, row));
            return next;
          });
        } else if (topRole) {
          const taskId = this.currentTask(ctx);
          const assignment = extractAssignment(taskInput);
          const row = extractRow(taskInput, assignment);
          replaceAssignment(taskInput, this.assembleContext(ctx, topRole, taskId, assignment, row));
        }
      } catch (error) {
        return {
          ...ctx,
          block: true,
          reason: 'Blocked: omp-flow Python context assembly failed: ' + (error instanceof Error ? error.message : String(error)),
        };
      }
      if (ctx.input) ctx.input = taskInput;
      if (ctx.toolArgs) ctx.toolArgs = taskInput;
    }

    if (ctx.toolName === 'write' || ctx.toolName === 'edit') {
      const rawPath = typeof input.path === 'string' ? input.path : typeof input.filePath === 'string' ? input.filePath : '';
      if (rawPath) {
        try {
          const normalized = normalizeWorkspacePath(this.workspaceDir, rawPath);
          if (PYTHON_OWNED_PATHS.some(pattern => pattern.test(normalized))) {
            return {
              ...ctx,
              block: true,
              reason: 'Blocked: use .omp-flow/scripts/omp_flow.py for Python-owned file ' + rawPath,
            };
          }
        } catch (error) {
          return { ...ctx, block: true, reason: error instanceof Error ? error.message : String(error) };
        }
      }
    }
    return ctx;
  }

  public onAgentEnd(ctx: OMPHookContext): OMPHookContext {
    return ctx;
  }
}

export default function activateExtension(pi: { on: (event: string, handler: (ctx: OMPHookContext) => OMPHookContext) => void }) {
  const extension = new OMPFlowExtension();
  pi.on('session_start', ctx => extension.onSessionStart(ctx));
  pi.on('tool_call', ctx => extension.onToolCall(ctx));
  pi.on('context', ctx => extension.onContext(ctx));
  pi.on('session_compact', ctx => extension.onSessionCompact(ctx));
  pi.on('agent_end', ctx => extension.onAgentEnd(ctx));
}
