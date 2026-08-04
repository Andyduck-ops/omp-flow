import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  formatOMPFlowStatusCompact,
  OMPFlowStatusAdapter,
  probeOMPFlowStatusCapability,
  registerOMPFlowStatus,
  type OMPFlowStatusContext,
  type OMPFlowStatusProcessRunner,
} from '../src/omp/flow-status.js';

type Check = (condition: unknown, message: string) => void;
type FixtureEvent = Record<string, unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fakeSnapshot(document: Record<string, unknown>): Record<string, unknown> {
  const taskSet = document.taskSet as Record<string, unknown>;
  if (taskSet.state !== 'available') {
    return {
      version: 1,
      taskSet: {
        state: 'unavailable',
        reason: taskSet.reason,
        capability: 'ompTaskBatchV1',
      },
      currentTask: null,
      attention: [],
    };
  }
  const members = taskSet.members as Array<Record<string, unknown>>;
  const counts = { completed: 0, active: 0, pending: 0, failed: 0 };
  for (const member of members) counts[member.state as keyof typeof counts] += 1;
  const current = members.find(member => member.taskId === taskSet.currentTaskId);
  const rawAssignment = record(document.assignment) ? document.assignment : null;
  const positions: Record<string, string | null> = {
    executor: 'Implement',
    reviewer: 'Review',
    researcher: 'Research',
    architect: 'Design',
    'qbd-auditor': 'QbD',
    planner: 'Plan',
    explore: null,
    oracle: null,
    orchestrator: null,
  };
  return {
    version: 1,
    taskSet: {
      state: 'available',
      ...counts,
      total: members.length,
    },
    currentTask: current
      ? {
          label: current.label,
          assignment: rawAssignment
            ? {
                role: rawAssignment.nativeRole,
                methodologyPosition: positions[String(rawAssignment.nativeRole)] ?? null,
              }
            : null,
          progress: null,
        }
      : null,
    attention: document.attention,
  };
}

