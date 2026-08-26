import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FLOW_STATUS_PRODUCT_PATHS,
  planBundledFlowStatus,
  planBundledFlowStatusFromValidatedInputs,
  validateBundledFlowStatusPlanInputs,
  type ExactBytes,
  type FlowStatusPlanTarget,
} from '../src/cli/flow-status-install.js';
import type { InspectedFlowStatusReleaseArtifacts } from '../src/cli/flow-status-release-artifacts.js';
import {
  parseHarnessConfig,
  planHarnessConfigPatch,
  readHarnessConfig,
} from '../src/cli/harness.js';

type Check = (condition: unknown, message: string) => asserts condition;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function write(file: string, value: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function artifactFixture(root: string, suffix = 'one'): InspectedFlowStatusReleaseArtifacts {
  const packageRoot = path.join(root, `release-${suffix}`);
  const providerPath = path.join(packageRoot, 'ccstatusline.js');
  const supervisorPath = path.join(packageRoot, 'supervisor.js');
  const packageMetadataPath = path.join(packageRoot, 'package.json');
  const provider = Buffer.from(`provider-${suffix}\n`);
  const supervisor = Buffer.from(`supervisor-${suffix}\n`);
  const metadata = Buffer.from(`${JSON.stringify({ name: '@omp-flow/ccstatusline', version: suffix })}\n`);
  write(providerPath, provider);
  write(supervisorPath, supervisor);
  write(packageMetadataPath, metadata);
  return {
    packageRoot,
    manifestPath: path.join(packageRoot, 'manifest.json'),
    providerPath,
    supervisorPath,
    packageMetadataPath,
    providerSha256: sha256(provider),
    supervisorSha256: sha256(supervisor),
    packageMetadataSha256: sha256(metadata),
    package: { name: '@omp-flow/ccstatusline', version: suffix },
    upstreamRevision: '83c8ffd551ec700fceeed98fe9ab50de84cb49fa',
  };
}

function bytes(value: ExactBytes): Buffer | null {
  return value.state === 'absent' ? null : Buffer.from(value.bytesBase64!, 'base64');
}

function applyTargets(targets: readonly FlowStatusPlanTarget[]): void {
  for (const entry of targets) {
    if (entry.operation === 'unchanged') continue;
    const content = bytes(entry.new);
    if (content === null) {
      if (fs.existsSync(entry.absolutePath)) fs.unlinkSync(entry.absolutePath);
      continue;
    }
    fs.mkdirSync(path.dirname(entry.absolutePath), { recursive: true });
    fs.writeFileSync(entry.absolutePath, content);
  }
}

function config(root: string, flowStatus?: boolean, extra = ''): void {
  const suffix = flowStatus === undefined ? '' : `,\n  "flowStatus": ${String(flowStatus)}`;
  write(
    path.join(root, '.omp-flow', 'config.json'),
    `{\n  "schemaVersion": 1,\n  "harnesses": ["claude"]${extra}${suffix}\n}\n`,
  );
}

function noWritePlan(
  root: string,
  artifacts: InspectedFlowStatusReleaseArtifacts,
  intent: 'enable' | 'disable' | 'preserve' = 'preserve',
) {
  return planBundledFlowStatusFromValidatedInputs(
    { mode: 'update', intent },
    {
      repositoryRoot: path.resolve(root),
      artifacts,
      confinement: {
      state: 'confined',
      repositoryRoot: path.resolve(root),
      destinations: [],
      },
    },
  );
}

function tree(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const result: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll('\\', '/');
      if (entry.isDirectory()) visit(absolute);
      else result.push(`${relative}:${sha256(fs.readFileSync(absolute))}`);
    }
  };
  visit(root);
  return result.sort();
}

