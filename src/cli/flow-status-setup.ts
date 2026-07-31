import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  atomicCommitFilesSync,
  atomicWriteFileSync,
  type AtomicCommitOptions,
} from './atomic-file.js';
import { readHarnessConfig, type Harness } from './harness.js';
import { computeHash, loadHashes, toPosix } from './template-hash.js';

const CCSTATUSLINE_PACKAGE_NAME = '@omp-flow/ccstatusline';
const CCSTATUSLINE_PACKAGE_VERSION = '2.2.27-flowstatus.2';
const CCSTATUSLINE_PACKAGE = `${CCSTATUSLINE_PACKAGE_NAME}@${CCSTATUSLINE_PACKAGE_VERSION}`;
const CCSTATUSLINE_REVISION = '83c8ffd551ec700fceeed98fe9ab50de84cb49fa';
const PROBE_TIMEOUT_MS = 3_000;
const PROBE_MAX_BUFFER = 16 * 1024;
const OWNERSHIP_FILE = path.join('.omp-flow', '.flow-status-ownership.json');
const PENDING_FILE = path.join('.omp-flow', '.runtime', 'flow-status-setup-pending-v2.json');
const BINDING_FILE = path.join('.omp-flow', '.flow-status-supervisor.json');
const HASH_FILE = path.join('.omp-flow', '.template-hashes.json');
const LEGACY_WIDGET_ID = 'omp-flow-flow-status-v1';
const ROOT_WIDGET_ID = 'omp-flow-root-task-v2';
const FLOW_WIDGET_ID = 'omp-flow-flow-v2';

const ROOT_WIDGET = {
  id: ROOT_WIDGET_ID,
  type: 'flow-status',
  view: 'root-task',
} as const;
const FLOW_WIDGET = {
  id: FLOW_WIDGET_ID,
  type: 'flow-status',
  view: 'flow',
} as const;
const LEGACY_WIDGET = {
  id: LEGACY_WIDGET_ID,
  type: 'flow-status',
} as const;
const HEX_DIGEST = /^[0-9a-f]{64}$/u;

const FLOW_STATUS_FILES = [
  path.join('.agents', 'skills', 'flow-status', 'SKILL.md'),
  path.join('.codex', 'skills', 'flow-status', 'SKILL.md'),
  path.join('.claude', 'hooks', 'flow-status-observe.py'),
  path.join('.claude', 'hooks', 'flow-status-task-update-guard.py'),
] as const;

type RecordValue = Record<string, unknown>;
export type FlowStatusScope = 'project' | 'user';

export interface CcstatuslineProbe {
  state: 'not-requested' | 'supported' | 'unsupported' | 'failed';
  package: string;
  upstreamRevision: string;
  detail: string;
}

export interface FlowStatusPlacement {
  line: 1 | 2;
  position: number;
}

export interface FlowStatusSetupOptions {
  cwd: string;
  scope: FlowStatusScope;
  ccstatuslineExecutable: string;
  ccstatuslinePackageJson: string;
  ccstatuslineConfig: string;
  claudeSettings: string;
  rootTaskLine: 1;
  rootTaskPosition: number;
  flowLine: 2;
  flowPosition: number;
  mode?: 'setup' | 'update';
  yes?: boolean;
  dryRun?: boolean;
  atomic?: AtomicCommitOptions;
}

export interface FlowStatusSetupMutationReport {
  version: 2;
  state:
    | 'planned'
    | 'configured'
    | 'unchanged'
    | 'confirmation-required'
    | 'conflict'
    | 'partial-owned';
  scope: FlowStatusScope;
  views: {
    rootTask: FlowStatusPlacement & { id: typeof ROOT_WIDGET_ID; action: 'add' | 'move' | 'keep' };
    flow: FlowStatusPlacement & { id: typeof FLOW_WIDGET_ID; action: 'add' | 'move' | 'keep' };
  };
  claudeStatusLine: { action: 'add' | 'keep'; command: string };
  ownershipPath: string;
  capability: CcstatuslineProbe;
  classification: string;
}

interface OwnershipWidget {
  id: string;
  type: 'flow-status';
  view: 'root-task' | 'flow';
  line: number;
  position: number;
  canonicalDigest: string;
}

interface OwnershipRecordV2 {
  version: 2;
  capability: 'flowStatusWidgetV2';
  configPath: string;
  providerDigest: string;
  buildRevision: string;
  widgets: [OwnershipWidget, OwnershipWidget];
  preInstall: { state: 'absent' } | { state: 'existing'; digest: string };
  managedPostInstallDigest: string;
}

interface OwnershipRecordV1 {
  version: 1;
  capability: 'flowStatusWidgetV1';
  configPath: string;
  providerDigest: string;
  buildRevision: string;
  widget: {
    id: typeof LEGACY_WIDGET_ID;
    type: 'flow-status';
    line: number;
    position: number;
    canonicalDigest: string;
  };
  preInstall: OwnershipRecordV2['preInstall'];
  managedPostInstallDigest: string;
}

interface PendingRecordV2 {
  version: 2;
  configPath: string;
  ownershipPath: string;
  oldConfigDigest: string | null;
  newConfigDigest: string;
  oldOwnershipDigest: string | null;
  newOwnershipDigest: string;
  newConfig: string;
  newOwnership: string;
  artifactDigests: {
    provider: string;
    binding: string;
  };
  placements: {
    rootTask: FlowStatusPlacement;
    flow: FlowStatusPlacement;
  };
}

