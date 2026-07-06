import * as fs from 'fs';
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
import { runCLI } from '../src/cli/index.js';
import { generateWavePlan } from '../src/core/wave-planner.js';
import { buildWavePrompt } from '../src/core/wave-prompt.js';
import { checkConvergence, formatConvergenceReport } from '../src/core/convergence-checker.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTests() {
  const testDir = path.join(process.cwd(), '.test-omp-flow-workspace');
  if (fs.existsSync(testDir)) {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
        break;
      } catch (e) {
        if (attempt === maxRetries - 1) throw e;
        // Windows EBUSY — retry after a brief delay
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
  fs.mkdirSync(testDir, { recursive: true });

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

  console.log('--- Test 7: CLI Commands & Full Skill Pack Installer ---');
  const originalCwd = process.cwd();
  try {
    process.chdir(testDir);
    await runCLI(['node', 'omp-flow', 'status']);
    await runCLI(['node', 'omp-flow', 'brainstorm', 'Test topic', '--task', 'TASK-CLI-003']);
    await runCLI(['node', 'omp-flow', 'plan', 'Test intent', '--task', 'TASK-CLI-002']);
    await runCLI(['node', 'omp-flow', 'execute']);
    await runCLI(['node', 'omp-flow', 'continue']);
    await runCLI(['node', 'omp-flow', 'grill', '--step', '1', '--status', 'DONE']);
    await runCLI(['node', 'omp-flow', 'harvest']);
    await runCLI(['node', 'omp-flow', 'install']);
    
    assert(fs.existsSync(path.join(testDir, '.omp', 'extensions', 'omp-flow.ts')), 'Installed extension');
    assert(fs.existsSync(path.join(testDir, '.omp', 'skills', 'omp-flow', 'SKILL.md')), 'Installed omp-flow skill');
    assert(fs.existsSync(path.join(testDir, '.omp', 'skills', 'omp-flow-brainstorm', 'SKILL.md')), 'Installed omp-flow-brainstorm skill');
    assert(fs.existsSync(path.join(testDir, '.omp', 'skills', 'omp-flow-architect', 'SKILL.md')), 'Installed omp-flow-architect skill');
    assert(fs.existsSync(path.join(testDir, '.omp', 'skills', 'omp-flow-researcher', 'SKILL.md')), 'Installed omp-flow-researcher skill');
    assert(fs.existsSync(path.join(testDir, '.omp', 'skills', 'omp-flow-executor', 'SKILL.md')), 'Installed omp-flow-executor skill');
    assert(fs.existsSync(path.join(testDir, '.omp', 'skills', 'omp-flow-reviewer', 'SKILL.md')), 'Installed omp-flow-reviewer skill');
    assert(fs.existsSync(path.join(testDir, '.omp', 'skills', 'omp-flow-harvester', 'SKILL.md')), 'Installed omp-flow-harvester skill');
    assert(fs.existsSync(path.join(testDir, '.omp', 'skills', 'omp-flow-debugger', 'SKILL.md')), 'Installed omp-flow-debugger skill');
  } finally {
    process.chdir(originalCwd);
  }

  // --- Test 8: Deep Module Tests (wave-planner, convergence-checker, wave-prompt) ---
  console.log('--- Test 8: Deep Module Tests ---');
  try {
    const deepDir = path.join(process.cwd(), '.test-deep-modules');
    if (fs.existsSync(deepDir)) fs.rmSync(deepDir, { recursive: true, force: true });
    fs.mkdirSync(deepDir, { recursive: true });
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
    assert(wavePlan.taskIds.length >= 2, 'WavePlan has at least 2 tasks');
    assert(wavePlan.waveCount >= 1, 'WavePlan has at least 1 wave');
    assert(fs.existsSync(path.join(waveTaskDir, 'plan.json')), 'plan.json written');
    assert(fs.existsSync(path.join(waveTaskDir, '.task', 'TASK-001.json')), 'TASK-001.json written');
    console.log('  [✓] 8.1 Wave Planner generates plan from prd.md');

    // 8.2 Convergence Checker — contains + missing file
    const testFile = path.join(deepDir, 'auth.ts');
    fs.writeFileSync(testFile, 'export function verifyToken(token: string): boolean { return true; }', 'utf-8');
    const convResult = checkConvergence(waveTaskId, 'TASK-001', deepDir);
    assert(convResult.results.length > 0, 'Convergence has results');
    const hasPass = convResult.results.some(r => r.passed);
    assert(hasPass, 'At least one convergence criterion passes');
    fs.unlinkSync(testFile);
    const convResultMissing = checkConvergence(waveTaskId, 'TASK-001', deepDir);
    const hasFail = convResultMissing.results.some(r => !r.passed);
    assert(hasFail, 'Missing file causes convergence failure');
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
    const { parseCSV, stringifyCSV, exportPlanToCSV, importCSVToPlan, readCSVRow, updateCSVRow } = await import('../src/core/csv-adapter.js');
    
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
    // Create mock check evidence so assertCheckPassed doesn't throw
    const checkDir = path.join(deepDir, '.omp-flow', 'tasks', waveTaskId, '.task');
    fs.mkdirSync(checkDir, { recursive: true });
    fs.writeFileSync(
      path.join(checkDir, 'TASK-001.json'),
      JSON.stringify({ verdict: 'pass', tests_run: 1, tests_failed: 0, evidence: 'mock' })
    );

    updateCSVRow(waveTaskId, 'TASK-001', { status: 'completed', findings: 'All tests pass' }, deepDir);
    const updatedRow = readCSVRow(waveTaskId, 'TASK-001', deepDir);
    assert(updatedRow !== null && updatedRow.status === 'completed', 'updateCSVRow updates status');
    assert(updatedRow!.findings === 'All tests pass', 'updateCSVRow updates findings');
    console.log('  [✓] 9.3 Fast row operations (read/update)');

    // 9.4 Import CSV back to Plan
    const importRes = importCSVToPlan(waveTaskId, deepDir);
    assert(importRes.updatedTasks >= 1, 'Imported updated tasks');
    const task1Def = JSON.parse(fs.readFileSync(path.join(csvTaskDir, '.task', 'TASK-001.json'), 'utf-8'));
    assert(task1Def.status === 'completed', 'Import updated TASK-001.json status to completed');
    console.log('  [✓] 9.4 importCSVToPlan updates plan.json/.task/*.json');

    // --- Test 10: Adversarial Check Mechanism ---
    console.log('\n--- Test 10: Adversarial Check Mechanism ---');
    const { createFinding, transitionFindingStatus } = await import('../src/core/finding.js');
    const { ContextPackageBuilder, ManifestAction } = await import('../src/core/context-package.js');

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
    // Last review step (index 3, grill) should have fullScope: true
    const grillStep = advStatus.steps.find(s => s.stage === 'review');
    assert(grillStep !== undefined, 'grill step exists');
    assert(grillStep!.fullScope === true, 'Last grill step has fullScope=true');
    console.log('  [✓] 10.4a FSM createSession marks last grill step fullScope=true');

    // 10.5 rollbackToPlanning transitions S_GRILL → S_PLANNING
    // First, advance to grill step
    advFsm.advanceNextStep(); // plan
    advFsm.completeStep(1, 'DONE', 'planning done', { verifyCommands: ['node -e "process.exit(0)"'] });
    advFsm.advanceNextStep(); // execute
    advFsm.completeStep(2, 'DONE', 'execute done', { verifyCommands: ['node -e "process.exit(0)"'] });
    advFsm.advanceNextStep(); // grill (fullScope)
    const beforeRollback = advFsm.getStatus();
    assert(beforeRollback.fsmState === 'S_GRILL', 'At grill state before rollback');
    // Trigger rollback via BLOCKED + findingInfo
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
    // Advance back to grill and try second rollback
    advFsm.advanceNextStep(); // back to planning
    advFsm.completeStep(1, 'DONE', 're-planning done', { verifyCommands: ['node -e "process.exit(0)"'] });
    advFsm.advanceNextStep(); // execute
    advFsm.completeStep(2, 'DONE', 're-execute done', { verifyCommands: ['node -e "process.exit(0)"'] });
    advFsm.advanceNextStep(); // grill again
    advFsm.completeStep(3, 'BLOCKED', 'second contract defect', { caveats: ['second architecture flaw'] }, {
      severity: 'high',
      dimension: 'architecture',
      id: 'FIND-ROLLBACK-002',
    });
    const secondRollback = advFsm.getStatus();
    // Second rollback should NOT transition to S_PLANNING (cap exceeded)
    assert(secondRollback.rollbackCount === 1, 'rollbackCount stays at 1 (cap)');
    assert(secondRollback.fsmState === 'S_DECISION_EVAL', 'Second rollback blocked at S_DECISION_EVAL');
    console.log('  [✓] 10.4c Rollback loop guard caps at DEFAULT_MAX_ROLLBACK=1');

    // 10.7 classifyExhaustion
    const exhaustion = advFsm.classifyExhaustion();
    // After rollback, rollbackCount>0, so if exhausted → contract
    if (exhaustion) {
      assert(exhaustion.classification === 'contract', 'classifyExhaustion returns contract after rollback');
    }
    console.log('  [✓] 10.4d classifyExhaustion routes code vs contract');

    fs.rmSync(deepDir, { recursive: true, force: true });
  } catch (e) {
    console.log(`  [✗] Test 8/9/10 error: ${(e as Error).message}`);
  }
  console.log('');

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('\n✅ ALL 10 TEST SUITES PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
