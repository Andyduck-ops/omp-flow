import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FLOW_STATUS_RELEASE_ARTIFACT_PATHS,
  FlowStatusReleaseArtifactError,
  inspectFlowStatusReleaseArtifacts,
} from '../src/cli/flow-status-release-artifacts.js';

type Check = (condition: unknown, message: string) => asserts condition;
type ArtifactKind = keyof typeof FLOW_STATUS_RELEASE_ARTIFACT_PATHS;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixture(sourceRoot: string, temporaryRoot: string, name: string): string {
  const root = path.join(temporaryRoot, name);
  const sourceIntegration = path.join(sourceRoot, 'integrations', 'ccstatusline');
  const targetIntegration = path.join(root, 'integrations', 'ccstatusline');
  fs.mkdirSync(targetIntegration, { recursive: true });
  fs.copyFileSync(
    path.join(sourceIntegration, 'flow-status-build.json'),
    path.join(targetIntegration, 'flow-status-build.json'),
  );
  const targetArtifacts = path.join(targetIntegration, 'artifacts');
  fs.mkdirSync(targetArtifacts);
  for (const filename of ['ccstatusline.js', 'supervisor.js', 'package.json']) {
    fs.copyFileSync(path.join(sourceIntegration, 'artifacts', filename), path.join(targetArtifacts, filename));
  }
  return root;
}