export interface FlowStatusSetupReport {
  version: 2;
  repositoryRoot: string;
  harnesses: Harness[];
  managedResources: Array<{
    path: string;
    state: 'managed' | 'modified' | 'missing' | 'not-selected';
  }>;
  claude: {
    statusOwner: 'none' | 'ccstatusline' | 'other' | 'invalid-settings' | 'not-selected';
    capability: CcstatuslineProbe;
    setup: 'ready' | 'manual-compatible-build-required' | 'conflict' | 'not-selected';
    configured: boolean;
    guardConformant: boolean;
    nativeE2E: 'proven' | 'unproven';
    placements: {
      rootTask: FlowStatusPlacement | null;
      flow: FlowStatusPlacement | null;
    };
  };
  codex: { setup: 'skill-only' | 'not-selected'; persistentFooterChanged: false };
  ohMyPi: {
    setup: 'runtime-capability-gated' | 'not-selected';
    ownedStatusKey: 'flow-status';
    ownedCommand: 'flow-status';
  };
  previews: ReturnType<typeof renderFlowStatusPreviews>;
}

export interface FlowStatusRemoveOptions {
  cwd: string;
  scope: FlowStatusScope;
  ccstatuslineConfig: string;
  claudeSettings: string;
  yes?: boolean;
  dryRun?: boolean;
  atomic?: AtomicCommitOptions;
}

export interface FlowStatusRemovalEntry {
  path: string;
  action: 'delete' | 'rewrite' | 'skip';
  reason: 'managed' | 'modified' | 'missing' | 'not-selected' | 'settings-conflict';
}

export interface FlowStatusRemovalReport {
  version: 2;
  dryRun: boolean;
  views: 'removed' | 'planned' | 'absent' | 'partial-owned';
  entries: FlowStatusRemovalEntry[];
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function objectDigest(value: unknown): string {
  return digest(canonicalJson(value));
}

function selected(harnesses: readonly Harness[], harness: Harness): boolean {
  return harnesses.includes(harness);
}

function resolveExplicitPath(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} requires a non-empty explicit path`);
  return path.resolve(value);
}

function assertScopePath(cwd: string, scope: FlowStatusScope, target: string, label: string): void {
  if (scope !== 'project') return;
  const relative = path.relative(path.resolve(cwd), target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes project scope: ${target}`);
  }
}

function ownershipPath(cwd: string, scope: FlowStatusScope, configPath: string): string {
  return scope === 'project'
    ? path.join(path.resolve(cwd), OWNERSHIP_FILE)
    : path.join(path.dirname(configPath), '.omp-flow-status-ownership.json');
}

function pendingPath(cwd: string, scope: FlowStatusScope, configPath: string): string {
  return scope === 'project'
    ? path.join(path.resolve(cwd), PENDING_FILE)
    : path.join(path.dirname(configPath), '.omp-flow-status-pending-v2.json');
}

function bindingPath(cwd: string, scope: FlowStatusScope, configPath: string): string {
  return scope === 'project'
    ? path.join(path.resolve(cwd), BINDING_FILE)
    : path.join(path.dirname(configPath), '.omp-flow-status-supervisor.json');
}

function readJsonObject(file: string, fallback?: RecordValue): RecordValue {
  if (!fs.existsSync(file)) {
    if (fallback) return structuredClone(fallback);
    throw new Error(`Required JSON file is missing: ${file}`);
  }
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`Expected a JSON object: ${file}`);
  return parsed;
}

function readOwnership(file: string): RecordValue | null {
  if (!fs.existsSync(file)) return null;
  const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!isRecord(value)) throw new Error('Flow Status ownership record is malformed');
  return value;
}

function validatedLines(settings: RecordValue): unknown[][] {
  if (!Array.isArray(settings.lines) || settings.lines.some(line => !Array.isArray(line))) {
    throw new Error('ccstatusline config lines must be arrays');
  }
  return settings.lines as unknown[][];
}

function exactWidget(value: unknown, expected: typeof ROOT_WIDGET | typeof FLOW_WIDGET): boolean {
  return isRecord(value)
    && Object.keys(value).length === 3
    && value.id === expected.id
    && value.type === expected.type
    && value.view === expected.view;
}

function findId(lines: unknown[][], id: string): Array<{ line: number; index: number; value: unknown }> {
  const result: Array<{ line: number; index: number; value: unknown }> = [];
  for (let line = 0; line < lines.length; line += 1) {
    for (let index = 0; index < (lines[line]?.length ?? 0); index += 1) {
      const value = lines[line]?.[index];
      if (isRecord(value) && value.id === id) result.push({ line, index, value });
    }
  }
  return result;
}

function positionOf(
  lines: unknown[][],
  expected: typeof ROOT_WIDGET | typeof FLOW_WIDGET,
): FlowStatusPlacement | null {
  const found = findId(lines, expected.id);
  if (found.length !== 1 || !exactWidget(found[0]!.value, expected)) return null;
  return { line: (found[0]!.line + 1) as 1 | 2, position: found[0]!.index + 1 };
}

function exactPreInstall(value: unknown): value is OwnershipRecordV2['preInstall'] {
  return isRecord(value)
    && (
      exactKeys(value, ['state']) && value.state === 'absent'
      || exactKeys(value, ['state', 'digest'])
        && value.state === 'existing'
        && typeof value.digest === 'string'
        && HEX_DIGEST.test(value.digest)
    );
}

