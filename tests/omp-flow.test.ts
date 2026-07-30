import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deployInitResources, getManagedResources } from '../src/cli/init.js';
import { analyzeChanges } from '../src/cli/update.js';
import { loadHashes } from '../src/cli/template-hash.js';
import { OMPFlowExtension } from '../src/omp/extension.js';

const python = process.platform === 'win32' ? 'python' : 'python3';
let checks = 0;

function check(condition: unknown, message: string): asserts condition {
  assert(condition, message);
  checks += 1;
}

function run(root: string, args: string[], context = 'test-session'): string {
  return execFileSync(
    python,
    ['-X', 'utf8', path.join(root, '.omp-flow', 'scripts', 'omp_flow.py'), '--cwd', root, ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, OMP_FLOW_CONTEXT_ID: context },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim();
}

function json<T>(root: string, args: string[], context = 'test-session'): T {
  return JSON.parse(run(root, args, context)) as T;
}

function failure(root: string, args: string[], expected: string, context = 'test-session'): void {
  const result = spawnSync(
    python,
    ['-X', 'utf8', path.join(root, '.omp-flow', 'scripts', 'omp_flow.py'), '--cwd', root, ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, OMP_FLOW_CONTEXT_ID: context },
    },
  );
  check(result.status === 2, `expected failure for ${args.join(' ')}`);
  check(result.stderr.includes(expected), `failure should include ${expected}: ${result.stderr}`);
}

function writeConcept(file: string, type: string, title: string, body: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `---\ntype: ${JSON.stringify(type)}\ntitle: ${JSON.stringify(title)}\n---\n\n# ${title}\n\n${body}\n`,
    'utf8',
  );
}

interface CreatedTask {
  taskId: string;
  taskDir: string;
}

interface Operation {
  id: string;
  actor_id: string;
  state: string;
  predecessor: string | null;
  output_path: string;
}

