import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { deployInitResources, getManagedResources } from '../src/cli/init.js';
import { analyzeChanges, interactiveUpdate } from '../src/cli/update.js';
import { computeHash, loadHashes, saveHashes } from '../src/cli/template-hash.js';
import { normalizeHarnesses, readHarnessConfig, writeHarnessConfig } from '../src/cli/harness.js';
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

// Drive a fresh task all the way to an executing, QbD 2-frozen state (phase=execute,
// status=in_progress) so amendment/design tests can start from real frozen topology.
function driveToExecuting(
  root: string,
  env: Record<string, string>,
  title: string,
  slug: string,
  csvRows: string[],
  briefs: Record<string, string>,
): { taskId: string; dir: string } {
  const created = runPythonJson<{ taskId: string }>(root, ['task', 'create', title, '--slug', slug], env);
  const dir = path.join(root, '.omp-flow', 'tasks', created.taskId);
  fs.writeFileSync(
    path.join(dir, 'tasks.csv'),
    ['id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd', ...csvRows, ''].join('\n'),
    'utf8',
  );
  for (const [id, body] of Object.entries(briefs)) {
    fs.writeFileSync(path.join(dir, '.task', id + '.implement.md'), body, 'utf8');
  }
  const synthesisRel = `research/90-synthesis-001-${slug}.md`;
  fs.writeFileSync(path.join(dir, synthesisRel), '# Synthesis\n\nEvidence.\n', 'utf8');
  runPython(root, ['workflow', 'select-synthesis', '--path', synthesisRel], env);
  fs.writeFileSync(path.join(dir, 'prd.md'), `# PRD\n\n## Goal\n\n${title}.\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'design.md'), `# Design\n\n## Architecture\n\n${title} core.\n`, 'utf8');
  for (const gate of ['qbd1', 'qbd2'] as const) {
    const prepared = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['gate', 'prepare', gate], env);
    fs.writeFileSync(
      path.join(dir, prepared.report),
      ['---', `gate: ${gate}`, 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + prepared.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', gate], env);
    runPython(root, ['gate', 'decide', gate, '--decision', 'pass', '--note', 'ok'], env);
  }
  runPython(root, ['task', 'start'], env);
  return { taskId: created.taskId, dir };
}

// Take a ready row from pending to completed with passing evidence.
function completeRow(root: string, dir: string, env: Record<string, string>, rowId: string, reviewer: string): void {
  runPython(root, ['topology', 'mark-result', '--row', rowId, '--result', 'success'], env);
  fs.writeFileSync(path.join(dir, '.task', `${rowId}.review.md`), '# Review\n\nPASS\n', 'utf8');
  runPython(root, [
    'evidence', 'submit', '--row', rowId, '--verdict', 'pass', '--tests-run', '1', '--tests-failed', '0',
    '--report', `.task/${rowId}.review.md`, '--evidence', `${rowId} passed`, '--reviewer-agent-id', reviewer,
  ], env);
}

async function runTests(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-portable-'));
  fs.mkdirSync(path.join(root, '.git'));

  try {
    console.log('--- Test 1: project init deploys portable core and Harness adapters ---');
    let missingHarnessRejected = false;
    try {
      deployInitResources({ cwd: root, force: true });
    } catch (error) {
      missingHarnessRejected = String(error).includes('At least one harness');
    }
    assert(missingHarnessRejected, 'Programmatic init requires an explicit harness selection');
    assert(readHarnessConfig(root) === null, 'No harness config exists before initialization');
    const harnessCombinations = [
      ['omp'], ['codex'], ['claude'], ['omp', 'codex'],
      ['omp', 'claude'], ['codex', 'claude'], ['omp', 'codex', 'claude'],
    ] as const;
    const adapterDirs: Record<string, string> = { omp: '.omp', codex: '.codex', claude: '.claude' };
    for (const harnesses of harnessCombinations) {
      const resources = getManagedResources(harnesses);
      assert(resources.some(entry => entry.group === 'core'), 'Every harness selection includes the core');
      for (const harness of ['omp', 'codex', 'claude'] as const) {
        const selected = harnesses.includes(harness);
        assert(
          resources.some(entry => entry.group === harness) === selected,
          `Harness selection keeps ${harness} resources isolated`,
        );
        // Declarations must never point into an unselected adapter's directory.
        const targetsAdapterDir = resources.some(entry => entry.destinationPath.split(path.sep)[0] === adapterDirs[harness]);
        assert(targetsAdapterDir === selected, `Selection [${harnesses.join(',')}] has no ${harness} directory leakage`);
      }
      // Every declared resource is either shared core (under .omp-flow) or owned by a selected adapter directory.
      for (const entry of resources) {
        if (entry.group === 'core') {
          assert(entry.destinationPath.split(path.sep)[0] === '.omp-flow', 'Core resources deploy under .omp-flow');
          continue;
        }
        assert((harnesses as readonly string[]).includes(entry.group), `Resource group ${entry.group} belongs to the selection`);
        assert(
          entry.destinationPath.split(path.sep)[0] === adapterDirs[entry.group],
          `Adapter resource for ${entry.group} deploys under its own directory`,
        );
      }
    }
    const claudeResources = getManagedResources(['claude']);
    assert(claudeResources.every(entry => entry.group === 'core' || entry.destinationPath.startsWith('.claude')), 'Claude selection has no OMP or Codex deployment leakage');
    assert(claudeResources.some(entry => entry.destinationPath === path.join('.claude', 'settings.json')), 'Claude settings are managed');
    assert(claudeResources.some(entry => entry.destinationPath === path.join('.claude', 'hooks', 'session-start.py')), 'Claude Hooks are declared as managed resources');
    assert(claudeResources.some(entry => entry.destinationPath === path.join('.claude', 'agents', 'omp-flow-implement.md')), 'Claude agents are declared as managed resources');
    // Boundary: the Claude group declares only settings/agents/hooks/skills; no commands, status line, plugin, model alias, or dispatcher.
    assert(
      !claudeResources.some(entry => /commands|statusline|plugin|model-alias|dispatcher/i.test(entry.destinationPath)),
      'Claude registry adds no commands, status line, plugin, model alias, or dispatcher',
    );
    // Registry accepts, normalizes, and persists Claude at schema version 1 without deploying its not-yet-provisioned sources.
    assert(normalizeHarnesses(['claude']).join(',') === 'claude', 'Claude is an accepted harness');
    assert(normalizeHarnesses(['claude', 'omp']).join(',') === 'omp,claude', 'Mixed selection with Claude normalizes to canonical order');
    assert(normalizeHarnesses(['claude', 'codex', 'omp']).join(',') === 'omp,codex,claude', 'Full selection normalizes to canonical order');
    const registryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-registry-'));
    try {
      const persisted = writeHarnessConfig(registryDir, ['claude', 'omp']);
      assert(persisted.schemaVersion === 1, 'Persisting a Claude selection keeps schema version 1');
      assert(persisted.harnesses.join(',') === 'omp,claude', 'Persisted Claude selection is normalized');
      const readBack = readHarnessConfig(registryDir, true)!;
      assert(readBack.schemaVersion === 1 && readBack.harnesses.join(',') === 'omp,claude', 'Claude selection round-trips through config.json');
      const claudeOnly = writeHarnessConfig(registryDir, ['claude']);
      assert(claudeOnly.harnesses.join(',') === 'claude', 'Claude-only selection persists');
      assert(!fs.existsSync(path.join(registryDir, '.claude')), 'Declaring a Claude selection deploys none of its resources');
    } finally {
      fs.rmSync(registryDir, { recursive: true, force: true });
    }
    const initPlan = deployInitResources({ cwd: root, force: true, harnesses: ['omp', 'codex'] });
    assert(initPlan.some(entry => entry.displayPath.includes('omp_flow.py')), 'Python core is managed');
    assert(fs.existsSync(path.join(root, '.codex', 'hooks.json')), 'Codex hooks deployed');
    assert(fs.existsSync(path.join(root, '.codex', 'agents', 'omp-flow-implement.toml')), 'Codex agents deployed');
    assert(fs.existsSync(path.join(root, '.codex', 'skills', 'omp-flow', 'SKILL.md')), 'Codex skills deployed');
    assert(fs.existsSync(path.join(root, '.codex', 'skills', 'omp-flow-research', 'SKILL.md')), 'Codex phase skills deployed');
    assert(fs.existsSync(path.join(root, '.codex', 'config.toml')), 'Codex project config deployed');
    assert(fs.existsSync(path.join(root, '.omp', 'skills', 'omp-flow', 'SKILL.md')), 'OMP project skills deployed');
    assert(fs.existsSync(path.join(root, '.omp', 'skills', 'omp-flow-execute', 'SKILL.md')), 'OMP phase skills deployed');
    assert(!fs.existsSync(path.join(root, '.omp', 'skills', 'omp-flow-executor')), 'Legacy role-named Skill is not deployed');
    assert(readHarnessConfig(root, true)!.harnesses.join(',') === 'omp,codex', 'Harness manifest records both adapters');
    const sharedRouter = fs.readFileSync(path.join(process.cwd(), 'templates', 'common', 'skills', 'omp-flow', 'SKILL.md'), 'utf8');
    const ompRouter = fs.readFileSync(path.join(root, '.omp', 'skills', 'omp-flow', 'SKILL.md'), 'utf8');
    const codexRouter = fs.readFileSync(path.join(root, '.codex', 'skills', 'omp-flow', 'SKILL.md'), 'utf8');
    assert(sharedRouter === ompRouter && sharedRouter === codexRouter, 'Both Harnesses deploy the neutral shared Skill source');
    assert(sharedRouter.includes('## Phase Routing'), 'Router Skill maps workflow phase to a phase Skill');
    assert(sharedRouter.includes('## Red Flags'), 'Router Skill includes anti-rationalization guidance');
    const codexImplementPrompt = fs.readFileSync(path.join(root, '.codex', 'agents', 'omp-flow-implement.toml'), 'utf8');
    assert(codexImplementPrompt.includes('# Identity And Recursion Guard'), 'Codex prompt declares recursion contract first');
    assert(codexImplementPrompt.includes('# Pull Context'), 'Codex prompt pulls deterministic context');
    assert(codexImplementPrompt.includes('multi_agent = false'), 'Codex child collaboration is physically disabled');
    assert(codexImplementPrompt.includes('# Postconditions And Handoff'), 'Codex prompt defines artifact postconditions');
    const ompExecutorPrompt = fs.readFileSync(path.join(root, '.omp', 'agents', 'executor.md'), 'utf8');
    const ompExecutorTemplate = fs.readFileSync(path.join(process.cwd(), 'templates', 'omp', 'agents', 'executor.md'), 'utf8');
    assert(ompExecutorPrompt === ompExecutorTemplate, 'OMP agent deploys from the OMP adapter template source');
    assert(ompExecutorPrompt.includes('workflow breadcrumbs apply to Main'), 'OMP child ignores Main-only dispatch breadcrumbs');
    assert(ompExecutorPrompt.includes('## Postconditions'), 'OMP prompt defines completion postconditions');
    assert(!fs.existsSync(path.join(root, '.omp-flow', 'scripts', 'get_context.py')), 'Compatibility wrapper is not deployed');
    assert(fs.existsSync(path.join(root, '.omp-flow', 'scripts', 'common', 'topology.py')), 'Topology module deployed');
    const hooks = fs.readFileSync(path.join(root, '.codex', 'hooks.json'), 'utf8');
    assert(!hooks.includes('{{PYTHON_CMD}}'), 'Codex hook Python command is rendered');
    const obsoletePath = path.join(root, '.omp-flow', 'scripts', 'get_context.py');
    const obsoleteContent = '# old managed wrapper\n';
    fs.writeFileSync(obsoletePath, obsoleteContent, 'utf8');
    const obsoleteSkillPath = path.join(root, '.omp', 'skills', 'omp-flow-executor', 'SKILL.md');
    fs.mkdirSync(path.dirname(obsoleteSkillPath), { recursive: true });
    fs.writeFileSync(obsoleteSkillPath, obsoleteContent, 'utf8');
    const managedHashes = loadHashes(root);
    managedHashes['.omp-flow/scripts/get_context.py'] = computeHash(obsoleteContent);
    managedHashes['.omp/skills/omp-flow-executor/SKILL.md'] = computeHash(obsoleteContent);
    saveHashes(root, managedHashes);
    const updatePlan = await interactiveUpdate({ cwd: root, force: true });
    assert(updatePlan.some(entry => entry.relativePath.endsWith('get_context.py') && entry.action === 'delete'), 'Update plans managed obsolete file deletion');
    assert(!fs.existsSync(obsoletePath), 'Update removes unchanged obsolete managed wrapper');
    assert(updatePlan.some(entry => entry.relativePath.endsWith('omp-flow-executor/SKILL.md') && entry.action === 'delete'), 'Update plans legacy Skill deletion');
    assert(!fs.existsSync(obsoleteSkillPath), 'Update removes unchanged legacy role-named Skill');

    const codexOnly = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-codex-'));
    const ompOnly = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-omp-'));
    try {
      fs.mkdirSync(path.join(codexOnly, '.git'));
      fs.mkdirSync(path.join(ompOnly, '.git'));
      deployInitResources({ cwd: codexOnly, force: true, harnesses: ['codex'] });
      deployInitResources({ cwd: ompOnly, force: true, harnesses: ['omp'] });
      assert(fs.existsSync(path.join(codexOnly, '.codex', 'agents', 'omp-flow-check.toml')), 'Codex-only installs Codex adapter');
      assert(!fs.existsSync(path.join(codexOnly, '.omp')), 'Codex-only does not install OMP adapter');
      const codexUpdatePlan = analyzeChanges(codexOnly, loadHashes(codexOnly));
      assert(!codexUpdatePlan.some(entry => entry.relativePath.startsWith('.omp/')), 'Codex-only update excludes OMP resources');
      assert(fs.existsSync(path.join(ompOnly, '.omp', 'agents', 'executor.md')), 'OMP-only installs OMP adapter');
      assert(!fs.existsSync(path.join(ompOnly, '.codex')), 'OMP-only does not install Codex adapter');
      const before = process.cwd();
      const codexHandlers: string[] = [];
      try {
        process.chdir(codexOnly);
        activateExtension({ on(eventName) { codexHandlers.push(eventName); } });
      } finally {
        process.chdir(before);
      }
      assert(codexHandlers.length === 0, 'OMP extension is inert in Codex-only projects');
      deployInitResources({ cwd: codexOnly, harnesses: ['omp'] });
      assert(readHarnessConfig(codexOnly, true)!.harnesses.join(',') === 'omp,codex', 'Init incrementally adds a Harness');
      assert(fs.existsSync(path.join(codexOnly, '.omp', 'agents', 'orchestrator.md')), 'Incremental Harness install deploys its adapter');
    } finally {
      fs.rmSync(codexOnly, { recursive: true, force: true });
      fs.rmSync(ompOnly, { recursive: true, force: true });
    }

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

    // M2: active rows may not depend on retired (superseded/cancelled) rows,
    // but a completed row depending on a retired row is historical and allowed.
    const supersededDepCsv = [
      'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
      'A-001,1,P0,Root,src/a.ts,implement,,,superseded,task,.task/A-001.implement.md',
      'B-001,1,P0,Peer,src/b.ts,implement,,,completed,task,.task/B-001.implement.md',
      'C-A001B001--003,2,P0,Join,src/c.ts,implement,,,pending,task,.task/C-A001B001--003.implement.md',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(alphaDir, 'tasks.csv'), supersededDepCsv, 'utf8');
    expectPythonFailure(
      root, ['topology', 'validate'], 'Active row C-A001B001--003 depends on superseded row A-001', alphaEnv,
    );
    // The same retired dependency is tolerated once the dependant is completed (historical).
    fs.writeFileSync(
      path.join(alphaDir, 'tasks.csv'),
      supersededDepCsv.replace('C-A001B001--003,2,P0,Join,src/c.ts,implement,,,pending', 'C-A001B001--003,2,P0,Join,src/c.ts,implement,,,completed'),
      'utf8',
    );
    const retiredHistorical = runPythonJson<{ rows: number }>(root, ['topology', 'validate'], alphaEnv);
    assert(retiredHistorical.rows === 3, 'Completed row may historically depend on a superseded row');
    // Restore the canonical all-pending topology for the QbD gate tests that follow.
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
    const rework = runPythonJson<{ phase: string; reworkRecord: string }>(root, [
      'task', 'rework', '--reason', 'Human-approved test topology correction',
    ], alphaEnv);
    assert(rework.phase === 'decompose', 'Human-approved rework returns task to decomposition');
    assert(fs.existsSync(path.join(alphaDir, rework.reworkRecord)), 'Rework records the human-approved reason');
    const reworkedTask = JSON.parse(fs.readFileSync(path.join(alphaDir, 'task.json'), 'utf8')) as {
      status: string;
      phase: string;
      topologyFrozen: boolean;
      gates: { qbd2: { status: string } };
    };
    assert(
      reworkedTask.status === 'planning'
        && reworkedTask.phase === 'decompose'
        && !reworkedTask.topologyFrozen
        && reworkedTask.gates.qbd2.status === 'needs_revision',
      'Rework clears only the QbD 2 execution freeze',
    );
    const qbd2Rework = runPythonJson<{ report: string; evidenceDigest: string }>(
      root, ['gate', 'prepare', 'qbd2'], alphaEnv,
    );
    assert(qbd2Rework.report === 'qbd/qbd-2/audit-002.md', 'Rework reserves a new QbD 2 attempt');
    const reworkedGate = JSON.parse(fs.readFileSync(path.join(alphaDir, 'task.json'), 'utf8')) as {
      gates: { qbd2: { status: string; verdict?: string; inspectedAt?: string; humanDecision?: string } };
    };
    assert(
      reworkedGate.gates.qbd2.status === 'prepared'
        && reworkedGate.gates.qbd2.verdict === undefined
        && reworkedGate.gates.qbd2.inspectedAt === undefined
        && reworkedGate.gates.qbd2.humanDecision === undefined,
      'New QbD attempt clears the prior verdict and human decision',
    );
    fs.writeFileSync(
      path.join(alphaDir, qbd2Rework.report),
      [
        '---',
        'gate: qbd2',
        'verdict: PASS',
        'risk: low',
        'evidenceDigest: ' + qbd2Rework.evidenceDigest,
        '---',
        '',
        '# Rework Audit',
        '',
      ].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', 'qbd2'], alphaEnv);
    runPython(root, ['gate', 'decide', 'qbd2', '--decision', 'pass', '--note', 'Approved corrected test topology'], alphaEnv);
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
    const reviewerContext = runPython(root, ['context', '--role', 'reviewer', '--row', 'A-001'], alphaEnv, 'Review root.');
    assert(reviewerContext.includes('--task ' + alpha.taskId), 'Reviewer handoff uses explicit parent task identity');
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
    expectPythonFailure(
      root,
      ['task', 'rework', '--reason', 'Completed work cannot be silently reopened'],
      'forbidden after completed rows',
      alphaEnv,
    );
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
    const bashInput: Record<string, unknown> = { command: 'omp-flow status' };
    extension.onToolCall({
      toolName: 'bash',
      input: bashInput,
      sessionManager: { getSessionId: () => 'omp-main', taskDepth: 0 },
    });
    assert((bashInput.env as Record<string, string>).OMP_FLOW_CONTEXT_ID === 'omp-main', 'Main bash receives session identity through native env input');
    const childBash: Record<string, unknown> = { command: 'echo child' };
    extension.onToolCall({
      toolName: 'bash',
      input: childBash,
      sessionManager: { getSessionId: () => 'omp-child', taskDepth: 1 },
    });
    assert(childBash.env === undefined, 'Child bash does not create an unrelated active-task session');
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

    console.log('--- Test 8: completed topology enters finish and archives ---');
    // Per-row freeze localizes: mutating a COMPLETED row's brief must not brick siblings.
    const completedBriefPath = path.join(alphaDir, '.task', 'A-001.implement.md');
    const completedBrief = fs.readFileSync(completedBriefPath, 'utf8');
    fs.writeFileSync(completedBriefPath, completedBrief + '\nPost-completion edit.\n', 'utf8');
    const localizedReady = runPythonJson<{ rows: Array<{ id: string }> }>(
      root, ['topology', 'ready', '--role', 'executor'], alphaEnv,
    );
    assert(
      localizedReady.rows.some(row => row.id === 'B-001'),
      'Mutating a completed row brief does not brick a sibling row (per-row digest localizes)',
    );
    // Shared design evidence still fails closed for ALL rows even while a completed brief drifts.
    const designPath = path.join(alphaDir, 'design.md');
    const designBody = fs.readFileSync(designPath, 'utf8');
    fs.writeFileSync(designPath, designBody + '\nAdversarial design drift.\n', 'utf8');
    expectPythonFailure(root, ['topology', 'ready', '--role', 'executor'], 'design evidence is stale', alphaEnv);
    fs.writeFileSync(designPath, designBody, 'utf8');
    // A sibling row still marks/completes normally while the completed row's brief is mutated.
    runPython(root, ['topology', 'mark-result', '--row', 'B-001', '--result', 'success'], alphaEnv);
    fs.writeFileSync(completedBriefPath, completedBrief, 'utf8');
    fs.writeFileSync(path.join(alphaDir, '.task', 'B-001.review.md'), '# Review\n\nPASS\n', 'utf8');
    runPython(root, [
      'evidence', 'submit', '--task', alpha.taskId, '--row', 'B-001', '--verdict', 'pass',
      '--tests-run', '1', '--tests-failed', '0', '--report', '.task/B-001.review.md',
      '--evidence', 'B passed', '--reviewer-agent-id', 'reviewer-test-2',
    ], alphaEnv);
    const joinReady = runPythonJson<{ rows: Array<{ id: string }> }>(
      root, ['topology', 'ready', '--role', 'executor'], alphaEnv,
    );
    assert(joinReady.rows.map(row => row.id).join(',') === 'C-A001B001--003', 'Join unlocks after both exact dependencies pass');
    runPython(root, ['topology', 'mark-result', '--row', 'C-A001B001--003', '--result', 'success'], alphaEnv);
    fs.writeFileSync(path.join(alphaDir, '.task', 'C-A001B001--003.review.md'), '# Review\n\nPASS\n', 'utf8');
    runPython(root, [
      'evidence', 'submit', '--task', alpha.taskId, '--row', 'C-A001B001--003', '--verdict', 'pass',
      '--tests-run', '1', '--tests-failed', '0', '--report', '.task/C-A001B001--003.review.md',
      '--evidence', 'C passed', '--reviewer-agent-id', 'reviewer-test-3',
    ], alphaEnv);
    const finishingTask = JSON.parse(fs.readFileSync(path.join(alphaDir, 'task.json'), 'utf8')) as { phase: string };
    assert(finishingTask.phase === 'finish', 'Last PASS evidence enters finish phase');
    runPython(root, ['task', 'finish'], alphaEnv);
    const archived = runPythonJson<{ archivedTo: string }>(root, ['task', 'archive'], alphaEnv);
    assert(fs.existsSync(archived.archivedTo), 'Completed task moves to monthly archive');

    console.log('--- Test 8b: finish tolerates superseded and cancelled rows ---');
    const gammaEnv = { CODEX_THREAD_ID: 'gamma-thread' };
    const gamma = runPythonJson<{ taskId: string }>(
      root, ['task', 'create', 'Gamma Task', '--slug', 'gamma'], gammaEnv,
    );
    const gammaDir = path.join(root, '.omp-flow', 'tasks', gamma.taskId);
    fs.writeFileSync(
      path.join(gammaDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,completed,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,superseded,task,.task/B-001.implement.md',
        'C-001,1,P0,Third,src/d.ts,implement,,,cancelled,task,.task/C-001.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );
    const gammaFinished = runPythonJson<{ status: string; phase: string }>(root, ['task', 'finish'], gammaEnv);
    assert(
      gammaFinished.status === 'completed' && gammaFinished.phase === 'completed',
      'Finish accepts a topology whose remaining rows are superseded or cancelled',
    );

    console.log('--- Test 8c: amendment / ECO change-order flow ---');
    const deltaEnv = { CODEX_THREAD_ID: 'delta-thread' };
    const delta = runPythonJson<{ taskId: string }>(
      root, ['task', 'create', 'Delta Task', '--slug', 'delta'], deltaEnv,
    );
    const deltaDir = path.join(root, '.omp-flow', 'tasks', delta.taskId);
    fs.writeFileSync(
      path.join(deltaDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(deltaDir, '.task', 'A-001.implement.md'), '# A brief\n', 'utf8');
    fs.writeFileSync(path.join(deltaDir, '.task', 'B-001.implement.md'), '# B brief\n', 'utf8');
    fs.writeFileSync(path.join(deltaDir, 'research', '90-synthesis-001-delta.md'), '# Synthesis\n\nEvidence.\n', 'utf8');
    runPython(root, ['workflow', 'select-synthesis', '--path', 'research/90-synthesis-001-delta.md'], deltaEnv);
    fs.writeFileSync(path.join(deltaDir, 'prd.md'), '# PRD\n\n## Goal\n\nDelta.\n', 'utf8');
    fs.writeFileSync(path.join(deltaDir, 'design.md'), '# Design\n\n## Architecture\n\nDelta core.\n', 'utf8');
    const dq1 = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['gate', 'prepare', 'qbd1'], deltaEnv);
    fs.writeFileSync(
      path.join(deltaDir, dq1.report),
      ['---', 'gate: qbd1', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + dq1.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', 'qbd1'], deltaEnv);
    runPython(root, ['gate', 'decide', 'qbd1', '--decision', 'pass', '--note', 'ok'], deltaEnv);
    const dq2 = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['gate', 'prepare', 'qbd2'], deltaEnv);
    fs.writeFileSync(
      path.join(deltaDir, dq2.report),
      ['---', 'gate: qbd2', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + dq2.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', 'qbd2'], deltaEnv);
    runPython(root, ['gate', 'decide', 'qbd2', '--decision', 'pass', '--note', 'ok'], deltaEnv);
    runPython(root, ['task', 'start'], deltaEnv);
    // Take A-001 all the way through to completed evidence so the amendment runs against real completed work.
    runPython(root, ['topology', 'mark-result', '--row', 'A-001', '--result', 'success'], deltaEnv);
    fs.writeFileSync(path.join(deltaDir, '.task', 'A-001.review.md'), '# Review\n\nPASS\n', 'utf8');
    runPython(root, [
      'evidence', 'submit', '--row', 'A-001', '--verdict', 'pass', '--tests-run', '1', '--tests-failed', '0',
      '--report', '.task/A-001.review.md', '--evidence', 'A passed', '--reviewer-agent-id', 'rev-d1',
    ], deltaEnv);
    assert(readCsv(root, delta.taskId).includes('A-001,1,P0,Root,src/a.ts,implement,,,completed'), 'Delta A-001 completes');
    const evidenceBefore = fs.readFileSync(path.join(deltaDir, 'evidence.csv'), 'utf8');
    const verdictBefore = fs.readFileSync(path.join(deltaDir, '.task', 'A-001.verdict.json'), 'utf8');

    // Propose an amendment; only one open amendment is allowed at a time.
    const proposed = runPythonJson<{ id: string; status: string; proposal: string }>(
      root, ['topology', 'amend', 'propose', '--reason', 'Add D-001 and refine B-001'], deltaEnv,
    );
    assert(proposed.id === 'amend-001' && proposed.status === 'open', 'First amendment is amend-001/open');
    expectPythonFailure(
      root, ['topology', 'amend', 'propose', '--reason', 'second'], 'open amendment already exists', deltaEnv,
    );
    // Fill the proposal (strip the uncommitted-template marker) so prepare accepts it.
    fs.writeFileSync(
      path.join(deltaDir, proposed.proposal),
      ['---', 'amendment: amend-001', 'gate: qbd2-delta', '---', '', '# Amendment Proposal',
        '', '## Change Set', '', 'Add D-001; refine B-001 brief.', '', '## Impact Statement', '',
        'No completed rows are edited or superseded.', ''].join('\n'),
      'utf8',
    );
    // The new row's brief must exist on disk; the edited row's brief is mutated in place.
    fs.writeFileSync(path.join(deltaDir, '.task', 'D-001.implement.md'), '# D brief\n', 'utf8');
    fs.writeFileSync(path.join(deltaDir, '.task', 'B-001.implement.md'), '# B brief\n\nRefined scope after amendment.\n', 'utf8');
    const changeSet = JSON.stringify([
      { op: 'add-row', id: 'D-001', wave: 1, priority: 'P1', title: 'New', scope: 'src/d.ts', action: 'implement', modelSlot: 'task' },
      { op: 'edit-brief', id: 'B-001' },
    ]);
    runPython(root, ['topology', 'amend', 'set-change', '--change', changeSet], deltaEnv);
    // editing a completed row's brief is forbidden even inside an amendment.
    expectPythonFailure(
      root,
      ['topology', 'amend', 'set-change', '--change', JSON.stringify([{ op: 'edit-brief', id: 'A-001' }])],
      'edit-brief on a completed row is forbidden',
      deltaEnv,
    );
    // Restore the intended change set (the forbidden attempt above rejected before mutating state).
    runPython(root, ['topology', 'amend', 'set-change', '--change', changeSet], deltaEnv);
    const preparedAmend = runPythonJson<{ report: string; evidenceDigest: string }>(
      root, ['topology', 'amend', 'prepare'], deltaEnv,
    );
    assert(preparedAmend.report === 'qbd/qbd-2/amend-001/audit-001.md', 'Delta audit report is under the amendment dir');
    fs.writeFileSync(
      path.join(deltaDir, preparedAmend.report),
      ['---', 'gate: qbd2-delta', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + preparedAmend.evidenceDigest, '---', '', '# Delta Audit', ''].join('\n'),
      'utf8',
    );
    const inspectedAmend = runPythonJson<{ status: string; verdict: string }>(root, ['topology', 'amend', 'inspect'], deltaEnv);
    assert(inspectedAmend.status === 'awaiting_human' && inspectedAmend.verdict === 'PASS', 'Delta PASS awaits a human decision');
    const applied = runPythonJson<{ status: string; applied: Array<{ op: string; id: string }> }>(
      root, ['topology', 'amend', 'decide', '--decision', 'pass', '--note', 'approve delta'], deltaEnv,
    );
    assert(applied.status === 'approved', 'Amendment closes as approved');
    assert(applied.applied.some(item => item.op === 'add-row' && item.id === 'D-001'), 'Apply summary reports the add-row');

    const deltaCsv = readCsv(root, delta.taskId);
    assert(
      deltaCsv.includes('D-001,1,P1,New,src/d.ts,implement,,,pending,task,.task/D-001.implement.md'),
      'New row is appended to tasks.csv as pending',
    );
    const amendReady = runPythonJson<{ rows: Array<{ id: string }> }>(root, ['topology', 'ready', '--role', 'executor'], deltaEnv);
    const readyIds = amendReady.rows.map(row => row.id);
    assert(readyIds.includes('D-001'), 'Newly added row is ready/executable (per-row digest refreshed)');
    assert(readyIds.includes('B-001'), 'Edited row stays ready despite a mutated brief (digest refreshed)');
    assert(!readyIds.includes('A-001'), 'Completed row stays out of the ready set');
    const dContext = runPython(root, ['context', '--role', 'executor', '--row', 'D-001'], deltaEnv, 'Implement D.');
    assert(dContext.includes('# D brief'), 'New row context resolves end-to-end with the refreshed digest');
    // Completed work and its independent evidence are never touched by an amendment.
    assert(deltaCsv.includes('A-001,1,P0,Root,src/a.ts,implement,,,completed'), 'Completed row remains completed');
    assert(fs.readFileSync(path.join(deltaDir, 'evidence.csv'), 'utf8') === evidenceBefore, 'Completed row evidence.csv is untouched');
    assert(fs.readFileSync(path.join(deltaDir, '.task', 'A-001.verdict.json'), 'utf8') === verdictBefore, 'Completed row verdict JSON is untouched');

    // Reject path: a fully prepared+inspected amendment that is rejected changes nothing.
    const csvAfterApprove = readCsv(root, delta.taskId);
    const reject = runPythonJson<{ id: string; proposal: string }>(
      root, ['topology', 'amend', 'propose', '--reason', 'try supersede B'], deltaEnv,
    );
    assert(reject.id === 'amend-002', 'A second amendment is allocated only after the first closes');
    fs.writeFileSync(
      path.join(deltaDir, reject.proposal),
      ['---', 'amendment: amend-002', 'gate: qbd2-delta', '---', '', '# Proposal', '', '## Change Set', '',
        'Supersede B-001.', '', '## Impact Statement', '', 'B-001 not started.', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['topology', 'amend', 'set-change', '--change', JSON.stringify([{ op: 'supersede', id: 'B-001' }])], deltaEnv);
    const rejPrep = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['topology', 'amend', 'prepare'], deltaEnv);
    fs.writeFileSync(
      path.join(deltaDir, rejPrep.report),
      ['---', 'gate: qbd2-delta', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + rejPrep.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['topology', 'amend', 'inspect'], deltaEnv);
    const rejected = runPythonJson<{ status: string; applied: unknown[] }>(
      root, ['topology', 'amend', 'decide', '--decision', 'reject', '--note', 'not now'], deltaEnv,
    );
    assert(rejected.status === 'rejected' && rejected.applied.length === 0, 'Reject applies no changes');
    assert(readCsv(root, delta.taskId) === csvAfterApprove, 'Reject leaves the topology byte-for-byte unchanged');

    console.log('--- Test 8d: uncommitted-template brief is rejected before it can half-apply ---');
    // Atomicity invariant after the approved amendment: a row is in tasks.csv IFF gates.qbd2.rows
    // carries its frozen digest. This is exactly the mutual consistency a half-apply would break.
    const deltaState = JSON.parse(fs.readFileSync(path.join(deltaDir, 'task.json'), 'utf8')) as {
      gates: { qbd2: { rows: Record<string, string> } };
    };
    const deltaRowIds = readCsv(root, delta.taskId).trim().split(/\r?\n/).slice(1)
      .filter(Boolean).map(line => line.split(',')[0]);
    for (const rowId of deltaRowIds) {
      assert(typeof deltaState.gates.qbd2.rows[rowId] === 'string', `tasks.csv row ${rowId} has a frozen digest in task.json`);
    }
    assert(typeof deltaState.gates.qbd2.rows['D-001'] === 'string', 'Approved add-row D-001: tasks.csv and task.json agree');
    // An add-row whose new brief still carries the uncommitted-template marker must be rejected at
    // set-change, so it can never reach decide and commit tasks.csv while the digest recompute raises.
    const marked = runPythonJson<{ id: string; proposal: string }>(
      root, ['topology', 'amend', 'propose', '--reason', 'add E-001 with an unfinished brief'], deltaEnv,
    );
    fs.writeFileSync(
      path.join(deltaDir, marked.proposal),
      ['---', 'amendment: ' + marked.id, 'gate: qbd2-delta', '---', '', '# Proposal', '', '## Change Set', '',
        'Add E-001.', '', '## Impact Statement', '', 'None.', ''].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(deltaDir, '.task', 'E-001.implement.md'),
      '# E brief\n\n<!-- Uncommitted template. Fill me in. -->\n',
      'utf8',
    );
    const markedChange = JSON.stringify([
      { op: 'add-row', id: 'E-001', wave: 1, priority: 'P1', title: 'E', scope: 'src/e.ts', action: 'implement', modelSlot: 'task' },
    ]);
    expectPythonFailure(root, ['topology', 'amend', 'set-change', '--change', markedChange], 'uncommitted template', deltaEnv);
    // The rejected change set never mutated the topology: E-001 is absent from BOTH files.
    assert(!readCsv(root, delta.taskId).includes('E-001'), 'Marked-brief add-row never reached tasks.csv');
    const afterMarked = JSON.parse(fs.readFileSync(path.join(deltaDir, 'task.json'), 'utf8')) as {
      gates: { qbd2: { rows: Record<string, string> } };
    };
    assert(afterMarked.gates.qbd2.rows['E-001'] === undefined, 'Marked-brief add-row left no frozen digest');

    console.log('--- Test 8e: gate reset escape hatch (M4) ---');
    // gate reset is the only legitimate exit from a qbd1 stale / needs_revision / attempt>=3
    // deadlock without hand-editing task.json (which the system forbids).
    const resetEnv = { CODEX_THREAD_ID: 'reset-thread' };
    const resetTask = runPythonJson<{ taskId: string }>(root, ['task', 'create', 'Reset Task', '--slug', 'reset'], resetEnv);
    const resetDir = path.join(root, '.omp-flow', 'tasks', resetTask.taskId);
    fs.writeFileSync(path.join(resetDir, 'research', '90-synthesis-001-reset.md'), '# Synthesis\n\nEvidence.\n', 'utf8');
    runPython(root, ['workflow', 'select-synthesis', '--path', 'research/90-synthesis-001-reset.md'], resetEnv);
    fs.writeFileSync(path.join(resetDir, 'prd.md'), '# PRD\n\n## Goal\n\nReset.\n', 'utf8');
    fs.writeFileSync(path.join(resetDir, 'design.md'), '# Design\n\n## Architecture\n\nReset core.\n', 'utf8');
    const rq1 = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['gate', 'prepare', 'qbd1'], resetEnv);
    // A model FAIL verdict lands qbd1 in needs_revision (a stuck, hand-edit-only state pre-M4).
    fs.writeFileSync(
      path.join(resetDir, rq1.report),
      ['---', 'gate: qbd1', 'verdict: FAIL', 'risk: high', 'evidenceDigest: ' + rq1.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    const rq1Inspected = runPythonJson<{ status: string }>(root, ['gate', 'inspect', 'qbd1'], resetEnv);
    assert(rq1Inspected.status === 'needs_revision', 'qbd1 FAIL audit lands in needs_revision');
    expectPythonFailure(root, ['gate', 'reset', 'qbd1', '--reason', '   '], 'non-empty', resetEnv);
    const gateReset = runPythonJson<{ resetRecord: string; status: string; attempt: number; phase: string }>(
      root, ['gate', 'reset', 'qbd1', '--reason', 'Auditor deadlocked; restart qbd1 cleanly'], resetEnv,
    );
    assert(
      gateReset.status === 'not_started' && gateReset.attempt === 0 && gateReset.phase === 'design',
      'Gate reset returns qbd1 to a clean pre-prepare state at phase=design',
    );
    assert(fs.existsSync(path.join(resetDir, gateReset.resetRecord)), 'Gate reset writes a reset-NNN record');
    const resetRecordBody = fs.readFileSync(path.join(resetDir, gateReset.resetRecord), 'utf8');
    assert(resetRecordBody.includes('priorStatus: needs_revision') && resetRecordBody.includes('Auditor deadlocked'), 'Reset record captures prior status and reason');
    // A fresh prepare now works -- the whole point of the escape hatch.
    const rq1b = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['gate', 'prepare', 'qbd1'], resetEnv);
    assert(rq1b.report === 'qbd/qbd-1/audit-001.md', 'A fresh qbd1 prepare works after reset');
    // Drive qbd1 to approved, then confirm resetting an APPROVED gate is rejected.
    fs.writeFileSync(
      path.join(resetDir, rq1b.report),
      ['---', 'gate: qbd1', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + rq1b.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', 'qbd1'], resetEnv);
    runPython(root, ['gate', 'decide', 'qbd1', '--decision', 'pass', '--note', 'ok'], resetEnv);
    expectPythonFailure(root, ['gate', 'reset', 'qbd1', '--reason', 'must not unfreeze'], 'is approved', resetEnv);

    console.log('--- Test 8f: cumulative amendment cap forces a full QbD 2 re-audit (M4) ---');
    // The cap is exercised against hand-built amendment history (realistic record shape) so the
    // threshold is reached deterministically without running dozens of full amendment cycles.
    const capEnv = { CODEX_THREAD_ID: 'cap-thread' };
    const capTask = runPythonJson<{ taskId: string }>(root, ['task', 'create', 'Cap Task', '--slug', 'cap'], capEnv);
    const capDir = path.join(root, '.omp-flow', 'tasks', capTask.taskId);
    const capJsonPath = path.join(capDir, 'task.json');
    fs.writeFileSync(
      path.join(capDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md',
        'C-001,1,P0,Third,src/c.ts,implement,,,pending,task,.task/C-001.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );
    const capJson = JSON.parse(fs.readFileSync(capJsonPath, 'utf8')) as Record<string, any>;
    capJson.status = 'in_progress';
    capJson.phase = 'execute';
    capJson.topologyFrozen = true;
    capJson.gates = {
      qbd2: {
        status: 'approved', attempt: 1, evidenceDigest: 'sha256:x', evidencePaths: [], designDigest: 'sha256:d',
        rows: { 'A-001': 'sha256:a', 'B-001': 'sha256:b', 'C-001': 'sha256:c' },
      },
    };
    // Path (a): more than 3 approved amendments.
    capJson.amendments = [
      { id: 'amend-001', status: 'approved', changeSet: [] },
      { id: 'amend-002', status: 'approved', changeSet: [] },
      { id: 'amend-003', status: 'approved', changeSet: [] },
      { id: 'amend-004', status: 'approved', changeSet: [] },
    ];
    fs.writeFileSync(capJsonPath, JSON.stringify(capJson, null, 2), 'utf8');
    expectPythonFailure(root, ['topology', 'amend', 'propose', '--reason', 'one more'], 'Amendment cap reached', capEnv);
    expectPythonFailure(root, ['topology', 'amend', 'propose', '--reason', 'one more'], 'task rework', capEnv);
    // Path (b): below the approved-count cap, but retired-or-edited rows exceed one third.
    fs.writeFileSync(
      path.join(capDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,superseded,task,.task/B-001.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );
    capJson.amendments = [{ id: 'amend-001', status: 'approved', changeSet: [{ op: 'supersede', id: 'B-001' }] }];
    capJson.gates.qbd2.rows = { 'A-001': 'sha256:a', 'B-001': 'sha256:b' };
    fs.writeFileSync(capJsonPath, JSON.stringify(capJson, null, 2), 'utf8');
    expectPythonFailure(root, ['topology', 'amend', 'propose', '--reason', 'too much drift'], 'exceed one third', capEnv);

    console.log('--- Test 8g: design-level amendment downgrades uncovered completed rows (M4) ---');
    const epsEnv = { CODEX_THREAD_ID: 'epsilon-thread' };
    const eps = driveToExecuting(
      root, epsEnv, 'Epsilon', 'epsilon',
      [
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md',
        'C-A001B001--003,2,P0,Join,src/c.ts,implement,,,pending,task,.task/C-A001B001--003.implement.md',
      ],
      { 'A-001': '# A brief\n', 'B-001': '# B brief\n', 'C-A001B001--003': '# Join brief\n' },
    );
    // Complete A-001 and B-001; the join row stays pending so the task stays in execute phase.
    completeRow(root, eps.dir, epsEnv, 'A-001', 'rev-e1');
    completeRow(root, eps.dir, epsEnv, 'B-001', 'rev-e2');
    assert(readCsv(root, eps.taskId).includes('A-001,1,P0,Root,src/a.ts,implement,,,completed'), 'Epsilon A-001 completes');
    assert(readCsv(root, eps.taskId).includes('B-001,1,P0,Peer,src/b.ts,implement,,,completed'), 'Epsilon B-001 completes');
    const epsEvidenceBefore = fs.readFileSync(path.join(eps.dir, 'evidence.csv'), 'utf8');
    // A design edit on disk: prd/design changed. Impact Statement keeps A-001 valid but not B-001.
    fs.writeFileSync(path.join(eps.dir, 'design.md'), '# Design\n\n## Architecture\n\nEpsilon core, revised.\n', 'utf8');
    const epsProposed = runPythonJson<{ id: string; proposal: string }>(
      root, ['topology', 'amend', 'propose', '--reason', 'Design revision; A stays valid, B must be redone'], epsEnv,
    );
    fs.writeFileSync(
      path.join(eps.dir, epsProposed.proposal),
      ['---', 'amendment: ' + epsProposed.id, 'gate: qbd2-delta', '---', '', '# Proposal', '', '## Change Set', '',
        'Edit design.', '', '## Impact Statement', '', 'A-001 unaffected by the design change.', '',
        'valid-completed: A-001', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['topology', 'amend', 'set-change', '--change', JSON.stringify([{ op: 'edit-design' }])], epsEnv);
    const epsPrepared = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['topology', 'amend', 'prepare'], epsEnv);
    fs.writeFileSync(
      path.join(eps.dir, epsPrepared.report),
      ['---', 'gate: qbd2-delta', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + epsPrepared.evidenceDigest, '---', '', '# Delta Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['topology', 'amend', 'inspect'], epsEnv);
    const epsApplied = runPythonJson<{ status: string; applied: Array<{ op: string; id?: string }> }>(
      root, ['topology', 'amend', 'decide', '--decision', 'pass', '--note', 'approve design change'], epsEnv,
    );
    assert(epsApplied.status === 'approved', 'Design amendment closes as approved');
    assert(epsApplied.applied.some(item => item.op === 'downgrade' && item.id === 'B-001'), 'Uncovered completed row B-001 is downgraded');
    const epsCsv = readCsv(root, eps.taskId);
    assert(epsCsv.includes('A-001,1,P0,Root,src/a.ts,implement,,,completed'), 'Listed completed row A-001 stays completed');
    assert(epsCsv.includes('B-001,1,P0,Peer,src/b.ts,implement,,,needs_fix'), 'Unlisted completed row B-001 is downgraded to needs_fix');
    assert(fs.readFileSync(path.join(eps.dir, 'evidence.csv'), 'utf8') === epsEvidenceBefore, 'Downgraded row evidence.csv is preserved (append-only history)');
    // B-001 re-enters the execute loop as a ready candidate.
    const epsReady = runPythonJson<{ rows: Array<{ id: string }> }>(root, ['topology', 'ready', '--role', 'executor'], epsEnv);
    assert(epsReady.rows.some(row => row.id === 'B-001'), 'Downgraded row re-enters the ready set for re-implementation');
    // edit-design without a valid-completed declaration must fail closed at prepare.
    const epsBad = runPythonJson<{ id: string; proposal: string }>(
      root, ['topology', 'amend', 'propose', '--reason', 'another design edit, no declaration'], epsEnv,
    );
    fs.writeFileSync(
      path.join(eps.dir, epsBad.proposal),
      ['---', 'amendment: ' + epsBad.id, 'gate: qbd2-delta', '---', '', '# Proposal', '', '## Change Set', '',
        'Edit design again.', '', '## Impact Statement', '', 'Forgot to declare valid-completed rows.', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['topology', 'amend', 'set-change', '--change', JSON.stringify([{ op: 'edit-design' }])], epsEnv);
    expectPythonFailure(root, ['topology', 'amend', 'prepare'], 'valid-completed', epsEnv);

    console.log('--- Test 9: doctor reports legacy state without guessing ---');
    fs.writeFileSync(path.join(root, '.omp-flow', 'tasks', '.active-task'), alpha.taskId, 'utf8');
    const doctor = runPythonJson<{ ok: boolean; findings: Array<{ kind: string }> }>(root, ['doctor']);
    assert(!doctor.ok && doctor.findings.some(item => item.kind === 'legacy-active-task'), 'Doctor reports legacy pointer');

    // A QbD 2 approved before per-row digests existed (no gates.qbd2.rows) is flagged informationally.
    const legacyDir = path.join(root, '.omp-flow', 'tasks', 'legacy-qbd2');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, 'task.json'),
      JSON.stringify({
        schemaVersion: 2,
        taskId: 'legacy-qbd2',
        gates: { qbd2: { status: 'approved', attempt: 1, evidenceDigest: 'sha256:legacy', evidencePaths: [] } },
      }),
      'utf8',
    );
    const legacyDoctor = runPythonJson<{ ok: boolean; findings: Array<{ kind: string; path: string }> }>(root, ['doctor']);
    assert(
      legacyDoctor.findings.some(item => item.kind === 'legacy-qbd2-whole-digest' && item.path.includes('legacy-qbd2')),
      'Doctor flags legacy qbd2 approval lacking per-row digests',
    );

    console.log('\nAll portable workflow tests passed.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

runTests().catch(error => {
  console.error(error);
  process.exit(1);
});
