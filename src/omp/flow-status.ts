import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HOST_VERSION = '17.2.1';
const UPSTREAM_REVISION = '7a2ced50bea8b97dbab7d9bd579329c4ea704de0';
const STATUS_KEY = 'flow-status';
const MAX_AGE_MS = 30_000;
const NATIVE_ROLES = new Set([
  'executor',
  'reviewer',
  'researcher',
  'architect',
  'qbd-auditor',
  'planner',
  'explore',
  'oracle',
  'orchestrator',
]);

type RecordValue = Record<string, unknown>;

export interface OMPFlowStatusContext {
  cwd?: string;
  ui?: {
    setStatus?: (key: string, text: string | undefined) => void;
    notify?: (message: string, type?: 'info' | 'warning' | 'error') => void;
  };
  sessionManager?: { getSessionId?: () => string | null };
  setTimeout?: (callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => unknown;
  clearTimer?: (timer: unknown) => void;
}

export interface OMPFlowStatusAPI {
  pi?: { VERSION?: unknown };
  on?: (
    eventName: string,
    handler: (event: unknown, ctx: OMPFlowStatusContext) => unknown | Promise<unknown>,
  ) => void;
  registerCommand?: (
    name: string,
    options: {
      description?: string;
      handler: (args: string, ctx: OMPFlowStatusContext) => Promise<void>;
    },
  ) => void;
  getCommands?: () => Array<{ name?: string }>;
  logger?: { warn?: (message: string, detail?: unknown) => void };
}

export interface OMPFlowStatusCapability {
  supported: boolean;
  reason: 'supported' | 'unsupported-version' | 'missing-api' | 'command-conflict';
}

interface SubmittedMember {
  id: string | null;
  agent: string | null;
  label: string;
}

interface SelectedCall {
  toolCallId: string;
  token: string;
  submitted: SubmittedMember[];
  sequence: number;
  ambiguous: boolean;
}

interface NativeProgress {
  index: number;
  id: string;
  agent: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  task: string;
}

interface ProcessResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type OMPFlowStatusProcessRunner = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    input: string;
    encoding: 'utf8';
    maxBuffer: number;
  },
) => ProcessResult;

