import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIGEST = /^[0-9a-f]{64}$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const PROBE_TIMEOUT_MS = 3_000;
const PROBE_MAX_BUFFER = 16 * 1024;

export const FLOW_STATUS_RELEASE_MANIFEST = 'integrations/ccstatusline/flow-status-build.json';
export const FLOW_STATUS_RELEASE_ARTIFACT_PATHS = {
  provider: 'integrations/ccstatusline/artifacts/ccstatusline.js',
  supervisor: 'integrations/ccstatusline/artifacts/supervisor.js',
  packageMetadata: 'integrations/ccstatusline/artifacts/package.json',
} as const;

type ArtifactKind = keyof typeof FLOW_STATUS_RELEASE_ARTIFACT_PATHS;

interface ManifestArtifact {
  path: string;
  sha256: string;
}

interface ReleaseManifest {
  version: number;
  upstream: { revision: string };
  package: { name: string; version: string };
  capability: {
    flowStatusWidgetV2: boolean;
    flowStatusSnapshotV2: boolean;
    flowStatusViewsV2: string[];
    flowStatusSharedFrameReadV2: boolean;
    upstreamRevision: string;
  };
  artifacts: Record<ArtifactKind, ManifestArtifact>;
}

export interface InspectedFlowStatusReleaseArtifacts {
  packageRoot: string;
  manifestPath: string;
  providerPath: string;
  supervisorPath: string;
  packageMetadataPath: string;
  providerSha256: string;
  supervisorSha256: string;
  packageMetadataSha256: string;
  package: { name: string; version: string };
  upstreamRevision: string;
}

export class FlowStatusReleaseArtifactError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FlowStatusReleaseArtifactError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(code: string, message: string): never {
  throw new FlowStatusReleaseArtifactError(code, message);
}

function parseManifest(file: string): ReleaseManifest {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail('manifest-unavailable', 'Flow Status release manifest is unavailable or invalid.');
  }
  if (
    !isRecord(value)
    || value.version !== 2
    || !isRecord(value.upstream)
    || typeof value.upstream.revision !== 'string'
    || !REVISION.test(value.upstream.revision)
    || !isRecord(value.package)
    || typeof value.package.name !== 'string'
    || typeof value.package.version !== 'string'
    || !isRecord(value.capability)
    || !isRecord(value.artifacts)
  ) fail('manifest-invalid', 'Flow Status release manifest contract is invalid.');

  const artifacts = value.artifacts;
  const expectedKeys = Object.keys(FLOW_STATUS_RELEASE_ARTIFACT_PATHS).sort();
  if (Object.keys(artifacts).sort().join(',') !== expectedKeys.join(',')) {
    fail('manifest-invalid', 'Flow Status release manifest must name exactly three artifacts.');
  }
  for (const kind of expectedKeys as ArtifactKind[]) {
    const artifact = artifacts[kind];
    if (
      !isRecord(artifact)
      || artifact.path !== FLOW_STATUS_RELEASE_ARTIFACT_PATHS[kind]
      || typeof artifact.sha256 !== 'string'
      || !DIGEST.test(artifact.sha256)
    ) fail('manifest-invalid', `Flow Status ${kind} manifest entry is invalid.`);
  }

  const capability = value.capability;
  if (
    capability.flowStatusWidgetV2 !== true
    || capability.flowStatusSnapshotV2 !== true
    || !Array.isArray(capability.flowStatusViewsV2)
    || JSON.stringify(capability.flowStatusViewsV2) !== JSON.stringify(['root-task', 'flow'])
    || capability.flowStatusSharedFrameReadV2 !== true
    || capability.upstreamRevision !== value.upstream.revision
  ) fail('manifest-invalid', 'Flow Status release capability contract is invalid.');

  return value as unknown as ReleaseManifest;
}

function confinedRegularFile(root: string, relative: string, kind: string): string {
  const candidate = path.resolve(root, ...relative.split('/'));
  const relation = path.relative(root, candidate);
  if (relation.startsWith('..') || path.isAbsolute(relation)) {
    fail(`outside-package-root-${kind}`, `Flow Status ${kind} source escapes the installed package root.`);
  }

  let cursor = root;
  for (const segment of relation.split(path.sep)) {
    cursor = path.join(cursor, segment);
    let metadata: fs.Stats;
    try {
      metadata = fs.lstatSync(cursor);
    } catch {
      fail(`missing-${kind}`, `Flow Status ${kind} artifact is missing.`);
    }
    if (metadata.isSymbolicLink()) {
      fail(`outside-package-root-${kind}`, `Flow Status ${kind} source must not traverse a link.`);
    }
  }
  if (!fs.statSync(candidate).isFile()) {
    fail(`missing-${kind}`, `Flow Status ${kind} artifact is not a regular file.`);
  }
  const real = fs.realpathSync.native(candidate);
  const realRelation = path.relative(root, real);
  if (realRelation.startsWith('..') || path.isAbsolute(realRelation)) {
    fail(`outside-package-root-${kind}`, `Flow Status ${kind} source resolves outside the installed package root.`);
  }
  return candidate;
}