export function runOMPFlowStatusTests(root: string, check: Check): void {
  console.log('--- native Oh My Pi Flow Status');
  const fixturePath = path.join(
    process.cwd(),
    'tests',
    'fixtures',
    'flow-status',
    'oh-my-pi-task-events-v17.2.1.json',
  );
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    scenarios: Array<Record<string, unknown>>;
  };
  const scenario = (name: string): Record<string, unknown> => {
    const found = fixture.scenarios.find(item => item.name === name);
    assert(found, `missing fixture ${name}`);
    return found;
  };
  const observations: Array<Record<string, unknown>> = [];
  const processCalls: Array<{ command: string; args: string[]; input: string }> = [];
  let stale = false;
  const fakeRunner: OMPFlowStatusProcessRunner = (command, args, options) => {
    processCalls.push({ command, args, input: options.input });
    if (args.includes('observe')) {
      const document = JSON.parse(options.input) as Record<string, unknown>;
      observations.push(document);
      return {
        status: 0,
        stdout: JSON.stringify({ version: 1, state: 'stored', snapshot: fakeSnapshot(document) }),
        stderr: '',
      };
    }
    if (args.includes('--json')) {
      return {
        status: 0,
        stdout: JSON.stringify({
          version: 1,
          state: 'degraded',
          snapshot: {
            version: 1,
            taskSet: { state: 'unavailable', reason: stale ? 'stale' : 'disconnected' },
            currentTask: null,
            attention: [],
          },
        }),
        stderr: '',
      };
    }
    return { status: 0, stdout: 'Flow Status: available (fresh)\nTasks: 1/2 complete', stderr: '' };
  };
  const statuses: Array<{ key: string; text: string | undefined }> = [];
  let timer: (() => void) | null = null;
  const ctx: OMPFlowStatusContext = {
    sessionManager: { getSessionId: () => 'fixture-session' },
    ui: {
      setStatus: (key, text) => statuses.push({ key, text }),
      notify: () => undefined,
    },
    setTimeout: callback => {
      timer = () => callback();
      return timer;
    },
    clearTimer: () => {
      timer = null;
    },
  };
  const adapter = new OMPFlowStatusAdapter(root, { now: () => 1_900_000_000_000, runProcess: fakeRunner });
  adapter.onSessionStart(ctx);
  const flat = scenario('flat-single-task-running-snapshot').events as FixtureEvent[];
  adapter.onToolExecutionStart(flat[0], ctx);
  adapter.onToolExecutionUpdate(flat[1], ctx);
  const flatDocument = observations.at(-1);
  assert(flatDocument);
  const flatTaskSet = flatDocument.taskSet as Record<string, unknown>;
  check(flatTaskSet.state === 'available', 'flat fixture becomes an available complete observation');
  check(
    (flatTaskSet.evidence as Record<string, unknown>).piVersion === '17.2.1'
      && (flatTaskSet.evidence as Record<string, unknown>).upstreamRevision
        === '7a2ced50bea8b97dbab7d9bd579329c4ea704de0',
    'positive observation pins the exact version and upstream revision',
  );
  check(
    Array.isArray(flatTaskSet.members)
      && (flatTaskSet.members as Array<Record<string, unknown>>)[0]?.taskId === 'worker-single',
    'flat fixture preserves the native allocated member identity',
  );
  check(
    statuses.at(-1)?.text?.includes('tasks ░░░░░ 0/1') === true
      && statuses.at(-1)?.text?.includes('executor·implement') === true,
    'flat fixture renders one compact native task bar and explicit role position',
  );

  const batchAdapter = new OMPFlowStatusAdapter(root, { now: () => 1_900_000_000_100, runProcess: fakeRunner });
  batchAdapter.onSessionStart(ctx);
  const batch = scenario('complete-batch-running-snapshot').events as FixtureEvent[];
  batchAdapter.onToolExecutionStart(batch[0], ctx);
  batchAdapter.onToolExecutionUpdate(batch[1], ctx);
  const batchDocument = observations.at(-1);
  assert(batchDocument);
  const batchTaskSet = batchDocument.taskSet as Record<string, unknown>;
  check(
    (batchTaskSet.members as Array<Record<string, unknown>>).map(item => item.state).join(',') === 'completed,active'
      && batchTaskSet.currentTaskId === 'worker-b',
    'batch fixture replaces the whole indexed state and selects the sole running member',
  );
  check(
    (batchDocument.assignment as Record<string, unknown>).nativeRole === 'reviewer'
      && batchDocument.progress === null,
    'native role is explicit while unsupported current-task denominators remain absent',
  );

  const terminal = scenario('terminal-failed-and-aborted').event as FixtureEvent;
  batchAdapter.onToolExecutionEnd(terminal, ctx);
  const terminalDocument = observations.at(-1);
  assert(terminalDocument);
  check(
    (terminalDocument.taskSet as Record<string, unknown>).currentTaskId === null
      && (terminalDocument.attention as unknown[]).length === 2,
    'failed and aborted terminals become failed members with bounded attention',
  );

  const incompleteAdapter = new OMPFlowStatusAdapter(root, {
    now: () => 1_900_000_000_200,
    runProcess: fakeRunner,
  });
  incompleteAdapter.onSessionStart(ctx);
  incompleteAdapter.onToolExecutionStart(batch[0], ctx);
  const partial = scenario('partial-progress-is-unavailable').progress;
  incompleteAdapter.onToolExecutionUpdate({
    type: 'tool_execution_update',
    toolCallId: 'tc-flow-001',
    toolName: 'task',
    partialResult: { details: { progress: partial } },
  }, ctx);
  check(
    (observations.at(-1)?.taskSet as Record<string, unknown>).reason === 'incomplete',
    'partial progress remains unavailable instead of manufacturing a denominator',
  );
  incompleteAdapter.onToolExecutionUpdate({
    type: 'tool_execution_update',
    toolCallId: 'tc-flow-001',
    toolName: 'task',
    partialResult: {
      details: {
        progress: (batch[1].partialResult as Record<string, unknown> & {
          details: { progress: Array<Record<string, unknown>> };
        }).details.progress.map((item, index) => index === 0 ? { ...item, id: 'mismatched-id' } : item),
      },
    },
  }, ctx);
  check(
    (observations.at(-1)?.taskSet as Record<string, unknown>).reason === 'incomplete',
    'input/progress identity mismatch fails closed',
  );

  const concurrentAdapter = new OMPFlowStatusAdapter(root, {
    now: () => 1_900_000_000_300,
    runProcess: fakeRunner,
  });
  concurrentAdapter.onSessionStart(ctx);
  concurrentAdapter.onToolExecutionStart(batch[0], ctx);
  concurrentAdapter.onToolExecutionStart({
    type: 'tool_execution_start',
    toolCallId: 'tc-flow-002',
    toolName: 'task',
    args: { name: 'other', agent: 'executor', task: 'Unselected task' },
  }, ctx);
  const beforeUnselectedUpdate = observations.length;
  concurrentAdapter.onToolExecutionUpdate({
    type: 'tool_execution_update',
    toolCallId: 'tc-flow-002',
    toolName: 'task',
    partialResult: { details: { progress: [] } },
  }, ctx);
  check(
    observations.length === beforeUnselectedUpdate
      && (observations.at(-1)?.taskSet as Record<string, unknown>).reason === 'incomplete',
    'a concurrent unselected call cannot contaminate or replace the selected observation',
  );

  stale = true;
  assert(timer, 'accepted observation should schedule a bounded freshness refresh');
  const fireTimer = timer as () => void;
  fireTimer();
  check(statuses.at(-1)?.text === 'tasks stale', 'freshness expiry removes current authority visibly');
  check(
    processCalls.every(call => Array.isArray(call.args))
      && processCalls.filter(call => call.args.includes('observe')).every(call => call.input.startsWith('{')),
    'adapter calls the portable boundary with argument arrays and UTF-8 JSON on stdin',
  );

  const utf8Text = formatOMPFlowStatusCompact({
    snapshot: {
      taskSet: { state: 'available', completed: 1, total: 2, failed: 0 },
      currentTask: { label: '解析器状态任务很长但仍然安全', assignment: null },
      attention: [],
    },
  });
  check(utf8Text?.includes('解析器状态任务') === true, 'compact formatting preserves UTF-8 task labels');
  check(
    formatOMPFlowStatusCompact({
      snapshot: {
        taskSet: { state: 'unavailable', reason: 'unsupported' },
        currentTask: null,
        attention: [],
      },
    }) === undefined,
    'unsupported data with no attention is semantic empty',
  );
  check(
    statuses.every(item => item.key === 'flow-status')
      && statuses.filter(item => item.text).every(item => !/\bOMP\b|omp:|\bBundle\b/i.test(item.text ?? '')),
    'adapter writes only its namespaced key and injects no product branding',
  );

  check(
    probeOMPFlowStatusCapability({ pi: { VERSION: '16.4.4' } }).reason === 'unsupported-version',
    'older versions fail closed',
  );
  check(
    probeOMPFlowStatusCapability({ pi: { VERSION: '17.2.1' }, on: () => undefined }).reason === 'missing-api',
    'missing public capabilities fail closed',
  );
  let registrations = 0;
  check(
    registerOMPFlowStatus({
      pi: { VERSION: '17.2.1' },
      on: () => undefined,
      getCommands: () => [{ name: 'flow-status' }],
      registerCommand: () => { registrations += 1; },
    }, root).reason === 'command-conflict' && registrations === 0,
    'a foreign command conflict is preserved without an alias',
  );
  const handlers = new Map<string, (event: unknown, context: OMPFlowStatusContext) => unknown>();
  let command: { handler: (args: string, context: OMPFlowStatusContext) => Promise<void> } | null = null;
  const capability = registerOMPFlowStatus({
    pi: { VERSION: '17.2.1' },
    on: (name, handler) => handlers.set(name, handler),
    getCommands: () => [],
    registerCommand: (_name, options) => { command = options; },
  }, root, { runProcess: fakeRunner });
  check(
    capability.supported
      && handlers.has('tool_execution_start')
      && handlers.has('session_before_switch')
      && handlers.has('session_switch')
      && handlers.has('session_shutdown')
      && command !== null,
    'the exact pinned public surface registers structured events, transition rebind, cleanup, and one detail command',
  );
  assert(command);
  const transitionCallsAtStart = processCalls.length;
  const oldStatuses: Array<{ key: string; text: string | undefined }> = [];
  const newStatuses: Array<{ key: string; text: string | undefined }> = [];
  const notices: string[] = [];
  const oldContext: OMPFlowStatusContext = {
    sessionManager: { getSessionId: () => 'session-old' },
    ui: { setStatus: (key, text) => oldStatuses.push({ key, text }) },
  };
  const newContext: OMPFlowStatusContext = {
    sessionManager: { getSessionId: () => 'session-new' },
    ui: {
      notify: message => notices.push(message),
      setStatus: (key, text) => newStatuses.push({ key, text }),
    },
  };
  handlers.get('session_start')?.({ type: 'session_start' }, oldContext);
  handlers.get('session_before_switch')?.({
    type: 'session_before_switch',
    reason: 'new',
  }, oldContext);
  handlers.get('session_switch')?.({
    type: 'session_switch',
    reason: 'new',
    previousSessionFile: undefined,
  }, newContext);
  handlers.get('tool_execution_start')?.(flat[0], newContext);
  handlers.get('tool_execution_update')?.(flat[1], newContext);
  void command.handler('', newContext);
  const transitionCalls = processCalls.slice(transitionCallsAtStart);
  const transitionObservation = transitionCalls
    .filter(call => call.args.includes('observe'))
    .map(call => JSON.parse(call.input) as Record<string, unknown>)
    .at(-1);
  check(
    oldStatuses.some(item => item.key === 'flow-status' && item.text === undefined)
      && oldStatuses.every(item => item.key === 'flow-status')
      && newStatuses.at(-1)?.text?.includes('0/1') === true
      && newStatuses.every(item => item.key === 'flow-status'),
    'session transition clears only the adapter-owned old contribution and restores it in the new session',
  );
  check(
    (transitionObservation?.taskSet as Record<string, unknown>).hostSessionId === 'session-new'
      && transitionCalls.filter(call => call.args.includes('observe')).every(call => !call.args.includes('session-old')),
    'post-switch task events observe only the rebound session scope',
  );
  check(
    notices[0]?.startsWith('Flow Status: available') === true
      && transitionCalls.at(-1)?.args.includes('inspect') === true
      && transitionCalls.at(-1)?.args.includes('session-new') === true
      && !transitionCalls.at(-1)?.args.some(arg => ['archive', 'finish', 'clear'].includes(arg)),
    'the rebound native detail command invokes only read-only inspection for the new session',
  );

  const realStatuses: Array<string | undefined> = [];
  const realAdapter = new OMPFlowStatusAdapter(root);
  const realCtx: OMPFlowStatusContext = {
    sessionManager: { getSessionId: () => 'omp-adapter-real' },
    ui: { setStatus: (_key, text) => realStatuses.push(text) },
  };
  realAdapter.onSessionStart(realCtx);
  realAdapter.onToolExecutionStart(flat[0], realCtx);
  realAdapter.onToolExecutionUpdate(flat[1], realCtx);
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const inspect = spawnSync(
    python,
    [
      '-X', 'utf8',
      path.join(root, '.omp-flow', 'scripts', 'omp_flow.py'),
      '--cwd', root,
      'status', 'inspect',
      '--host', 'oh-my-pi',
      '--session', 'omp-adapter-real',
      '--json',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  const inspected = JSON.parse(inspect.stdout) as Record<string, unknown>;
  check(
    inspect.status === 2
      && record(inspected.snapshot)
      && record(inspected.snapshot.nativeActivity)
      && (inspected.snapshot.nativeActivity.taskSet as Record<string, unknown>).total === 1
      && realStatuses.at(-1)?.includes('native tasks') === true
      && realStatuses.at(-1)?.includes('0/1') === true,
    'pinned fixture crosses the real status observe boundary without borrowing native counts as root Flow',
  );
}