function exactOwnershipWidget(
  value: unknown,
  expected: typeof ROOT_WIDGET | typeof FLOW_WIDGET,
  placement: FlowStatusPlacement | null,
): value is OwnershipWidget {
  return isRecord(value)
    && placement !== null
    && exactKeys(value, ['id', 'type', 'view', 'line', 'position', 'canonicalDigest'])
    && value.id === expected.id
    && value.type === expected.type
    && value.view === expected.view
    && value.line === placement?.line
    && value.position === placement.position
    && value.canonicalDigest === objectDigest(expected);
}

function exactOwnershipV2(
  value: RecordValue | null,
  configPath: string,
  executable: string,
  lines: unknown[][],
): boolean {
  if (
    value === null
    || !exactKeys(value, [
      'version',
      'capability',
      'configPath',
      'providerDigest',
      'buildRevision',
      'widgets',
      'preInstall',
      'managedPostInstallDigest',
    ])
    || value.version !== 2
    || value.capability !== 'flowStatusWidgetV2'
    || value.configPath !== configPath
    || value.providerDigest !== digest(fs.readFileSync(executable))
    || value.buildRevision !== CCSTATUSLINE_REVISION
    || !Array.isArray(value.widgets)
    || value.widgets.length !== 2
    || !exactPreInstall(value.preInstall)
    || typeof value.managedPostInstallDigest !== 'string'
    || !HEX_DIGEST.test(value.managedPostInstallDigest)
  ) return false;
  return exactOwnershipWidget(value.widgets[0], ROOT_WIDGET, positionOf(lines, ROOT_WIDGET))
    && exactOwnershipWidget(value.widgets[1], FLOW_WIDGET, positionOf(lines, FLOW_WIDGET));
}

function exactLegacyOwnership(
  value: RecordValue | null,
  configPath: string,
  configText: string,
  lines: unknown[][],
): boolean {
  if (
    value === null
    || !exactKeys(value, [
      'version',
      'capability',
      'configPath',
      'providerDigest',
      'buildRevision',
      'widget',
      'preInstall',
      'managedPostInstallDigest',
    ])
    || value.version !== 1
    || value.capability !== 'flowStatusWidgetV1'
    || value.configPath !== configPath
    || typeof value.providerDigest !== 'string'
    || !HEX_DIGEST.test(value.providerDigest)
    || value.buildRevision !== CCSTATUSLINE_REVISION
    || !exactPreInstall(value.preInstall)
    || value.managedPostInstallDigest !== digest(configText)
    || !isRecord(value.widget)
    || !exactKeys(value.widget, ['id', 'type', 'line', 'position', 'canonicalDigest'])
  ) return false;
  const found = findId(lines, LEGACY_WIDGET_ID);
  return found.length === 1
    && isRecord(found[0]!.value)
    && exactKeys(found[0]!.value, ['id', 'type'])
    && found[0]!.value.id === LEGACY_WIDGET.id
    && found[0]!.value.type === LEGACY_WIDGET.type
    && value.widget.id === LEGACY_WIDGET.id
    && value.widget.type === LEGACY_WIDGET.type
    && value.widget.line === found[0]!.line + 1
    && value.widget.position === found[0]!.index + 1
    && value.widget.canonicalDigest === objectDigest(LEGACY_WIDGET);
}

function exactBinding(file: string, expected: RecordValue): boolean {
  try {
    const value = readJsonObject(file);
    return exactKeys(value, ['executable', 'configPath', 'cwd', 'expectedExecutableDigest'])
      && Object.entries(expected).every(([key, item]) => value[key] === item);
  } catch {
    return false;
  }
}

function validatedBinding(file: string, configPath: string, cwd: string): RecordValue | null {
  try {
    const value = readJsonObject(file);
    if (
      !exactKeys(value, ['executable', 'configPath', 'cwd', 'expectedExecutableDigest'])
      || typeof value.executable !== 'string'
      || value.configPath !== configPath
      || value.cwd !== cwd
      || typeof value.expectedExecutableDigest !== 'string'
      || !HEX_DIGEST.test(value.expectedExecutableDigest)
      || !fs.existsSync(value.executable)
      || digest(fs.readFileSync(value.executable)) !== value.expectedExecutableDigest
    ) return null;
    return value;
  } catch {
    return null;
  }
}

function managedState(
  cwd: string,
  relativePath: string,
  hashes: Record<string, string>,
  enabled: boolean,
): 'managed' | 'modified' | 'missing' | 'not-selected' {
  if (!enabled) return 'not-selected';
  const normalized = toPosix(relativePath);
  const absolute = path.join(cwd, relativePath);
  if (!fs.existsSync(absolute)) return 'missing';
  const stored = hashes[normalized];
  if (stored === undefined) return 'modified';
  return computeHash(fs.readFileSync(absolute, 'utf8')) === stored ? 'managed' : 'modified';
}

function packageGate(packageJsonPath: string | undefined): { supported: boolean; detail: string } {
  if (!packageJsonPath) {
    return { supported: false, detail: 'An explicit --ccstatusline-package-json path is required.' };
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.resolve(packageJsonPath), 'utf8'));
    const supported = isRecord(parsed)
      && parsed.name === CCSTATUSLINE_PACKAGE_NAME
      && parsed.version === CCSTATUSLINE_PACKAGE_VERSION;
    return {
      supported,
      detail: supported
        ? `Exact package ${CCSTATUSLINE_PACKAGE} verified.`
        : `Package must be exactly ${CCSTATUSLINE_PACKAGE}.`,
    };
  } catch {
    return { supported: false, detail: 'Package metadata unavailable.' };
  }
}

