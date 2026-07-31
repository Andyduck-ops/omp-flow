import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FLOW_STATUS_SUPERVISOR_TIMEOUT_MS,
  runSupervisedChild,
} from '../dist/cli/flow-status-supervisor.js';

const tarball = process.env.OMP_FLOW_CCSTATUSLINE_TARBALL;
if (!tarball || !fs.statSync(tarball).isFile()) {
  throw new Error('OMP_FLOW_CCSTATUSLINE_TARBALL must name the clean-built pinned production artifact');
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-status-v2-benchmark-'));
const artifact = path.join(root, 'artifact');
const project = path.resolve(path.join(root, '项目-基准'));
const session = 'benchmark-claude-session';
const config = path.join(project, 'ccstatusline.json');

function nearestRankP95(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
}

function deadline(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => setTimeout(
      () => reject(new Error(`${label} exceeded ${ms} ms`)),
      ms,
    )),
  ]);
}

async function sample(spec, input, timeoutMs = FLOW_STATUS_SUPERVISOR_TIMEOUT_MS) {
  const started = performance.now();
  const child = runSupervisedChild(spec, input, { timeoutMs });
  const presentation = await deadline(child.presentation, 1_200, 'presentation watchdog');
  const presentedAt = performance.now();
  const cleanup = await deadline(child.cleanup, 1_000, 'cleanup watchdog');
  return {
    presentationMs: presentedAt - started,
    cleanupMs: performance.now() - started,
    bytes: presentation.byteLength,
    receipt: cleanup,
  };
}

function cacheKey(repositoryRoot, hostSessionId) {
  return createHash('sha256')
    .update(JSON.stringify([repositoryRoot, 'claude', hostSessionId]), 'utf8')
    .digest('hex');
}