export interface OMPFlowStatusAdapterOptions {
  now?: () => number;
  runProcess?: OMPFlowStatusProcessRunner;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function callToken(sessionId: string, toolCallId: string): string {
  return createHash('sha256').update(sessionId).update('\0').update(toolCallId).digest('hex').slice(0, 24);
}

function displayLabel(value: string, maximum = 24): string {
  const chars = Array.from(value);
  return chars.length <= maximum ? value : `${chars.slice(0, maximum - 1).join('')}…`;
}

function submittedMembers(args: unknown): SubmittedMember[] | null {
  if (!isRecord(args)) return null;
  if (Array.isArray(args.tasks)) {
    if (args.tasks.length < 1 || args.tasks.length > 128) return null;
    const result: SubmittedMember[] = [];
    for (const value of args.tasks) {
      if (!isRecord(value)) return null;
      const label = safeString(value.task);
      if (!label) return null;
      result.push({
        id: safeString(value.id) ?? safeString(value.name),
        agent: safeString(value.agent),
        label,
      });
    }
    return result;
  }
  const label = safeString(args.task);
  if (!label) return null;
  return [{
    id: safeString(args.id) ?? safeString(args.name),
    agent: safeString(args.agent),
    label,
  }];
}

function fullProgress(value: unknown, submitted: SubmittedMember[]): NativeProgress[] | null {
  if (!Array.isArray(value) || value.length !== submitted.length) return null;
  const byIndex = new Map<number, NativeProgress>();
  const ids = new Set<string>();
  for (const raw of value) {
    if (!isRecord(raw) || !Number.isSafeInteger(raw.index)) return null;
    const index = raw.index as number;
    const id = safeString(raw.id);
    const agent = safeString(raw.agent);
    const task = safeString(raw.task);
    const status = raw.status;
    if (
      index < 0
      || index >= submitted.length
      || byIndex.has(index)
      || !id
      || ids.has(id)
      || !agent
      || !task
      || !['pending', 'running', 'completed', 'failed', 'aborted'].includes(String(status))
    ) {
      return null;
    }
    const expected = submitted[index];
    if (!expected || (expected.id !== null && expected.id !== id) || (expected.agent !== null && expected.agent !== agent)) {
      return null;
    }
    ids.add(id);
    byIndex.set(index, {
      index,
      id,
      agent,
      task,
      status: status as NativeProgress['status'],
    });
  }
  return Array.from({ length: submitted.length }, (_, index) => byIndex.get(index) ?? null)
    .filter((item): item is NativeProgress => item !== null);
}

function progressFromEvent(event: RecordValue, field: 'partialResult' | 'result'): unknown {
  const result = event[field];
  if (!isRecord(result) || !isRecord(result.details)) return null;
  return result.details.progress;
}

function nativeState(status: NativeProgress['status']): 'pending' | 'active' | 'completed' | 'failed' {
  if (status === 'running') return 'active';
  if (status === 'failed' || status === 'aborted') return 'failed';
  return status;
}

function snapshotFromResponse(value: unknown): RecordValue | null {
  return isRecord(value) && isRecord(value.snapshot) ? value.snapshot : null;
}

export function formatOMPFlowStatusCompact(value: unknown): string | undefined {
  const snapshot = snapshotFromResponse(value);
  if (snapshot?.version === 2 && isRecord(snapshot.rootFlow)) {
    const rootFlow = snapshot.rootFlow;
    if (rootFlow.state === 'available' && isRecord(rootFlow.publication)) {
      const publication = rootFlow.publication;
      const task = isRecord(publication.rootTask) ? publication.rootTask : null;
      const orientation = isRecord(publication.orientation) ? publication.orientation : null;
      const taskLabel = task
        ? safeString(task.title) ?? safeString(task.taskId) ?? 'task unavailable'
        : 'task unavailable';
      const position = orientation ? safeString(orientation.position) : null;
      const ordinal = position
        ? ['explore', 'design', 'qbd-1', 'decompose', 'qbd-2', 'execute', 'integrate', 'wiki', 'finish']
          .indexOf(position) + 1
        : 0;
      const parts = [displayLabel(taskLabel)];
      if (position && ordinal > 0) parts.push(`flow ${ordinal}/9 ${position}`);
      if (orientation && isRecord(orientation.measure)) {
        const measure = orientation.measure;
        if (typeof measure.current === 'number' && typeof measure.total === 'number') {
          parts.push(`${safeString(measure.label) ?? 'progress'} ${measure.current}/${measure.total}`);
        }
      }
      return parts.join(' │ ');
    }
    if (isRecord(snapshot.nativeActivity) && isRecord(snapshot.nativeActivity.taskSet)) {
      const taskSet = snapshot.nativeActivity.taskSet;
      if (taskSet.state === 'available') {
        const completed = typeof taskSet.completed === 'number' ? taskSet.completed : 0;
        const total = typeof taskSet.total === 'number' && taskSet.total > 0 ? taskSet.total : 1;
        const filled = Math.max(0, Math.min(5, Math.floor((completed * 5) / total)));
        return `native tasks ${'█'.repeat(filled)}${'░'.repeat(5 - filled)} ${completed}/${total}`;
      }
    }
    return undefined;
  }
  if (!snapshot || !isRecord(snapshot.taskSet)) {
    const reason = isRecord(value) && isRecord(value.error) ? safeString(value.error.code) : null;
    return reason === 'unsupported' ? undefined : `tasks ${reason ?? 'unavailable'}`;
  }
  const taskSet = snapshot.taskSet;
  if (taskSet.state !== 'available') {
    const reason = safeString(taskSet.reason) ?? 'unavailable';
    return reason === 'unsupported' ? undefined : `tasks ${reason}`;
  }
  const completed = typeof taskSet.completed === 'number' ? taskSet.completed : 0;
  const total = typeof taskSet.total === 'number' && taskSet.total > 0 ? taskSet.total : 1;
  const filled = Math.max(0, Math.min(5, Math.floor((completed * 5) / total)));
  const parts = [`tasks ${'█'.repeat(filled)}${'░'.repeat(5 - filled)} ${completed}/${total}`];
  const failed = typeof taskSet.failed === 'number' ? taskSet.failed : 0;
  if (failed > 0) parts.push(`✕${failed}`);
  if (isRecord(snapshot.currentTask)) {
    const label = safeString(snapshot.currentTask.label);
    if (label) parts.push(displayLabel(label));
    if (isRecord(snapshot.currentTask.assignment)) {
      const role = safeString(snapshot.currentTask.assignment.role);
      const position = safeString(snapshot.currentTask.assignment.methodologyPosition);
      if (role) parts.push(position ? `${role}·${position.toLowerCase()}` : role);
    }
  }
  if (Array.isArray(snapshot.attention) && snapshot.attention.length > 0) {
    parts.push(`⚠${snapshot.attention.length}`);
  }
  return parts.join(' │ ');
}

function defaultRunProcess(
  command: string,
  args: string[],
  options: Parameters<OMPFlowStatusProcessRunner>[2],
): ProcessResult {
  const result = spawnSync(command, args, options);
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}

export class OMPFlowStatusAdapter {
  private readonly workspaceDir: string;
  private readonly now: () => number;
  private readonly runProcess: OMPFlowStatusProcessRunner;
  private sessionId: string | null = null;
  private selected: SelectedCall | null = null;
  private readonly activeCalls = new Set<string>();
  private ui: OMPFlowStatusContext['ui'];
  private timer: unknown;
  private timerContext: OMPFlowStatusContext | null = null;

