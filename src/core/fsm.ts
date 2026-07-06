import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { FindingSeverity, FindingDimension } from './finding.js';
import type { BoundaryContract } from './context-package.js';

export type CoreFSMState = 'S_PLANNING' | 'S_DISPATCH' | 'S_GRILL' | 'S_HARVEST';

export type FSMState =
  | CoreFSMState
  | 'S_PARSE_ROUTE'
  | 'S_RESOLVE_PHASE'
  | 'S_INFER'
  | 'S_QUALITY_MODE'
  | 'S_PLANNING_MODE'
  | 'S_DECOMPOSE'
  | 'S_BUILD_CHAIN'
  | 'S_CREATE_SESSION'
  | 'S_CONFIRM'
  | 'S_DECISION_EVAL'
  | 'S_AUTOFIX'
  | 'S_WAVE_DISPATCH';

export type StepStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
export type CompletionStatus = 'DONE' | 'DONE_WITH_CONCERNS' | 'NEEDS_RETRY' | 'BLOCKED';

export interface RalphStep {
  index: number;
  skill: string;
  args: string;
  stage: string;
  decision: string | null;
  status: StepStatus;
  completion_status: CompletionStatus | null;
  completion_summary?: string | null;
  completion_caveats?: string[];
  completion_decisions?: string[];
  completion_deferred?: string[];
  completed_at?: string | null;
  fullScope?: boolean;
  retry_count?: number;
  source_artifact_ref?: string | null;
  goal_ref?: string | null;
  milestone_id?: string | null;
  completion_evidence?: string[];
}

export interface DecisionLogEntry {
  stepIndex: number;
  gateType: 'quality-gate' | 'goal-gate' | 'scope-gate' | 'reground-gate' | 'structural' | string;
  verdict: string;
  timestamp: string;
  confidence_score?: number;
  parse_failed?: boolean;
  summary?: string;
}

export type BouncePhase = 'S_AUTOFIX' | 'S_DECISION_EVAL';

export interface RetryBounceTracker {
  stepIndex: number;
  lastPhase: BouncePhase;
  bounceCount: number;
  updatedAt: string;
}

export interface TaskDecompositionGoal {
  id: string;
  goal: string;
  done_when: string;
  boundary?: string;
  status: 'pending' | 'active' | 'completed' | 'superseded';
}

export interface SessionContext {
  scratch_dir?: string;
  plan_dir?: string;
  analysis_dir?: string;
  from_artifact?: string;
  scope_verdict?: 'large' | 'medium' | 'small' | 'unknown';
}

export interface GoalChangelogEntry {
  id: string;
  timestamp: string;
  change_type: 'added' | 'modified' | 'superseded' | 'removed';
  reason: string;
  before?: TaskDecompositionGoal;
  after?: TaskDecompositionGoal;
}

export interface RalphStatus {
  sessionId: string;
  fsmState: FSMState;
  status: 'running' | 'paused' | 'completed' | 'failed';
  currentStepIndex: number;
  steps: RalphStep[];
  decisionLog: DecisionLogEntry[];
  updatedAt: string;
  autoFixIterations?: number;
  maxAutoFixIterations?: number;
  retryBounce?: RetryBounceTracker;
  blockedReason?: string;
  blockedSource?: 'retry-cap' | 'bounce-breaker' | 'staleness-timeout' | 'exhaustion';
  blockedStepIndex?: number;
  blockedAt?: string;
  currentWave?: number;
  waveTaskIds?: string[];
  rollbackFindingId?: string;
  rollbackReason?: string;
  rollbackCount?: number;
  boundaryContract?: BoundaryContract | null;
  taskDecomposition?: TaskDecompositionGoal[] | null;
  sessionContext?: SessionContext | null;
  goalChangelog?: GoalChangelogEntry[];
}

interface WaveTaskInfo {
  id: string;
  title: string;
  description?: string;
  scope: string;
  action: string;
  files?: Array<{
    path: string;
    target: string;
    change: string;
  }>;
  readFirst: string[];
  implementation: string[];
  convergence: {
    criteria: string[];
  };
  dependsOn?: string[];
  wave: number;
  executor?: string;
  type?: 'feature' | 'fix' | 'refactor' | 'test';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  summaryPath?: string;
  commitHash?: string;
}

interface WavePlanInfo {
  waveCount: number;
  waves: Array<{
    wave: number;
    tasks: string[];
  }>;
}

interface WaveTaskSummary {
  taskId: string;
  parentTaskId: string;
  status: 'completed' | 'failed' | 'blocked';
  executor: string;
  summary: string;
  commitHash?: string;
  completedAt: string;
}

const DEFAULT_MAX_AUTOFIX = 3;
const DEFAULT_MAX_ROLLBACK = 1;
const SESSION_STALE_TIMEOUT_MS = 30 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStepStatus(value: unknown): value is StepStatus {
  return value === 'pending' || value === 'running' || value === 'completed' || value === 'skipped' || value === 'failed';
}

function isCompletionStatus(value: unknown): value is CompletionStatus {
  return value === 'DONE' || value === 'DONE_WITH_CONCERNS' || value === 'NEEDS_RETRY' || value === 'BLOCKED';
}

function stringArrayFrom(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') out.push(item);
  }
  return out;
}

function waveTaskArray(value: unknown): string[] {
  return stringArrayFrom(value) || [];
}

export class RalphFSMEngine {
  private workspaceDir: string;
  private fsmDir: string;
  private static readonly WEASEL_PATTERNS = [
    /\bshould\s+work/i, /\b(probably|likely)\s+(fine|ok|works)/i,
    /\bseems?\s+(correct|fine|to\s+work)/i, /\blooks?\s+(good|correct|fine)/i,
    /\bI'?m\s+(confident|sure|pretty\s+sure)/i,
    /\b(just|simple|trivial)\s+(fix|change|update)/i,
  ];

  constructor(workspaceDir: string = process.cwd()) {
    this.workspaceDir = workspaceDir;
    this.fsmDir = path.join(workspaceDir, '.omp-flow', 'fsm');
    fs.mkdirSync(this.fsmDir, { recursive: true });
  }

  private getActiveSessionPath(): string {
    const activeTaskFile = path.join(this.workspaceDir, '.omp-flow', 'tasks', '.active-task');
    let activeTask = '';
    if (fs.existsSync(activeTaskFile)) {
      activeTask = fs.readFileSync(activeTaskFile, 'utf-8').trim();
    }

    if (activeTask) {
      return path.join(this.fsmDir, `ralph-${activeTask}`, 'status.json');
    }

    let sessions: string[] = [];
    try {
      sessions = fs.readdirSync(this.fsmDir).filter((dir) => dir.startsWith('ralph-'));
    } catch {
      sessions = [];
    }

    if (sessions.length === 0) {
      return path.join(this.fsmDir, 'ralph-default', 'status.json');
    }

    return path.join(this.fsmDir, sessions[0], 'status.json');
  }