interface Started {
  operation: Operation;
  assignment: string;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-okf-'));
try {
  console.log('--- install');
  deployInitResources({ cwd: root, harnesses: ['omp', 'codex', 'claude'] });
  const resources = getManagedResources(['omp', 'codex', 'claude']);
  check(resources.length > 0, 'managed resources are declared');
  for (const resource of resources) {
    check(fs.statSync(path.join(root, resource.destinationPath)).isFile(), `deployed ${resource.destinationPath}`);
  }
  const deployedCore = fs.readdirSync(path.join(root, '.omp-flow', 'scripts', 'common')).sort();
  check(
    JSON.stringify(deployedCore) === JSON.stringify([
      '__init__.py',
      'active_task.py',
      'io.py',
      'operation_store.py',
      'paths.py',
      'task_store.py',
    ]),
    `runtime kernel is minimal: ${deployedCore.join(', ')}`,
  );
  for (const legacy of [
    'workflow.py',
    'topology.py',
    'context.py',
    'reference.py',
    'gates.py',
    'evidence.py',
    'amend.py',
    'currency.py',
    'disposition.py',
  ]) {
    check(!fs.existsSync(path.join(root, '.omp-flow', 'scripts', 'common', legacy)), `${legacy} is retired`);
  }
  check(!fs.existsSync(path.join(root, '.codex', 'hooks.json')), 'Codex has no legacy state-render hook');
  const claudeSettings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
  check(!('UserPromptSubmit' in claudeSettings.hooks), 'Claude has no per-turn semantic state hook');
  check(
    claudeSettings.hooks.PreToolUse.length === 2
      && claudeSettings.hooks.PreToolUse.every((item: { matcher: string }) => ['Write', 'Edit'].includes(item.matcher)),
    'Claude protects runtime writes without intercepting semantic dispatch',
  );
  const sourceRoot = process.cwd();
  for (const skill of ['omp-flow-debug', 'omp-flow-ui-designer', 'omp-flow-wiki']) {
    const canonical = fs.readFileSync(
      path.join(sourceRoot, 'templates', 'common', 'skills', skill, 'SKILL.md'),
      'utf8',
    );
    for (const harnessRoot of ['.agents', '.omp', '.codex', '.claude']) {
      check(
        fs.readFileSync(path.join(sourceRoot, harnessRoot, 'skills', skill, 'SKILL.md'), 'utf8') === canonical,
        `${skill} is synchronized to ${harnessRoot}`,
      );
    }
    for (const harnessRoot of ['.agents', '.omp', '.codex', '.claude']) {
      check(
        fs.readFileSync(path.join(root, harnessRoot, 'skills', skill, 'SKILL.md'), 'utf8') === canonical,
        `${skill} deploys identically to ${harnessRoot}`,
      );
    }
    if (skill !== 'omp-flow-wiki') {
      check(
        ['Bundle root', 'entry Concept', 'output boundary', 'operation receipt']
          .every(required => canonical.includes(required)),
        `${skill} requires Bundle entry/output/receipt inputs`,
      );
      check(
        !/task\/row IDs|assigned row|row boundary|accepted context|context package|Python Evidence|downstream rows/i
          .test(canonical),
        `${skill} contains no retired row, context-pack, or Evidence consumer`,
      );
    }
  }

  console.log('--- Bundle scaffold and Explore spiral');
  const created = json<CreatedTask>(root, ['task', 'create', 'Semantic dogfood', '--slug', 'semantic-dogfood']);
  const taskRoot = created.taskDir;
  check(
    JSON.stringify(fs.readdirSync(taskRoot).sort()) === JSON.stringify(['brainstorm.md', 'index.md', 'task.md']),
    'new task has only the minimal Bundle seed',
  );
  check(fs.readFileSync(path.join(taskRoot, 'index.md'), 'utf8').includes('okf_version: "0.2"'), 'root declares OKF v0.2');
  for (const retired of [
    'task.json',
    'tasks.csv',
    'evidence.csv',
    'implement.jsonl',
    'check.jsonl',
    'context/index.json',
    '.task',
    '.summaries',
  ]) {
    check(!fs.existsSync(path.join(taskRoot, retired)), `scaffold omits ${retired}`);
  }

  fs.mkdirSync(path.join(taskRoot, 'research'), { recursive: true });
  fs.mkdirSync(path.join(taskRoot, 'work'), { recursive: true });
  fs.mkdirSync(path.join(taskRoot, 'review'), { recursive: true });
  fs.mkdirSync(path.join(taskRoot, 'qbd'), { recursive: true });
  writeConcept(
    path.join(taskRoot, 'research', 'cache-observation.md'),
    'Research',
    'Cache observation',
    'This evidence reframes the open question. Return to [brainstorm](../brainstorm.md).',
  );
  fs.appendFileSync(
    path.join(taskRoot, 'brainstorm.md'),
    '\nEvidence loop: [cache observation](research/cache-observation.md).\n',
    'utf8',
  );
  writeConcept(
    path.join(taskRoot, 'design.md'),
    'Technical Design',
    'Selected direction',
    'Derived from [the reframed question](brainstorm.md).',
  );
  writeConcept(
    path.join(taskRoot, 'qbd', 'human-decision.md'),
    'Human Decision',
    'Proceed with grouped work',
    'The human accepted [the selected design](../design.md).',
  );
  writeConcept(
    path.join(taskRoot, 'work', 'first-change.md'),
    'Work',
    'First descriptive change',
    'Implement [the selected design](../design.md).',
  );
  writeConcept(
    path.join(taskRoot, 'work', 'second-change.md'),
    'Work',
    'Second descriptive change',
    'Can run beside [the first change](first-change.md).',
  );
  writeConcept(
    path.join(taskRoot, 'work', 'index.md'),
    'Work Map',
    'Work grouping',
    'Parallel group: [first](first-change.md) and [second](second-change.md).',
  );
  fs.appendFileSync(
    path.join(taskRoot, 'index.md'),
    '\n- [Research](research/cache-observation.md)\n- [Design](design.md)\n'
      + '- [Human decision](qbd/human-decision.md)\n- [Grouped work](work/index.md)\n',
    'utf8',
  );
  check(
    fs.readFileSync(path.join(taskRoot, 'brainstorm.md'), 'utf8').includes('research/cache-observation.md'),
    'brainstorm and research are linked in both reasoning directions',
  );

  console.log('--- session, path, operation, review');
  const current = json<{ taskId: string }>(root, ['task', 'current']);
  check(current.taskId === created.taskId, 'creation selects the Bundle for the current session');
  const other = json<CreatedTask>(root, ['task', 'create', 'Other session', '--slug', 'other-session'], 'other');
  check(
    json<{ taskId: string }>(root, ['task', 'current'], 'other').taskId === other.taskId
      && json<{ taskId: string }>(root, ['task', 'current']).taskId === created.taskId,
    'active task selection is session isolated',
  );
  failure(root, ['task', 'show', '..'], 'Task path escapes task root');
  failure(
    root,
    ['operation', 'start', '--entry', '../other.md', '--output', 'src', '--role', 'executor', '--actor-id', 'x', '--objective', 'x'],
    'Path escapes repository root',
  );
  failure(
    root,
    ['operation', 'start', '--entry', 'work/missing.md', '--output', 'src', '--role', 'executor', '--actor-id', 'x', '--objective', 'x'],
    'Required entry Concept not found',
  );

  const implementation = json<Started>(root, [
    'operation', 'start',
    '--entry', 'work/first-change.md',
    '--output', `.omp-flow/tasks/${created.taskId}/work/first-handoff.md`,
    '--role', 'executor',
    '--actor-id', 'implementer-native-id',
    '--objective', 'Implement the first linked work',
    '--require-external-receipt',
  ]);
  const firstLine = implementation.assignment.split(/\r?\n/).find(line => line.trim())!;
  const descriptor = JSON.parse(firstLine).ompFlowDispatch;
  check(
    descriptor.receipt === implementation.operation.id
      && descriptor.actorId === 'implementer-native-id'
      && descriptor.entry.endsWith('/work/first-change.md'),
    'runtime produces a strict path-and-receipt assignment',
  );
  const claudeCards = [
    ['omp-flow-research.md', 'researcher', 'omp-flow-research'],
    ['omp-flow-architect.md', 'architect', 'omp-flow-architect'],
    ['omp-flow-qbd.md', 'qbd-auditor', 'omp-flow-qbd'],
    ['omp-flow-implement.md', 'executor', 'omp-flow-implement'],
    ['omp-flow-check.md', 'reviewer', 'omp-flow-check'],
  ] as const;
  check(
    Object.keys(JSON.parse(firstLine).ompFlowDispatch).sort().join(',') ===
      'actorId,bundle,entry,objective,output,predecessor,predecessorOutput,receipt,role,version',
    'operation assignment first line has the exact strict-v1 descriptor shape',
  );
  for (const [cardName, expectedRole, agentType] of claudeCards) {
    const canonicalCard = fs.readFileSync(
      path.join(sourceRoot, 'templates', 'claude', 'agents', cardName),
      'utf8',
    );
    const deployedCard = fs.readFileSync(path.join(root, '.claude', 'agents', cardName), 'utf8');
    check(canonicalCard === deployedCard, `${cardName} deploys byte-identically`);
    check(
      canonicalCard.includes('first non-blank assignment line')
        && canonicalCard.includes('{"ompFlowDispatch":{...}}')
        && canonicalCard.includes('Require its role')
        && canonicalCard.includes(`\`${expectedRole}\``)
        && ['bundle', 'entry', 'output', 'actorId', 'receipt', 'predecessor']
          .every(field => canonicalCard.includes(`\`${field}\``)),
      `${cardName} accepts and reads the operation-produced descriptor`,
    );
    check(
      canonicalCard.includes('<!-- omp-flow-claude-identity:v1 -->')
        && canonicalCard.includes(`agentType\` exactly \`${agentType}`)
        && !canonicalCard.includes('<!-- omp-flow-claude-dispatch:v1 -->'),
      `${cardName} retains independent native identity without the retired prompt marker`,
    );
  }
  writeConcept(
    path.join(taskRoot, 'work', 'first-handoff.md'),
    'Implementation Handoff',
    'First change handoff',
    'Completed [the assigned work](first-change.md). Native implementation receipt recorded in the operation runtime.',
  );
  json<Operation>(root, [
    'operation', 'finish', implementation.operation.id,
    '--state', 'completed',
    '--actor-id', 'implementer-native-id',
    '--external-receipt', 'native-implementation-result',
  ]);
  failure(
    root,
    [
      'operation', 'start',
      '--entry', 'work/first-change.md',
      '--output', `.omp-flow/tasks/${created.taskId}/review/first-review.md`,
      '--role', 'reviewer',
      '--actor-id', 'implementer-native-id',
      '--objective', 'Review',
      '--predecessor', implementation.operation.id,
    ],
    'Independent review actor must differ',
  );
  const review = json<Started>(root, [
    'operation', 'start',
    '--entry', 'work/first-change.md',
    '--output', `.omp-flow/tasks/${created.taskId}/review/first-review.md`,
    '--role', 'reviewer',
    '--actor-id', 'reviewer-native-id',
    '--objective', 'Independently review the linked handoff and code',
    '--predecessor', implementation.operation.id,
  ]);
  check(
    review.operation.predecessor === implementation.operation.id
      && review.operation.actor_id !== implementation.operation.actor_id,
    'review receipt preserves predecessor correlation and actor independence',
  );
  failure(root, ['task', 'archive'], 'Task has active runtime operations');
  writeConcept(
    path.join(taskRoot, 'review', 'first-review.md'),
    'Review',
    'Independent review',
    'PASS. Reviewed [the work](../work/first-change.md) and [handoff](../work/first-handoff.md).',
  );
  json<Operation>(root, [
    'operation', 'finish', review.operation.id,
    '--state', 'completed',
    '--actor-id', 'reviewer-native-id',
  ]);

  console.log('--- native OMP role/descriptor seam');
  const extension = new OMPFlowExtension(root);
  const managedRoles = [
    'architect',
    'executor',
    'explore',
    'oracle',
    'orchestrator',
    'planner',
    'qbd-auditor',
    'researcher',
    'reviewer',
  ];
  for (const role of managedRoles) {
    const actorId = `native-${role}`;
    const startArgs = [
      'operation', 'start',
      '--entry', 'work/first-change.md',
      '--output', `.omp-flow/tasks/${created.taskId}/adapter/${role}.md`,
      '--role', role,
      '--actor-id', actorId,
      '--objective', `Probe ${role} through the native adapter`,
    ];
    if (role === 'reviewer') {
      startArgs.push('--predecessor', implementation.operation.id);
    }
    const started = json<Started>(root, startArgs);
    const sessionManager = {
      getSessionId: () => 'test-session',
      taskDepth: 0,
    };
    const valid = extension.onToolCall({
      toolName: 'task',
      input: {
        agent: role,
        id: actorId,
        assignment: started.assignment,
      },
      sessionManager,
    });
    check(valid.block !== true, `${role} valid strict descriptor reaches native dispatch`);
    check(
      (valid.input as Record<string, unknown>).assignment === started.assignment,
      `${role} assignment is forwarded unchanged`,
    );
    const malformed = extension.onToolCall({
      toolName: 'task',
      input: {
        agent: role,
        id: actorId,
        assignment: 'not-a-descriptor',
      },
      sessionManager,
    });
    check(malformed.block === true, `${role} malformed descriptor fails closed`);
    json<Operation>(root, [
      'operation', 'finish', started.operation.id,
      '--state', 'failed',
      '--actor-id', actorId,
    ]);
  }
  const missingQbd = extension.onToolCall({
    toolName: 'task',
    input: {
      agent: 'qbd-auditor',
      id: 'native-qbd-missing',
    },
    sessionManager: {
      getSessionId: () => 'test-session',
      taskDepth: 0,
    },
  });
  check(missingQbd.block === true, 'qbd-auditor missing descriptor fails closed');

  console.log('--- duplicate side effect claim');
  const duplicateOne = json<Started>(root, [
    'operation', 'start',
    '--entry', 'work/second-change.md',
    '--output', `.omp-flow/tasks/${created.taskId}/work/second-handoff.md`,
    '--role', 'executor',
    '--actor-id', 'side-effect-one',
    '--objective', 'Claim one native side effect',
    '--require-external-receipt',
  ]);
  const duplicateTwo = json<Started>(root, [
    'operation', 'start',
    '--entry', 'work/second-change.md',
    '--output', `.omp-flow/tasks/${created.taskId}/work/second-handoff.md`,
    '--role', 'executor',
    '--actor-id', 'side-effect-two',
    '--objective', 'Attempt the same native side effect',
    '--require-external-receipt',
  ]);
  json<Operation>(root, [
    'operation', 'finish', duplicateOne.operation.id,
    '--state', 'completed',
    '--actor-id', 'side-effect-one',
    '--external-receipt', 'same-native-receipt',
  ]);
  failure(
    root,
    [
      'operation', 'finish', duplicateTwo.operation.id,
      '--state', 'completed',
      '--actor-id', 'side-effect-two',
      '--external-receipt', 'same-native-receipt',
    ],
    'External action receipt is already claimed',
  );
  json<Operation>(root, [
    'operation', 'finish', duplicateTwo.operation.id,
    '--state', 'failed',
    '--actor-id', 'side-effect-two',
  ]);

  console.log('--- Git boundary and archive');
  execFileSync('git', ['init', '-q'], { cwd: root });
  fs.mkdirSync(path.join(root, '.omp-flow', 'cache', 'repos', 'upstream'), { recursive: true });
  fs.writeFileSync(path.join(root, '.omp-flow', 'cache', 'repos', 'upstream', 'HEAD'), 'revision', 'utf8');
  const trackedStatus = execFileSync('git', ['status', '--short', '--', `.omp-flow/tasks/${created.taskId}`], {
    cwd: root,
    encoding: 'utf8',
  });
  check(trackedStatus.trim().length > 0, 'task Bundle changes are Git-visible');
  const ignored = execFileSync(
    'git',
    ['check-ignore', '.omp-flow/.runtime', '.omp-flow/cache/repos/upstream/HEAD'],
    { cwd: root, encoding: 'utf8' },
  );
  check(ignored.includes('.runtime') && ignored.includes('cache/repos'), 'runtime and clone cache are ignored');
  const archive = json<{ archivedTo: string }>(root, ['task', 'archive']);
  const archivedRoot = path.join(root, archive.archivedTo);
  check(fs.statSync(archivedRoot).isDirectory(), 'archive relocates the whole Bundle');
  check(
    fs.existsSync(path.resolve(path.dirname(path.join(archivedRoot, 'work', 'first-handoff.md')), 'first-change.md'))
      && fs.readFileSync(path.join(archivedRoot, 'review', 'first-review.md'), 'utf8').includes('../work/first-handoff.md'),
    'relative work/handoff/review navigation survives archive',
  );
  const archivedStatus = execFileSync('git', ['status', '--short', '--', archive.archivedTo], {
    cwd: root,
    encoding: 'utf8',
  });
  check(archivedStatus.trim().length > 0, 'archive relocation remains Git-visible');

  console.log('--- update and Hook boundary');
  const plan = analyzeChanges(root, loadHashes(root));
  check(plan.every(item => item.status === 'unchanged'), 'fresh install is unchanged under update analysis');
  const guard = spawnSync(
    python,
    ['-X', 'utf8', path.join(root, '.claude', 'hooks', 'protect-runtime.py')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: path.join(root, '.omp-flow', '.runtime', 'operations', 'forbidden.json') },
      }),
    },
  );
  check(guard.status === 0 && guard.stdout.includes('"permissionDecision": "deny"'), 'Claude denies direct runtime writes');
  const conceptWrite = spawnSync(
    python,
    ['-X', 'utf8', path.join(root, '.claude', 'hooks', 'protect-runtime.py')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: path.join(archivedRoot, 'new-concept.md') },
      }),
    },
  );
  check(conceptWrite.status === 0 && conceptWrite.stdout === '', 'Claude allows normal Bundle Concept writes');

  console.log(`PASS: ${checks} focused checks`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
