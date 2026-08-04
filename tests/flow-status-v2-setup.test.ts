import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  configureFlowStatus,
  inspectFlowStatusSetup,
  probeCcstatusline,
  removeFlowStatusManagedResources,
  type FlowStatusSetupOptions,
} from '../src/cli/flow-status-setup.js';

type Check = (condition: unknown, message: string) => asserts condition;
const REVISION = '83c8ffd551ec700fceeed98fe9ab50de84cb49fa';

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fakeBuild(root: string) {
  const packageRoot = path.join(root, 'ccstatusline-v2');
  const script = path.join(packageRoot, 'dist', 'ccstatusline.js');
  const packageJson = path.join(packageRoot, 'package.json');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(
    script,
    `process.stdout.write(JSON.stringify({flowStatusWidgetV2:true,flowStatusSnapshotV2:true,flowStatusViewsV2:["root-task","flow"],flowStatusSharedFrameReadV2:true,upstreamRevision:${JSON.stringify(REVISION)}}));\n`,
    'utf8',
  );
  fs.writeFileSync(
    packageJson,
    `${JSON.stringify({ name: '@omp-flow/ccstatusline', version: '2.2.27-flowstatus.2' })}\n`,
    'utf8',
  );
  return { script, packageJson };
}

export function runFlowStatusSetupTests(root: string, check: Check): void {
  const build = fakeBuild(root);
  check(probeCcstatusline(build.script, build.packageJson).state === 'supported', 'exact v2 capability quartet is accepted');
  const config = path.join(root, '.claude', 'ccstatusline.json');
  const settings = path.join(root, '.claude', 'settings.json');
  const options: FlowStatusSetupOptions = {
    cwd: root,
    scope: 'project',
    ccstatuslineExecutable: build.script,
    ccstatuslinePackageJson: build.packageJson,
    ccstatuslineConfig: config,
    claudeSettings: settings,
    rootTaskLine: 1,
    rootTaskPosition: 1,
    flowLine: 2,
    flowPosition: 1,
  };
  const before = fs.readFileSync(settings, 'utf8');
  const confirmation = configureFlowStatus(options);
  check(
    confirmation.state === 'confirmation-required'
      && !fs.existsSync(config)
      && fs.readFileSync(settings, 'utf8') === before,
    'setup preview does not mutate without confirmation',
  );
  const configured = configureFlowStatus({ ...options, yes: true });
  const document = JSON.parse(fs.readFileSync(config, 'utf8'));
  check(
    configured.state === 'configured'
      && document.lines[0][0].id === 'omp-flow-root-task-v2'
      && document.lines[0][0].view === 'root-task'
      && document.lines[1][0].id === 'omp-flow-flow-v2'
      && document.lines[1][0].view === 'flow',
    'setup installs exactly the root Task and Flow views on two lines',
  );
  check(
    document.powerline.enabled === true
      && document.lines[0].some((item: { type?: string }) => item.type === 'model')
      && document.lines[0].some((item: { type?: string }) => item.type === 'context-length')
      && document.lines[0].some((item: { type?: string }) => item.type === 'git-branch'),
    'fresh setup keeps the Powerline/native model-context-Git row',
  );
  check(configureFlowStatus({ ...options, yes: true }).state === 'unchanged', 'repeat setup is idempotent');
  const ownerPath = path.join(root, '.omp-flow', '.flow-status-ownership.json');
  const firstOwner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
  check(firstOwner.preInstall.state === 'absent', 'fresh ownership records original absence');
  check(
    configureFlowStatus({ ...options, rootTaskPosition: 2, yes: true }).state === 'configured',
    'owned v2 placement can be updated explicitly',
  );
  const movedOwner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
  check(
    movedOwner.preInstall.state === 'absent' && movedOwner.widgets[0].position === 2,
    'v2 update preserves original pre-install state and records exact placement',
  );
  const doctor = inspectFlowStatusSetup(root, build.script, build.packageJson, settings, config);
  check(
    doctor.claude.configured
      && doctor.claude.guardConformant
      && doctor.claude.placements.rootTask?.line === 1
      && doctor.claude.placements.flow?.line === 2,
    'doctor proves configuration and guard boundaries without claiming native E2E proof',
  );
  const exactOwnerText = fs.readFileSync(ownerPath, 'utf8');
  const foreignOwner = JSON.parse(exactOwnerText);
  foreignOwner.unexpected = true;
  fs.writeFileSync(ownerPath, `${JSON.stringify(foreignOwner, null, 2)}\n`, 'utf8');
  let rejectedForeignOwner = false;
  try {
    configureFlowStatus({ ...options, rootTaskPosition: 2, yes: true });
  } catch {
    rejectedForeignOwner = true;
  }
  check(rejectedForeignOwner, 'setup fails closed on a partial or foreign ownership record');
  fs.writeFileSync(ownerPath, exactOwnerText, 'utf8');

  const exactConfigText = fs.readFileSync(config, 'utf8');
  const modifiedConfig = JSON.parse(exactConfigText);
  modifiedConfig.lines[0][1].view = 'flow';
  fs.writeFileSync(config, `${JSON.stringify(modifiedConfig, null, 2)}\n`, 'utf8');
  let rejectedModifiedRemoval = false;
  try {
    removeFlowStatusManagedResources({
      cwd: root,
      scope: 'project',
      ccstatuslineConfig: config,
      claudeSettings: settings,
      yes: true,
    });
  } catch {
    rejectedModifiedRemoval = true;
  }
  check(rejectedModifiedRemoval, 'removal fails closed when an owned view is modified');
  fs.writeFileSync(config, exactConfigText, 'utf8');
  const removed = removeFlowStatusManagedResources({
    cwd: root,
    scope: 'project',
    ccstatuslineConfig: config,
    claudeSettings: settings,
    yes: true,
  });
  check(removed.views === 'removed' && !fs.existsSync(config), 'removal deletes the exact owned fresh config');

  configureFlowStatus({ ...options, yes: true });
  const freshEdited = JSON.parse(fs.readFileSync(config, 'utf8'));
  freshEdited.userRefreshMs = 1_234;
  freshEdited.lines[0].push({ id: 'user-widget', type: 'custom', command: 'user-owned' });
  fs.writeFileSync(config, `${JSON.stringify(freshEdited, null, 2)}\n`, 'utf8');
  removeFlowStatusManagedResources({
    cwd: root,
    scope: 'project',
    ccstatuslineConfig: config,
    claudeSettings: settings,
    yes: true,
  });
  const preservedFreshEdit = JSON.parse(fs.readFileSync(config, 'utf8'));
  check(
    preservedFreshEdit.userRefreshMs === 1_234
      && preservedFreshEdit.lines[0].some((item: { id?: string }) => item.id === 'user-widget')
      && !JSON.stringify(preservedFreshEdit).includes('omp-flow-root-task-v2')
      && !JSON.stringify(preservedFreshEdit).includes('omp-flow-flow-v2'),
    'fresh removal preserves unrelated edits and removes only exact owned views after digest drift',
  );

  const baseline = {
    version: 3,
    lines: [
      [{ id: 'foreign-model', type: 'model' }],
      [{ id: 'foreign-git', type: 'git-branch' }],
    ],
  };
  fs.writeFileSync(config, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  configureFlowStatus({ ...options, yes: true });
  const existingEdited = JSON.parse(fs.readFileSync(config, 'utf8'));
  existingEdited.userTheme = { name: 'kept-after-remove' };
  existingEdited.lines[1].push({ id: 'user-context', type: 'context-length' });
  fs.writeFileSync(config, `${JSON.stringify(existingEdited, null, 2)}\n`, 'utf8');
  removeFlowStatusManagedResources({
    cwd: root,
    scope: 'project',
    ccstatuslineConfig: config,
    claudeSettings: settings,
    yes: true,
  });
  const preservedExisting = JSON.parse(fs.readFileSync(config, 'utf8'));
  check(
    preservedExisting.userTheme.name === 'kept-after-remove'
      && preservedExisting.lines[0][0].id === 'foreign-model'
      && preservedExisting.lines[1].some((item: { id?: string }) => item.id === 'foreign-git')
      && preservedExisting.lines[1].some((item: { id?: string }) => item.id === 'user-context')
      && !JSON.stringify(preservedExisting).includes('omp-flow-root-task-v2')
      && !JSON.stringify(preservedExisting).includes('omp-flow-flow-v2'),
    'existing-config removal preserves both baseline and unrelated post-install edits',
  );

  const legacyConfig = {
    version: 3,
    lines: [[{ id: 'omp-flow-flow-status-v1', type: 'flow-status' }], []],
  };
  const legacyText = `${JSON.stringify(legacyConfig, null, 2)}\n`;
  fs.writeFileSync(config, legacyText, 'utf8');
  fs.writeFileSync(ownerPath, `${JSON.stringify({
    version: 1,
    capability: 'flowStatusWidgetV1',
    configPath: config,
    providerDigest: sha256(fs.readFileSync(build.script)),
    buildRevision: REVISION,
    widget: {
      id: 'omp-flow-flow-status-v1',
      type: 'flow-status',
      line: 1,
      position: 1,
      canonicalDigest: sha256(canonical({ id: 'omp-flow-flow-status-v1', type: 'flow-status' })),
    },
    preInstall: { state: 'absent' },
    managedPostInstallDigest: sha256(legacyText),
  }, null, 2)}\n`, 'utf8');
  check(
    configureFlowStatus({ ...options, mode: 'update', yes: true }).state === 'configured',
    'explicit update performs the exact one-way owned-v1 migration',
  );
  const migrated = JSON.parse(fs.readFileSync(config, 'utf8'));
  check(
    !JSON.stringify(migrated).includes('omp-flow-flow-status-v1')
      && migrated.lines[0][0].id === 'omp-flow-root-task-v2'
      && migrated.lines[1][0].id === 'omp-flow-flow-v2',
    'v1 migration atomically replaces the legacy view with the exact v2 pair',
  );
  removeFlowStatusManagedResources({
    cwd: root,
    scope: 'project',
    ccstatuslineConfig: config,
    claudeSettings: settings,
    yes: true,
  });
}
