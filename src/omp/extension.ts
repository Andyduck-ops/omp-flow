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

const CONTEXT_MARKER = '<!-- omp-flow-runtime-state -->';
const PYTHON_OWNED_PATHS = [
  /^\.omp-flow\/config\.json$/,
  /^\.omp-flow\/\.runtime(?:\/|$)/,
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
    qbd: 'qbd-auditor',
    'qbd-auditor': 'qbd-auditor',
    planner: 'planner',
    plan: 'planner',
    explore: 'explore',
    oracle: 'oracle',
    orchestrator: 'orchestrator',
  };
  return aliases[normalized] ?? null;
}

function extractRole(input: Record<string, unknown>): string | null {
  for (const key of ['agent', 'role']) {
    const role = normalizeRole(input[key]);
    if (role) return role;
  }
  return null;
}

function extractAssignment(input: Record<string, unknown>): string {
  const value = input.assignment;
  return typeof value === 'string' ? value : '';
}

function replaceAssignment(input: Record<string, unknown>, assignment: string): void {
  input.assignment = assignment;
}

interface DispatchDescriptor {
  version: 1;
  bundle: string;
  entry: string;
  output: string;
  role: string;
  actorId: string;
  objective: string;
  receipt: string;
  predecessor: string | null;
  predecessorOutput: string | null;
}

interface OperationRecord {
  id: string;
  task_id: string;
  entry_path: string;
  output_path: string;
  role: string;
  actor_id: string;
  state: string;
  predecessor: string | null;
}

const DISPATCH_KEYS = [
  'actorId',
  'bundle',
  'entry',
  'objective',
  'output',
  'predecessor',
  'predecessorOutput',
  'receipt',
  'role',
  'version',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Dispatch descriptor requires a non-empty ' + field + '.');
  }
  return value.trim();
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return nonEmptyString(value, field);
}

function firstNonBlankLine(value: string): string {
  for (const rawLine of value.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.trim()) return line.trim();
  }
  throw new Error('Native omp-flow assignment is empty.');
}

function parseDispatchDescriptor(assignment: string): DispatchDescriptor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(firstNonBlankLine(assignment));
  } catch (error) {
    throw new Error(
      'Native omp-flow assignment must start with a valid v1 dispatch descriptor: ' +
      (error instanceof Error ? error.message : String(error)),
    );
  }
  if (!isRecord(parsed) || Object.keys(parsed).length !== 1 || !isRecord(parsed.ompFlowDispatch)) {
    throw new Error('Dispatch descriptor root must contain only ompFlowDispatch.');
  }
  const value = parsed.ompFlowDispatch;
  const keys = Object.keys(value).sort();
  if (
    keys.length !== DISPATCH_KEYS.length ||
    keys.some((key, index) => key !== DISPATCH_KEYS[index])
  ) {
    throw new Error('Dispatch descriptor fields do not match the v1 contract.');
  }
  if (value.version !== 1) {
    throw new Error('Unsupported omp-flow dispatch descriptor version.');
  }
  return {
    version: 1,
    bundle: nonEmptyString(value.bundle, 'bundle'),
    entry: nonEmptyString(value.entry, 'entry'),
    output: nonEmptyString(value.output, 'output'),
    role: nonEmptyString(value.role, 'role'),
    actorId: nonEmptyString(value.actorId, 'actorId'),
    objective: nonEmptyString(value.objective, 'objective'),
    receipt: nonEmptyString(value.receipt, 'receipt'),
    predecessor: nullableString(value.predecessor, 'predecessor'),
    predecessorOutput: nullableString(value.predecessorOutput, 'predecessorOutput'),
  };
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

  private readOperation(
    ctx: OMPHookContext,
    receipt: string,
  ): OperationRecord {
    const raw = this.python(['operation', 'show', receipt], '', ctx);
    const value = JSON.parse(raw) as Partial<OperationRecord>;
    if (
      typeof value.id !== 'string' ||
      typeof value.task_id !== 'string' ||
      typeof value.entry_path !== 'string' ||
      typeof value.output_path !== 'string' ||
      typeof value.role !== 'string' ||
      typeof value.actor_id !== 'string' ||
      typeof value.state !== 'string' ||
      (value.predecessor !== null && typeof value.predecessor !== 'string')
    ) {
      throw new Error('Python returned an invalid operation record.');
    }
    return value as OperationRecord;
  }

  private validateDispatch(
    ctx: OMPHookContext,
    input: Record<string, unknown>,
    role: string,
    taskId: string,
  ): string {
    const assignment = extractAssignment(input);
    const descriptor = parseDispatchDescriptor(assignment);
    const nativeActorId = nonEmptyString(input.id, 'native task id');
    const expectedBundle = `.omp-flow/tasks/${taskId}`;
    if (
      normalizeWorkspacePath(this.workspaceDir, descriptor.bundle) !==
      normalizeWorkspacePath(this.workspaceDir, expectedBundle)
    ) {
      throw new Error('Dispatch Bundle does not match the session-active task.');
    }
    if (descriptor.actorId !== nativeActorId) {
      throw new Error('Dispatch actorId does not match the native task id.');
    }
    if (normalizeRole(descriptor.role) !== role) {
      throw new Error('Dispatch role does not match the native task role.');
    }

    const operation = this.readOperation(ctx, descriptor.receipt);
    const expectedEntry = `${expectedBundle}/${operation.entry_path}`;
    if (
      operation.id !== descriptor.receipt ||
      operation.task_id !== taskId ||
      operation.state !== 'active' ||
      operation.role !== role ||
      operation.actor_id !== descriptor.actorId ||
      operation.output_path !== descriptor.output ||
      operation.predecessor !== descriptor.predecessor ||
      descriptor.entry !== expectedEntry
    ) {
      throw new Error('Dispatch descriptor does not match its active runtime operation.');
    }

    if (descriptor.predecessor) {
      const predecessor = this.readOperation(ctx, descriptor.predecessor);
      if (
        predecessor.task_id !== taskId ||
        predecessor.state !== 'completed' ||
        predecessor.output_path !== descriptor.predecessorOutput
      ) {
        throw new Error('Dispatch predecessor output does not match a completed operation.');
      }
    } else if (descriptor.predecessorOutput !== null) {
      throw new Error('Dispatch predecessorOutput requires a predecessor receipt.');
    }
    return assignment;
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
    const state = this.python(['status'], '', ctx);
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
            const dispatchInput = { ...taskInput, ...next };
            const role = extractRole(dispatchInput) ?? topRole;
            if (!role) return next;
            replaceAssignment(next, this.validateDispatch(ctx, dispatchInput, role, taskId));
            return next;
          });
        } else if (topRole) {
          const taskId = this.currentTask(ctx);
          replaceAssignment(taskInput, this.validateDispatch(ctx, taskInput, topRole, taskId));
        }
      } catch (error) {
        return {
          ...ctx,
          block: true,
          reason: 'Blocked: omp-flow dispatch preparation failed: ' + (error instanceof Error ? error.message : String(error)),
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