  public createSession(sessionId: string, initialSteps: Partial<RalphStep>[] = []): RalphStatus {
    const sessionDir = path.join(this.fsmDir, `ralph-${sessionId}`);
    fs.mkdirSync(sessionDir, { recursive: true });

    const defaultSteps: RalphStep[] = [
      { index: 1, skill: 'plan', args: '--mode task', stage: 'planning', decision: null, status: 'pending', completion_status: null, retry_count: 0 },
      { index: 2, skill: 'execute', args: '--mode dispatch', stage: 'execution', decision: null, status: 'pending', completion_status: null, retry_count: 0 },
      { index: 3, skill: 'grill', args: '--mode review', stage: 'review', decision: null, status: 'pending', completion_status: null, fullScope: true, retry_count: 0 },
      { index: 4, skill: 'harvest', args: '--mode learn', stage: 'harvest', decision: null, status: 'pending', completion_status: null, retry_count: 0 },
    ];

    const steps: RalphStep[] = initialSteps.length > 0
      ? initialSteps.map((step, index) => {
          const status: StepStatus = isStepStatus(step.status) ? step.status : 'pending';
          const completionStatus: CompletionStatus | null = isCompletionStatus(step.completion_status) ? step.completion_status : null;
          return {
            index: index + 1,
            skill: typeof step.skill === 'string' && step.skill.length > 0 ? step.skill : 'execute',
            args: typeof step.args === 'string' ? step.args : '',
            stage: typeof step.stage === 'string' && step.stage.length > 0 ? step.stage : 'execution',
            decision: typeof step.decision === 'string' ? step.decision : null,
            status,
            completion_status: completionStatus,
            completion_summary: typeof step.completion_summary === 'string' ? step.completion_summary : null,
            completion_caveats: stringArrayFrom(step.completion_caveats),
            completion_decisions: stringArrayFrom(step.completion_decisions),
            completion_deferred: stringArrayFrom(step.completion_deferred),
            completed_at: typeof step.completed_at === 'string' ? step.completed_at : null,
            fullScope: step.fullScope,
            retry_count: Number.isFinite(step.retry_count) && (step.retry_count || 0) > 0 ? (step.retry_count as number) : 0,
          };
        })
      : defaultSteps;

    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].stage === 'review') {
        if (steps[i].fullScope === undefined) {
          steps[i].fullScope = true;
        }
        break;
      }
    }

    const status: RalphStatus = {
      sessionId,
      fsmState: 'S_PLANNING',
      status: 'running',
      currentStepIndex: 1,
      steps,
      decisionLog: [],
      updatedAt: new Date().toISOString(),
      autoFixIterations: 0,
      maxAutoFixIterations: DEFAULT_MAX_AUTOFIX,
    };

    fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify(status, null, 2), 'utf-8');
    return status;
  }

  private resolveActiveSessionId(): string {
    const activeTaskFile = path.join(this.workspaceDir, '.omp-flow', 'tasks', '.active-task');
    if (fs.existsSync(activeTaskFile)) {
      const tid = fs.readFileSync(activeTaskFile, 'utf-8').trim();
      if (tid) return tid;
    }
    return 'default';
  }

  private normalizeStatus(parsed: unknown): RalphStatus | null {
    if (!isRecord(parsed)) return null;
    if (typeof parsed.sessionId !== 'string' || typeof parsed.fsmState !== 'string' || typeof parsed.status !== 'string') return null;
    if (typeof parsed.currentStepIndex !== 'number' || !Array.isArray(parsed.steps)) return null;

    const steps: RalphStep[] = parsed.steps.map((step, index) => {
      const source = isRecord(step) ? step : {};
      return {
        index: typeof source.index === 'number' ? source.index : index + 1,
        skill: typeof source.skill === 'string' ? source.skill : 'execute',
        args: typeof source.args === 'string' ? source.args : '',
        stage: typeof source.stage === 'string' ? source.stage : 'execution',
        decision: typeof source.decision === 'string' ? source.decision : null,
        status: isStepStatus(source.status) ? source.status : 'pending',
        completion_status: isCompletionStatus(source.completion_status) ? source.completion_status : null,
        completion_summary: typeof source.completion_summary === 'string' ? source.completion_summary : null,
        completion_caveats: stringArrayFrom(source.completion_caveats),
        completion_decisions: stringArrayFrom(source.completion_decisions),
        completion_deferred: stringArrayFrom(source.completion_deferred),
        completed_at: typeof source.completed_at === 'string' ? source.completed_at : null,
        fullScope: source.fullScope === true ? true : source.fullScope === false ? false : undefined,
        retry_count: Number.isFinite(source.retry_count) && (source.retry_count as number) > 0 ? (source.retry_count as number) : 0,
        source_artifact_ref: typeof source.source_artifact_ref === 'string' ? source.source_artifact_ref : null,
        goal_ref: typeof source.goal_ref === 'string' ? source.goal_ref : null,
        milestone_id: typeof source.milestone_id === 'string' ? source.milestone_id : null,
        completion_evidence: stringArrayFrom(source.completion_evidence),
      };
    });

    const decisionLog: DecisionLogEntry[] = Array.isArray(parsed.decisionLog)
      ? parsed.decisionLog.flatMap((entry) => {
          return [{
            stepIndex: entry.stepIndex,
            gateType: entry.gateType,
            verdict: entry.verdict,
            timestamp: entry.timestamp,
            confidence_score: typeof entry.confidence_score === 'number' ? entry.confidence_score : undefined,
            parse_failed: entry.parse_failed === true ? true : undefined,
            summary: typeof entry.summary === 'string' ? entry.summary : undefined,
          }];
        })
      : [];

    const retryBounce: RetryBounceTracker | undefined = isRecord(parsed.retryBounce) && typeof parsed.retryBounce.stepIndex === 'number' && typeof parsed.retryBounce.lastPhase === 'string' && typeof parsed.retryBounce.bounceCount === 'number' && typeof parsed.retryBounce.updatedAt === 'string'
      ? {
          stepIndex: parsed.retryBounce.stepIndex,
          lastPhase: parsed.retryBounce.lastPhase === 'S_AUTOFIX' ? 'S_AUTOFIX' : 'S_DECISION_EVAL',
          bounceCount: parsed.retryBounce.bounceCount,
          updatedAt: parsed.retryBounce.updatedAt,
        }
      : undefined;

    return {
      sessionId: parsed.sessionId,
      fsmState: parsed.fsmState as FSMState,
      status: parsed.status === 'running' || parsed.status === 'paused' || parsed.status === 'completed' || parsed.status === 'failed'
        ? parsed.status
        : 'running',
      currentStepIndex: parsed.currentStepIndex,
      steps,
      decisionLog,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      autoFixIterations: typeof parsed.autoFixIterations === 'number' ? parsed.autoFixIterations : 0,
      maxAutoFixIterations: typeof parsed.maxAutoFixIterations === 'number' ? parsed.maxAutoFixIterations : DEFAULT_MAX_AUTOFIX,
      retryBounce,
      blockedReason: typeof parsed.blockedReason === 'string' ? parsed.blockedReason : undefined,
      blockedSource: parsed.blockedSource === 'retry-cap' || parsed.blockedSource === 'bounce-breaker' || parsed.blockedSource === 'staleness-timeout' || parsed.blockedSource === 'exhaustion' ? parsed.blockedSource : undefined,
      blockedStepIndex: typeof parsed.blockedStepIndex === 'number' ? parsed.blockedStepIndex : undefined,
      blockedAt: typeof parsed.blockedAt === 'string' ? parsed.blockedAt : undefined,
      currentWave: typeof parsed.currentWave === 'number' ? parsed.currentWave : undefined,
      waveTaskIds: stringArrayFrom(parsed.waveTaskIds),
      rollbackFindingId: typeof parsed.rollbackFindingId === 'string' ? parsed.rollbackFindingId : undefined,
      rollbackReason: typeof parsed.rollbackReason === 'string' ? parsed.rollbackReason : undefined,
      rollbackCount: typeof parsed.rollbackCount === 'number' ? parsed.rollbackCount : undefined,
      boundaryContract: isRecord(parsed.boundaryContract) ? (parsed.boundaryContract as unknown as BoundaryContract) : null,
      taskDecomposition: Array.isArray(parsed.taskDecomposition) ? parsed.taskDecomposition.flatMap((g) => {
        if (!isRecord(g) || typeof g.id !== 'string' || typeof g.goal !== 'string' || typeof g.done_when !== 'string') return [];
        const goalStatus = g.status === 'pending' || g.status === 'active' || g.status === 'completed' || g.status === 'superseded' ? g.status : 'pending';
        return [{ id: g.id, goal: g.goal, done_when: g.done_when, boundary: typeof g.boundary === 'string' ? g.boundary : undefined, status: goalStatus }];
      }) : null,
      sessionContext: isRecord(parsed.sessionContext) ? {
        scratch_dir: typeof parsed.sessionContext.scratch_dir === 'string' ? parsed.sessionContext.scratch_dir : undefined,
        plan_dir: typeof parsed.sessionContext.plan_dir === 'string' ? parsed.sessionContext.plan_dir : undefined,
        analysis_dir: typeof parsed.sessionContext.analysis_dir === 'string' ? parsed.sessionContext.analysis_dir : undefined,
        from_artifact: typeof parsed.sessionContext.from_artifact === 'string' ? parsed.sessionContext.from_artifact : undefined,
        scope_verdict: parsed.sessionContext.scope_verdict === 'large' || parsed.sessionContext.scope_verdict === 'medium' || parsed.sessionContext.scope_verdict === 'small' || parsed.sessionContext.scope_verdict === 'unknown' ? parsed.sessionContext.scope_verdict : undefined,
      } : null,
      goalChangelog: Array.isArray(parsed.goalChangelog) ? parsed.goalChangelog.flatMap((e) => {
        if (!isRecord(e) || typeof e.id !== 'string' || typeof e.timestamp !== 'string' || typeof e.change_type !== 'string' || typeof e.reason !== 'string') return [];
        const ct = e.change_type === 'added' || e.change_type === 'modified' || e.change_type === 'superseded' || e.change_type === 'removed' ? e.change_type : 'added';
        return [{ id: e.id, timestamp: e.timestamp, change_type: ct, reason: e.reason }];
      }) : undefined,
    };
  }

  public getStatus(): RalphStatus {
    const statusPath = this.getActiveSessionPath();
    if (!fs.existsSync(statusPath)) {
      return this.createSession(this.resolveActiveSessionId());
    }

    try {
      const content = fs.readFileSync(statusPath, 'utf-8');
      const parsed = this.normalizeStatus(JSON.parse(content));
      if (!parsed) {
        return this.createSession(this.resolveActiveSessionId());
      }
      const ageMs = Date.now() - new Date(parsed.updatedAt).getTime();
      if (ageMs > SESSION_STALE_TIMEOUT_MS && parsed.status === 'running') {
        parsed.status = 'failed';
        parsed.blockedReason = `Session stale (${Math.round(ageMs / 60000)}min without update)`;
        parsed.blockedSource = 'staleness-timeout';
        this.saveStatus(parsed);
      }
      return parsed;
    } catch {
      console.warn('[omp-flow Warning] Ralph FSM status.json corrupted. Re-initializing session.');
      return this.createSession(this.resolveActiveSessionId());
    }
  }

  public pauseSession(sessionId: string, reason: string): RalphStatus {
    const status = this.getStatus();
    status.status = 'paused';
    status.blockedReason = reason;
    status.blockedAt = new Date().toISOString();
    status.updatedAt = new Date().toISOString();
    this.saveStatus(status);
    return status;
  }

  public resumeSession(sessionId: string): RalphStatus {
    const status = this.getStatus();
    if (status.status !== 'paused') {
      throw new Error(`Session ${sessionId} is not paused (current status: ${status.status})`);
    }
    status.status = 'running';
    delete status.blockedReason;
    delete status.blockedAt;
    delete status.blockedSource;
    delete status.blockedStepIndex;
    status.updatedAt = new Date().toISOString();
    this.saveStatus(status);
    return status;
  }

  private saveStatus(status: RalphStatus): void {
    const statusPath = this.getActiveSessionPath();
    const tmpPath = statusPath + '.tmp';
    const data = JSON.stringify(status, null, 2);
    try {
      fs.mkdirSync(path.dirname(statusPath), { recursive: true });
      fs.writeFileSync(tmpPath, data, 'utf-8');
      fs.renameSync(tmpPath, statusPath);
    } catch {
      // Fallback for Windows antivirus / EPERM on rename — direct write
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
      fs.writeFileSync(statusPath, data, 'utf-8');
    }
  }

  private appendDecisionToFile(sessionId: string, entry: DecisionLogEntry): void {
    const dir = path.join(this.workspaceDir, '.omp-flow', 'fsm', `ralph-${sessionId}`);
    const ndjsonPath = path.join(dir, 'decisions.ndjson');
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(ndjsonPath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch {
      // Best-effort — decision log persistence is non-critical
    }
  }

  public getVerifyCommands(taskId?: string): string[] {
    const resolvedTaskId = taskId || this.resolveActiveTaskId();
    if (resolvedTaskId) {
      const taskPath = path.join(this.workspaceDir, '.omp-flow', 'tasks', resolvedTaskId, 'task.json');
      if (fs.existsSync(taskPath)) {
        try {
          const parsed: unknown = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
          if (isRecord(parsed)) {
            const taskCommands = stringArrayFrom(parsed.verifyCommands);
            if (taskCommands && taskCommands.length > 0) {
              return taskCommands;
            }
            if (isRecord(parsed.meta)) {
              const metaCommands = stringArrayFrom(parsed.meta.verifyCommands);
              if (metaCommands && metaCommands.length > 0) {
                return metaCommands;
              }
            }
          }
        } catch {
          // fall through to default command
        }
      }
    }

    return ['npm test'];
  }

  private runVerifyCommands(commands: string[]): { passed: boolean; evidence: string[] } {
    const evidence: string[] = [];

    for (const command of commands) {
      try {
        const output = execSync(command, {
          cwd: this.workspaceDir,
          stdio: 'pipe',
          encoding: 'utf-8',
          timeout: 300000,
          maxBuffer: 10 * 1024 * 1024,
        });
        const trimmed = typeof output === 'string' ? output.trim() : '';
        evidence.push(trimmed.length > 0 ? `[${command}] passed: ${trimmed.slice(0, 500)}` : `[${command}] passed`);
      } catch (error: unknown) {
        let exitCode = -1;
        let stdout = '';
        let stderr = '';

        if (typeof error === 'object' && error !== null) {
          const candidate = error as { status?: unknown; stdout?: unknown; stderr?: unknown };
          if (typeof candidate.status === 'number') {
            exitCode = candidate.status;
          }
          if (typeof candidate.stdout === 'string') {
            stdout = candidate.stdout;
          }
          if (typeof candidate.stderr === 'string') {
            stderr = candidate.stderr;
          }
        }

        const failureEvidence = [`[${command}] failed with exit ${exitCode}`];
        const output = `${stdout}\n${stderr}`.trim();
        if (output.length > 0) {
          failureEvidence.push(output.slice(0, 2000));
        }
        evidence.push(failureEvidence.join(': '));
        return { passed: false, evidence };
      }
    }

    return { passed: true, evidence };
  }

  private recordBounce(status: RalphStatus, stepIndex: number, nextPhase: BouncePhase): void {
    const now = new Date().toISOString();
    const current = status.retryBounce;

    if (!current || current.stepIndex !== stepIndex) {
      status.retryBounce = {
        stepIndex,
        lastPhase: nextPhase,
        bounceCount: nextPhase === 'S_AUTOFIX' ? 1 : 0,
        updatedAt: now,
      };
      return;
    }

    if (current.lastPhase === nextPhase) {
      current.updatedAt = now;
      return;
    }

    if (nextPhase === 'S_AUTOFIX') {
      current.bounceCount += 1;
    }

    current.lastPhase = nextPhase;
    current.updatedAt = now;
  }

  private blockStep(status: RalphStatus, step: RalphStep, source: 'retry-cap' | 'bounce-breaker' | 'staleness-timeout' | 'exhaustion', reason: string): RalphStatus {
    const now = new Date().toISOString();
    step.status = 'failed';
    step.completion_status = 'BLOCKED';
    step.completion_summary = reason;
    step.completed_at = now;
    status.status = 'failed';
    status.fsmState = 'S_DECISION_EVAL';
    status.currentStepIndex = step.index;
    status.blockedReason = reason;
    status.blockedSource = source;
    status.blockedStepIndex = step.index;
    status.blockedAt = now;
    status.updatedAt = now;
    return status;
  }

  private applyRetryEscalation(status: RalphStatus, step: RalphStep, source: 'retry-cap' | 'bounce-breaker' | 'staleness-timeout' | 'exhaustion', retryCount: number): RalphStatus {
    const maxRetries = status.maxAutoFixIterations || DEFAULT_MAX_AUTOFIX;
    const reason = source === 'retry-cap'
      ? `Retry cap reached for step ${step.index} after ${retryCount} failed retries (max ${maxRetries})`
      : `Bounce breaker tripped for step ${step.index} after ${status.retryBounce?.bounceCount || 0} bounce cycles`;
    return this.blockStep(status, step, source, reason);
  }

  private enterAutofix(status: RalphStatus, step: RalphStep): void {
    status.autoFixIterations = (status.autoFixIterations || 0) + 1;
    status.fsmState = 'S_AUTOFIX';
    this.recordBounce(status, step.index, 'S_AUTOFIX');
  }

  private shouldInsertRegroundGate(status: RalphStatus): boolean {
    const completedExecSteps = status.steps.filter(
      (s) => s.status === 'completed' && s.stage === 'execution'
    ).length;
    if (completedExecSteps < 3) return false;

    // Find the last reground-gate entry in decisionLog
    const regroundEntries = status.decisionLog
      .map((entry, idx) => entry.gateType === 'reground-gate' ? idx : -1)
      .filter((idx) => idx >= 0);
    const lastRegroundIndex = regroundEntries.length > 0 ? regroundEntries[regroundEntries.length - 1] : undefined;

    if (lastRegroundIndex === undefined) {
      return completedExecSteps >= 3;
    }

    const lastRegroundStepIndex = status.decisionLog[lastRegroundIndex].stepIndex;
    const execStepsSinceReground = status.steps.filter(
      (s) => s.status === 'completed' && s.stage === 'execution' && s.index > lastRegroundStepIndex
    ).length;

    return execStepsSinceReground >= 3;
  }

  public advanceNextStep(): { prompt: string; stepIdx: number; isComplete: boolean; step?: RalphStep; priorContext?: string } {
    const status = this.getStatus();

    if (status.status === 'failed' && status.fsmState === 'S_DECISION_EVAL' && status.blockedReason) {
      const blockedStep = typeof status.blockedStepIndex === 'number'
        ? status.steps.find((step) => step.index === status.blockedStepIndex)
        : undefined;
      this.saveStatus(status);
      return {
        prompt: `${status.blockedReason} | Escalation required.`,
        stepIdx: status.blockedStepIndex || status.currentStepIndex || -1,
        isComplete: false,
        step: blockedStep,
      };
    }

    const activeStep =
      status.steps.find((step) => step.status === 'running') ||
      status.steps.find((step) => step.status === 'failed') ||
      status.steps.find((step) => step.status === 'pending');

    // Insert reground-gate decision if pending step is due for periodic alignment check
    if (activeStep && activeStep.status === 'pending' && this.shouldInsertRegroundGate(status)) {
      activeStep.decision = 'reground-gate';
    }

    if (!activeStep) {
      status.status = 'completed';
      status.fsmState = 'S_HARVEST';
      this.saveStatus(status);
      return { prompt: 'All FSM steps completed.', stepIdx: -1, isComplete: true };
    }

    if (activeStep.status === 'failed') {
      const retryCount = activeStep.retry_count || 0;
      const maxRetries = status.maxAutoFixIterations || DEFAULT_MAX_AUTOFIX;

      if (retryCount >= maxRetries) {
        const blocked = this.applyRetryEscalation(status, activeStep, 'retry-cap', retryCount);
        this.saveStatus(blocked);
        return {
          prompt: blocked.blockedReason || `Retry cap reached for step ${activeStep.index}`,
          stepIdx: activeStep.index,
          isComplete: false,
          step: activeStep,
        };
      }

      this.recordBounce(status, activeStep.index, 'S_AUTOFIX');
      if ((status.retryBounce?.stepIndex === activeStep.index ? status.retryBounce.bounceCount : 0) >= 2) {
        const blocked = this.applyRetryEscalation(status, activeStep, 'bounce-breaker', retryCount);
        this.saveStatus(blocked);
        return {
          prompt: blocked.blockedReason || `Bounce breaker tripped for step ${activeStep.index}`,
          stepIdx: activeStep.index,
          isComplete: false,
          step: activeStep,
        };
      }

      this.enterAutofix(status, activeStep);
    }

    // Source artifact chaining: populate source_artifact_ref based on stage lineage
    if (activeStep) {
      const completedForChain = status.steps.filter((s) => s.status === 'completed');
      if (activeStep.stage === 'execution') {
        const latestPlan = [...completedForChain].reverse().find((s) => s.stage === 'planning');
        if (latestPlan) {
          activeStep.source_artifact_ref = `plan:${latestPlan.index}`;
        }
      } else if (activeStep.stage === 'review') {
        const latestExec = [...completedForChain].reverse().find((s) => s.stage === 'execution');
        if (latestExec) {
          activeStep.source_artifact_ref = `execute:${latestExec.index}`;
        }
      } else if (activeStep.stage === 'planning') {
        const latestAnalysis = [...completedForChain].reverse().find((s) => s.stage === 'analysis');
        if (latestAnalysis) {
          activeStep.source_artifact_ref = `analyze:${latestAnalysis.index}`;
        }
      }
      if (activeStep.source_artifact_ref) {
        if (!status.sessionContext) {
          status.sessionContext = {};
        }
        status.sessionContext.from_artifact = activeStep.source_artifact_ref;
      }
    }

    activeStep.status = 'running';
    status.currentStepIndex = activeStep.index;

    if (status.fsmState !== 'S_AUTOFIX') {
      if (activeStep.stage === 'planning') {
        status.fsmState = 'S_PLANNING';
      } else if (activeStep.stage === 'execution') {
        if (activeStep.args.includes('--wave')) {
          status.fsmState = 'S_WAVE_DISPATCH';
        } else {
          status.fsmState = 'S_DISPATCH';
        }
      } else if (activeStep.stage === 'review') {
        status.fsmState = 'S_GRILL';
      } else if (activeStep.stage === 'harvest') {
        status.fsmState = 'S_HARVEST';
      }
    }

    this.saveStatus(status);

    const priorContext = this.buildPriorContext(status, 5);
    const retryInfo = activeStep.retry_count && activeStep.retry_count > 0
      ? ` | Retry: ${activeStep.retry_count}/${status.maxAutoFixIterations || DEFAULT_MAX_AUTOFIX}`
      : '';
    const fullScopeMarker = activeStep.fullScope === true
      ? ' [FULLSCOPE] This is the final-pass review — load ALL affected package specs, not just the current task scope.'
      : '';

    return {
      prompt: `[Ralph FSM Step ${activeStep.index}/${status.steps.length}] Skill: ${activeStep.skill} | Args: ${activeStep.args} | Stage: ${activeStep.stage}${retryInfo}${fullScopeMarker}`,
      stepIdx: activeStep.index,
      isComplete: false,
      step: activeStep,
      priorContext,
    };
  }

  public buildPriorContext(status: RalphStatus, windowSize: number = 5): string {
    const completed = status.steps.filter((step) => step.status === 'completed' && step.completion_summary);
    const recent = completed.slice(-windowSize);

    if (recent.length === 0) return '';

    const lines: string[] = ['<prior-step-context>'];
    for (const step of recent) {
      lines.push(`- [Step ${step.index}] ${step.skill} (${step.stage}): ${step.completion_summary}`);
      if (step.completion_caveats && step.completion_caveats.length > 0) {
        lines.push(`  ⚠️ Caveats: ${step.completion_caveats.join('; ')}`);
      }
      if (step.completion_decisions && step.completion_decisions.length > 0) {
        lines.push(`  📌 Decisions: ${step.completion_decisions.join('; ')}`);
      }
      if (step.completion_deferred && step.completion_deferred.length > 0) {
        lines.push(`  ⏭️ Deferred: ${step.completion_deferred.join('; ')}`);
      }
    }
    lines.push('</prior-step-context>');
    return lines.join('\n');
  }

  public buildSessionAnchor(status: RalphStatus, intent?: string): string {
    const truncatedIntent = intent && intent.length > 1200 ? intent.slice(0, 1197) + '...' : (intent || 'No intent specified');

    // Boundary Contract
    let boundaryBlock = 'None specified';
    if (status.boundaryContract) {
      const b = status.boundaryContract;
      boundaryBlock = `In Scope: ${b.in_scope.join(', ')}\nOut of Scope: ${b.out_of_scope.join(', ')}\nConstraints: ${b.constraints.join('; ')}\nDone When: ${b.done_when.join('; ')}`;
    }

    // Execution Progress (reuse buildPriorContext sliding window)
    const progressBlock = this.buildPriorContext(status, 5) || 'No completed steps yet.';

    // Goals Overview
    let goalsBlock = 'None decomposed';
    if (status.taskDecomposition && status.taskDecomposition.length > 0) {
      const goals = status.taskDecomposition.map((g) => {
        const mark = g.status === 'completed' ? '✓' : '○';
        return `${mark} ${g.id}: ${g.goal}`;
      });
      goalsBlock = goals.join('\n');
    }

    // Current Goal (matching current step's goal_ref)
    const currentStep = status.steps.find((s) => s.index === status.currentStepIndex);
    let currentGoalBlock = 'None';
    if (currentStep?.goal_ref && status.taskDecomposition) {
      const goal = status.taskDecomposition.find((g) => g.id === currentStep.goal_ref);
      if (goal) {
        currentGoalBlock = `${goal.id}: ${goal.goal}\nDone when: ${goal.done_when}`;
        if (goal.boundary) currentGoalBlock += `\nBoundary: ${goal.boundary}`;
      }
    }

    // Accumulated Signals (aggregated caveats + deferred from all completed steps)
    const allCaveats: string[] = [];
    const allDeferred: string[] = [];
    for (const step of status.steps) {
      if (step.status === 'completed') {
        if (step.completion_caveats) allCaveats.push(...step.completion_caveats);
        if (step.completion_deferred) allDeferred.push(...step.completion_deferred);
      }
    }
    const signalsBlock: string[] = [];
    if (allCaveats.length > 0) signalsBlock.push(`⚠️ Caveats: ${allCaveats.join('; ')}`);
    if (allDeferred.length > 0) signalsBlock.push(`⏭️ Deferred: ${allDeferred.join('; ')}`);
    const signalsText = signalsBlock.length > 0 ? signalsBlock.join('\n') : 'No accumulated signals.';

    return `<session_anchor>
## Session Anchor — ralph-${status.sessionId}

**Intent**: ${truncatedIntent}
**Scope**: FSM: ${status.fsmState} | Status: ${status.status}
**Boundary Contract**:
${boundaryBlock}

**Execution Progress**:
${progressBlock}

**Goals Overview**:
${goalsBlock}

**Current Goal**:
${currentGoalBlock}

**⚠️ Accumulated Signals**:
${signalsText}
<!-- session_anchor: read-only grounding. Honor Intent + Boundary Contract before acting.
     If work falls outside scope → escalate. -->
</session_anchor>`;
  }

  public completeStep(
    idx: number,
    completionStatus: CompletionStatus,
    summary: string,
    options: {
      caveats?: string[];
      decisions?: string[];
      deferred?: string[];
      verifyCommands?: string[];
    } = {},
    findingInfo?: {
      severity?: FindingSeverity;
      dimension?: FindingDimension;
      id?: string;
    },
  ): RalphStatus {
    const status = this.getStatus();
    const step = status.steps.find((candidate) => candidate.index === idx);
    const verifyCommands = options.verifyCommands && options.verifyCommands.length > 0
      ? options.verifyCommands
      : this.getVerifyCommands();
    const verification = completionStatus === 'DONE'
      ? this.runVerifyCommands(verifyCommands)
      : { passed: true, evidence: [] as string[] };
    const effectiveCompletionStatus: CompletionStatus = completionStatus === 'DONE' && !verification.passed
      ? 'NEEDS_RETRY'
      : completionStatus;

    if (step) {
      step.status = effectiveCompletionStatus === 'NEEDS_RETRY' ? 'failed' : 'completed';
      step.completion_status = effectiveCompletionStatus;
      step.completion_summary = summary;
      step.completion_caveats = verification.evidence.length > 0
        ? [...(options.caveats || []), ...verification.evidence]
        : (options.caveats || []);
      step.completion_decisions = options.decisions || [];
      step.completion_deferred = options.deferred || [];
      step.completed_at = new Date().toISOString();
    }
    // Weasel-word detection: check summary and caveats for unverified claims
    const textToCheck = summary + ' ' + (options.caveats || []).join(' ');
    const weaselMatch = RalphFSMEngine.WEASEL_PATTERNS.find(p => p.test(textToCheck));
    if (weaselMatch && effectiveCompletionStatus === 'DONE' && step) {
      // Downgrade DONE to NEEDS_RETRY — summary contains unverified claim
      step.completion_status = 'NEEDS_RETRY';
      step.status = 'failed';
      step.completion_caveats = [...(options.caveats || []), `WEASEL WORD DETECTED: '${weaselMatch.source}' — run verification commands and report actual results.`];
      status.fsmState = 'S_DECISION_EVAL';
      this.recordBounce(status, step.index, 'S_DECISION_EVAL');
      // Skip normal decision gate routing — weasel words override
      status.updatedAt = new Date().toISOString();
      this.saveStatus(status);
      return status;
    }

    if (
      step &&
      completionStatus === 'BLOCKED' &&
      step.fullScope === true &&
      findingInfo &&
      (findingInfo.severity === 'critical' || findingInfo.severity === 'high') &&
      (findingInfo.dimension === 'architecture' || findingInfo.dimension === 'correctness')
    ) {
      const reasonParts: string[] = [];
      if (options.caveats && options.caveats.length > 0) reasonParts.push(options.caveats.join('; '));
      if (options.decisions && options.decisions.length > 0) reasonParts.push(options.decisions.join('; '));
      const reason = reasonParts.length > 0 ? reasonParts.join(' | ') : 'Contract-level defect in final-pass review';
      status.updatedAt = new Date().toISOString();
      this.saveStatus(status);
      return this.rollbackToPlanning(reason, findingInfo.id || '');
    }

    let shouldBlock: RalphStatus | null = null;

    if (step && step.decision) {
      const gateType = step.decision;
      let verdict = 'review';

      if (gateType === 'quality-gate') {
        if (effectiveCompletionStatus === 'DONE') {
          verdict = 'pass';
        } else if (effectiveCompletionStatus === 'NEEDS_RETRY') {
          step.status = 'failed';
          step.retry_count = (step.retry_count || 0) + 1;
          verdict = 'retry';
          status.fsmState = 'S_DECISION_EVAL';
          this.recordBounce(status, step.index, 'S_DECISION_EVAL');

          const maxRetries = status.maxAutoFixIterations || DEFAULT_MAX_AUTOFIX;
          if ((step.retry_count || 0) >= maxRetries) {
            shouldBlock = this.applyRetryEscalation(status, step, 'retry-cap', step.retry_count || 0);
          }
        } else {
          verdict = effectiveCompletionStatus === 'BLOCKED' ? 'blocked' : 'concerns';
          status.fsmState = 'S_DECISION_EVAL';
          this.recordBounce(status, step.index, 'S_DECISION_EVAL');
        }
      } else if (gateType === 'goal-gate') {
        if (effectiveCompletionStatus === 'DONE') {
          verdict = 'pass';
        } else if (effectiveCompletionStatus === 'NEEDS_RETRY') {
          step.status = 'failed';
          step.retry_count = (step.retry_count || 0) + 1;
          verdict = 'retry';
          status.fsmState = 'S_DECISION_EVAL';
          this.recordBounce(status, step.index, 'S_DECISION_EVAL');

          const maxRetries = status.maxAutoFixIterations || DEFAULT_MAX_AUTOFIX;
          if ((step.retry_count || 0) >= maxRetries) {
            shouldBlock = this.applyRetryEscalation(status, step, 'exhaustion', step.retry_count || 0);
          }
        } else {
          verdict = 'blocked';
          status.fsmState = 'S_DECISION_EVAL';
          this.recordBounce(status, step.index, 'S_DECISION_EVAL');
        }
      } else if (gateType === 'scope-gate') {
        if (effectiveCompletionStatus === 'DONE') {
          if (!status.sessionContext) {
            status.sessionContext = {};
          }
          status.sessionContext.scope_verdict = 'medium';
          verdict = 'pass';
        } else {
          verdict = 'blocked';
          status.fsmState = 'S_DECISION_EVAL';
          this.recordBounce(status, step.index, 'S_DECISION_EVAL');
        }
      } else if (gateType === 'reground-gate') {
        if (effectiveCompletionStatus === 'DONE') {
          verdict = 'pass';
        } else {
          status.status = 'paused';
          status.blockedReason = 'Reground gate: drift detected with high confidence, session paused for safety';
          status.blockedAt = new Date().toISOString();
          status.fsmState = 'S_DECISION_EVAL';
          verdict = 'blocked';
        }
      } else if (gateType === 'structural') {
        if (effectiveCompletionStatus === 'DONE') {
          verdict = 'pass';
        } else {
          verdict = 'blocked';
          status.fsmState = 'S_DECISION_EVAL';
          this.recordBounce(status, step.index, 'S_DECISION_EVAL');
        }
      } else {
        verdict = effectiveCompletionStatus === 'DONE' ? 'pass' : 'review';
        if (verdict !== 'pass') {
          status.fsmState = 'S_DECISION_EVAL';
          this.recordBounce(status, step.index, 'S_DECISION_EVAL');
        }
      }

      const entry: DecisionLogEntry = {
        stepIndex: idx,
        gateType,
        verdict,
        timestamp: new Date().toISOString(),
      };
      status.decisionLog.push(entry);
      this.appendDecisionToFile(status.sessionId, entry);
    }

    if (shouldBlock) {
      this.saveStatus(shouldBlock);
      return shouldBlock;
    }

    const allFinished = status.steps.every((candidate) => candidate.status === 'completed' || candidate.status === 'skipped');
    if (allFinished) {
      status.status = 'completed';
      status.fsmState = 'S_HARVEST';
    }

    status.updatedAt = new Date().toISOString();
    this.saveStatus(status);
    return status;
  }

  public getDecisionLog(): DecisionLogEntry[] {
    const status = this.getStatus();
    return Array.isArray(status.decisionLog) ? status.decisionLog : [];
  }

  public transitionTo(nextState: FSMState): RalphStatus {
    const status = this.getStatus();
    status.fsmState = nextState;
    status.updatedAt = new Date().toISOString();
    this.saveStatus(status);
    return status;
  }

  public rollbackToPlanning(reason: string, findingId: string): RalphStatus {
    const status = this.getStatus();
    const count = (status.rollbackCount || 0) + 1;
    if (count > DEFAULT_MAX_ROLLBACK) {
      status.fsmState = 'S_DECISION_EVAL';
      status.status = 'failed';
      status.updatedAt = new Date().toISOString();
      this.saveStatus(status);
      return status;
    }

    const currentIdx = status.currentStepIndex - 1;
    if (status.steps[currentIdx]) {
      status.steps[currentIdx].status = 'skipped';
    }

    const planningIdx = status.steps.findIndex((candidate) => candidate.stage === 'planning');
    status.currentStepIndex = planningIdx >= 0 ? planningIdx + 1 : 1;
    status.fsmState = 'S_PLANNING';
    status.rollbackCount = count;
    status.rollbackReason = reason;
    status.rollbackFindingId = findingId;
    status.updatedAt = new Date().toISOString();
    this.saveStatus(status);
    return status;
  }

  public isAutoFixExhausted(): boolean {
    const status = this.getStatus();
    return (status.autoFixIterations || 0) >= (status.maxAutoFixIterations || DEFAULT_MAX_AUTOFIX);
  }

  public classifyExhaustion(): {
    classification: 'code' | 'contract';
    deferredFindings: string[];
    escalation?: {
      blocked: true;
      reason: string;
      source?: 'retry-cap' | 'bounce-breaker' | 'staleness-timeout' | 'exhaustion';
    };
  } | null {
    if (!this.isAutoFixExhausted()) return null;
    const status = this.getStatus();
    const classification = (status.rollbackCount || 0) > 0 ? 'contract' : 'code';
    const reason = status.blockedReason || 'Auto-fix exhaustion reached';
    return {
      classification,
      deferredFindings: [],
      escalation: {
        blocked: true,
        reason,
        source: status.blockedSource,
      },
    };
  }

  private resolveActiveTaskId(workspaceDir: string = this.workspaceDir): string | null {
    const pointer = path.join(workspaceDir, '.omp-flow', 'tasks', '.active-task');
    if (!fs.existsSync(pointer)) return null;
    const raw = fs.readFileSync(pointer, 'utf-8').trim();
    return raw.length > 0 ? raw : null;
  }

  private loadWavePlanInfo(workspaceDir: string, taskId: string): WavePlanInfo | null {
    const planPath = path.join(workspaceDir, '.omp-flow', 'tasks', taskId, 'plan.json');
    if (!fs.existsSync(planPath)) return null;
    try {
      const content = fs.readFileSync(planPath, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      if (!isRecord(parsed) || !Array.isArray(parsed.waves) || typeof parsed.waveCount !== 'number') return null;
      const waves = parsed.waves.flatMap((wave) => {
        if (!isRecord(wave) || typeof wave.wave !== 'number' || !Array.isArray(wave.tasks)) return [];
        return [{
          wave: wave.wave,
          tasks: waveTaskArray(wave.tasks),
        }];
      });
      return { waveCount: parsed.waveCount, waves };
    } catch {
      return null;
    }
  }

  private readWaveTaskInfo(workspaceDir: string, taskId: string, subTaskId: string): WaveTaskInfo | null {
    const taskFile = path.join(workspaceDir, '.omp-flow', 'tasks', taskId, '.task', `${subTaskId}.json`);
    if (!fs.existsSync(taskFile)) return null;
    try {
      const content = fs.readFileSync(taskFile, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      if (!isRecord(parsed) || typeof parsed.id !== 'string' || typeof parsed.wave !== 'number') return null;
      const status = parsed.status === 'running' || parsed.status === 'completed' || parsed.status === 'failed' || parsed.status === 'blocked'
        ? parsed.status
        : 'pending';
      return {
        id: parsed.id,
        title: typeof parsed.title === 'string' ? parsed.title : parsed.id,
        description: typeof parsed.description === 'string' ? parsed.description : undefined,
        scope: typeof parsed.scope === 'string' ? parsed.scope : '',
        action: typeof parsed.action === 'string' ? parsed.action : '',
        files: Array.isArray(parsed.files)
          ? parsed.files.flatMap((file) => {
              if (!isRecord(file) || typeof file.path !== 'string' || typeof file.target !== 'string' || typeof file.change !== 'string') return [];
              return [{ path: file.path, target: file.target, change: file.change }];
            })
          : undefined,
        readFirst: stringArrayFrom(parsed.readFirst) || [],
        implementation: stringArrayFrom(parsed.implementation) || [],
        convergence: isRecord(parsed.convergence) && Array.isArray(parsed.convergence.criteria)
          ? {
              criteria: stringArrayFrom(parsed.convergence.criteria) || [],
            }
          : { criteria: [] },
        dependsOn: stringArrayFrom(parsed.dependsOn),
        wave: parsed.wave,
        executor: typeof parsed.executor === 'string' ? parsed.executor : undefined,
        type: parsed.type === 'feature' || parsed.type === 'fix' || parsed.type === 'refactor' || parsed.type === 'test' ? parsed.type : undefined,
        status,
        summaryPath: typeof parsed.summaryPath === 'string' ? parsed.summaryPath : undefined,
        commitHash: typeof parsed.commitHash === 'string' ? parsed.commitHash : undefined,
      };
    } catch {
      return null;
    }
  }

  private writeWaveTaskInfo(workspaceDir: string, taskId: string, info: WaveTaskInfo): void {
    const taskDir = path.join(workspaceDir, '.omp-flow', 'tasks', taskId, '.task');
    fs.mkdirSync(taskDir, { recursive: true });
    const taskFile = path.join(taskDir, `${info.id}.json`);
    fs.writeFileSync(taskFile, JSON.stringify(info, null, 2), 'utf-8');
  }

  private listWaveTaskInfos(workspaceDir: string, taskId: string): WaveTaskInfo[] {
    const taskDir = path.join(workspaceDir, '.omp-flow', 'tasks', taskId, '.task');
    if (!fs.existsSync(taskDir) || !fs.statSync(taskDir).isDirectory()) return [];
    const out: WaveTaskInfo[] = [];
    for (const entry of fs.readdirSync(taskDir)) {
      if (!entry.endsWith('.json')) continue;
      const subId = entry.slice(0, -5);
      const info = this.readWaveTaskInfo(workspaceDir, taskId, subId);
      if (info) out.push(info);
    }
    return out;
  }

  private readWaveSummary(workspaceDir: string, taskId: string, subTaskId: string): WaveTaskSummary | null {
    const sumPath = path.join(workspaceDir, '.omp-flow', 'tasks', taskId, '.summaries', `${subTaskId}-summary.md`);
    if (!fs.existsSync(sumPath)) return null;
    try {
      const text = fs.readFileSync(sumPath, 'utf-8');
      const fm = text.match(/^```json\n([\s\S]*?)\n```/);
      if (fm) {
        const obj: unknown = JSON.parse(fm[1]);
        if (isRecord(obj)) {
          return {
            taskId: subTaskId,
            parentTaskId: taskId,
            status: obj.status === 'failed' || obj.status === 'blocked' ? obj.status : 'completed',
            executor: typeof obj.executor === 'string' ? obj.executor : 'unknown',
            summary: typeof obj.summary === 'string' ? obj.summary : text,
            commitHash: typeof obj.commitHash === 'string' ? obj.commitHash : undefined,
            completedAt: typeof obj.completedAt === 'string' ? obj.completedAt : new Date().toISOString(),
          };
        }
      }
      return {
        taskId: subTaskId,
        parentTaskId: taskId,
        status: 'completed',
        executor: 'unknown',
        summary: text,
        completedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  public advanceWaveStep(workspaceDir: string): {
    taskDef: WaveTaskInfo | null;
    priorSummaries: WaveTaskSummary[];
    waveNum: number;
    isWaveComplete: boolean;
    prompt: string;
  } {
    const status = this.getStatus();
    const activeTaskId = this.resolveActiveTaskId(workspaceDir);

    if (!activeTaskId) {
      return { taskDef: null, priorSummaries: [], waveNum: 0, isWaveComplete: false, prompt: 'No active task for wave dispatch.' };
    }

    const plan = this.loadWavePlanInfo(workspaceDir, activeTaskId);
    if (!plan) {
      return { taskDef: null, priorSummaries: [], waveNum: 0, isWaveComplete: false, prompt: `No plan.json found for task ${activeTaskId}.` };
    }

    let waveNum = typeof status.currentWave === 'number' && status.currentWave > 0 ? status.currentWave : 1;
    if (waveNum > plan.waveCount) {
      waveNum = plan.waveCount;
    }

    const wave = plan.waves.find((candidate) => candidate.wave === waveNum);
    if (!wave) {
      return { taskDef: null, priorSummaries: [], waveNum, isWaveComplete: true, prompt: `Wave ${waveNum} not defined in plan.` };
    }

    status.waveTaskIds = wave.tasks.slice();
    status.fsmState = 'S_WAVE_DISPATCH';

    let nextTask: WaveTaskInfo | null = null;
    for (const subId of wave.tasks) {
      const info = this.readWaveTaskInfo(workspaceDir, activeTaskId, subId);
      if (info && info.status === 'pending') {
        nextTask = info;
        break;
      }
    }

    if (nextTask) {
      nextTask.status = 'running';
      this.writeWaveTaskInfo(workspaceDir, activeTaskId, nextTask);
      status.currentWave = waveNum;
      this.saveStatus(status);
      const priorSummaries = this.collectPriorWaveSummaries(workspaceDir, activeTaskId, plan, waveNum);
      const prompt = this.buildWavePrompt(nextTask, waveNum, priorSummaries.length);
      return { taskDef: nextTask, priorSummaries, waveNum, isWaveComplete: false, prompt };
    }

    const nextWaveNum = waveNum + 1;
    const hasNextWave = plan.waves.some((candidate) => candidate.wave === nextWaveNum);
    if (hasNextWave) {
      status.currentWave = nextWaveNum;
      const nextWave = plan.waves.find((candidate) => candidate.wave === nextWaveNum);
      status.waveTaskIds = nextWave ? nextWave.tasks.slice() : [];
    } else {
      status.currentWave = waveNum;
    }
    this.saveStatus(status);

    const priorSummaries = this.collectPriorWaveSummaries(workspaceDir, activeTaskId, plan, waveNum);
    return {
      taskDef: null,
      priorSummaries,
      waveNum,
      isWaveComplete: true,
      prompt: hasNextWave
        ? `Wave ${waveNum} complete. Advance to wave ${nextWaveNum}.`
        : `Wave ${waveNum} complete. All waves exhausted for task ${activeTaskId}.`,
    };
  }

  private collectPriorWaveSummaries(workspaceDir: string, taskId: string, plan: WavePlanInfo, waveNum: number): WaveTaskSummary[] {
    const out: WaveTaskSummary[] = [];
    for (const wave of plan.waves) {
      if (wave.wave >= waveNum) continue;
      for (const subId of wave.tasks) {
        const sum = this.readWaveSummary(workspaceDir, taskId, subId);
        if (sum) out.push(sum);
      }
    }
    return out;
  }

  private buildWavePrompt(task: WaveTaskInfo, waveNum: number, priorCount: number): string {
    const lines: string[] = [];
    lines.push(`[Wave ${waveNum}] ${task.id}: ${task.title}`);
    lines.push(`Scope: ${task.scope}`);
    lines.push(`Action: ${task.action}`);
    if (task.readFirst.length > 0) lines.push(`Read first: ${task.readFirst.join(', ')}`);
    if (task.implementation.length > 0) {
      lines.push('Implementation:');
      for (const step of task.implementation) lines.push(`  - ${step}`);
    }
    if (task.convergence.criteria.length > 0) {
      lines.push('Convergence:');
      for (const criterion of task.convergence.criteria) lines.push(`  - ${criterion}`);
    }
    if (priorCount > 0) lines.push(`Prior wave summaries: ${priorCount}`);
    return lines.join('\n');
  }

  public completeWaveTask(
    parentTaskId: string,
    subTaskId: string,
    status: 'completed' | 'failed' | 'blocked',
    summary: string,
    workspaceDir: string,
  ): { waveComplete: boolean; nextWave?: number } {
    const info = this.readWaveTaskInfo(workspaceDir, parentTaskId, subTaskId);
    if (!info) {
      throw new Error(`Task definition not found for ${subTaskId} under ${parentTaskId}`);
    }
    info.status = status;
    this.writeWaveTaskInfo(workspaceDir, parentTaskId, info);

    const sumDir = path.join(workspaceDir, '.omp-flow', 'tasks', parentTaskId, '.summaries');
    fs.mkdirSync(sumDir, { recursive: true });
    const completedAt = new Date().toISOString();
    const summaryRecord = {
      taskId: subTaskId,
      parentTaskId,
      status,
      executor: info.executor || 'agent',
      summary,
      completedAt,
    };
    const summaryPath = path.join(sumDir, `${subTaskId}-summary.md`);
    const summaryContent = '```json\n' + JSON.stringify(summaryRecord, null, 2) + '\n```\n\n' + summary + '\n';
    fs.writeFileSync(summaryPath, summaryContent, 'utf-8');
    info.summaryPath = summaryPath;
    this.writeWaveTaskInfo(workspaceDir, parentTaskId, info);

    const plan = this.loadWavePlanInfo(workspaceDir, parentTaskId);
    if (!plan) {
      return { waveComplete: false };
    }

    const fsmStatus = this.getStatus();
    const currentWaveNum = typeof fsmStatus.currentWave === 'number' && fsmStatus.currentWave > 0 ? fsmStatus.currentWave : info.wave;
    const wave = plan.waves.find((candidate) => candidate.wave === currentWaveNum);
    if (!wave) {
      return { waveComplete: false };
    }

    const allDone = wave.tasks.every((taskId) => {
      const task = this.readWaveTaskInfo(workspaceDir, parentTaskId, taskId);
      if (!task) return false;
      return task.status === 'completed' || task.status === 'failed' || task.status === 'blocked';
    });
    if (!allDone) {
      return { waveComplete: false };
    }

    const nextWaveNum = currentWaveNum + 1;
    const hasNextWave = plan.waves.some((candidate) => candidate.wave === nextWaveNum);
    if (hasNextWave) {
      const nextWave = plan.waves.find((candidate) => candidate.wave === nextWaveNum);
      fsmStatus.currentWave = nextWaveNum;
      fsmStatus.waveTaskIds = nextWave ? nextWave.tasks.slice() : [];
      fsmStatus.fsmState = 'S_WAVE_DISPATCH';
      fsmStatus.updatedAt = new Date().toISOString();
      this.saveStatus(fsmStatus);
      return { waveComplete: true, nextWave: nextWaveNum };
    }

    fsmStatus.currentWave = currentWaveNum;
    fsmStatus.waveTaskIds = wave.tasks.slice();
    fsmStatus.updatedAt = new Date().toISOString();
    this.saveStatus(fsmStatus);
    return { waveComplete: true };
  }
}