export function probeCcstatusline(executable?: string, packageJsonPath?: string): CcstatuslineProbe {
  const common = { package: CCSTATUSLINE_PACKAGE, upstreamRevision: CCSTATUSLINE_REVISION };
  if (!executable) {
    return {
      ...common,
      state: 'not-requested',
      detail: 'Pass explicit binary and package.json paths; configured command strings are never executed.',
    };
  }
  const gate = packageGate(packageJsonPath);
  if (!gate.supported) return { ...common, state: 'unsupported', detail: gate.detail };
  const resolved = path.resolve(executable);
  const isJavaScript = resolved.toLowerCase().endsWith('.js');
  const command = isJavaScript ? process.execPath : resolved;
  const args = isJavaScript ? [resolved, '--capabilities', '--json'] : ['--capabilities', '--json'];
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: PROBE_TIMEOUT_MS,
    maxBuffer: PROBE_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    return {
      ...common,
      state: 'failed',
      detail: 'Pinned capability probe failed.',
    };
  }
  try {
    const value: unknown = JSON.parse(String(result.stdout));
    const supported = isRecord(value)
      && value.flowStatusWidgetV2 === true
      && value.flowStatusSnapshotV2 === true
      && Array.isArray(value.flowStatusViewsV2)
      && JSON.stringify(value.flowStatusViewsV2) === JSON.stringify(['root-task', 'flow'])
      && value.flowStatusSharedFrameReadV2 === true
      && value.upstreamRevision === CCSTATUSLINE_REVISION;
    return {
      ...common,
      state: supported ? 'supported' : 'unsupported',
      detail: supported
        ? `${gate.detail} Exact v2 capability quartet and pinned revision verified.`
        : 'The build is not the exact reviewed Flow Status v2 capability.',
    };
  } catch {
    return { ...common, state: 'failed', detail: 'Capability probe did not return one JSON object.' };
  }
}

function freshDefault(): RecordValue {
  return {
    version: 3,
    lines: [
      [
        ROOT_WIDGET,
        { id: '1', type: 'separator' },
        { id: '2', type: 'model', color: 'cyan' },
        { id: '3', type: 'separator' },
        { id: '4', type: 'context-length', color: 'brightBlack' },
        { id: '5', type: 'separator' },
        { id: '6', type: 'git-branch', color: 'magenta' },
        { id: '7', type: 'separator' },
        { id: '8', type: 'git-changes', color: 'yellow' },
      ],
      [FLOW_WIDGET],
    ],
    powerline: {
      enabled: true,
      separators: ['\uE0B0'],
      separatorInvertBackground: [false],
      startCaps: ['\uE0B6'],
      endCaps: ['\uE0B4'],
      autoAlign: false,
      continueThemeAcrossLines: false,
    },
  };
}

function insertAt(line: unknown[], item: unknown, position: number): number {
  if (!Number.isSafeInteger(position) || position < 1 || position > 64) {
    throw new Error('Flow Status positions must be in 1..64');
  }
  const index = Math.min(position - 1, line.length);
  line.splice(index, 0, item);
  return index + 1;
}

function removeManagedIds(lines: unknown[][]): {
  root: Array<{ line: number; index: number; value: unknown }>;
  flow: Array<{ line: number; index: number; value: unknown }>;
} {
  const root = findId(lines, ROOT_WIDGET_ID);
  const flow = findId(lines, FLOW_WIDGET_ID);
  for (const item of [...root, ...flow].sort((left, right) => (
    right.line - left.line || right.index - left.index
  ))) {
    lines[item.line]?.splice(item.index, 1);
  }
  return { root, flow };
}

function classify(
  lines: unknown[][],
  exactOwned: boolean,
): 'empty' | 'exact-owned' | 'foreign' | 'duplicate' | 'modified' | 'swapped-view' | 'partial-owned' {
  const root = findId(lines, ROOT_WIDGET_ID);
  const flow = findId(lines, FLOW_WIDGET_ID);
  if (root.length > 1 || flow.length > 1) return 'duplicate';
  if (root.length === 0 && flow.length === 0) return 'empty';
  const rootExact = root.length === 1 && exactWidget(root[0]!.value, ROOT_WIDGET);
  const flowExact = flow.length === 1 && exactWidget(flow[0]!.value, FLOW_WIDGET);
  if (
    (root.length === 1 && isRecord(root[0]!.value) && root[0]!.value.view === 'flow')
    || (flow.length === 1 && isRecord(flow[0]!.value) && flow[0]!.value.view === 'root-task')
  ) return 'swapped-view';
  if ((root.length === 1 && !rootExact) || (flow.length === 1 && !flowExact)) return 'modified';
  if (rootExact && flowExact) return exactOwned ? 'exact-owned' : 'foreign';
  return exactOwned ? 'partial-owned' : 'foreign';
}

