import * as fs from 'fs';
import * as path from 'path';
import { UnifiedWorkspaceManager } from '../src/maestro-trellis/core/state';
import { RalphFSMEngine } from '../src/maestro-trellis/core/fsm';
import { ContextPackageBuilder } from '../src/maestro-trellis/core/context-package';
import { executeMaestroState } from '../src/maestro-trellis/tools/state-tool';
import { executeMaestroSpecSearch } from '../src/maestro-trellis/tools/spec-search-tool';
import { executeMaestroBoundaryCheck } from '../src/maestro-trellis/tools/drift-check-tool';
import { OMPMaestroTrellisExtension } from '../.omp/extensions/maestro-trellis';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runTests() {
  const testDir = path.join(process.cwd(), '.test-workspace');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  console.log('--- Running Test 1: UnifiedWorkspaceManager ---');
  const stateMgr = new UnifiedWorkspaceManager(testDir);
  stateMgr.initWorkspace();

  assert(fs.existsSync(path.join(testDir, '.trellis')), '.trellis folder created');
  assert(fs.existsSync(path.join(testDir, '.workflow')), '.workflow folder created');

  stateMgr.setActiveTask('TASK-001');
  const state = stateMgr.getUnifiedState();
  assert(state.trellis.activeTask === 'TASK-001', 'activeTask pointer set correctly');
  assert(state.workflow.fsmState === 'S_PARSE_ROUTE', 'default FSM state initialized');

  console.log('--- Running Test 2: RalphFSMEngine ---');
  const fsm = new RalphFSMEngine(testDir);
  const status = fsm.getStatus();
  assert(status.status === 'running', 'Ralph session running');
  assert(status.steps.length > 0, 'Ralph session initialized with steps');

  const nextStep = fsm.advanceNextStep();
  assert(nextStep.stepIdx === 1, 'First step advanced');
  assert(nextStep.isComplete === false, 'Session not complete yet');

  const updatedStatus = fsm.completeStep(1, 'DONE', 'Completed plan step');
  assert(updatedStatus.steps[0].status === 'completed', 'Step 1 marked completed');

  console.log('--- Running Test 3: ContextPackageBuilder ---');
  const taskPrdDir = path.join(testDir, '.trellis', 'tasks', 'TASK-001');
  fs.mkdirSync(taskPrdDir, { recursive: true });
  fs.writeFileSync(path.join(taskPrdDir, 'prd.md'), '# PRD TASK-001\n- Requirement A\n- Requirement B', 'utf-8');

  const pkgBuilder = new ContextPackageBuilder(testDir);
  const pkg = pkgBuilder.buildPackage('TASK-001');
  assert(pkg.requirements.includes('Requirement A'), 'PRD Requirement A loaded');
  assert(fs.existsSync(path.join(testDir, '.workflow', 'scratch', 'TASK-001', 'context-package.json')), 'context-package.json saved');

  console.log('--- Running Test 4: Custom Tools ---');
  const stateToolResult = executeMaestroState({ action: 'get' }, testDir);
  assert(stateToolResult.unifiedState.trellis.activeTask === 'TASK-001', 'maestro_state tool returns activeTask');

  fs.writeFileSync(path.join(testDir, '.workflow', 'specs', 'coding-style.md'), 'Rule: Always use TypeScript.', 'utf-8');
  const searchResults = executeMaestroSpecSearch('TypeScript', testDir);
  assert(searchResults.length > 0, 'maestro_spec_search found matching spec rule');

  const boundaryResult = executeMaestroBoundaryCheck('TASK-001', ['src/valid.ts'], testDir);
  assert(boundaryResult.hasDrift === false, 'maestro_boundary_check confirms valid edit');

  console.log('--- Running Test 5: OMP Extension Hooks ---');
  const ext = new OMPMaestroTrellisExtension(testDir);

  const sessionStartCtx = ext.onSessionStart({ systemPrompt: 'Base System Prompt' });
  assert(sessionStartCtx.systemPrompt?.includes('<maestro-trellis-context>'), 'session_start injects context');

  const beforeAgentCtx = ext.onBeforeAgentStart({ prompt: 'Execute subtask' });
  assert(beforeAgentCtx.subagentPrompt?.includes('<subagent-boundary-context>'), 'before_agent_start wraps subagent prompt');

  const sessionStopCtx = ext.onSessionStop({});
  assert(sessionStopCtx.continue === true, 'session_stop triggers continuation for next step');

  // Clean up
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('\n✅ ALL 5 TEST SUITES PASSED SUCCESSFULLY!');
}

runTests();
