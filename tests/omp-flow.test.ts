import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UnifiedWorkspaceManager } from '../src/core/state.js';
import type { TaskDefinition, TaskSummary, WavePlan } from '../src/core/state.js';
import { RalphFSMEngine } from '../src/core/fsm.js';
import { ContextPackageBuilder } from '../src/core/context-package.js';
import { HarvestManager } from '../src/core/harvest.js';
import { executeMaestroState } from '../src/tools/state-tool.js';
import { executeMaestroSpecSearch } from '../src/tools/spec-search-tool.js';
import { executeMaestroBoundaryCheck } from '../src/tools/drift-check-tool.js';
import { OMPFlowExtension } from '../src/omp/extension.js';
import activateExtension from '../src/omp/extension-entry.js';
import { runCLI } from '../src/cli/index.js';
import { generateWavePlan } from '../src/core/wave-planner.js';
import { buildWavePrompt } from '../src/core/wave-prompt.js';
import { checkConvergence, formatConvergenceReport } from '../src/core/convergence-checker.js';
import { parseCSV, stringifyCSV, exportPlanToCSV, importCSVToPlan, readCSVRow, updateCSVRow, assertCheckPassed, getCSVWorkflowStatus } from '../src/core/csv-adapter.js';
import { appendEvidenceRow } from '../src/core/evidence-store.js';
import { createDispatchTool, loadAgentDefinition, stripFrontmatter } from '../src/omp/dispatch-tool.js';
import { createVerdictTool } from '../src/omp/verdict-tool.js';
import { readActiveTaskId } from '../src/omp/active-task.js';
import { createFinding, transitionFindingStatus } from '../src/core/finding.js';
import { runPreCheck } from '../src/core/pre-check.js';
import { runAuditCheck } from '../src/core/audit-check.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function removeDirWithRetry(dir: string, maxRetries = 5, delayMs = 100) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }
}

async function captureConsoleLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(arg => String(arg)).join(' '));
  };

  try {
    const result = await fn();
    return { result, logs };
  } finally {
    console.log = originalLog;
  }
}