async function removeBenchmarkRoot(target) {
  const deadlineMs = Date.now() + 10_000;
  while (true) {
    try {
      await fs.promises.rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      const retryable = error && typeof error === 'object'
        && ['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code);
      if (!retryable || Date.now() >= deadlineMs) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}

function writeSnapshot(now) {
  const scope = { repositoryRoot: project, host: 'claude', hostSessionId: session };
  const publication = {
    version: 2,
    capability: 'orchestratorFlowPublicationV2',
    requestId: 'benchmark-request-revision',
    requestDigest: '0'.repeat(64),
    scope,
    rootTask: {
      taskId: '07-30-omp-flow-tui-control',
      title: '状态栏返工',
      selectionRevision: 'benchmark-selection-revision',
    },
    orientation: {
      position: 'execute',
      movement: 'forward',
      fromPosition: 'qbd-2',
      resumeFrom: null,
      detail: {
        kind: 'execute',
        workSetRevision: 'benchmark-work-set-revision',
        workTotal: 13,
        workCatalogRevision: 'benchmark-catalog-revision',
        workCatalogDigest: '1'.repeat(64),
        acceptedWork: 4,
        acceptanceSetRevision: 'benchmark-acceptance-revision',
        acceptanceDigest: '2'.repeat(64),
        currentWork: {
          workId: 'benchmark-render',
          title: '真实渲染',
          workRevision: 'benchmark-work-revision',
          focus: 'review',
          reviewRound: 2,
          reworkRound: 1,
          reviewVerdict: 'pending',
          handoffRevision: 'benchmark-handoff-revision',
        },
      },
      measure: {
        owner: 'accepted-work',
        label: 'Work',
        current: 4,
        total: 13,
        unit: 'accepted',
        unitSetRevision: 'benchmark-work-set-revision',
        sourceRevision: 'benchmark-acceptance-revision',
      },
    },
    drilldown: { wave: null },
    publisher: {
      publisherId: 'benchmark-publisher',
      actorId: 'benchmark-actor',
      sourceRevision: 'benchmark-source-revision',
      publicationRevision: 'benchmark-publication-revision',
    },
    semanticObservedAtUnixMs: now,
    lease: {
      leaseId: 'benchmark-lease-identifier',
      leaseRevision: 'benchmark-lease-revision',
      ownerActorId: 'benchmark-actor',
      selectionRevision: 'benchmark-selection-revision',
      issuedAtUnixMs: now,
      expiresAtUnixMs: now + 900_000,
      durationMs: 900_000,
    },
  };
  const snapshot = {
    version: 2,
    snapshotRevision: 'benchmark-snapshot-revision',
    generatedAtUnixMs: now,
    scope,
    rootFlow: { state: 'available', publication },
    nativeActivity: null,
  };
  const cache = path.join(project, '.omp-flow', '.runtime', 'flow-status');
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(
    path.join(cache, `${cacheKey(project, session)}.json`),
    `${JSON.stringify({ version: 2, cachedAtUnixMs: now, snapshot })}\n`,
    'utf8',
  );
}

try {
  fs.mkdirSync(artifact, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  const extracted = spawnSync('tar', ['-xf', path.resolve(tarball), '-C', artifact], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 30_000,
  });
  if (extracted.error || extracted.status !== 0) {
    throw extracted.error ?? new Error(extracted.stderr);
  }
  const executable = path.join(artifact, 'package', 'dist', 'ccstatusline.js');
  const packageJson = JSON.parse(fs.readFileSync(path.join(artifact, 'package', 'package.json'), 'utf8'));
  if (packageJson.name !== '@omp-flow/ccstatusline' || packageJson.version !== '2.2.27-flowstatus.2') {
    throw new Error('benchmark artifact is not the exact pinned ccstatusline package');
  }
  fs.writeFileSync(config, `${JSON.stringify({
    version: 3,
    lines: [
      [{ id: 'benchmark-root', type: 'flow-status', view: 'root-task' }],
      [{ id: 'benchmark-flow', type: 'flow-status', view: 'flow' }],
    ],
    powerline: { enabled: false },
  })}\n`, 'utf8');
  writeSnapshot(Date.now());
  const input = Buffer.from(JSON.stringify({
    session_id: session,
    cwd: project,
    workspace: { current_dir: project },
  }));
  const providerRun = spawnSync(
    process.execPath,
    [executable, '--config', config, '--flow-status-provider-benchmark', '200'],
    {
      cwd: project,
      input,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (providerRun.error || providerRun.status !== 0) {
    throw providerRun.error ?? new Error(providerRun.stderr);
  }
  const providerReport = JSON.parse(providerRun.stdout);
  if (
    providerReport.capability !== 'flowStatusProviderBenchmarkV2'
    || providerReport.samples.length !== 200
    || providerReport.bytes <= 0
  ) throw new Error('production provider benchmark returned an invalid report');
  const warm = providerReport.samples;
  const realSpec = {
    executable,
    configPath: config,
    cwd: project,
    expectedExecutableDigest: createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),
  };
  const hanging = path.join(root, 'hanging.js');
  const hangingConfig = path.join(root, 'hanging.json');
  fs.writeFileSync(hanging, 'setInterval(()=>{},1000);\n', 'utf8');
  fs.writeFileSync(hangingConfig, '{}\n', 'utf8');
  const hangingSpec = {
    executable: hanging,
    configPath: hangingConfig,
    cwd: root,
    expectedExecutableDigest: createHash('sha256').update(fs.readFileSync(hanging)).digest('hex'),
  };
  const hangs = [];
  for (let index = 0; index < 20; index += 1) hangs.push(await sample(hangingSpec, Buffer.alloc(0)));
  const cold = [];
  const coldRendered = [];
  for (let index = 0; index < 40; index += 1) {
    const result = await sample(realSpec, input, 1_200);
    cold.push(result.presentationMs);
    coldRendered.push(result.bytes > 0);
  }
  const warmP95 = nearestRankP95(warm);
  const coldP95 = nearestRankP95(cold);
  const hangPresentationMax = Math.max(...hangs.map(item => item.presentationMs));
  const hangCleanupMax = Math.max(...hangs.map(item => item.cleanupMs));
  const killLatenessMax = Math.max(...hangs.map(item => (
    item.receipt.killRequestedAtUnixMs - item.receipt.spawnedAtUnixMs
  )));
  const gates = {
    warmP95: warmP95 <= 50,
    coldP95: coldP95 <= 250,
    hungKill: killLatenessMax <= 450,
    hungPresentation: hangPresentationMax <= 600,
    hungCleanup: hangCleanupMax <= 1000,
  };
  const report = {
    version: 2,
    capability: 'flowStatusSupervisorBenchmarkV2',
    productionArtifact: {
      package: `${packageJson.name}@${packageJson.version}`,
      tarballSha256: createHash('sha256').update(fs.readFileSync(tarball)).digest('hex'),
      providerCapability: providerReport.capability,
    },
    platform: {
      platform: process.platform,
      release: os.release(),
      arch: process.arch,
      node: process.version,
    },
    samples: {
      discardedWarmups: providerReport.discardedWarmups,
      warm: { count: warm.length, durationsMs: warm, p95Ms: warmP95, maxMs: Math.max(...warm) },
      cold: {
        count: cold.length,
        rendered: coldRendered.filter(Boolean).length,
        durationsMs: cold,
        p95Ms: coldP95,
        maxMs: Math.max(...cold),
      },
      hangingChild: {
        count: hangs.length,
        presentationMs: hangs.map(item => item.presentationMs),
        cleanupMs: hangs.map(item => item.cleanupMs),
        killLatenessMs: hangs.map(item => (
          item.receipt.killRequestedAtUnixMs - item.receipt.spawnedAtUnixMs
        )),
      },
    },
    gates,
    calibration: {
      coldP95NonBlocking: true,
      reason: 'human-calibrated local idle-run cost; correctness and hung-child gates remain blocking',
    },
    pass: gates.warmP95 && gates.hungKill && gates.hungPresentation && gates.hungCleanup,
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.pass && process.env.OMP_FLOW_BENCHMARK_STRICT === '1') process.exitCode = 1;
} finally {
  // Windows may release a just-closed executable or cwd a few scheduler turns after `close`.
  // Retry only the three documented file-release races and retain a hard 10-second bound.
  await removeBenchmarkRoot(root);
}