  constructor(workspaceDir: string, options: OMPFlowStatusAdapterOptions = {}) {
    this.workspaceDir = path.resolve(workspaceDir);
    this.now = options.now ?? Date.now;
    this.runProcess = options.runProcess ?? defaultRunProcess;
  }

  private pythonCommand(): string {
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  private run(args: string[], input = ''): ProcessResult {
    const script = path.join(this.workspaceDir, '.omp-flow', 'scripts', 'omp_flow.py');
    if (!fs.existsSync(script)) {
      return { status: 2, stdout: '', stderr: 'Flow Status runtime is unavailable.' };
    }
    return this.runProcess(
      this.pythonCommand(),
      ['-X', 'utf8', script, '--cwd', this.workspaceDir, ...args],
      {
        cwd: this.workspaceDir,
        env: { ...process.env, ...(this.sessionId ? { OMP_FLOW_CONTEXT_ID: this.sessionId } : {}) },
        input,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      },
    );
  }

  private parseOutput(result: ProcessResult): unknown {
    try {
      return JSON.parse(result.stdout);
    } catch {
      return {
        version: 1,
        state: 'unavailable',
        snapshot: null,
        error: { code: result.status === 0 ? 'malformed' : 'disconnected' },
      };
    }
  }

  private clearTimer(ctx?: OMPFlowStatusContext): void {
    const owner = ctx ?? this.timerContext ?? undefined;
    if (this.timer !== undefined && owner?.clearTimer) owner.clearTimer(this.timer);
    this.timer = undefined;
    this.timerContext = null;
  }

  private present(value: unknown, ctx: OMPFlowStatusContext, schedule = true): void {
    this.ui = ctx.ui;
    try {
      this.ui?.setStatus?.(STATUS_KEY, formatOMPFlowStatusCompact(value));
    } catch {
      // A status contribution must never disturb task dispatch or result delivery.
    }
    this.clearTimer(ctx);
    if (schedule && ctx.setTimeout && ctx.clearTimer && this.sessionId) {
      this.timerContext = ctx;
      this.timer = ctx.setTimeout(() => this.refresh(ctx), MAX_AGE_MS + 5);
    }
  }

  private observe(document: RecordValue, ctx: OMPFlowStatusContext): void {
    if (!this.sessionId) return;
    const result = this.run(
      ['status', 'observe', '--host', 'oh-my-pi', '--session', this.sessionId],
      JSON.stringify(document),
    );
    this.present(this.parseOutput(result), ctx);
  }

  private baseUnavailable(reason: 'incomplete' | 'malformed' | 'disconnected'): RecordValue {
    const sourceToken = this.selected?.token ?? callToken(this.sessionId ?? 'unbound', 'unbound');
    return {
      version: 1,
      taskSet: {
        state: 'unavailable',
        capability: 'ompTaskBatchV1',
        sourceId: `native-task-${sourceToken}`,
        repositoryRoot: this.workspaceDir,
        hostSessionId: this.sessionId,
        reason,
        observedAtUnixMs: this.now(),
        maxAgeMs: MAX_AGE_MS,
      },
      assignment: null,
      progress: null,
      attention: [],
    };
  }

  private emitUnavailable(
    reason: 'incomplete' | 'malformed' | 'disconnected',
    ctx: OMPFlowStatusContext,
  ): void {
    this.observe(this.baseUnavailable(reason), ctx);
  }

  private emitProgress(progress: NativeProgress[], ctx: OMPFlowStatusContext): void {
    const selected = this.selected;
    if (!selected || !this.sessionId) return;
    selected.sequence += 1;
    const observedAt = this.now();
    const revision = `native-task-${selected.token}-r${selected.sequence}`;
    const currentItems = progress.filter(item => item.status === 'running');
    const current = currentItems.length === 1 ? currentItems[0] : null;
    const taskSetId = `native-task-set-${selected.token}`;
    const taskSourceId = `native-task-${selected.token}`;
    const assignmentSourceId = `native-assignment-${selected.token}`;
    const assignment = current && NATIVE_ROLES.has(current.agent)
      ? {
          sourceId: assignmentSourceId,
          capability: 'nativeAssignmentV1',
          repositoryRoot: this.workspaceDir,
          hostSessionId: this.sessionId,
          taskSetId,
          membershipRevision: revision,
          taskId: current.id,
          assignmentId: `native-assignment-${selected.token}-${current.index}`,
          nativeRole: current.agent,
          actorId: current.id,
          operationReceipt: null,
          nativeTargetId: current.id,
          bindingRevision: revision,
          observedAtUnixMs: observedAt,
          maxAgeMs: MAX_AGE_MS,
        }
      : null;
    const attention = progress
      .filter(item => item.status === 'failed' || item.status === 'aborted')
      .map(item => ({
        id: `native-failure-${selected.token}-${item.index}`,
        sourceId: taskSourceId,
        sourceRevision: revision,
        severity: 'warning',
        kind: 'failure',
        reason: `${item.task}: ${item.status}`,
        count: 1,
        observedAtUnixMs: observedAt,
        maxAgeMs: MAX_AGE_MS,
      }));
    this.observe({
      version: 1,
      taskSet: {
        state: 'available',
        evidence: {
          capability: 'ompTaskBatchV1',
          piVersion: HOST_VERSION,
          upstreamRevision: UPSTREAM_REVISION,
          toolCallId: selected.toolCallId,
          adapterSequence: selected.sequence,
        },
        sourceId: taskSourceId,
        repositoryRoot: this.workspaceDir,
        hostSessionId: this.sessionId,
        taskSetId,
        membershipRevision: revision,
        completeness: 'complete',
        observedAtUnixMs: observedAt,
        maxAgeMs: MAX_AGE_MS,
        members: progress.map(item => ({
          taskId: item.id,
          label: item.task,
          state: nativeState(item.status),
        })),
        currentTaskId: current?.id ?? null,
      },
      assignment,
      progress: null,
      attention,
    }, ctx);
  }

  public onSessionStart(ctx: OMPFlowStatusContext): void {
    const nextSession = ctx.sessionManager?.getSessionId?.() ?? null;
    if (this.sessionId !== nextSession) this.reset(ctx);
    this.sessionId = nextSession;
    this.ui = ctx.ui;
    try {
      this.ui?.setStatus?.(STATUS_KEY, undefined);
    } catch {
      // Keep the native session path operational when the UI is absent.
    }
  }

  public onToolExecutionStart(event: unknown, ctx: OMPFlowStatusContext): void {
    if (!this.sessionId || !isRecord(event) || String(event.toolName).toLowerCase() !== 'task') return;
    const toolCallId = safeString(event.toolCallId);
    if (!toolCallId) return;
    const submitted = submittedMembers(event.args);
    this.activeCalls.add(toolCallId);
    if (!this.selected) {
      if (!submitted) {
        this.emitUnavailable('malformed', ctx);
        return;
      }
      this.selected = {
        toolCallId,
        token: callToken(this.sessionId, toolCallId),
        submitted,
        sequence: 0,
        ambiguous: this.activeCalls.size > 1,
      };
      this.emitUnavailable('incomplete', ctx);
      return;
    }
    if (this.selected.toolCallId !== toolCallId) {
      this.selected.ambiguous = true;
      this.emitUnavailable('incomplete', ctx);
    }
  }

  public onToolExecutionUpdate(event: unknown, ctx: OMPFlowStatusContext): void {
    if (!this.selected || !isRecord(event) || event.toolCallId !== this.selected.toolCallId) return;
    if (this.selected.ambiguous) {
      this.emitUnavailable('incomplete', ctx);
      return;
    }
    const progress = fullProgress(progressFromEvent(event, 'partialResult'), this.selected.submitted);
    if (!progress) {
      this.emitUnavailable('incomplete', ctx);
      return;
    }
    this.emitProgress(progress, ctx);
  }

  public onToolExecutionEnd(event: unknown, ctx: OMPFlowStatusContext): void {
    if (!isRecord(event)) return;
    const toolCallId = safeString(event.toolCallId);
    if (!toolCallId) return;
    this.activeCalls.delete(toolCallId);
    if (!this.selected || toolCallId !== this.selected.toolCallId) return;
    if (this.selected.ambiguous) {
      this.emitUnavailable('incomplete', ctx);
    } else {
      const progress = fullProgress(progressFromEvent(event, 'result'), this.selected.submitted);
      if (progress) this.emitProgress(progress, ctx);
      else this.emitUnavailable('incomplete', ctx);
    }
    this.selected = null;
  }

  public refresh(ctx: OMPFlowStatusContext): void {
    if (!this.sessionId) return;
    const result = this.run([
      'status', 'inspect', '--host', 'oh-my-pi', '--session', this.sessionId, '--json',
    ]);
    this.present(this.parseOutput(result), ctx, false);
  }

  public detail(): ProcessResult {
    if (!this.sessionId) {
      return { status: 2, stdout: 'Flow Status is unavailable: no active session', stderr: '' };
    }
    return this.run(['status', 'inspect', '--host', 'oh-my-pi', '--session', this.sessionId]);
  }

  public reset(ctx?: OMPFlowStatusContext): void {
    this.clearTimer(ctx);
    try {
      (ctx?.ui ?? this.ui)?.setStatus?.(STATUS_KEY, undefined);
    } catch {
      // Clear only our key when the native UI is still available.
    }
    this.selected = null;
    this.activeCalls.clear();
    this.sessionId = null;
  }
}

export function probeOMPFlowStatusCapability(api: OMPFlowStatusAPI): OMPFlowStatusCapability {
  if (api.pi?.VERSION !== HOST_VERSION) {
    return { supported: false, reason: 'unsupported-version' };
  }
  if (
    typeof api.on !== 'function'
    || typeof api.registerCommand !== 'function'
    || typeof api.getCommands !== 'function'
  ) {
    return { supported: false, reason: 'missing-api' };
  }
  let commands: Array<{ name?: string }>;
  try {
    commands = api.getCommands();
  } catch {
    return { supported: false, reason: 'missing-api' };
  }
  if (commands.some(command => command.name === STATUS_KEY)) {
    return { supported: false, reason: 'command-conflict' };
  }
  return { supported: true, reason: 'supported' };
}

export function registerOMPFlowStatus(
  api: OMPFlowStatusAPI,
  workspaceDir: string,
  options: OMPFlowStatusAdapterOptions = {},
): OMPFlowStatusCapability {
  const capability = probeOMPFlowStatusCapability(api);
  if (!capability.supported) {
    if (capability.reason === 'command-conflict') {
      api.logger?.warn?.('Flow Status command registration conflict; the existing command was preserved.');
    }
    return capability;
  }
  const adapter = new OMPFlowStatusAdapter(workspaceDir, options);
  api.registerCommand?.(STATUS_KEY, {
    description: 'Show read-only task and progress status',
    handler: async (_args, ctx) => {
      const result = adapter.detail();
      const text = result.stdout.trim() || result.stderr.trim() || 'Flow Status is unavailable.';
      ctx.ui?.notify?.(text, result.status === 0 ? 'info' : 'warning');
    },
  });
  api.on?.('session_start', (_event, ctx) => adapter.onSessionStart(ctx));
  api.on?.('tool_execution_start', (event, ctx) => adapter.onToolExecutionStart(event, ctx));
  api.on?.('tool_execution_update', (event, ctx) => adapter.onToolExecutionUpdate(event, ctx));
  api.on?.('tool_execution_end', (event, ctx) => adapter.onToolExecutionEnd(event, ctx));
  api.on?.('session_before_switch', (_event, ctx) => adapter.reset(ctx));
  api.on?.('session_switch', (_event, ctx) => adapter.onSessionStart(ctx));
  api.on?.('session_shutdown', (_event, ctx) => adapter.reset(ctx));
  return capability;
}