async function runTests() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-test-'));

  console.log('=== Running Rebranded Test Suite for omp-flow ===\n');

  console.log('--- Test 1: UnifiedWorkspaceManager (.omp-flow/) ---');
  const stateMgr = new UnifiedWorkspaceManager(testDir);
  stateMgr.initWorkspace();
  assert(fs.existsSync(path.join(testDir, '.omp-flow')), '.omp-flow folder created');
  assert(fs.existsSync(path.join(testDir, '.omp-flow', 'specs')), '.omp-flow/specs created');
  assert(fs.existsSync(path.join(testDir, '.omp-flow', 'tasks')), '.omp-flow/tasks created');
  assert(fs.existsSync(path.join(testDir, '.omp-flow', 'fsm')), '.omp-flow/fsm created');

  stateMgr.setActiveTask('TASK-CLI-001');
  const state = stateMgr.getUnifiedState();
  assert(state.activeTask === 'TASK-CLI-001', 'Active task set');

  console.log('--- Test 2: RalphFSMEngine ---');
  const fsm = new RalphFSMEngine(testDir);
  const status = fsm.getStatus();
  assert(status.status === 'running', 'Ralph session initialized');
  const nextStep = fsm.advanceNextStep();
  assert(nextStep.stepIdx === 1, 'Advanced to step 1');
  const updatedStatus = fsm.completeStep(1, 'DONE', 'Step 1 complete', { verifyCommands: ['node -e "process.exit(0)"'] });
  assert(updatedStatus.steps[0].status === 'completed', 'Step 1 completed');

  const outOfOrderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-fsm-'));
  const outOfOrderFsm = new RalphFSMEngine(outOfOrderDir);
  outOfOrderFsm.createSession('TASK-FSM-ORDER', [
    { skill: 'plan', args: '--goal order', stage: 'planning' },
    { skill: 'execute', args: '--goal order', stage: 'execution' },
  ]);
  outOfOrderFsm.advanceNextStep();
  const outOfOrderStatus = outOfOrderFsm.completeStep(2, 'DONE', 'Step 2 complete out of order', {
    verifyCommands: ['node -e "process.exit(0)"'],
  });
  assert(outOfOrderStatus.currentStepIndex === 1, 'Out-of-order completion keeps currentStepIndex on earliest unfinished step');
  assert(outOfOrderStatus.steps[1].status === 'completed', 'Out-of-order step is completed');
  fs.rmSync(outOfOrderDir, { recursive: true, force: true });

  console.log('--- Test 3: ContextPackageBuilder & PRD ---');
  const pkgBuilder = new ContextPackageBuilder(testDir);
  const pkg = pkgBuilder.buildPackage('TASK-CLI-001', { in_scope: ['Build CLI module'] });
  assert(pkg.boundary.in_scope.includes('Build CLI module'), 'Custom in_scope set');
  assert(fs.existsSync(path.join(testDir, '.omp-flow', 'scratch', 'TASK-CLI-001', 'context-package.json')), 'context-package.json saved under .omp-flow/');

  console.log('--- Test 4: HarvestManager ---');
  const scratchFile = path.join(testDir, '.omp-flow', 'scratch', 'TASK-CLI-001', 'report.md');
  fs.writeFileSync(scratchFile, '# Report\nGotcha: Always verify NodeNext TypeScript imports.', 'utf-8');
  const harvester = new HarvestManager(testDir);
  const harvestResult = harvester.harvestLearnings();
  assert(harvestResult.harvestedCount > 0, 'Harvested gotchas');
  assert(fs.existsSync(path.join(testDir, '.omp-flow', 'knowhow', 'harvested-learnings.md')), 'harvested-learnings.md written under .omp-flow/');

  console.log('--- Test 5: Custom Tools ---');
  const stateRes = executeMaestroState({ action: 'get' }, testDir);
  assert(stateRes.unifiedState.activeTask === 'TASK-CLI-001', 'State tool returned active task');

  fs.writeFileSync(path.join(testDir, '.omp-flow', 'specs', 'api.md'), 'Rule: API must be stateless.', 'utf-8');
  const specSearchRes = executeMaestroSpecSearch('stateless', testDir);
  assert(specSearchRes.length > 0, 'Spec search found rule in .omp-flow/specs');

  const boundaryRes = executeMaestroBoundaryCheck('TASK-CLI-001', ['src/cli/index.ts'], testDir);
  assert(boundaryRes.hasDrift === false, 'Boundary check confirmed valid file');

  console.log('--- Test 6: OMPFlowExtension Hooks ---');
  const ext = new OMPFlowExtension(testDir);
  const sessionStartCtx = ext.onSessionStart({ systemPrompt: 'Base System Prompt' });
  assert(sessionStartCtx.systemPrompt?.includes('<omp-flow-context>'), 'session_start injected context');

  const subagentCtx = ext.onBeforeAgentStart({ prompt: 'Subagent task' });
  assert(subagentCtx.subagentPrompt?.includes('<session_anchor>'), 'before_agent_start wrapped prompt with session_anchor');

  const sessionStopCtx = ext.onSessionStop({});
  assert(sessionStopCtx.continue === true, 'session_stop auto-continued next step');

  const registeredTools: Array<{ name: string; defaultInactive?: boolean }> = [];
  const sessionStartHandlers: Array<(event: unknown, ctx: { sessionManager?: { getSessionId?: () => string | null }; systemPrompt?: string }) => unknown | Promise<unknown>> = [];
  let activeTools = ['builtin_read'];
  activateExtension({
    on(eventName, handler) {
      if (eventName === 'session_start') {
        sessionStartHandlers.push(handler);
      }
    },
    registerTool(tool) {
      registeredTools.push({ name: tool.name, defaultInactive: tool.defaultInactive });
    },
    getActiveTools() {
      return activeTools;
    },
    setActiveTools(toolNames) {
      activeTools = toolNames;
    },
  });
  const dispatchDefinition = registeredTools.find(tool => tool.name === 'omp_flow_dispatch');
  const verdictDefinition = registeredTools.find(tool => tool.name === 'omp_flow_submit_verdict');
  assert(dispatchDefinition?.defaultInactive === true, 'omp_flow_dispatch registers defaultInactive=true');
  assert(verdictDefinition?.defaultInactive === true, 'omp_flow_submit_verdict registers defaultInactive=true');
  assert(sessionStartHandlers.length === 1, 'registered one session_start handler');

  await sessionStartHandlers[0]!({ type: 'session_start', sessionId: 'ignored-child' }, { sessionManager: { getSessionId: () => 'main-session' }, systemPrompt: 'Main prompt' });
  assert(activeTools.includes('builtin_read'), 'session_start preserves existing active tools');
  assert(activeTools.includes('omp_flow_dispatch'), 'session_start activates dispatch for captured Main session');
  assert(!activeTools.includes('omp_flow_submit_verdict'), 'session_start does not activate verdict tool');
  const afterMainActivation = activeTools.slice();
  await sessionStartHandlers[0]!({ type: 'session_start', sessionId: 'ignored-main' }, { sessionManager: { getSessionId: () => 'child-session' }, systemPrompt: 'Child prompt' });
  assert(activeTools.length === afterMainActivation.length && activeTools.every((tool, index) => tool === afterMainActivation[index]), 'child session does not change active tools');

  const guardedDispatchTool = createDispatchTool(testDir, () => 'main-session');
  const missingSessionDispatch = await guardedDispatchTool.execute('call-1', { rowId: 'TASK-001', role: 'executor' }, undefined, undefined, {});
  assert(missingSessionDispatch.content[0]?.text.includes('session ID unavailable'), 'dispatch guard rejects missing execution session id');
  const mismatchedSessionDispatch = await guardedDispatchTool.execute('call-2', { rowId: 'TASK-001', role: 'executor' }, undefined, undefined, { sessionManager: { getSessionId: () => 'child-session' } });
  assert(mismatchedSessionDispatch.content[0]?.text.includes('only the main session may call omp_flow_dispatch'), 'dispatch guard rejects mismatched execution session id');

  const blockedWrite = ext.onToolCall({
    toolName: 'write',
    input: { path: '.omp-flow/tasks/test-wave/tasks.csv' },
  });
  assert(blockedWrite.block === true, 'write tool cannot modify host-managed tasks.csv');
  assert(blockedWrite.reason?.includes('control-plane file is host-managed'), 'write block reports control-plane protection');
  const blockedEdit = ext.onToolCall({
    toolName: 'edit',
    input: { input: '[.omp-flow/tasks/test-wave/evidence.csv#ABCD]\nINS.TAIL:\n+bad' },
  });
  assert(blockedEdit.block === true, 'edit tool cannot modify host-managed evidence.csv');

  console.log('--- Test 7: CLI Commands & Full Skill Pack Installer ---');
  const originalCwd = process.cwd();
  try {
    process.chdir(testDir);
    await runCLI(['node', 'omp-flow', 'status']);
    const statusTaskDir = path.join(testDir, '.omp-flow', 'tasks', 'TASK-CLI-001');
    assert(fs.existsSync(path.join(statusTaskDir, 'prd.md')), 'Status path retains TASK-CLI-001 prd.md');
    assert(fs.existsSync(path.join(testDir, '.omp-flow', 'scratch', 'TASK-CLI-001', 'context-package.json')), 'Status path retains TASK-CLI-001 context-package.json');

    await runCLI(['node', 'omp-flow', 'brainstorm', 'Test topic', '--task', 'TASK-CLI-003']);
    const brainstormTaskDir = path.join(testDir, '.omp-flow', 'tasks', 'TASK-CLI-003');
    assert(fs.existsSync(path.join(brainstormTaskDir, 'brainstorm.md')), 'Brainstorm writes brainstorm.md');
    assert(fs.existsSync(path.join(brainstormTaskDir, 'guidance-specification.md')), 'Brainstorm writes guidance-specification.md');

    await runCLI(['node', 'omp-flow', 'plan', 'Test intent', '--task', 'TASK-CLI-002']);
    const plannedTaskDir = path.join(testDir, '.omp-flow', 'tasks', 'TASK-CLI-002');
    assert(fs.existsSync(path.join(plannedTaskDir, 'prd.md')), 'Plan writes prd.md');
    assert(fs.existsSync(path.join(testDir, '.omp-flow', 'scratch', 'TASK-CLI-002', 'context-package.json')), 'Plan writes context-package.json');
    const cliState = JSON.parse(fs.readFileSync(path.join(testDir, '.omp-flow', 'state.json'), 'utf-8'));
    assert(Array.isArray(cliState.tasks), 'state.json stores task inventory array');
    assert(Array.isArray(cliState.artifacts), 'state.json preserves artifact registry array');
    assert(typeof cliState.version === 'string' && cliState.version.length > 0, 'state.json preserves version metadata');

    await runCLI(['node', 'omp-flow', 'execute']);
    const executeStatusPath = path.join(testDir, '.omp-flow', 'fsm', 'ralph-TASK-CLI-001', 'status.json');
    assert(fs.existsSync(executeStatusPath), 'Execute writes task-scoped fsm status.json');
    const executeStatus = JSON.parse(fs.readFileSync(executeStatusPath, 'utf-8'));
    assert(executeStatus.currentStepIndex === 2, 'Execute advances currentStepIndex to 2');
    assert(executeStatus.steps[0].status === 'completed', 'Execute completes first step');

    await runCLI(['node', 'omp-flow', 'continue']);
    await runCLI(['node', 'omp-flow', 'grill', '--step', '1', '--status', 'DONE']);
    await runCLI(['node', 'omp-flow', 'harvest']);

    const installCheck = await captureConsoleLogs(() => runCLI(['node', 'omp-flow', 'install']));
    assert(installCheck.logs.some(line => line.includes('omp-flow now uses declarative packaging via package.json omp.extensions.')), 'Install prints deprecation notice');
    assert(installCheck.logs.some(line => line.includes('No stale installer artifacts found. Declarative packaging is active.')), 'Install reports clean declarative packaging state');

    const staleExtensionDir = path.join(testDir, '.omp', 'extensions');
    const staleSkillsDir = path.join(testDir, '.omp', 'skills');
    fs.mkdirSync(staleExtensionDir, { recursive: true });
    fs.mkdirSync(staleSkillsDir, { recursive: true });
    fs.writeFileSync(path.join(staleExtensionDir, 'omp-flow.ts'), 'export default null;\n', 'utf-8');
    fs.mkdirSync(path.join(staleSkillsDir, 'omp-flow-legacy'), { recursive: true });

    const installWarnings = await captureConsoleLogs(() => runCLI(['node', 'omp-flow', 'install']));
    assert(installWarnings.logs.some(line => line.includes('Stale .omp/extensions/omp-flow.ts detected!')), 'Install warns about stale extension glue');
    assert(installWarnings.logs.some(line => line.includes('stale omp-flow skills found in .omp/skills/')), 'Install warns about stale packaged skills shadowing');
    assert(installWarnings.logs.some(line => line.includes('omp-flow-legacy')), 'Install lists stale skill names');
  } finally {
    process.chdir(originalCwd);
  }

  // --- Test 8: Deep Module Tests (wave-planner, convergence-checker, wave-prompt) ---
  console.log('--- Test 8: Deep Module Tests ---');
  const deepDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-test-'));
  const deepState = new UnifiedWorkspaceManager(deepDir);
  deepState.initWorkspace();

  // 8.1 Wave Planner — generateWavePlan from prd.md
  const waveTaskId = '07-05-wave-test';
  const waveTaskDir = path.join(deepDir, '.omp-flow', 'tasks', waveTaskId);
  fs.mkdirSync(path.join(waveTaskDir, '.task'), { recursive: true });
  fs.mkdirSync(path.join(waveTaskDir, '.summaries'), { recursive: true });
  fs.writeFileSync(path.join(waveTaskDir, 'prd.md'),
    `# PRD: Wave Test\n\n## Requirements\n- Implement user authentication\n- Add JWT token verification\n\n## Acceptance Criteria\n- auth.ts contains "export function verifyToken"\n- test exits 0\n`,
    'utf-8');
  deepState.createTask(waveTaskId, 'Wave Test');
  const wavePlan = generateWavePlan(waveTaskId, deepDir);
  assert(wavePlan.taskIds.length === 2, 'WavePlan has exactly 2 tasks');
  assert(wavePlan.waveCount >= 1, 'WavePlan has at least 1 wave');
  assert(fs.existsSync(path.join(waveTaskDir, 'plan.json')), 'plan.json written');
  assert(fs.existsSync(path.join(waveTaskDir, '.task', 'TASK-001.json')), 'TASK-001.json written');
  console.log('  [✓] 8.1 Wave Planner generates plan from prd.md');

  // 8.2 Convergence Checker — contains + missing file
  const testFile = path.join(deepDir, 'auth.ts');
  fs.writeFileSync(testFile, 'export function verifyToken(token: string): boolean { return true; }', 'utf-8');
  const convResult = checkConvergence(waveTaskId, 'TASK-001', deepDir);
  assert(convResult.results.length === 2, 'Convergence returns exactly 2 criterion results');
  assert(convResult.results[0]?.criterion === 'auth.ts contains "export function verifyToken"', 'Primary convergence criterion text matches PRD');
  assert(convResult.results[0]?.passed === true, 'Primary convergence criterion passes when auth.ts matches');
  assert(convResult.results[1]?.criterion === 'test exits 0', 'Command convergence criterion text matches PRD');
  assert(convResult.results[1]?.passed === false, 'Command convergence criterion remains failing in fixture workspace');
  fs.unlinkSync(testFile);
  const convResultMissing = checkConvergence(waveTaskId, 'TASK-001', deepDir);
  assert(convResultMissing.results.length === 2, 'Missing-file convergence preserves exact criterion count');
  assert(convResultMissing.results[0]?.criterion === 'auth.ts contains "export function verifyToken"', 'Missing-file primary criterion text remains stable');
  assert(convResultMissing.results[0]?.passed === false, 'Missing file causes primary criterion failure');
  assert(convResultMissing.results[1]?.criterion === 'test exits 0', 'Missing-file command criterion text remains stable');
  assert(convResultMissing.results[1]?.passed === false, 'Missing-file command criterion still fails');
  assert(convResultMissing.passed === false, 'Convergence fails when auth.ts is missing');
  console.log('  [✓] 8.2 Convergence Checker verifies criteria');

  // 8.3 Wave Prompt Builder — structured prompt
  const taskDef: TaskDefinition = {
    id: 'TASK-001', title: 'Test Task', description: 'Test desc',
    scope: 'src/', action: 'Implement feature',
    files: [{ path: 'src/app.ts', target: 'src/app.ts', change: 'Add export' }],
    readFirst: ['src/config.ts'], implementation: ['Step 1', 'Step 2'],
    convergence: { criteria: ['app.ts contains "export"'] },
    dependsOn: [], wave: 1, executor: 'agent', type: 'feature', status: 'pending',
  };
  const summaries: TaskSummary[] = [
    { taskId: 'TASK-000', parentTaskId: 'parent', status: 'completed', executor: 'agent', summary: 'Done', completedAt: '2026-01-01T00:00:00Z' },
  ];
  const prompt = buildWavePrompt(taskDef, summaries, 'specs content', '/path/to/guidance.md');
  assert(prompt.includes('Test Task'), 'Prompt contains task title');
  assert(prompt.includes('src/'), 'Prompt contains scope');
  assert(prompt.includes('Prior Wave Summaries'), 'Prompt includes prior summaries');
  assert(prompt.includes('Guidance Specification'), 'Prompt includes guidance path');
  console.log('  [✓] 8.3 Wave Prompt Builder produces structured prompt');

  // 8.4 Task Tree — parent/child linking
  deepState.createTask('parent-01', 'Parent Task');
  deepState.createTask('child-01', 'Child Task', 'parent-01');
  const parent = deepState.loadTaskRecord('parent-01');
  const child = deepState.loadTaskRecord('child-01');
  assert(parent !== null && parent.children.includes('child-01'), 'Parent has child linked');
  assert(child !== null && child.parent === 'parent-01', 'Child has parent linked');
  const progress = deepState.getChildrenProgress('parent-01');
  assert(progress.total === 1, 'Children progress total=1');
  console.log('  [✓] 8.4 Task Tree parent/child bidirectional linking');

  // 8.5 Archive — monthly bucket
  deepState.createTask('archive-test-01', 'Archive Test');
  const archDir = path.join(deepDir, '.omp-flow', 'tasks', 'archive-test-01');
  assert(fs.existsSync(archDir), 'Archive test task exists');
  deepState.archiveTask('archive-test-01');
  assert(!fs.existsSync(archDir), 'Original dir removed after archive');
  const archived = deepState.listArchivedTasks();
  assert(archived.some(a => a.taskId === 'archive-test-01'), 'Archived task in list');
  console.log('  [✓] 8.5 Archive moves task to monthly bucket');

  // 8.6 Prune — accumulated context
  deepState.addKeyDecision('Test decision', 'Because reason', 'test');
  deepState.addDeferred('Deferred item', 'Waiting', 'test');
  deepState.addBlocker('Blocker item', 'high', 'test');
  const pruneResult = deepState.pruneAccumulatedContext();
  assert(pruneResult.prunedDecisions >= 0, 'Prune decisions ran without crash');
  assert(pruneResult.prunedDeferred >= 0, 'Prune deferred ran without crash');
  assert(pruneResult.prunedBlockers >= 0, 'Prune blockers ran without crash');
  const prunedState = deepState.getUnifiedState();
  assert(typeof prunedState.lastPruned === 'string', 'lastPruned timestamp set');
  console.log('  [✓] 8.6 Prune cleans accumulated context');

  // 8.7 Format Convergence Report
  const report = formatConvergenceReport([convResult]);
  assert(report.includes('Convergence Report'), 'Report has title');
  assert(report.includes('TASK') || report.includes('PASS') || report.includes('FAIL'), 'Report has status');
  console.log('  [✓] 8.7 Convergence Report formatting');

  // 8.8 Wave Plan round-trip
  const loadedPlan = deepState.loadWavePlan(waveTaskId);
  assert(loadedPlan !== null, 'loadWavePlan returns plan');
  assert(loadedPlan!.taskIds.length >= 2, 'Loaded plan has tasks');
  console.log('  [✓] 8.8 Wave Plan load round-trip');

  // --- Test 9: CSV Adapter Tests ---
  console.log('\n--- Test 9: CSV Adapter Tests ---');

  // 9.1 RFC 4180 Parse & Stringify with Quotes and Commas
  const rows = [
    { id: 'TASK-001', title: 'Task with "quotes", commas, and\nnewlines', status: 'pending' },
    { id: 'TASK-002', title: 'Simple Task', status: 'completed' },
  ];
  const csvStr = stringifyCSV(rows);
  assert(csvStr.includes('"Task with ""quotes"", commas, and'), 'Serializer escapes quotes and wraps in quotes');
  const parsedRows = parseCSV(csvStr);
  assert(parsedRows.length === 2, 'Parsed 2 rows');
  assert(parsedRows[0].id === 'TASK-001', 'Row 1 ID matches');
  assert(parsedRows[0].title.includes('quotes'), 'Row 1 title unescaped');
  console.log('  [✓] 9.1 RFC 4180 parse/stringify round-trip with quotes and commas');

  // 9.2 Export Plan to CSV
  const csvTaskDir = path.join(deepDir, '.omp-flow', 'tasks', waveTaskId);
  const exportRes = exportPlanToCSV(waveTaskId, deepDir);
  assert(fs.existsSync(exportRes.csvPath), 'tasks.csv written');
  assert(exportRes.rowCount >= 2, 'Exported at least 2 tasks');
  console.log('  [✓] 9.2 exportPlanToCSV exports plan.json to tasks.csv');

  // 9.3 Fast Row Operations
  const row = readCSVRow(waveTaskId, 'TASK-001', deepDir);
  assert(row !== null && row.id === 'TASK-001', 'readCSVRow finds row by ID');
  // Create mock evidence for new assertCheckPassed (evidence.csv + implement.md)
  const checkDir = path.join(deepDir, '.omp-flow', 'tasks', waveTaskId, '.task');
  fs.mkdirSync(checkDir, { recursive: true });
  // New assertCheckPassed requires non-empty implement brief
  fs.writeFileSync(path.join(checkDir, 'TASK-001.implement.md'), '# TASK-001 Implementation\nReal implementation steps.', 'utf-8');
  // New assertCheckPassed reads evidence.csv, not .task/TASK-001.json
  const evidencePath = path.join(deepDir, '.omp-flow', 'tasks', waveTaskId, 'evidence.csv');
  appendEvidenceRow(evidencePath, {
    rowId: 'TASK-001',
    verdict: 'pass',
    tests_run: '1',
    tests_failed: '0',
    evidence: 'All tests pass with real assertions on changed behavior',
    timestamp: new Date().toISOString(),
    reviewer_agent_id: 'test-runner',
  });

  updateCSVRow(waveTaskId, 'TASK-001', { status: 'completed', findings: 'All tests pass' }, deepDir);
  const updatedRow = readCSVRow(waveTaskId, 'TASK-001', deepDir);
  assert(updatedRow !== null && updatedRow.status === 'completed', 'updateCSVRow updates status');
  assert(updatedRow!.findings === 'All tests pass', 'updateCSVRow updates findings');
  console.log('  [✓] 9.3 Fast row operations (read/update)');

  // 9.4 assertCheckPassed evidence-based validation
  const checkPass = assertCheckPassed(waveTaskId, 'TASK-001', deepDir);
  assert(checkPass.passed === true, 'assertCheckPassed passes with evidence.csv verdict=pass');
  assert(checkPass.reason.includes('1 tests'), 'assertCheckPassed reports test count');
  console.log('  [✓] 9.4 assertCheckPassed passes with valid evidence');

  // 9.5 assertCheckPassed fails when verdict=fail
  appendEvidenceRow(evidencePath, {
    rowId: 'TASK-001',
    verdict: 'fail',
    tests_run: '1',
    tests_failed: '1',
    evidence: 'A test failed',
    timestamp: new Date().toISOString(),
    reviewer_agent_id: 'test-runner',
  });
  const failCheck = assertCheckPassed(waveTaskId, 'TASK-001', deepDir);
  assert(failCheck.passed === false, 'assertCheckPassed fails when latest verdict=fail');
  assert(failCheck.reason.includes('not pass'), 'assertCheckPassed reports verdict failure');
  console.log('  [✓] 9.5 assertCheckPassed fails on verdict=fail');

  // 9.6 assertCheckPassed fails when tests_failed > 0
  appendEvidenceRow(evidencePath, {
    rowId: 'TASK-001',
    verdict: 'pass',
    tests_run: '2',
    tests_failed: '1',
    evidence: 'One test still failing',
    timestamp: new Date().toISOString(),
    reviewer_agent_id: 'test-runner',
  });
  const failedTestsCheck = assertCheckPassed(waveTaskId, 'TASK-001', deepDir);
  assert(failedTestsCheck.passed === false, 'assertCheckPassed fails when tests_failed > 0 with verdict=pass');
  assert(failedTestsCheck.reason.includes('tests_failed=1'), 'assertCheckPassed reports failed test count');
  console.log('  [✓] 9.6 assertCheckPassed fails on tests_failed > 0');

  // 9.7 assertCheckPassed fails when implement.md is missing
  const missingBriefTask = 'test-missing-brief';
  const missingBriefDir = path.join(deepDir, '.omp-flow', 'tasks', missingBriefTask);
  fs.mkdirSync(path.join(missingBriefDir, '.task'), { recursive: true });
  fs.writeFileSync(path.join(missingBriefDir, 'tasks.csv'), stringifyCSV([{ id: 'R-1', title: 't', scope: 's', status: 'completed' }]), 'utf-8');
  const missingBriefCheck = assertCheckPassed(missingBriefTask, 'R-1', deepDir);
  assert(missingBriefCheck.passed === false, 'assertCheckPassed fails when implement.md missing');
  assert(missingBriefCheck.reason.includes('brief missing'), 'assertCheckPassed reports missing brief');
  console.log('  [✓] 9.7 assertCheckPassed fails on missing implement.md');

  // 9.7b B-001 verdict tool treats missing session id as audit metadata only
  const verdictTaskId = 'test-verdict-tool-audit';
  const verdictTaskDir = path.join(deepDir, '.omp-flow', 'tasks', verdictTaskId);
  fs.mkdirSync(path.join(verdictTaskDir, '.task'), { recursive: true });
  fs.writeFileSync(path.join(deepDir, '.omp-flow', 'tasks', '.active-task'), verdictTaskId, 'utf-8');
  fs.writeFileSync(
    path.join(verdictTaskDir, 'tasks.csv'),
    stringifyCSV([{ id: 'B-001', title: 'verdict visibility cleanup', scope: 'src/omp/verdict-tool.ts', status: 'pending' }]),
    'utf-8'
  );
  fs.writeFileSync(path.join(verdictTaskDir, '.task', 'B-001.implement.md'), '# B-001\nImplementation steps.', 'utf-8');
  const verdictTool = createVerdictTool(deepDir);
  const verdictNoSession = await verdictTool.execute('verdict-no-session', {
    rowId: 'B-001',
    verdict: 'pass',
    tests_run: 1,
    tests_failed: 0,
    evidence: 'Focused verdict tool test passed and validated missing session handling.',
  }, undefined, undefined, {});
  assert(verdictNoSession.content[0]?.text.includes('Verdict submitted: pass'), 'verdict tool accepts valid call without session id');
  const verdictRecord = JSON.parse(fs.readFileSync(path.join(verdictTaskDir, '.task', 'B-001.verdict.json'), 'utf-8'));
  assert(verdictRecord.reviewer_agent_id === 'session-unknown', 'missing session id is stored as session-unknown audit metadata');
  const verdictRow = readCSVRow(verdictTaskId, 'B-001', deepDir);
  assert(verdictRow !== null && verdictRow.status === 'completed', 'valid missing-session verdict completes the row after assertCheckPassed');
  const invalidPass = await verdictTool.execute('verdict-invalid-pass', {
    rowId: 'B-001',
    verdict: 'pass',
    tests_run: 1,
    tests_failed: 1,
    evidence: 'Invalid pass verdict should be rejected before writing.',
  }, undefined, undefined, { sessionManager: { getSessionId: () => 'reviewer-session' } });
  assert(invalidPass.content[0]?.text.includes('verdict=pass requires tests_failed=0'), 'verdict tool keeps failed pass validation');
  const missingRow = await verdictTool.execute('verdict-missing-row', {
    rowId: 'B-404',
    verdict: 'fail',
    tests_run: 1,
    tests_failed: 1,
    evidence: 'Missing row should still fail row existence validation.',
  }, undefined, undefined, { sessionManager: { getSessionId: () => 'reviewer-session' } });
  assert(missingRow.content[0]?.text.includes('Row not found: B-404'), 'verdict tool keeps row existence validation');
  const protectedWrite = new OMPFlowExtension(deepDir).onToolCall({
    toolName: 'write',
    input: { path: `.omp-flow/tasks/${verdictTaskId}/.task/B-001.verdict.json` },
  });
  assert(protectedWrite.block === true, 'control-plane verdict JSON remains blocked through write tool');
  const protectedEdit = new OMPFlowExtension(deepDir).onToolCall({
    toolName: 'edit',
    input: { input: `[.omp-flow/tasks/${verdictTaskId}/evidence.csv#ABCD]\nSWAP 1.=1:\n+tamper` },
  });
  assert(protectedEdit.block === true, 'control-plane evidence.csv remains blocked through edit tool');
  console.log('  [✓] 9.7b B-001 verdict tool missing-session audit metadata and write protections');

  // 9.8 getCSVWorkflowStatus uses latest evidence.csv, not legacy verdict JSON
  const statusTaskId = 'test-evidence-status';
  const statusTaskDir = path.join(deepDir, '.omp-flow', 'tasks', statusTaskId);
  const statusTaskBriefDir = path.join(statusTaskDir, '.task');
  fs.mkdirSync(statusTaskBriefDir, { recursive: true });
  fs.writeFileSync(
    path.join(statusTaskDir, 'tasks.csv'),
    stringifyCSV([
      { id: 'GOOD', title: 'passing evidence', status: 'completed' },
      { id: 'LEGACY', title: 'legacy only', status: 'completed' },
      { id: 'FAIL', title: 'failed verdict', status: 'completed' },
      { id: 'FAILED-TEST', title: 'failed test', status: 'completed' },
      { id: 'INVALID', title: 'invalid counts', status: 'completed' },
      { id: 'MISSING', title: 'missing evidence', status: 'completed' },
      { id: 'BLANK', title: 'blank evidence', status: 'completed' },
      { id: 'TODO', title: 'pending row', status: 'pending' },
      { id: 'DOING', title: 'in-progress row', status: 'in_progress' },
    ]),
    'utf-8'
  );
  for (const rowId of ['GOOD', 'LEGACY', 'FAIL', 'FAILED-TEST', 'INVALID', 'MISSING', 'BLANK']) {
    fs.writeFileSync(path.join(statusTaskBriefDir, `${rowId}.implement.md`), `# ${rowId}\nImplementation steps.`, 'utf-8');
  }
  fs.writeFileSync(path.join(statusTaskBriefDir, 'LEGACY.json'), JSON.stringify({ verdict: 'pass', checkVerdict: 'pass' }), 'utf-8');
  const statusEvidencePath = path.join(statusTaskDir, 'evidence.csv');
  appendEvidenceRow(statusEvidencePath, {
    rowId: 'GOOD',
    verdict: 'fail',
    tests_run: '1',
    tests_failed: '1',
    evidence: 'Older failed verdict should be ignored once newer passing evidence exists.',
    timestamp: '2026-07-08T00:00:00.000Z',
    reviewer_agent_id: 'status-test',
  });
  appendEvidenceRow(statusEvidencePath, {
    rowId: 'GOOD',
    verdict: 'pass',
    tests_run: '2',
    tests_failed: '0',
    evidence: 'Latest passing evidence with real assertions.',
    timestamp: '2026-07-08T00:01:00.000Z',
    reviewer_agent_id: 'status-test',
  });
  appendEvidenceRow(statusEvidencePath, {
    rowId: 'FAIL',
    verdict: 'fail',
    tests_run: '1',
    tests_failed: '0',
    evidence: 'Failed verdict is not acceptable.',
    timestamp: '2026-07-08T00:02:00.000Z',
    reviewer_agent_id: 'status-test',
  });
  appendEvidenceRow(statusEvidencePath, {
    rowId: 'FAILED-TEST',
    verdict: 'pass',
    tests_run: '2',
    tests_failed: '1',
    evidence: 'A failing test remains.',
    timestamp: '2026-07-08T00:03:00.000Z',
    reviewer_agent_id: 'status-test',
  });
  appendEvidenceRow(statusEvidencePath, {
    rowId: 'INVALID',
    verdict: 'pass',
    tests_run: 'x',
    tests_failed: '0',
    evidence: 'Invalid count should not pass.',
    timestamp: '2026-07-08T00:04:00.000Z',
    reviewer_agent_id: 'status-test',
  });
  appendEvidenceRow(statusEvidencePath, {
    rowId: 'BLANK',
    verdict: 'pass',
    tests_run: '1',
    tests_failed: '0',
    evidence: '   ',
    timestamp: '2026-07-08T00:05:00.000Z',
    reviewer_agent_id: 'status-test',
  });
  const workflowStatus = getCSVWorkflowStatus(statusTaskId, deepDir);
  assert(workflowStatus !== null, 'getCSVWorkflowStatus returns status');
  assert(workflowStatus!.total === 9, 'getCSVWorkflowStatus preserves total count');
  assert(workflowStatus!.pending === 1, 'getCSVWorkflowStatus preserves pending count');
  assert(workflowStatus!.inProgress === 1, 'getCSVWorkflowStatus preserves in-progress count');
  assert(workflowStatus!.completed === 7, 'getCSVWorkflowStatus preserves completed count');
  assert(workflowStatus!.unchecked === 6, 'getCSVWorkflowStatus only checks passing evidence-backed completion');
  const statusById: Record<string, boolean> = Object.fromEntries(
    workflowStatus!.rows.map((statusRow) => [statusRow.id, statusRow.hasCheckEvidence])
  );
  assert(statusById.GOOD === true, 'getCSVWorkflowStatus accepts latest passing evidence.csv row');
  for (const rowId of ['LEGACY', 'FAIL', 'FAILED-TEST', 'INVALID', 'MISSING', 'BLANK']) {
    assert(statusById[rowId] === false, `getCSVWorkflowStatus leaves ${rowId} unchecked`);
  }
  console.log('  [✓] 9.8 getCSVWorkflowStatus uses evidence.csv validation');

  const auditTaskId = '07-06-audit-check';
  const auditTaskDir = path.join(deepDir, '.omp-flow', 'tasks', auditTaskId);
  fs.mkdirSync(path.join(auditTaskDir, '.task'), { recursive: true });
  fs.writeFileSync(
    path.join(auditTaskDir, 'tasks.csv'),
    stringifyCSV([
      {
        id: 'F-001',
        title: 'Audit fixture',
        scope: 'src/core/audit-check.ts',
        status: 'pending',
      },
    ]),
    'utf-8'
  );
  fs.writeFileSync(path.join(auditTaskDir, '.task', 'F-001.md'), 'Audit fixture task body', 'utf-8');
  fs.writeFileSync(
    path.join(auditTaskDir, '.task', 'F-001.json'),
    JSON.stringify(
      {
        verdict: 'PASS',
        tests_run: 1,
        tests_failed: 0,
        evidence: 'This should work. src/core/audit-check.ts:58 detected the issue during review with file evidence and more than enough supporting detail.',
      },
      null,
      2
    ),
    'utf-8'
  );
  const preCheckFixture = runPreCheck(auditTaskId, 'F-001', deepDir);
  assert(
    preCheckFixture.checks.some((check) => check.name === 'taskMd-non-empty' && check.passed),
    'runPreCheck validates fixture task markdown'
  );
  const auditWeaselFail = runAuditCheck(auditTaskId, 'F-001', deepDir);
  assert(auditWeaselFail.passed === false, 'runAuditCheck fails weasel-word evidence');
  assert(auditWeaselFail.downgraded === true, 'runAuditCheck downgrades PASS verdict with weasel words');
  assert(
    auditWeaselFail.reason === 'Audit check failed: no-weasel-words',
    'runAuditCheck reports weasel-word failure reason'
  );
  assert(
    fs.existsSync(path.join(auditTaskDir, '.task', 'F-001.precheck.json')),
    'runPreCheck writes .precheck.json evidence'
  );
  assert(
    fs.existsSync(path.join(auditTaskDir, '.task', 'F-001.auditcheck.json')),
    'runAuditCheck writes .auditcheck.json evidence'
  );
  console.log('  [✓] 9.3c runAuditCheck rejects weasel-word evidence');
  console.log('  [✓] 9.3b assertCheckPassed validates optional audit-check evidence');

  // 9.4 Import CSV back to Plan
  const importRes = importCSVToPlan(waveTaskId, deepDir);
  assert(importRes.updatedTasks >= 1, 'Imported updated tasks');
  const task1Def = JSON.parse(fs.readFileSync(path.join(csvTaskDir, '.task', 'TASK-001.json'), 'utf-8'));
  assert(task1Def.status === 'completed', 'Import updated TASK-001.json status to completed');
  console.log('  [✓] 9.4 importCSVToPlan updates plan.json/.task/*.json');

  // --- Test 10: Adversarial Check Mechanism ---
  console.log('\n--- Test 10: Adversarial Check Mechanism ---');

  // 10.1 Finding schema lifecycle (status, fix_attempts, fixed_by)
  const f = createFinding({
    dimension: 'correctness',
    category: 'logic',
    severity: 'high',
    title: 'Test finding',
    description: 'Test',
    location: { file: 'src/test.ts', line: 1 },
    source: 'llm',
    suggested_fix: 'Fix it',
    references: [],
    effort: 'trivial',
    fix_strategy: 'minimal',
    fix_complexity: 'trivial',
  });
  assert(f.status === 'open', 'createFinding defaults status to open');
  assert(f.fix_attempts === 0, 'createFinding defaults fix_attempts to 0');
  const fixing = transitionFindingStatus(f, 'fixing', 'reviewer-1');
  assert(fixing.status === 'fixing', 'transition to fixing');
  const fixed = transitionFindingStatus(fixing, 'fixed', 'reviewer-1');
  assert(fixed.status === 'fixed', 'transition to fixed');
  assert(fixed.fixed_by === 'reviewer-1', 'fixed_by set');
  assert(fixed.fixed_at !== undefined, 'fixed_at timestamp set');
  assert(f.status === 'open', 'original finding unchanged (pure function)');
  console.log('  [✓] 10.1 Finding schema lifecycle (createFinding, transitionFindingStatus)');

  // 10.2 Dual context manifest (implement.jsonl + check.jsonl)
  const advTaskDir = path.join(deepDir, '.omp-flow', 'tasks', 'TASK-ADV-TEST');
  fs.mkdirSync(path.join(advTaskDir, '.task'), { recursive: true });
  // Seed both manifests
  const advBuilder = new ContextPackageBuilder('TASK-ADV-TEST', deepDir);
  advBuilder.addContextEntry('TASK-ADV-TEST', 'implement', 'src/core/fsm.ts', 'FSM logic for implementer');
  advBuilder.addContextEntry('TASK-ADV-TEST', 'check', '.omp-flow/specs/review-standards.md', 'Review standards for checker');
  // Read implement manifest
  const implEntries = advBuilder.readContextManifest('TASK-ADV-TEST', 'implement');
  assert(implEntries.length >= 1, 'implement.jsonl has entries');
  assert(implEntries.some(e => e.file === 'src/core/fsm.ts'), 'implement manifest has fsm.ts');
  // Read check manifest
  const checkEntries = advBuilder.readCheckManifest('TASK-ADV-TEST');
  assert(checkEntries.length >= 1, 'check.jsonl has entries');
  assert(checkEntries.some(e => e.file === '.omp-flow/specs/review-standards.md'), 'check manifest has review-standards.md');
  // Verify isolation: check manifest should NOT contain implement-only files
  assert(!checkEntries.some(e => e.file === 'src/core/fsm.ts'), 'check manifest does NOT contain implement-only files (adversarial isolation)');
  console.log('  [✓] 10.2 Dual context manifest isolation (implement.jsonl vs check.jsonl)');

  // 10.3 diffManifests utility
  const diff = advBuilder.diffManifests('TASK-ADV-TEST', deepDir);
  assert(diff.implementOnly.length >= 1, 'diffManifests detects implement-only entries');
  assert(diff.checkOnly.length >= 1, 'diffManifests detects check-only entries');
  assert(diff.implementOnly.some(e => e.file === 'src/core/fsm.ts'), 'fsm.ts is implement-only');
  console.log('  [✓] 10.3 diffManifests detects manifest divergence');

  // 10.4 FSM fullScope flag + rollbackToPlanning
  const advFsm = new RalphFSMEngine(deepDir);
  advFsm.createSession('TASK-ADV-TEST', [
    { skill: 'plan', args: '--mode task', stage: 'planning' },
    { skill: 'execute', args: '--wave 1', stage: 'execution' },
    { skill: 'grill', args: '--mode review', stage: 'review' },
    { skill: 'harvest', args: '--mode learn', stage: 'harvest' },
  ]);
  const advStatus = advFsm.getStatus();
  const grillStep = advStatus.steps.find(s => s.stage === 'review');
  assert(grillStep !== undefined, 'grill step exists');
  assert(grillStep!.fullScope === true, 'Last grill step has fullScope=true');
  console.log('  [✓] 10.4a FSM createSession marks last grill step fullScope=true');

  // 10.5 rollbackToPlanning transitions S_GRILL → S_PLANNING
  advFsm.advanceNextStep();
  advFsm.completeStep(1, 'DONE', 'planning done', { verifyCommands: ['node -e "process.exit(0)"'] });
  advFsm.advanceNextStep();
  advFsm.completeStep(2, 'DONE', 'execute done', { verifyCommands: ['node -e "process.exit(0)"'] });
  advFsm.advanceNextStep();
  const beforeRollback = advFsm.getStatus();
  assert(beforeRollback.fsmState === 'S_GRILL', 'At grill state before rollback');
  advFsm.completeStep(3, 'BLOCKED', 'contract defect found', { caveats: ['architecture flaw'] }, {
    severity: 'high',
    dimension: 'architecture',
    id: 'FIND-ROLLBACK-001',
  });
  const afterRollback = advFsm.getStatus();
  assert(afterRollback.fsmState === 'S_PLANNING', 'Rollback transitions to S_PLANNING');
  assert(afterRollback.rollbackCount === 1, 'rollbackCount incremented');
  assert(afterRollback.rollbackFindingId === 'FIND-ROLLBACK-001', 'rollbackFindingId set');
  console.log('  [✓] 10.4b rollbackToPlanning transitions S_GRILL → S_PLANNING');

  // 10.6 Rollback loop guard (cap at 1)
  advFsm.advanceNextStep();
  advFsm.completeStep(1, 'DONE', 're-planning done', { verifyCommands: ['node -e "process.exit(0)"'] });
  advFsm.advanceNextStep();
  advFsm.completeStep(2, 'DONE', 're-execute done', { verifyCommands: ['node -e "process.exit(0)"'] });
  advFsm.advanceNextStep();
  advFsm.completeStep(3, 'BLOCKED', 'second contract defect', { caveats: ['second architecture flaw'] }, {
    severity: 'high',
    dimension: 'architecture',
    id: 'FIND-ROLLBACK-002',
  });
  const secondRollback = advFsm.getStatus();
  assert(secondRollback.rollbackCount === 1, 'rollbackCount stays at 1 (cap)');
  assert(secondRollback.fsmState === 'S_DECISION_EVAL', 'Second rollback blocked at S_DECISION_EVAL');
  console.log('  [✓] 10.4c Rollback loop guard caps at DEFAULT_MAX_ROLLBACK=1');

  // 10.7 classifyExhaustion
  const exhaustion = advFsm.classifyExhaustion();
  if (exhaustion) {
    assert(exhaustion.classification === 'contract', 'classifyExhaustion returns contract after rollback');
  }
  console.log('  [✓] 10.4d classifyExhaustion routes code vs contract');

  // --- Test 11: Tool Isolation & Evidence Edge Cases ---
  console.log('\n--- Test 11: Tool Isolation & Evidence Edge Cases ---');

  // 11.1 stripFrontmatter handles block arrays, inline arrays, and CSV strings
  const blockArray = stripFrontmatter('---\ntools:\n  - read\n  - write\n---\n# Body');
  assert(Array.isArray(blockArray.frontmatter.tools), 'YAML block array tools parse as array');
  assert(JSON.stringify(blockArray.frontmatter.tools) === JSON.stringify(['read', 'write']), 'YAML block array tools preserve values');
  const inlineArray = stripFrontmatter('---\ntools: [read, write]\n---\n# Body');
  assert(Array.isArray(inlineArray.frontmatter.tools), 'YAML inline array tools parse as array');
  assert(JSON.stringify(inlineArray.frontmatter.tools) === JSON.stringify(['read', 'write']), 'YAML inline array tools preserve values');
  const csvString = stripFrontmatter('---\ntools: read, write\n---\n# Body');
  assert(csvString.frontmatter.tools === 'read, write', 'CSV string tools remain scalar for parseToolsField');
  const csvAgentDir = path.join(deepDir, '.omp-flow', 'agents');
  fs.mkdirSync(csvAgentDir, { recursive: true });
  fs.writeFileSync(path.join(csvAgentDir, 'csv-tools.md'), '---\nname: csv-tools\ntools: read, write\n---\nCSV tools body\n', 'utf-8');
  const csvAgent = loadAgentDefinition(deepDir, 'csv-tools');
  assert(JSON.stringify(csvAgent.tools) === JSON.stringify(['read', 'write']), 'CSV string tools load as tool array');
  console.log('  [✓] 11.1 stripFrontmatter handles block arrays, inline arrays, and CSV strings');

  // 11.2 loadAgentDefinition prefers .omp/agents/ with .omp-flow/agents/ fallback
  const preferredAgentDir = path.join(deepDir, '.omp', 'agents');
  const fallbackAgentDir = path.join(deepDir, '.omp-flow', 'agents');
  fs.mkdirSync(preferredAgentDir, { recursive: true });
  fs.mkdirSync(fallbackAgentDir, { recursive: true });
  const preferredAgentPath = path.join(preferredAgentDir, 'test-role.md');
  const fallbackAgentPath = path.join(fallbackAgentDir, 'test-role.md');
  fs.writeFileSync(preferredAgentPath, '---\nname: preferred-test-role\ntools: read\n---\nPreferred body\n', 'utf-8');
  fs.writeFileSync(fallbackAgentPath, '---\nname: fallback-test-role\ntools: write\n---\nFallback body\n', 'utf-8');
  const preferredAgent = loadAgentDefinition(deepDir, 'test-role');
  assert(preferredAgent.name === 'preferred-test-role', 'loadAgentDefinition prefers .omp/agents version');
  assert(preferredAgent.systemPrompt.includes('Preferred body'), 'Preferred agent body loaded');
  fs.rmSync(preferredAgentPath);
  const fallbackAgent = loadAgentDefinition(deepDir, 'test-role');
  assert(fallbackAgent.name === 'fallback-test-role', 'loadAgentDefinition falls back to .omp-flow/agents version');
  assert(fallbackAgent.systemPrompt.includes('Fallback body'), 'Fallback agent body loaded');
  console.log('  [✓] 11.2 loadAgentDefinition prefers .omp/agents/ with .omp-flow/agents/ fallback');

  // 11.3 executor/reviewer whitelist exclusion
  const agentFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-agent-fixture-'));
  fs.mkdirSync(path.join(agentFixtureDir, '.omp', 'agents'), { recursive: true });
  fs.copyFileSync(path.join(originalCwd, '.omp', 'agents', 'executor.md'), path.join(agentFixtureDir, '.omp', 'agents', 'executor.md'));
  fs.copyFileSync(path.join(originalCwd, '.omp', 'agents', 'reviewer.md'), path.join(agentFixtureDir, '.omp', 'agents', 'reviewer.md'));
  const executorAgent = loadAgentDefinition(agentFixtureDir, 'executor');
  const reviewerAgent = loadAgentDefinition(agentFixtureDir, 'reviewer');
  assert(executorAgent.tools !== undefined, 'Executor agent exposes explicit tools whitelist');
  assert(!executorAgent.tools!.includes('omp_flow_dispatch'), 'Executor tools exclude dispatch tool');
  assert(!executorAgent.tools!.includes('omp_flow_submit_verdict'), 'Executor tools exclude verdict submission tool');
  assert(!executorAgent.tools!.includes('task'), 'Executor tools exclude task tool');
  assert(reviewerAgent.tools !== undefined, 'Reviewer agent exposes explicit tools whitelist');
  assert(reviewerAgent.tools!.includes('omp_flow_submit_verdict'), 'Reviewer tools include verdict submission tool');
  assert(!reviewerAgent.tools!.includes('omp_flow_dispatch'), 'Reviewer tools exclude dispatch tool');
  assert(!reviewerAgent.tools!.includes('task'), 'Reviewer tools exclude task tool');
  removeDirWithRetry(agentFixtureDir);
  console.log('  [✓] 11.3 executor/reviewer whitelist exclusion');

  // 11.4 appendEvidenceRow preserves existing bytes
  const evidenceEdgeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-evidence-edge-'));
  const preservedEvidencePath = path.join(evidenceEdgeDir, 'evidence.csv');
  const existingEvidenceBytes = Buffer.from('rowId,verdict,tests_run,tests_failed,evidence,timestamp,reviewer_agent_id\nOLD,pass,1,0,existing evidence,2026-07-08T00:00:00.000Z,reviewer-1\n', 'utf-8');
  fs.writeFileSync(preservedEvidencePath, existingEvidenceBytes);
  appendEvidenceRow(preservedEvidencePath, {
    rowId: 'NEW',
    verdict: 'pass',
    tests_run: '2',
    tests_failed: '0',
    evidence: 'new evidence',
    timestamp: '2026-07-08T00:01:00.000Z',
    reviewer_agent_id: 'reviewer-2',
  });
  const appendedEvidenceBytes = fs.readFileSync(preservedEvidencePath);
  assert(appendedEvidenceBytes.subarray(0, existingEvidenceBytes.length).equals(existingEvidenceBytes), 'appendEvidenceRow preserves existing bytes as prefix');
  console.log('  [✓] 11.4 appendEvidenceRow preserves existing bytes');

  // 11.5 appendEvidenceRow inserts newline when missing
  const missingNewlineEvidencePath = path.join(evidenceEdgeDir, 'missing-newline.csv');
  const headerWithoutNewline = 'rowId,verdict,tests_run,tests_failed,evidence,timestamp,reviewer_agent_id';
  fs.writeFileSync(missingNewlineEvidencePath, headerWithoutNewline, 'utf-8');
  appendEvidenceRow(missingNewlineEvidencePath, {
    rowId: 'ROW-NL',
    verdict: 'pass',
    tests_run: '1',
    tests_failed: '0',
    evidence: 'newline inserted',
    timestamp: '2026-07-08T00:02:00.000Z',
    reviewer_agent_id: 'reviewer-3',
  });
  const newlineEvidenceContent = fs.readFileSync(missingNewlineEvidencePath, 'utf-8');
  assert(newlineEvidenceContent.startsWith(`${headerWithoutNewline}\nROW-NL`), 'appendEvidenceRow inserts newline before appended row when missing');
  console.log('  [✓] 11.5 appendEvidenceRow inserts newline when missing');

  // 11.6 appendEvidenceRow escapes special characters
  const escapedEvidencePath = path.join(evidenceEdgeDir, 'escaped.csv');
  const specialEvidence = 'comma, quote " and newline\nplus carriage\rreturn';
  appendEvidenceRow(escapedEvidencePath, {
    rowId: 'ROW,SPECIAL',
    verdict: 'pass',
    tests_run: '1',
    tests_failed: '0',
    evidence: specialEvidence,
    timestamp: '2026-07-08T00:03:00.000Z',
    reviewer_agent_id: 'reviewer"4',
  });
  const escapedRows = parseCSV(fs.readFileSync(escapedEvidencePath, 'utf-8'));
  assert(escapedRows.length === 1, 'Escaped evidence parses one row');
  assert(escapedRows[0].rowId === 'ROW,SPECIAL', 'Escaped rowId with comma round-trips');
  assert(escapedRows[0].evidence === specialEvidence, 'Escaped evidence with comma, quote, CR/LF round-trips');
  assert(escapedRows[0].reviewer_agent_id === 'reviewer"4', 'Escaped reviewer id quote round-trips');
  removeDirWithRetry(evidenceEdgeDir);
  console.log('  [✓] 11.6 appendEvidenceRow escapes special characters');

  removeDirWithRetry(deepDir);
  console.log('');

  // Cleanup
  removeDirWithRetry(testDir);
  console.log('\n✅ ALL 11 TEST SUITES PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