function updateDigest(root: string, kind: ArtifactKind): void {
  const manifestPath = path.join(root, 'integrations', 'ccstatusline', 'flow-status-build.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const artifactPath = path.join(root, ...FLOW_STATUS_RELEASE_ARTIFACT_PATHS[kind].split('/'));
  manifest.artifacts[kind].sha256 = sha256(fs.readFileSync(artifactPath));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function expectCode(action: () => unknown, code: string, check: Check): void {
  try {
    action();
    check(false, `expected Flow Status artifact failure ${code}`);
  } catch (error) {
    check(error instanceof FlowStatusReleaseArtifactError, `${code} uses the typed closed failure`);
    check(error.code === code, `expected ${code}, received ${error.code}`);
  }
}

function npmPack(sourceRoot: string, destination: string): { tarball: string; files: string[] } {
  const packArgs = ['pack', '--json', '--ignore-scripts', '--pack-destination', destination];
  let command = 'npm';
  let args = packArgs;
  if (process.platform === 'win32') {
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    command = process.execPath;
    args = [npmCli, ...packArgs];
  }
  const result = spawnSync(
    command,
    args,
    {
      cwd: sourceRoot,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`npm pack failed: ${result.stderr}`);
  }
  const packed = JSON.parse(String(result.stdout));
  assert.ok(Array.isArray(packed) && packed.length === 1, 'npm pack returned one tarball');
  return {
    tarball: path.join(destination, packed[0].filename),
    files: packed[0].files.map((item: { path: string }) => item.path.replaceAll('\\', '/')),
  };
}

function packedBytes(tarball: string, relative: string): Buffer {
  const result = spawnSync('tar', ['-xOf', tarball, `package/${relative}`], {
    encoding: 'buffer',
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`tar read failed for ${relative}: ${String(result.stderr)}`);
  }
  return Buffer.from(result.stdout);
}

export function runFlowStatusReleaseArtifactTests(check: Check): void {
  const sourceRoot = process.cwd();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-release-artifacts-'));
  try {
    const inspected = inspectFlowStatusReleaseArtifacts(sourceRoot);
    check(inspected.package.name === '@omp-flow/ccstatusline', 'release artifact package name is pinned');
    check(inspected.package.version === '2.2.27-flowstatus.2', 'release artifact package version is pinned');

    for (const kind of Object.keys(FLOW_STATUS_RELEASE_ARTIFACT_PATHS) as ArtifactKind[]) {
      const missing = fixture(sourceRoot, temporaryRoot, `missing-${kind}`);
      fs.rmSync(path.join(missing, ...FLOW_STATUS_RELEASE_ARTIFACT_PATHS[kind].split('/')));
      expectCode(() => inspectFlowStatusReleaseArtifacts(missing), `missing-${kind}`, check);

      const tampered = fixture(sourceRoot, temporaryRoot, `tampered-${kind}`);
      fs.appendFileSync(path.join(tampered, ...FLOW_STATUS_RELEASE_ARTIFACT_PATHS[kind].split('/')), '\n');
      expectCode(() => inspectFlowStatusReleaseArtifacts(tampered), `digest-mismatch-${kind}`, check);
    }

    const wrongIdentity = fixture(sourceRoot, temporaryRoot, 'wrong-identity');
    const metadata = path.join(wrongIdentity, ...FLOW_STATUS_RELEASE_ARTIFACT_PATHS.packageMetadata.split('/'));
    const packageJson = JSON.parse(fs.readFileSync(metadata, 'utf8'));
    packageJson.name = '@foreign/ccstatusline';
    fs.writeFileSync(metadata, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
    updateDigest(wrongIdentity, 'packageMetadata');
    expectCode(() => inspectFlowStatusReleaseArtifacts(wrongIdentity), 'package-identity-mismatch', check);

    const wrongCapability = fixture(sourceRoot, temporaryRoot, 'wrong-capability');
    const provider = path.join(wrongCapability, ...FLOW_STATUS_RELEASE_ARTIFACT_PATHS.provider.split('/'));
    fs.writeFileSync(
      provider,
      `process.stdout.write(JSON.stringify({flowStatusWidgetV2:true,flowStatusSnapshotV2:true,flowStatusViewsV2:["flow"],flowStatusSharedFrameReadV2:true,upstreamRevision:"83c8ffd551ec700fceeed98fe9ab50de84cb49fa"}));\n`,
      'utf8',
    );
    updateDigest(wrongCapability, 'provider');
    expectCode(() => inspectFlowStatusReleaseArtifacts(wrongCapability), 'capability-mismatch', check);

    const outside = fixture(sourceRoot, temporaryRoot, 'outside-root');
    const artifactDirectory = path.join(outside, 'integrations', 'ccstatusline', 'artifacts');
    const externalArtifacts = path.join(temporaryRoot, 'external-artifacts');
    fs.cpSync(artifactDirectory, externalArtifacts, { recursive: true });
    fs.rmSync(artifactDirectory, { recursive: true });
    fs.symlinkSync(externalArtifacts, artifactDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    expectCode(
      () => inspectFlowStatusReleaseArtifacts(outside),
      'outside-package-root-provider',
      check,
    );

    const packRoot = path.join(temporaryRoot, 'pack');
    fs.mkdirSync(packRoot);
    const packed = npmPack(sourceRoot, packRoot);
    const manifest = JSON.parse(fs.readFileSync(inspected.manifestPath, 'utf8'));
    const packedArtifactPaths = packed.files.filter(file => file.startsWith('integrations/ccstatusline/artifacts/'));
    check(
      JSON.stringify(packedArtifactPaths.sort())
        === JSON.stringify(Object.values(FLOW_STATUS_RELEASE_ARTIFACT_PATHS).sort()),
      'npm tarball contains exactly the three canonical Flow Status artifact paths',
    );
    for (const kind of Object.keys(FLOW_STATUS_RELEASE_ARTIFACT_PATHS) as ArtifactKind[]) {
      const bytes = packedBytes(packed.tarball, FLOW_STATUS_RELEASE_ARTIFACT_PATHS[kind]);
      check(
        sha256(bytes) === manifest.artifacts[kind].sha256,
        `tarball ${kind} bytes match the release manifest digest`,
      );
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let checks = 0;
  runFlowStatusReleaseArtifactTests((condition, message): asserts condition => {
    assert(condition, message);
    checks += 1;
  });
  console.log(`flow-status release artifact tests passed (${checks} checks)`);
}