function verifiedBytes(
  root: string,
  artifact: ManifestArtifact,
  kind: ArtifactKind,
): { path: string; bytes: Buffer; digest: string } {
  const file = confinedRegularFile(root, artifact.path, kind);
  const bytes = fs.readFileSync(file);
  const digest = sha256(bytes);
  if (digest !== artifact.sha256) {
    fail(`digest-mismatch-${kind}`, `Flow Status ${kind} artifact digest mismatch.`);
  }
  return { path: file, bytes, digest };
}

function verifyIdentity(bytes: Buffer, manifest: ReleaseManifest): void {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('package-identity-mismatch', 'Flow Status package metadata is invalid JSON.');
  }
  if (
    !isRecord(value)
    || value.name !== manifest.package.name
    || value.version !== manifest.package.version
  ) fail('package-identity-mismatch', 'Flow Status package identity does not match the release manifest.');
}

function verifyCapability(provider: string, root: string, manifest: ReleaseManifest): void {
  const result = spawnSync(process.execPath, [provider, '--capabilities', '--json'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: PROBE_TIMEOUT_MS,
    maxBuffer: PROBE_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    fail('capability-probe-failed', 'Flow Status provider capability probe failed.');
  }
  let value: unknown;
  try {
    value = JSON.parse(String(result.stdout));
  } catch {
    fail('capability-mismatch', 'Flow Status provider capability probe did not return JSON.');
  }
  const expected = manifest.capability;
  if (
    !isRecord(value)
    || value.flowStatusWidgetV2 !== expected.flowStatusWidgetV2
    || value.flowStatusSnapshotV2 !== expected.flowStatusSnapshotV2
    || JSON.stringify(value.flowStatusViewsV2) !== JSON.stringify(expected.flowStatusViewsV2)
    || value.flowStatusSharedFrameReadV2 !== expected.flowStatusSharedFrameReadV2
    || value.upstreamRevision !== expected.upstreamRevision
  ) fail('capability-mismatch', 'Flow Status provider capability does not match the release manifest.');
}

export function installedOmpFlowPackageRoot(): string {
  return fs.realpathSync.native(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
}

/**
 * Resolve and verify the complete bundled Flow Status release set before any project mutation.
 * The returned paths are fixed by the manifest contract and confined to the real package root.
 */
export function inspectFlowStatusReleaseArtifacts(
  packageRoot: string = installedOmpFlowPackageRoot(),
): InspectedFlowStatusReleaseArtifacts {
  let root: string;
  try {
    root = fs.realpathSync.native(path.resolve(packageRoot));
  } catch {
    fail('package-root-unavailable', 'Installed omp-flow package root is unavailable.');
  }
  if (!fs.statSync(root).isDirectory()) {
    fail('package-root-unavailable', 'Installed omp-flow package root is not a directory.');
  }

  const manifestPath = confinedRegularFile(root, FLOW_STATUS_RELEASE_MANIFEST, 'manifest');
  const manifest = parseManifest(manifestPath);
  const provider = verifiedBytes(root, manifest.artifacts.provider, 'provider');
  const supervisor = verifiedBytes(root, manifest.artifacts.supervisor, 'supervisor');
  const packageMetadata = verifiedBytes(root, manifest.artifacts.packageMetadata, 'packageMetadata');
  verifyIdentity(packageMetadata.bytes, manifest);
  verifyCapability(provider.path, root, manifest);

  return {
    packageRoot: root,
    manifestPath,
    providerPath: provider.path,
    supervisorPath: supervisor.path,
    packageMetadataPath: packageMetadata.path,
    providerSha256: provider.digest,
    supervisorSha256: supervisor.digest,
    packageMetadataSha256: packageMetadata.digest,
    package: { ...manifest.package },
    upstreamRevision: manifest.upstream.revision,
  };
}
