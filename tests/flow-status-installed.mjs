import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceRoot = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-v2-installed-'));
const artifactRoot = path.join(fixtureRoot, 'artifacts');
const projectRoot = path.join(fixtureRoot, '项目-状态栏');
fs.mkdirSync(artifactRoot, { recursive: true });
fs.mkdirSync(projectRoot, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? sourceRoot,
    env: options.env ?? process.env,
    input: options.input,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: options.timeout ?? 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, options.status ?? 0, `${command} ${args.join(' ')}\n${result.stderr}`);
  return String(result.stdout);
}

function npm(args, cwd = sourceRoot) {
  if (process.platform === 'win32') {
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return run(process.execPath, [npmCli, ...args], { cwd });
  }
  return run('npm', args, { cwd });
}

function plainStatus(value) {
  return value.replace(/\u001b\[[0-9;]*m/gu, '').replaceAll('\u00a0', ' ');
}

try {
  const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', artifactRoot]));
  assert.equal(packed.length, 1);
  const files = packed[0].files.map(item => item.path.replaceAll('\\', '/'));
  for (const required of [
    'dist/cli/flow-status-semantic-publisher.js',
    'dist/cli/flow-status-setup.js',
    'dist/cli/flow-status-supervisor.js',
    'integrations/ccstatusline/patches/ccstatusline-v2.2.27-flow-status-v2.patch',
    'templates/.omp-flow/scripts/common/flow_status.py',
    'templates/claude/hooks/flow-status-observe.py',
    'templates/claude/hooks/flow-status-task-update-guard.py',
    'templates/snow/agents/omp-flow-architect.md',
    'templates/snow/hooks/beforeToolCall.json',
    'templates/snow/hooks/onSessionStart.json',
    'templates/snow/hooks/protect-runtime.py',
    'templates/snow/hooks/session-start.py',
    'templates/cursor/agents/omp-flow-architect.md',
    'templates/cursor/hooks.json',
    'templates/cursor/protect-runtime.py',
    'templates/cursor/session-start.py',
  ]) assert.ok(files.includes(required), `packed artifact is missing ${required}`);
  assert.ok(files.every(file => !file.includes('/cache/repos/') && !file.includes('/.runtime/')));

  const tarball = path.join(artifactRoot, packed[0].filename);
  fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"private":true}\n', 'utf8');
  npm(['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund'], projectRoot);
  const installed = path.join(projectRoot, 'node_modules', 'omp-flow');
  const cli = path.join(installed, 'bin', 'omp-flow.js');
  run(process.execPath, [cli, 'init', '--claude'], { cwd: projectRoot });

  const compatibleTarball = process.env.OMP_FLOW_CCSTATUSLINE_TARBALL;
  assert.ok(compatibleTarball, 'OMP_FLOW_CCSTATUSLINE_TARBALL must name the clean-built pinned artifact');
  assert.ok(fs.statSync(compatibleTarball).isFile(), 'clean-built ccstatusline tarball is missing');
  npm(['install', compatibleTarball, '--ignore-scripts', '--no-audit', '--no-fund'], projectRoot);
  const compatible = path.join(projectRoot, 'node_modules', '@omp-flow', 'ccstatusline');
  const executable = path.join(compatible, 'dist', 'ccstatusline.js');
  const packageJson = path.join(compatible, 'package.json');
  const config = path.join(projectRoot, '.claude', 'ccstatusline.json');
  const settings = path.join(projectRoot, '.claude', 'settings.json');
  const setup = [
    cli, 'flow-status', 'setup',
    '--scope', 'project',
    '--ccstatusline-bin', executable,
    '--ccstatusline-package-json', packageJson,
    '--ccstatusline-config', config,
    '--claude-settings', settings,
    '--root-task-line', '1',
    '--root-task-position', '1',
    '--flow-line', '2',
    '--flow-position', '1',
  ];
  assert.equal(JSON.parse(run(process.execPath, setup, { cwd: projectRoot })).state, 'confirmation-required');
  assert.equal(JSON.parse(run(process.execPath, [...setup, '--yes'], { cwd: projectRoot })).state, 'configured');
  assert.equal(JSON.parse(run(process.execPath, [...setup, '--yes'], { cwd: projectRoot })).state, 'unchanged');

  const document = JSON.parse(fs.readFileSync(config, 'utf8'));
  assert.deepEqual(
    [document.lines[0][0], document.lines[1][0]],
    [
      { id: 'omp-flow-root-task-v2', type: 'flow-status', view: 'root-task' },
      { id: 'omp-flow-flow-v2', type: 'flow-status', view: 'flow' },
    ],
  );
  assert.equal(document.powerline.enabled, true);
  const installedSettings = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.match(installedSettings.statusLine.command, /flow-status-supervisor/u);

  const doctor = JSON.parse(run(process.execPath, [
    cli, 'flow-status', 'doctor',
    '--ccstatusline-bin', executable,
    '--ccstatusline-package-json', packageJson,
    '--ccstatusline-config', config,
    '--claude-settings', settings,
  ], { cwd: projectRoot }));
  assert.equal(doctor.claude.configured, true);
  assert.equal(doctor.claude.guardConformant, true);
  assert.equal(doctor.claude.nativeE2E, 'unproven');

  const session = 'installed-claude-session';
  const created = JSON.parse(run(process.execPath, [
    cli, 'task', 'create', '状态栏真实产物', '--slug', 'installed-flow-status',
  ], {
    cwd: projectRoot,
    env: { ...process.env, OMP_FLOW_CONTEXT_ID: session },
  }));
  const now = Date.now();
  const publication = {
    version: 2,
    capability: 'rootFlowSemanticInputV2',
    requestId: 'installed-publication-request',
    expectedPreviousPublicationRevision: null,
    scope: { repositoryRoot: projectRoot, host: 'claude', hostSessionId: session },
    rootTask: {
      taskId: created.taskId,
      title: '状态栏真实产物',
      selectionRevision: 'installed-selection-revision',
    },
    orientation: {
      position: 'execute',
      movement: 'initial',
      fromPosition: null,
      resumeFrom: null,
      detailInput: { kind: 'execute' },
      measureInput: {
        owner: 'accepted-work',
        label: 'Work',
        current: 1,
        total: 3,
        unit: 'work',
        unitSetRevision: 'installed-work-set-revision',
        sourceRevision: 'installed-source-revision',
      },
    },
    workSetBaseline: {
      state: 'available',
      workSetRevision: 'installed-work-set-revision',
      catalogRevision: 'installed-catalog-revision',
      workTotal: 3,
      currentExecution: {
        workId: 'installed-render',
        focus: 'implement',
        reworkRound: 0,
      },
      works: [
        {
          workId: 'installed-accepted',
          title: '产物准备',
          currentWorkRevision: 'installed-work-accepted-revision',
          currentHandoff: {
            workRevision: 'installed-work-accepted-revision',
            handoffRevision: 'installed-handoff-revision',
            implementerActorId: 'installed-implementer',
          },
          currentIndependentReview: {
            workRevision: 'installed-work-accepted-revision',
            handoffRevision: 'installed-handoff-revision',
            reviewId: 'installed-review',
            reviewRevision: 'installed-review-revision',
            reviewerActorId: 'installed-reviewer',
            reviewRound: 1,
            independence: 'different-actor',
            result: 'accepted',
          },
        },
        {
          workId: 'installed-render',
          title: '真实渲染',
          currentWorkRevision: 'installed-work-render-revision',
          currentHandoff: null,
          currentIndependentReview: null,
        },
        {
          workId: 'installed-remove',
          title: '安全卸载',
          currentWorkRevision: 'installed-work-remove-revision',
          currentHandoff: null,
          currentIndependentReview: null,
        },
      ],
    },
    drilldown: { wave: null },
    publisher: {
      publisherId: 'installed-orchestrator',
      actorId: 'installed-actor',
      sourceRevision: 'installed-source-revision',
      publicationRevision: 'installed-publication-revision',
    },
    semanticObservedAtUnixMs: now,
    lease: {
      leaseId: 'installed-lease-identifier',
      leaseRevision: 'installed-lease-revision',
      durationMs: 600_000,
    },
  };
  const publisherModule = await import(pathToFileURL(
    path.join(installed, 'dist', 'cli', 'flow-status-semantic-publisher.js'),
  ).href);
  const builtPublication = publisherModule.buildRootFlowPublishRequestV2(null, publication);
  assert.equal(
    builtPublication.capability,
    'orchestratorFlowPublicationV2',
    `installed semantic publisher rejected fixture: ${JSON.stringify(builtPublication)}`,
  );
  run(process.execPath, [
    cli, 'flow-status', 'publish',
    '--host', 'claude',
    '--session', session,
    '--actor-id', 'installed-actor',
  ], {
    cwd: projectRoot,
    env: { ...process.env, OMP_FLOW_CONTEXT_ID: session },
    input: JSON.stringify(publication),
  });
  const binding = path.join(projectRoot, '.omp-flow', '.flow-status-supervisor.json');
  const statusInput = JSON.stringify({
    session_id: session,
    cwd: projectRoot,
    workspace: { current_dir: projectRoot },
    model: { id: 'claude-sonnet', display_name: 'Sonnet' },
  });
  const directRendered = run(process.execPath, [executable, '--config', config], {
    cwd: projectRoot,
    input: statusInput,
    timeout: 10_000,
  });
  assert.match(plainStatus(directRendered), /Task .*状态栏真实产物/u);
  assert.match(plainStatus(directRendered), /Flow 6\/9.*Execute/u);
  assert.match(plainStatus(directRendered), /Work 1\/3/u);
  const supervisorModule = await import(pathToFileURL(
    path.join(installed, 'dist', 'cli', 'flow-status-supervisor.js'),
  ).href);
  const supervised = supervisorModule.runSupervisedChild(
    JSON.parse(fs.readFileSync(binding, 'utf8')),
    Buffer.from(statusInput),
    { timeoutMs: 1_200 },
  );
  const rendered = (await supervised.presentation).toString('utf8');
  const supervisorReceipt = await supervised.cleanup;
  assert.equal(supervisorReceipt.timedOut, false, 'clean-built production child completes without a stall');
  assert.equal(supervisorReceipt.exitCode, 0);
  assert.match(plainStatus(rendered), /Task .*状态栏真实产物/u);
  assert.match(plainStatus(rendered), /Flow 6\/9.*Execute/u);
  assert.match(plainStatus(rendered), /Work 1\/3/u);

  const removal = JSON.parse(run(process.execPath, [
    cli, 'flow-status', 'remove',
    '--scope', 'project',
    '--ccstatusline-config', config,
    '--claude-settings', settings,
    '--yes',
  ], { cwd: projectRoot }));
  assert.equal(removal.views, 'removed');
  assert.equal(JSON.parse(fs.readFileSync(settings, 'utf8')).statusLine, undefined);
  console.log('PASS: packed Flow Status v2 and clean-built ccstatusline render through the production supervisor');
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