export function runFlowStatusProductPlanTests(check: Check): void {
  const parsedAbsent = parseHarnessConfig('{"schemaVersion":1,"harnesses":["claude"],"nested":{"keep":[1,2]}}\n');
  const parsedTrue = parseHarnessConfig('{"schemaVersion":1,"harnesses":["claude"],"flowStatus":true}\n');
  const parsedFalse = parseHarnessConfig('{"schemaVersion":1,"harnesses":["claude"],"flowStatus":false}\n');
  check(parsedAbsent.flowStatus === undefined, 'schema-1 accepts an absent Flow Status preference');
  check(parsedTrue.flowStatus === true && parsedFalse.flowStatus === false, 'schema-1 accepts boolean preferences');
  check(
    JSON.stringify(parsedAbsent.source.nested) === JSON.stringify({ keep: [1, 2] }),
    'schema-1 retains unrelated nested source members',
  );
  for (const source of [
    '{',
    '{"schemaVersion":2,"harnesses":["claude"]}',
    '{"schemaVersion":1,"harnesses":"claude"}',
    '{"schemaVersion":1,"harnesses":["unknown"]}',
    '{"schemaVersion":1,"harnesses":["claude"],"flowStatus":"yes"}',
  ]) {
    let rejected = false;
    try { parseHarnessConfig(source); } catch { rejected = true; }
    check(rejected, `schema-1 rejects malformed known input: ${source}`);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-product-plan-'));
  try {
    config(root, undefined, ',\n  "unknown": {"preserved": true}');
    const patch = planHarnessConfigPatch(root, { flowStatus: true });
    check(
      patch.oldSha256 === sha256(fs.readFileSync(patch.path))
        && patch.newSha256 === sha256(patch.newText)
        && JSON.parse(patch.newText).unknown.preserved === true,
      'preference patch contains exact old/new digests and preserves unknown values',
    );
    check(readHarnessConfig(root, true)?.sourceText === fs.readFileSync(patch.path, 'utf8'), 'reader retains exact source bytes');

    const artifacts = artifactFixture(root);
    const linkedConflict = planBundledFlowStatus({
      cwd: root,
      mode: 'update',
      intent: 'preserve',
      artifacts,
      confine: repositoryRoot => ({
        state: 'conflict',
        code: 'linked-ancestor',
        logicalTarget: FLOW_STATUS_PRODUCT_PATHS.preference,
        absolutePath: path.join(repositoryRoot, '.omp-flow'),
        detail: 'Synthetic linked/reparse-point destination refusal.',
      }),
    });
    check(
      linkedConflict.state === 'conflict'
        && linkedConflict.confinement.state === 'conflict'
        && linkedConflict.confinement.code === 'linked-ancestor'
        && linkedConflict.targets.length === 0
        && !JSON.stringify(linkedConflict).includes('preserved'),
      'public planner does not read or expose target bytes after linked/reparse confinement refusal',
    );

    const wrongTypeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-product-wrong-type-'));
    try {
      fs.mkdirSync(path.join(wrongTypeRoot, '.omp-flow', 'config.json'), { recursive: true });
      const wrongType = planBundledFlowStatus({
        cwd: wrongTypeRoot,
        mode: 'update',
        intent: 'preserve',
        artifacts,
      });
      check(
        wrongType.state === 'conflict'
          && wrongType.confinement.state === 'conflict'
          && wrongType.confinement.code === 'non-ordinary-target'
          && wrongType.confinement.logicalTarget === FLOW_STATUS_PRODUCT_PATHS.preference
          && wrongType.detail.includes('ordinary file')
          && wrongType.targets.length === 0,
        'public planner rejects a directory at a managed file target with actionable detail',
      );
    } finally {
      fs.rmSync(wrongTypeRoot, { recursive: true, force: true });
    }

    const validated = validateBundledFlowStatusPlanInputs({
      cwd: root,
      inspectArtifacts: () => artifacts,
      confine: repositoryRoot => ({
        state: 'confined', repositoryRoot: path.resolve(repositoryRoot), destinations: [],
      }),
    });
    check(validated.state === 'validated', 'validation boundary supplies confined and verified planner inputs');
    const before = tree(root);
    const fresh = noWritePlan(root, artifacts);
    check(fresh.state === 'install' && fresh.classification === 'fresh', 'fresh enabled project plans installation');
    check(fresh.targets.length === 8, 'enable plan contains seven integration targets and preference');
    check(
      JSON.stringify(tree(root)) === JSON.stringify(before)
        && !fs.existsSync(path.join(root, '.omp-flow', 'vendor')),
      'planning creates no directory, temporary file, pending record, or destination byte',
    );
    const commandTarget = fresh.targets.find(item => item.logicalTarget === FLOW_STATUS_PRODUCT_PATHS.claudeSettings)!;
    const commandText = JSON.parse(bytes(commandTarget.new)!.toString('utf8')).statusLine.command as string;
    check(
      commandText.includes(path.join(root, '.omp-flow', 'vendor', 'flow-status', 'supervisor.js'))
        && commandText.includes(path.join(root, '.omp-flow', '.flow-status-supervisor.json'))
        && !commandText.includes(artifacts.packageRoot),
      'planned Claude command names only canonical project-local supervisor and binding paths',
    );
    applyTargets(fresh.targets);

    const unchanged = noWritePlan(root, artifacts);
    check(
      unchanged.state === 'unchanged' && unchanged.targets.every(item => item.operation === 'unchanged'),
      'exact-owned installation produces a complete unchanged target plan',
    );

    fs.unlinkSync(path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.supervisor.split('/')));
    const repair = noWritePlan(root, artifacts);
    check(repair.state === 'repair' && repair.classification === 'stale-exact-owned', 'missing owned artifact plans repair');
    applyTargets(repair.targets);
    const managedSupervisor = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.supervisor.split('/'));
    write(managedSupervisor, 'user-modified\n');
    const modifiedArtifact = noWritePlan(root, artifacts);
    check(
      modifiedArtifact.state === 'conflict'
        && modifiedArtifact.classification === 'modified'
        && modifiedArtifact.targets.every(item => item.operation === 'unchanged'),
      'modified managed artifact fails closed without preference or integration takeover',
    );
    write(managedSupervisor, fs.readFileSync(artifacts.supervisorPath));

    const externalProvider = path.join(root, 'legacy-provider', 'ccstatusline.js');
    write(externalProvider, fs.readFileSync(artifacts.providerPath));
    const bindingPath = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.binding.split('/'));
    const legacyBinding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));
    legacyBinding.executable = externalProvider;
    write(bindingPath, `${JSON.stringify(legacyBinding, null, 2)}\n`);
    const settingsPath = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.claudeSettings.split('/'));
    const legacySettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const canonicalSupervisor = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.supervisor.split('/'));
    legacySettings.statusLine.command = legacySettings.statusLine.command.replace(
      canonicalSupervisor,
      path.resolve('src', 'cli', 'flow-status-supervisor.js'),
    );
    write(settingsPath, `${JSON.stringify(legacySettings, null, 2)}\n`);
    const migration = noWritePlan(root, artifacts);
    check(
      migration.state === 'update' && migration.classification === 'migratable-v2',
      'exact external v2 binding and command plan canonical project-local migration',
    );
    applyTargets(migration.targets);

    const updatedArtifacts = artifactFixture(root, 'two');
    const update = noWritePlan(root, updatedArtifacts);
    check(update.state === 'update' && update.classification === 'stale-exact-owned', 'new verified provider plans exact update');

    const removal = noWritePlan(root, artifacts, 'disable');
    check(
      removal.state === 'update'
        && removal.targets.filter(item => [
          FLOW_STATUS_PRODUCT_PATHS.provider,
          FLOW_STATUS_PRODUCT_PATHS.supervisor,
          FLOW_STATUS_PRODUCT_PATHS.packageMetadata,
          FLOW_STATUS_PRODUCT_PATHS.binding,
          FLOW_STATUS_PRODUCT_PATHS.ownership,
        ].includes(item.logicalTarget as never)).every(item => item.operation === 'delete')
        && JSON.parse(bytes(removal.targets.at(-1)!.new)!.toString('utf8')).flowStatus === false,
      'exact disable plans owned deletion, restoration, and preference false together',
    );

    const falseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-product-disabled-'));
    try {
      config(falseRoot, undefined, ',\n  "unknown": 7');
      const disabled = noWritePlan(falseRoot, artifacts, 'disable');
      check(
        disabled.state === 'disabled'
          && disabled.targets.length === 1
          && disabled.targets[0]!.logicalTarget === FLOW_STATUS_PRODUCT_PATHS.preference
          && JSON.parse(bytes(disabled.targets[0]!.new)!.toString('utf8')).unknown === 7,
        'config-only disable is planned without an integration writer and preserves unknown values',
      );
      config(falseRoot, false, ',\n  "unknown": 7');
      const enabledFromFalse = noWritePlan(falseRoot, artifacts, 'enable');
      check(
        enabledFromFalse.state === 'install'
          && JSON.parse(bytes(enabledFromFalse.targets.at(-1)!.new)!.toString('utf8')).flowStatus === true,
        'explicit enable from false plans artifacts and preference true together',
      );
    } finally {
      fs.rmSync(falseRoot, { recursive: true, force: true });
    }

    const notSelectedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-product-not-selected-'));
    try {
      write(
        path.join(notSelectedRoot, '.omp-flow', 'config.json'),
        '{"schemaVersion":1,"harnesses":["codex"]}\n',
      );
      const preserved = noWritePlan(notSelectedRoot, artifacts);
      const explicit = noWritePlan(notSelectedRoot, artifacts, 'enable');
      check(
        preserved.state === 'not-selected'
          && explicit.state === 'conflict'
          && explicit.targets.every(item => item.operation === 'unchanged'),
        'non-Claude projects report not-selected and reject explicit Flow Status intent',
      );
    } finally {
      fs.rmSync(notSelectedRoot, { recursive: true, force: true });
    }

    const conflictCases: Array<[string, unknown, string]> = [
      ['foreign', { version: 3, lines: [[{ id: 'omp-flow-root-task-v2', type: 'flow-status', view: 'root-task' }], [{ id: 'omp-flow-flow-v2', type: 'flow-status', view: 'flow' }]] }, 'foreign'],
      ['duplicate', { version: 3, lines: [[{ id: 'omp-flow-root-task-v2', type: 'flow-status', view: 'root-task' }, { id: 'omp-flow-root-task-v2', type: 'flow-status', view: 'root-task' }], []] }, 'duplicate'],
      ['swapped', { version: 3, lines: [[{ id: 'omp-flow-root-task-v2', type: 'flow-status', view: 'flow' }], [{ id: 'omp-flow-flow-v2', type: 'flow-status', view: 'root-task' }]] }, 'swapped'],
      ['partial', { version: 3, lines: [[{ id: 'omp-flow-root-task-v2', type: 'flow-status', view: 'root-task' }], []] }, 'partial-owned'],
      ['modified', { version: 3, lines: [[{ id: 'omp-flow-root-task-v2', type: 'flow-status', view: 'root-task', extra: true }], [{ id: 'omp-flow-flow-v2', type: 'flow-status', view: 'flow' }]] }, 'modified'],
    ];
    for (const [name, renderer, classification] of conflictCases) {
      const caseRoot = fs.mkdtempSync(path.join(os.tmpdir(), `omp-flow-product-${name}-`));
      try {
        config(caseRoot);
        write(path.join(caseRoot, '.claude', 'ccstatusline.json'), `${JSON.stringify(renderer)}\n`);
        const result = noWritePlan(caseRoot, artifacts, 'enable');
        check(
          result.state === 'conflict'
            && result.classification === classification
            && result.targets.every(item => item.operation === 'unchanged'),
          `${name} state is distinguished and leaves integration plus preference unchanged`,
        );
      } finally {
        fs.rmSync(caseRoot, { recursive: true, force: true });
      }
    }

    const userRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-product-user-owned-'));
    try {
      config(userRoot);
      write(path.join(userRoot, '.claude', 'settings.json'), '{"statusLine":{"type":"command","command":"user command"}}\n');
      const result = noWritePlan(userRoot, artifacts);
      check(result.state === 'conflict' && result.classification === 'user-owned', 'user-owned statusLine is distinguished');
    } finally {
      fs.rmSync(userRoot, { recursive: true, force: true });
    }

    const malformedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-product-malformed-'));
    try {
      config(malformedRoot);
      write(path.join(malformedRoot, '.claude', 'settings.json'), '{');
      const result = noWritePlan(malformedRoot, artifacts);
      check(result.state === 'conflict' && result.classification === 'malformed', 'malformed integration JSON is distinguished');
    } finally {
      fs.rmSync(malformedRoot, { recursive: true, force: true });
    }

    const pending = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.pending.split('/'));
    write(pending, '{}\n');
    const recovery = noWritePlan(root, artifacts);
    check(
      recovery.state === 'recovery-required' && recovery.targets.every(item => item.operation === 'unchanged'),
      'pending state reports recovery-required without invoking a second recovery authority',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
