import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { deployInitResources } from '../src/cli/init.js';
import { interactiveUpdate } from '../src/cli/update.js';
import { computeHash, loadHashes, saveHashes } from '../src/cli/template-hash.js';
import { OMPFlowExtension } from '../src/omp/extension.js';
import activateExtension from '../src/omp/extension-entry.js';
import { loadAgentDefinition } from '../src/omp/agent-loader.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('Assertion Failed: ' + message);
}

function pythonCommand(): string {
  return process.platform === 'win32' ? 'python' : 'python3';
}

function runPython(
  root: string,
  args: string[],
  env: Record<string, string> = {},
  input = '',
): string {
  const script = path.join(root, '.omp-flow', 'scripts', 'omp_flow.py');
  return execFileSync(
    pythonCommand(),
    ['-X', 'utf8', script, '--cwd', root, ...args],
    {
      cwd: root,
      input,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    },
  ).trim();
}

function runPythonJson<T>(
  root: string,
  args: string[],
  env: Record<string, string> = {},
  input = '',
): T {
  return JSON.parse(runPython(root, args, env, input)) as T;
}

function expectPythonFailure(
  root: string,
  args: string[],
  expected: string,
  env: Record<string, string> = {},
): void {
  const script = path.join(root, '.omp-flow', 'scripts', 'omp_flow.py');
  const result = spawnSync(
    pythonCommand(),
    ['-X', 'utf8', script, '--cwd', root, ...args],
    { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } },
  );
  assert(result.status === 2, 'Python command fails with workflow exit code');
  assert(result.stderr.includes(expected), 'Python failure includes: ' + expected);
}

function readCsv(root: string, taskId: string): string {
  return fs.readFileSync(path.join(root, '.omp-flow', 'tasks', taskId, 'tasks.csv'), 'utf8');
}