function quote(value: string): string {
  return /[\s"]/u.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

function supervisorPath(): string {
  return fileURLToPath(new URL('./flow-status-supervisor.js', import.meta.url));
}

function supervisorCommand(binding: string): string {
  return `${quote(process.execPath)} ${quote(supervisorPath())} --binding ${quote(binding)}`;
}

function supervisorBinding(executable: string, configPath: string, cwd: string): RecordValue {
  return {
    executable,
    configPath,
    cwd,
    expectedExecutableDigest: digest(fs.readFileSync(executable)),
  };
}

function statusLine(settings: RecordValue): { command: string | null; valid: boolean } {
  if (settings.statusLine === undefined) return { command: null, valid: true };
  if (
    !isRecord(settings.statusLine)
    || settings.statusLine.type !== 'command'
    || typeof settings.statusLine.command !== 'string'
  ) return { command: null, valid: false };
  return { command: settings.statusLine.command, valid: true };
}

function recoverPending(file: string, expectedConfigPath: string, expectedOwnershipPath: string): void {
  if (!fs.existsSync(file)) return;
  const value = readJsonObject(file);
  if (
    !exactKeys(value, [
      'version',
      'configPath',
      'ownershipPath',
      'oldConfigDigest',
      'newConfigDigest',
      'oldOwnershipDigest',
      'newOwnershipDigest',
      'newConfig',
      'newOwnership',
      'artifactDigests',
      'placements',
    ])
    || value.version !== 2
    || value.configPath !== expectedConfigPath
    || value.ownershipPath !== expectedOwnershipPath
    || !(value.oldConfigDigest === null || typeof value.oldConfigDigest === 'string' && HEX_DIGEST.test(value.oldConfigDigest))
    || typeof value.newConfigDigest !== 'string'
    || !HEX_DIGEST.test(value.newConfigDigest)
    || !(value.oldOwnershipDigest === null || typeof value.oldOwnershipDigest === 'string' && HEX_DIGEST.test(value.oldOwnershipDigest))
    || typeof value.newOwnershipDigest !== 'string'
    || !HEX_DIGEST.test(value.newOwnershipDigest)
    || typeof value.newConfig !== 'string'
    || digest(value.newConfig) !== value.newConfigDigest
    || typeof value.newOwnership !== 'string'
    || digest(value.newOwnership) !== value.newOwnershipDigest
    || !isRecord(value.artifactDigests)
    || !exactKeys(value.artifactDigests, ['provider', 'binding'])
    || typeof value.artifactDigests.provider !== 'string'
    || !HEX_DIGEST.test(value.artifactDigests.provider)
    || typeof value.artifactDigests.binding !== 'string'
    || !HEX_DIGEST.test(value.artifactDigests.binding)
    || !isRecord(value.placements)
    || !exactKeys(value.placements, ['rootTask', 'flow'])
  ) throw new Error('Flow Status pending transaction is malformed');
  const pending = value as unknown as PendingRecordV2;
  const configDigest = fs.existsSync(pending.configPath)
    ? digest(fs.readFileSync(pending.configPath))
    : null;
  const ownershipDigest = fs.existsSync(pending.ownershipPath)
    ? digest(fs.readFileSync(pending.ownershipPath))
    : null;
  if (
    configDigest === pending.oldConfigDigest
    && ownershipDigest === pending.oldOwnershipDigest
  ) {
    fs.unlinkSync(file);
    return;
  }
  if (configDigest === pending.newConfigDigest) {
    if (ownershipDigest === pending.newOwnershipDigest) {
      fs.unlinkSync(file);
      return;
    }
    if (ownershipDigest === null) {
      atomicWriteFileSync(pending.ownershipPath, pending.newOwnership);
      fs.unlinkSync(file);
      return;
    }
  }
  throw new Error('Flow Status interrupted transaction conflicts with current user data');
}

function ownershipV2(
  configPath: string,
  executable: string,
  preInstall: OwnershipRecordV2['preInstall'],
  config: RecordValue,
  rootPlacement: FlowStatusPlacement,
  flowPlacement: FlowStatusPlacement,
): OwnershipRecordV2 {
  return {
    version: 2,
    capability: 'flowStatusWidgetV2',
    configPath,
    providerDigest: digest(fs.readFileSync(executable)),
    buildRevision: CCSTATUSLINE_REVISION,
    widgets: [
      {
        ...ROOT_WIDGET,
        ...rootPlacement,
        canonicalDigest: objectDigest(ROOT_WIDGET),
      },
      {
        ...FLOW_WIDGET,
        ...flowPlacement,
        canonicalDigest: objectDigest(FLOW_WIDGET),
      },
    ],
    preInstall,
    managedPostInstallDigest: digest(json(config)),
  };
}

function legacyOwned(lines: unknown[][]): { line: number; index: number } | null {
  const found = findId(lines, LEGACY_WIDGET_ID);
  if (found.length !== 1) return null;
  const value = found[0]!.value;
  if (!isRecord(value) || !exactKeys(value, ['id', 'type']) || value.type !== 'flow-status') return null;
  return { line: found[0]!.line, index: found[0]!.index };
}

export function configureFlowStatus(options: FlowStatusSetupOptions): FlowStatusSetupMutationReport {
  const cwd = path.resolve(options.cwd);
  const configPath = resolveExplicitPath(options.ccstatuslineConfig, '--ccstatusline-config');
  const settingsPath = resolveExplicitPath(options.claudeSettings, '--claude-settings');
  const executable = resolveExplicitPath(options.ccstatuslineExecutable, '--ccstatusline-bin');
  const packageJson = resolveExplicitPath(options.ccstatuslinePackageJson, '--ccstatusline-package-json');
  for (const [target, label] of [
    [configPath, '--ccstatusline-config'],
    [settingsPath, '--claude-settings'],
    [executable, '--ccstatusline-bin'],
    [packageJson, '--ccstatusline-package-json'],
  ] as const) assertScopePath(cwd, options.scope, target, label);
  if (options.rootTaskLine !== 1 || options.flowLine !== 2) {
    throw new Error('v2 requires root Task on line 1 and Flow on line 2');
  }
  const capability = probeCcstatusline(executable, packageJson);
  if (capability.state !== 'supported') {
    throw new Error(`Flow Status v2 compatible build is required: ${capability.detail}`);
  }
  if (!installedGuardBoundary(cwd, settingsPath)) {
    throw new Error('Claude TaskUpdate guard/matcher/managed-agent boundary is not conformant');
  }
  const ownerPath = ownershipPath(cwd, options.scope, configPath);
  const pending = pendingPath(cwd, options.scope, configPath);
  const binding = bindingPath(cwd, options.scope, configPath);
  recoverPending(pending, configPath, ownerPath);

  const configExisted = fs.existsSync(configPath);
  const oldConfigText = configExisted ? fs.readFileSync(configPath, 'utf8') : null;
  const config = configExisted ? readJsonObject(configPath) : freshDefault();
  const lines = validatedLines(config);
  while (lines.length < 2) lines.push([]);
  const oldOwnershipText = fs.existsSync(ownerPath) ? fs.readFileSync(ownerPath, 'utf8') : null;
  const ownership = readOwnership(ownerPath);
  const v2Ownership = configExisted
    && exactOwnershipV2(ownership, configPath, executable, lines)
    ? ownership as unknown as OwnershipRecordV2
    : null;
  const v1Ownership = configExisted
    && exactLegacyOwnership(ownership, configPath, oldConfigText!, lines)
    ? ownership as unknown as OwnershipRecordV1
    : null;
  if (ownership !== null && v2Ownership === null && v1Ownership === null) {
    throw new Error('Flow Status ownership is foreign or malformed');
  }
  const legacy = v1Ownership ? legacyOwned(lines) : null;
  let classification = configExisted ? classify(lines, v2Ownership !== null) : 'empty';
  if (legacy) classification = 'empty';
  if (legacy && options.mode !== 'update') {
    throw new Error('Owned v1 Flow Status requires explicit update migration');
  }
  if (
    ['foreign', 'duplicate', 'modified', 'swapped-view'].includes(classification)
  ) throw new Error(`Flow Status setup conflict: ${classification}`);
  if (classification === 'partial-owned') throw new Error('Flow Status setup conflict: partial-owned');

  const existingRoot = positionOf(lines, ROOT_WIDGET);
  const existingFlow = positionOf(lines, FLOW_WIDGET);
  const settings = readJsonObject(settingsPath, {});
  const existingStatus = statusLine(settings);
  const command = supervisorCommand(binding);
  const bindingValue = supervisorBinding(executable, configPath, cwd);
  if (!existingStatus.valid || (existingStatus.command !== null && existingStatus.command !== command)) {
    throw new Error('Claude statusLine is user-owned or malformed');
  }
  if (
    classification === 'exact-owned'
    && existingRoot?.line === 1
    && existingRoot.position === options.rootTaskPosition
    && existingFlow?.line === 2
    && existingFlow.position === options.flowPosition
  ) {
    if (existingStatus.command !== command || !exactBinding(binding, bindingValue)) {
      throw new Error('Flow Status supervisor binding or Claude statusLine is modified');
    }
    return report('unchanged', 'exact-owned');
  }

  if (legacy) lines[legacy.line]?.splice(legacy.index, 1);
  removeManagedIds(lines);
  const resolvedRoot = insertAt(lines[0]!, ROOT_WIDGET, options.rootTaskPosition);
  const resolvedFlow = insertAt(lines[1]!, FLOW_WIDGET, options.flowPosition);
  const rootPlacement: FlowStatusPlacement = { line: 1, position: resolvedRoot };
  const flowPlacement: FlowStatusPlacement = { line: 2, position: resolvedFlow };
  settings.statusLine = { type: 'command', command };
  const owner = ownershipV2(
    configPath,
    executable,
    v2Ownership
      ? v2Ownership.preInstall
      : v1Ownership
        ? v1Ownership.preInstall
        : configExisted
          ? { state: 'existing', digest: digest(oldConfigText!) }
          : { state: 'absent' },
    config,
    rootPlacement,
    flowPlacement,
  );
  const nextConfig = json(config);
  const nextOwnership = json(owner);
  const nextBinding = json(bindingValue);
  const nextSettings = json(settings);
  const pendingValue: PendingRecordV2 = {
    version: 2,
    configPath,
    ownershipPath: ownerPath,
    oldConfigDigest: oldConfigText === null ? null : digest(oldConfigText),
    newConfigDigest: digest(nextConfig),
    oldOwnershipDigest: oldOwnershipText === null ? null : digest(oldOwnershipText),
    newOwnershipDigest: digest(nextOwnership),
    newConfig: nextConfig,
    newOwnership: nextOwnership,
    artifactDigests: {
      provider: owner.providerDigest,
      binding: digest(nextBinding),
    },
    placements: { rootTask: rootPlacement, flow: flowPlacement },
  };
  const state = options.dryRun
    ? 'planned'
    : options.yes
      ? 'configured'
      : 'confirmation-required';
  if (state === 'configured') {
    atomicWriteFileSync(pending, json(pendingValue));
    atomicCommitFilesSync([
      { path: binding, content: nextBinding },
      { path: configPath, content: nextConfig },
      { path: ownerPath, content: nextOwnership },
      { path: settingsPath, content: nextSettings },
      { path: pending, content: null },
    ], options.atomic);
    invalidateOldCache(cwd);
  }
  return {
    version: 2,
    state,
    scope: options.scope,
    views: {
      rootTask: {
        id: ROOT_WIDGET_ID,
        ...rootPlacement,
        action: existingRoot ? 'move' : 'add',
      },
      flow: {
        id: FLOW_WIDGET_ID,
        ...flowPlacement,
        action: existingFlow ? 'move' : 'add',
      },
    },
    claudeStatusLine: {
      action: existingStatus.command === command ? 'keep' : 'add',
      command,
    },
    ownershipPath: ownerPath,
    capability,
    classification,
  };

  function report(
    state: FlowStatusSetupMutationReport['state'],
    reportClassification: string,
  ): FlowStatusSetupMutationReport {
    return {
      version: 2,
      state,
      scope: options.scope,
      views: {
        rootTask: {
          id: ROOT_WIDGET_ID,
          line: 1,
          position: existingRoot?.position ?? options.rootTaskPosition,
          action: existingRoot ? 'keep' : 'add',
        },
        flow: {
          id: FLOW_WIDGET_ID,
          line: 2,
          position: existingFlow?.position ?? options.flowPosition,
          action: existingFlow ? 'keep' : 'add',
        },
      },
      claudeStatusLine: { action: 'keep', command: supervisorCommand(binding) },
      ownershipPath: ownerPath,
      capability,
      classification: reportClassification,
    };
  }
}

function invalidateOldCache(cwd: string): void {
  const cache = path.join(cwd, '.omp-flow', '.runtime', 'flow-status');
  if (!fs.existsSync(cache)) return;
  for (const entry of fs.readdirSync(cache, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const target = path.join(cache, entry.name);
    try {
      const value: unknown = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (!isRecord(value) || value.version !== 2) fs.unlinkSync(target);
    } catch {
      fs.unlinkSync(target);
    }
  }
}

export function renderFlowStatusPreviews() {
  return {
    full: [
      'Task · 07-30-omp-flow-tui-control · TUI control | Sonnet 4 | ctx 38% | main +5',
      'Flow 6/9 · Execute | Work 4/13 ████░░░░░░░░░ | Review · Round 2',
    ],
    compact: [
      'Task · TUI control | Sonnet 4 | ctx 38% | main +5',
      'Flow 6/9 Execute | Work 4/13 | Review R2',
    ],
    minimum: [
      'Task · TUI control',
      'Flow 6/9 Execute',
    ],
    unavailable: [
      'Task · unavailable | Sonnet 4 | ctx 38% | main +5',
      '',
    ],
  };
}

function configuredCommand(
  settingsPath: string,
  expectedCommand: string,
): { owner: FlowStatusSetupReport['claude']['statusOwner']; exact: boolean } {
  if (!fs.existsSync(settingsPath)) return { owner: 'none', exact: false };
  try {
    const settings = readJsonObject(settingsPath);
    const status = statusLine(settings);
    if (!status.valid) return { owner: 'other', exact: false };
    if (status.command === null) return { owner: 'none', exact: false };
    return {
      owner: status.command === expectedCommand ? 'ccstatusline' : 'other',
      exact: status.command === expectedCommand,
    };
  } catch {
    return { owner: 'invalid-settings', exact: false };
  }
}

function guardConformance(cwd: string): boolean {
  const guard = path.join(cwd, '.claude', 'hooks', 'flow-status-task-update-guard.py');
  if (!fs.existsSync(guard)) return false;
  const result = spawnSync(
    process.platform === 'win32' ? 'python' : 'python3',
    ['-X', 'utf8', guard, '--self-test'],
    {
      cwd,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: 64 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
    },
  );
  return !result.error && result.status === 0;
}

function installedGuardBoundary(cwd: string, settingsPath: string): boolean {
  const guard = path.join(cwd, '.claude', 'hooks', 'flow-status-task-update-guard.py');
  if (!fs.existsSync(guard) || !guardConformance(cwd)) return false;
  let settings: RecordValue;
  try {
    settings = readJsonObject(settingsPath);
  } catch {
    return false;
  }
  const hooks = isRecord(settings.hooks) ? settings.hooks : null;
  const pre = hooks && Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  const guards = pre.filter(value => {
    if (!isRecord(value) || value.matcher !== 'TaskUpdate' || !Array.isArray(value.hooks)) return false;
    return value.hooks.length === 1
      && isRecord(value.hooks[0])
      && value.hooks[0].type === 'command'
      && typeof value.hooks[0].command === 'string'
      && value.hooks[0].command.includes('flow-status-task-update-guard.py');
  });
  if (guards.length !== 1) return false;
  for (const name of [
    'omp-flow-research',
    'omp-flow-architect',
    'omp-flow-qbd',
    'omp-flow-implement',
    'omp-flow-check',
  ]) {
    const file = path.join(cwd, '.claude', 'agents', `${name}.md`);
    if (!fs.existsSync(file)) return false;
    const content = fs.readFileSync(file, 'utf8');
    const tools = content.match(/^tools:\s*(.+)$/mu)?.[1] ?? '';
    if (!tools.split(',').map(value => value.trim()).includes('TaskUpdate')) return false;
    if (tools.split(',').map(value => value.trim()).includes('Agent')) return false;
  }
  return true;
}

export function inspectFlowStatusSetup(
  cwdValue: string,
  ccstatuslineExecutable?: string,
  ccstatuslinePackageJson?: string,
  claudeSettings?: string,
  ccstatuslineConfig?: string,
): FlowStatusSetupReport {
  const cwd = path.resolve(cwdValue);
  const harnesses = readHarnessConfig(cwd)?.harnesses ?? [];
  const hashes = loadHashes(cwd);
  const claudeEnabled = selected(harnesses, 'claude');
  const settingsPath = path.resolve(claudeSettings ?? path.join(cwd, '.claude', 'settings.json'));
  const configPath = path.resolve(ccstatuslineConfig ?? path.join(cwd, '.claude', 'ccstatusline.json'));
  const ownerPath = ownershipPath(cwd, 'project', configPath);
  const binding = bindingPath(cwd, 'project', configPath);
  const expected = supervisorCommand(binding);
  const status = configuredCommand(settingsPath, expected);
  const capability = probeCcstatusline(ccstatuslineExecutable, ccstatuslinePackageJson);
  let rootPlacement: FlowStatusPlacement | null = null;
  let flowPlacement: FlowStatusPlacement | null = null;
  let exactViews = false;
  let exactOwnership = false;
  let bindingReady = false;
  try {
    const config = readJsonObject(configPath);
    const lines = validatedLines(config);
    rootPlacement = positionOf(lines, ROOT_WIDGET);
    flowPlacement = positionOf(lines, FLOW_WIDGET);
    exactViews = rootPlacement?.line === 1 && flowPlacement?.line === 2;
    const owner = readOwnership(ownerPath);
    if (ccstatuslineExecutable) {
      exactOwnership = exactOwnershipV2(
        owner,
        configPath,
        path.resolve(ccstatuslineExecutable),
        lines,
      );
      const expectedBinding = supervisorBinding(path.resolve(ccstatuslineExecutable), configPath, cwd);
      bindingReady = exactBinding(binding, expectedBinding);
    }
  } catch {
    // Doctor is read-only and reports unavailable state below.
  }
  const configured = claudeEnabled
    && status.exact
    && capability.state === 'supported'
    && exactViews
    && exactOwnership
    && bindingReady;
  return {
    version: 2,
    repositoryRoot: cwd,
    harnesses,
    managedResources: FLOW_STATUS_FILES.map(relativePath => ({
      path: toPosix(relativePath),
      state: managedState(cwd, relativePath, hashes, claudeEnabled),
    })),
    claude: {
      statusOwner: claudeEnabled ? status.owner : 'not-selected',
      capability,
      setup: !claudeEnabled
        ? 'not-selected'
        : configured
          ? 'ready'
          : status.owner === 'other' || status.owner === 'invalid-settings'
            ? 'conflict'
            : 'manual-compatible-build-required',
      configured,
      guardConformant: installedGuardBoundary(cwd, settingsPath),
      nativeE2E: 'unproven',
      placements: { rootTask: rootPlacement, flow: flowPlacement },
    },
    codex: {
      setup: selected(harnesses, 'codex') ? 'skill-only' : 'not-selected',
      persistentFooterChanged: false,
    },
    ohMyPi: {
      setup: selected(harnesses, 'omp') ? 'runtime-capability-gated' : 'not-selected',
      ownedStatusKey: 'flow-status',
      ownedCommand: 'flow-status',
    },
    previews: renderFlowStatusPreviews(),
  };
}

function removeAt(lines: unknown[][], id: string, expected: typeof ROOT_WIDGET | typeof FLOW_WIDGET): boolean {
  const found = findId(lines, id);
  if (found.length !== 1 || !exactWidget(found[0]!.value, expected)) return false;
  lines[found[0]!.line]?.splice(found[0]!.index, 1);
  return true;
}

export function removeFlowStatusManagedResources(
  options: FlowStatusRemoveOptions,
): FlowStatusRemovalReport {
  const cwd = path.resolve(options.cwd);
  const configPath = resolveExplicitPath(options.ccstatuslineConfig, '--ccstatusline-config');
  const settingsPath = resolveExplicitPath(options.claudeSettings, '--claude-settings');
  assertScopePath(cwd, options.scope, configPath, '--ccstatusline-config');
  assertScopePath(cwd, options.scope, settingsPath, '--claude-settings');
  const ownerPath = ownershipPath(cwd, options.scope, configPath);
  const binding = bindingPath(cwd, options.scope, configPath);
  const ownership = readOwnership(ownerPath);
  if (ownership === null) {
    return { version: 2, dryRun: Boolean(options.dryRun), views: 'absent', entries: [] };
  }
  const config = readJsonObject(configPath);
  const configText = fs.readFileSync(configPath, 'utf8');
  const lines = validatedLines(config);
  const bindingValue = validatedBinding(binding, configPath, cwd);
  if (
    bindingValue === null
    || !exactOwnershipV2(
      ownership,
      configPath,
      String(bindingValue.executable),
      lines,
    )
  ) throw new Error('Flow Status ownership, provider, or binding is foreign or modified');
  const exactOwner = ownership as unknown as OwnershipRecordV2;
  const rootRemoved = removeAt(lines, ROOT_WIDGET_ID, ROOT_WIDGET);
  const flowRemoved = removeAt(lines, FLOW_WIDGET_ID, FLOW_WIDGET);
  if (!rootRemoved || !flowRemoved) {
    throw new Error('Owned Flow Status views are modified or missing');
  }
  const settings = readJsonObject(settingsPath, {});
  const command = supervisorCommand(binding);
  const status = statusLine(settings);
  if (status.command === command) delete settings.statusLine;
  else if (status.command !== null) throw new Error('Claude statusLine changed after installation');
  const restoreAbsent = exactOwner.preInstall.state === 'absent'
    && exactOwner.managedPostInstallDigest === digest(configText);
  const changes = [
    { path: configPath, content: restoreAbsent ? null : json(config) },
    { path: settingsPath, content: json(settings) },
    { path: ownerPath, content: null },
    { path: binding, content: null },
  ];
  if (!options.dryRun && options.yes) atomicCommitFilesSync(changes, options.atomic);
  return {
    version: 2,
    dryRun: Boolean(options.dryRun),
    views: options.dryRun || !options.yes
      ? 'planned'
      : 'removed',
    entries: changes.map(change => ({
      path: change.path,
      action: change.content === null ? 'delete' as const : 'rewrite' as const,
      reason: 'managed' as const,
    })),
  };
}