async function runTests(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-portable-'));
  fs.mkdirSync(path.join(root, '.git'));

  try {
    console.log('--- Test 1: project init deploys portable core and Harness adapters ---');
    const initPlan = deployInitResources({ cwd: root, force: true });
    assert(initPlan.some(entry => entry.displayPath.includes('omp_flow.py')), 'Python core is managed');
    assert(fs.existsSync(path.join(root, '.codex', 'hooks.json')), 'Codex hooks deployed');
    assert(!fs.existsSync(path.join(root, '.omp-flow', 'scripts', 'get_context.py')), 'Compatibility wrapper is not deployed');
    assert(fs.existsSync(path.join(root, '.omp-flow', 'scripts', 'common', 'topology.py')), 'Topology module deployed');
    const hooks = fs.readFileSync(path.join(root, '.codex', 'hooks.json'), 'utf8');
    assert(!hooks.includes('{{PYTHON_CMD}}'), 'Codex hook Python command is rendered');
    const obsoletePath = path.join(root, '.omp-flow', 'scripts', 'get_context.py');
    const obsoleteContent = '# old managed wrapper\n';
    fs.writeFileSync(obsoletePath, obsoleteContent, 'utf8');
    const managedHashes = loadHashes(root);
    managedHashes['.omp-flow/scripts/get_context.py'] = computeHash(obsoleteContent);
    saveHashes(root, managedHashes);
    const updatePlan = await interactiveUpdate({ cwd: root, force: true });
    assert(updatePlan.some(entry => entry.relativePath.endsWith('get_context.py') && entry.action === 'delete'), 'Update plans managed obsolete file deletion');
    assert(!fs.existsSync(obsoletePath), 'Update removes unchanged obsolete managed wrapper');

    console.log('--- Test 2: full scaffold and session-scoped active task ---');
    const alphaEnv = { CODEX_THREAD_ID: 'alpha-thread' };
    const betaEnv = { CODEX_THREAD_ID: 'beta-thread' };
    const alpha = runPythonJson<{ taskId: string; activation: string }>(
      root, ['task', 'create', 'Alpha Task', '--slug', 'alpha'], alphaEnv,
    );
    const beta = runPythonJson<{ taskId: string }>(
      root, ['task', 'create', 'Beta Task', '--slug', 'beta'], betaEnv,
    );
    assert(alpha.activation === 'session', 'Task create activates current session');
    const alphaCurrent = runPythonJson<{ taskId: string }>(root, ['task', 'current'], alphaEnv);
    const betaCurrent = runPythonJson<{ taskId: string }>(root, ['task', 'current'], betaEnv);
    assert(alphaCurrent.taskId === alpha.taskId, 'Alpha session keeps alpha task');
    assert(betaCurrent.taskId === beta.taskId, 'Beta session keeps beta task');
    assert(alphaCurrent.taskId !== betaCurrent.taskId, 'Sessions do not overwrite each other');
    const noSessionEnv = {
      CODEX_THREAD_ID: '', CODEX_SESSION_ID: '', OMP_SESSION_ID: '', PI_SESSION_ID: '', OMP_FLOW_CONTEXT_ID: '',
    };
    expectPythonFailure(root, ['task', 'create', 'No Session', '--slug', 'no-session'], 'No session identity', noSessionEnv);
    const noSessionTasks = fs.readdirSync(path.join(root, '.omp-flow', 'tasks')).filter(name => name.endsWith('-no-session'));
    assert(noSessionTasks.length === 0, 'Failed activation leaves no task workspace');

    const alphaDir = path.join(root, '.omp-flow', 'tasks', alpha.taskId);
    for (const relative of [
      'task.json',
      'brainstorm.md',
      'prd.md',
      'design.md',
      'tasks.csv',
      'evidence.csv',
      'qbd/qbd-1',
      'qbd/qbd-2',
      '.task',
      'context/index.json',
    ]) {
      assert(fs.existsSync(path.join(alphaDir, relative)), 'Scaffold contains ' + relative);
    }
    assert(readCsv(root, alpha.taskId).trim().split(/\r?\n/).length === 1, 'Seed tasks.csv is header-only');
    assert(fs.readdirSync(path.join(alphaDir, '.task')).length === 0, 'Seed creates no concrete row artifact');
    assert(fs.readdirSync(path.join(alphaDir, 'qbd', 'qbd-1')).length === 0, 'Seed creates no QbD result');

    console.log('--- Test 3: workflow state comes from workflow.md ---');
    const state = runPython(root, ['workflow', 'state'], alphaEnv);
    assert(state.includes('Phase: explore'), 'Workflow state includes task phase');
    assert(state.includes('Stay in exploration'), 'Workflow block is parsed from workflow.md');
    const hook = runPythonJson<{ hookSpecificOutput: { additionalContext: string } }>(
      root,
      ['hook', 'codex-workflow-state'],
      alphaEnv,
      JSON.stringify({ session_id: 'alpha-thread', platform: 'codex', cwd: root }),
    );
    assert(hook.hookSpecificOutput.additionalContext.includes('Phase: explore'), 'Codex Hook returns additionalContext');

    console.log('--- Test 4: exact topology is the only DAG ---');
    fs.writeFileSync(
      path.join(alphaDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md',
        'C-A001B001--003,2,P0,Join,src/c.ts,implement,,,pending,task,.task/C-A001B001--003.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(alphaDir, '.task', 'A-001.implement.md'), '# Root brief\n', 'utf8');
    fs.writeFileSync(path.join(alphaDir, '.task', 'B-001.implement.md'), '# Peer brief\n', 'utf8');
    fs.writeFileSync(path.join(alphaDir, '.task', 'C-A001B001--003.implement.md'), '# Join brief\n', 'utf8');
    const topology = runPythonJson<{ rows: number; waves: Record<string, number> }>(
      root, ['topology', 'validate'], alphaEnv,
    );
    assert(topology.rows === 3, 'All exact topology rows validate');
    assert(topology.waves['C-003'] === 2, 'Dependent row wave is derived from exact refs');
    const invalidCsv = readCsv(root, alpha.taskId).replace(
      'C-A001B001--003,2',
      'C-AB-003,2',
    );
    fs.writeFileSync(path.join(alphaDir, 'tasks.csv'), invalidCsv, 'utf8');
    expectPythonFailure(root, ['topology', 'validate'], 'Invalid topology ID', alphaEnv);
    fs.writeFileSync(
      path.join(alphaDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md',
        'C-A001B001--003,2,P0,Join,src/c.ts,implement,,,pending,task,.task/C-A001B001--003.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );

    console.log('--- Test 5: Reference provenance and QbD gates ---');
    const upstream = path.join(root, 'reference', 'sample');
    fs.mkdirSync(upstream, { recursive: true });
    fs.writeFileSync(path.join(upstream, 'source.ts'), 'export const value = 1;\n', 'utf8');
    const digested = runPythonJson<{ reference: { slug: string } }>(
      root,
      [
        'reference', 'digest-file', '--source-repo', 'reference/sample',
        '--source-path', 'source.ts', '--summary', 'Sample source',
      ],
      alphaEnv,
    );
    assert(digested.reference.slug.endsWith('source-ts'), 'Reference slug includes source extension');
    expectPythonFailure(
      root,
      ['reference', 'digest-file', '--source-repo', 'src', '--source-path', 'index.ts'],
      'source-repo must be under repository reference/',
      alphaEnv,
    );

    const synthesis = path.join(alphaDir, 'research', '90-synthesis-001-test.md');
    fs.writeFileSync(synthesis, '# Synthesis\n\nConfirmed evidence.\n', 'utf8');
    runPython(root, [
      'workflow', 'select-synthesis', '--path', 'research/90-synthesis-001-test.md',
    ], alphaEnv);
    fs.writeFileSync(path.join(alphaDir, 'prd.md'), '# PRD\n\n## Goal\n\nPortable workflow.\n', 'utf8');
    fs.writeFileSync(path.join(alphaDir, 'design.md'), '# Design\n\n## Architecture\n\nPython core.\n', 'utf8');
    const qbd1 = runPythonJson<{ report: string; evidenceDigest: string }>(
      root, ['gate', 'prepare', 'qbd1'], alphaEnv,
    );
    assert(qbd1.report === 'qbd/qbd-1/audit-001.md', 'QbD 1 report is outside .task');
    fs.writeFileSync(
      path.join(alphaDir, qbd1.report),
      [
        '---',
        'gate: qbd1',
        'verdict: PASS',
        'risk: low',
        'evidenceDigest: ' + qbd1.evidenceDigest,
        '---',
        '',
        '# Audit',
        '',
      ].join('\n'),
      'utf8',
    );
    const inspected1 = runPythonJson<{ status: string }>(root, ['gate', 'inspect', 'qbd1'], alphaEnv);
    assert(inspected1.status === 'awaiting_human', 'QbD model PASS waits for human');
    runPython(root, ['gate', 'decide', 'qbd1', '--decision', 'pass', '--note', 'Approved test design'], alphaEnv);

    const referenceSlice = path.join(alphaDir, 'reference', digested.reference.slug + '.ts');
    const approvedReference = fs.readFileSync(referenceSlice, 'utf8');
    fs.writeFileSync(referenceSlice, approvedReference + '// changed\n', 'utf8');
    expectPythonFailure(root, ['gate', 'prepare', 'qbd2'], 'qbd1 approved evidence is stale', alphaEnv);
    fs.writeFileSync(referenceSlice, approvedReference, 'utf8');

    const qbd2 = runPythonJson<{ report: string; evidenceDigest: string }>(
      root, ['gate', 'prepare', 'qbd2'], alphaEnv,
    );
    fs.writeFileSync(
      path.join(alphaDir, qbd2.report),
      [
        '---',
        'gate: qbd2',
        'verdict: PASS',
        'risk: low',
        'evidenceDigest: ' + qbd2.evidenceDigest,
        '---',
        '',
        '# Audit',
        '',
      ].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', 'qbd2'], alphaEnv);
    runPython(root, ['gate', 'decide', 'qbd2', '--decision', 'pass', '--note', 'Approved test topology'], alphaEnv);
    const approvedTask = JSON.parse(fs.readFileSync(path.join(alphaDir, 'task.json'), 'utf8')) as {
      phase: string;
      topologyFrozen: boolean;
    };
    assert(approvedTask.phase === 'ready' && approvedTask.topologyFrozen, 'QbD 2 human PASS freezes topology');

    console.log('--- Test 6: execution context and independent evidence ---');
    runPython(root, ['task', 'start'], alphaEnv);
    const frozenBriefPath = path.join(alphaDir, '.task', 'A-001.implement.md');
    const frozenBrief = fs.readFileSync(frozenBriefPath, 'utf8');
    fs.writeFileSync(frozenBriefPath, frozenBrief + '\nUnauthorized mutation.\n', 'utf8');
    expectPythonFailure(root, ['topology', 'ready', '--role', 'executor'], 'qbd2 approved evidence is stale', alphaEnv);
    fs.writeFileSync(frozenBriefPath, frozenBrief, 'utf8');
    const ready = runPythonJson<{ rows: Array<{ id: string }> }>(
      root, ['topology', 'ready', '--role', 'executor'], alphaEnv,
    );
    assert(ready.rows.map(row => row.id).join(',') === 'A-001,B-001', 'Only root rows are initially ready');
    expectPythonFailure(root, ['context', '--role', 'reviewer', '--row', 'A-001'], 'not valid for reviewer', alphaEnv);
    const executorContext = runPython(root, ['context', '--role', 'executor', '--row', 'A-001'], alphaEnv, 'Implement root.');
    assert(executorContext.includes('A-001') && executorContext.includes('# Root brief'), 'Executor receives exact row brief');
    runPython(root, ['topology', 'mark-result', '--row', 'A-001', '--result', 'success'], alphaEnv);
    const reviewReady = runPythonJson<{ rows: Array<{ id: string }> }>(
      root, ['topology', 'ready', '--role', 'reviewer'], alphaEnv,
    );
    assert(reviewReady.rows.map(row => row.id).join(',') === 'A-001', 'Reviewer sees only rows awaiting review');
    fs.writeFileSync(path.join(alphaDir, '.task', 'A-001.review.md'), '# Review\n\nPASS\n', 'utf8');
    runPython(
      root,
      [
        'evidence', 'submit',
        '--row', 'A-001',
        '--verdict', 'pass',
        '--tests-run', '2',
        '--tests-failed', '0',
        '--report', '.task/A-001.review.md',
        '--evidence', 'focused tests passed',
        '--reviewer-agent-id', 'reviewer-test-1',
      ],
      alphaEnv,
    );
    assert(readCsv(root, alpha.taskId).includes('A-001,1,P0,Root,src/a.ts,implement,,,completed'), 'Evidence marks row completed');
    const nextReady = runPythonJson<{ rows: Array<{ id: string }> }>(
      root, ['topology', 'ready', '--role', 'executor'], alphaEnv,
    );
    assert(nextReady.rows.some(row => row.id === 'B-001'), 'Independent root remains ready');
    assert(!nextReady.rows.some(row => row.id === 'C-A001B001--003'), 'Join waits for every exact dependency');

    console.log('--- Test 7: thin OMP adapter preserves native task ---');
    const ompEnv = { OMP_FLOW_CONTEXT_ID: 'omp-main' };
    runPython(root, ['task', 'select', alpha.taskId], ompEnv);
    const extension = new OMPFlowExtension(root);
    extension.onSessionStart({ sessionManager: { getSessionId: () => 'omp-main', taskDepth: 0 } });
    const injected = extension.onContext({
      messages: [],
      sessionManager: { getSessionId: () => 'omp-main', taskDepth: 0 },
    });
    assert(JSON.stringify(injected.messages).includes('omp-flow-workflow-state'), 'OMP context uses Python workflow state');
    const nativeInput: Record<string, unknown> = {
      agent: 'executor',
      assignment: 'Implement row B-001',
    };
    const nativeResult = extension.onToolCall({
      toolName: 'task',
      input: nativeInput,
      sessionManager: { getSessionId: () => 'omp-main', taskDepth: 0 },
    });
    assert(nativeResult.block !== true, 'Valid native task is not blocked');
    assert(String(nativeInput.assignment).includes('OMP-Flow Executor Handoff'), 'Native assignment is enriched by Python');

    const qbdInput: Record<string, unknown> = { agent: 'qbd-auditor', assignment: 'Prepared QbD prompt' };
    extension.onToolCall({ toolName: 'task', input: qbdInput });
    assert(qbdInput.assignment === 'Prepared QbD prompt', 'Prepared QbD prompt remains native and untouched');

    const entrySource = fs.readFileSync(path.join(process.cwd(), 'src', 'omp', 'extension-entry.ts'), 'utf8');
    assert(!entrySource.includes('registerTool('), 'OMP adapter registers no custom tools');
    const handlers: Array<(event: unknown, ctx: Record<string, unknown>) => unknown | Promise<unknown>> = [];
    let activeTools: string[] = [];
    activateExtension({
      on(eventName, handler) {
        if (eventName === 'session_start') handlers.push(handler as (event: unknown, ctx: Record<string, unknown>) => unknown);
      },
      setActiveTools(toolNames) {
        activeTools = toolNames;
      },
    });
    await handlers[0]!({}, { sessionManager: { getSessionId: () => 'main', taskDepth: 0 } });
    const orchestratorTools = loadAgentDefinition(process.cwd(), 'orchestrator').tools ?? [];
    assert(JSON.stringify(activeTools) === JSON.stringify(orchestratorTools), 'Main uses orchestrator native belt');
    assert(activeTools.includes('bash') && activeTools.includes('write') && activeTools.includes('task'), 'Main can run Python and native task');
    assert(!activeTools.some(tool => tool.startsWith('omp_flow_')), 'No custom omp-flow tools pollute main belt');

    console.log('--- Test 8: doctor reports legacy state without guessing ---');
    fs.writeFileSync(path.join(root, '.omp-flow', 'tasks', '.active-task'), alpha.taskId, 'utf8');
    const doctor = runPythonJson<{ ok: boolean; findings: Array<{ kind: string }> }>(root, ['doctor']);
    assert(!doctor.ok && doctor.findings.some(item => item.kind === 'legacy-active-task'), 'Doctor reports legacy pointer');

    console.log('\nAll portable workflow tests passed.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

runTests().catch(error => {
  console.error(error);
  process.exit(1);
});
