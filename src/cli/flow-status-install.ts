import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  confineRepositoryDestinations,
  type DestinationConfinementSuccess,
  type DestinationConfinementResult,
} from './destination-confinement.js';
import {
  inspectFlowStatusReleaseArtifacts,
  type InspectedFlowStatusReleaseArtifacts,
} from './flow-status-release-artifacts.js';
import {
  HARNESS_CONFIG_PATH,
  planHarnessConfigPatch,
  readHarnessConfig,
} from './harness.js';

export type FlowStatusIntent = 'enable' | 'disable' | 'preserve';
export type FlowStatusInstallMode = 'init' | 'update';
export type FlowStatusProductState =
  | 'not-selected'
  | 'disabled'
  | 'install'
  | 'repair'
  | 'update'
  | 'unchanged'
  | 'recovery-required'
  | 'conflict';

export type FlowStatusOwnershipClassification =
  | 'fresh'
  | 'exact-owned'
  | 'stale-exact-owned'
  | 'migratable-v2'
  | 'foreign'
  | 'modified'
  | 'duplicate'
  | 'swapped'
  | 'partial-owned'
  | 'malformed'
  | 'user-owned';

export interface ExactBytes {
  state: 'absent' | 'present';
  bytesBase64: string | null;
  sha256: string | null;
}

export interface FlowStatusPlanTarget {
  logicalTarget: string;
  absolutePath: string;
  operation: 'create' | 'replace' | 'delete' | 'unchanged';
  old: ExactBytes;
  new: ExactBytes;
}

export interface FlowStatusProductReport {
  version: 1;
  repositoryRoot: string;
  mode: FlowStatusInstallMode;
  intent: FlowStatusIntent;
  state: FlowStatusProductState;
  classification: FlowStatusOwnershipClassification;
  detail: string;
  preference: boolean | null;
  targets: FlowStatusPlanTarget[];
  confinement: DestinationConfinementResult;
}

export interface PlanBundledFlowStatusOptions {
  cwd: string;
  mode: FlowStatusInstallMode;
  intent: FlowStatusIntent;
  artifacts?: InspectedFlowStatusReleaseArtifacts;
  inspectArtifacts?: () => InspectedFlowStatusReleaseArtifacts;
  confine?: typeof confineRepositoryDestinations;
}

export interface ValidatedFlowStatusPlanInputs {
  repositoryRoot: string;
  confinement: DestinationConfinementSuccess;
  artifacts: InspectedFlowStatusReleaseArtifacts;
}

export type FlowStatusPlanInputValidation =
  | { state: 'validated'; value: ValidatedFlowStatusPlanInputs }
  | {
      state: 'conflict';
      repositoryRoot: string;
      confinement: DestinationConfinementResult;
      detail: string;
    };

export const FLOW_STATUS_PRODUCT_PATHS = {
  pending: '.omp-flow/.runtime/flow-status-setup-pending-v2.json',
  ignore: '.omp-flow/.gitignore',
  templateHashes: '.omp-flow/.template-hashes.json',
  provider: '.omp-flow/vendor/flow-status/ccstatusline.js',
  supervisor: '.omp-flow/vendor/flow-status/supervisor.js',
  packageMetadata: '.omp-flow/vendor/flow-status/package.json',
  binding: '.omp-flow/.flow-status-supervisor.json',
  renderer: '.claude/ccstatusline.json',
  ownership: '.omp-flow/.flow-status-ownership.json',
  claudeSettings: '.claude/settings.json',
  preference: HARNESS_CONFIG_PATH.replaceAll('\\', '/'),
} as const;

const ROOT_WIDGET = { id: 'omp-flow-root-task-v2', type: 'flow-status', view: 'root-task' } as const;
const FLOW_WIDGET = { id: 'omp-flow-flow-v2', type: 'flow-status', view: 'flow' } as const;
const BUILD_REVISION = '83c8ffd551ec700fceeed98fe9ab50de84cb49fa';
const DIGEST = /^[0-9a-f]{64}$/u;
type JsonObject = Record<string, unknown>;

interface OwnershipV2 {
  version: 2;
  capability: 'flowStatusWidgetV2';
  configPath: string;
  providerDigest: string;
  buildRevision: string;
  widgets: [OwnershipWidget, OwnershipWidget];
  preInstall: { state: 'absent' } | { state: 'existing'; digest: string };
  managedPostInstallDigest: string;
}

interface OwnershipWidget {
  id: string;
  type: 'flow-status';
  view: 'root-task' | 'flow';
  line: number;
  position: number;
  canonicalDigest: string;
}

interface CurrentInstallation {
  classification: FlowStatusOwnershipClassification;
  detail: string;
  renderer: JsonObject | null;
  settings: JsonObject | null;
  ownership: OwnershipV2 | null;
  installed: boolean;
  exactRelease: boolean;
  canonicalCommand: boolean;
}

const INTEGRATION_TARGETS = [
  FLOW_STATUS_PRODUCT_PATHS.provider,
  FLOW_STATUS_PRODUCT_PATHS.supervisor,
  FLOW_STATUS_PRODUCT_PATHS.packageMetadata,
  FLOW_STATUS_PRODUCT_PATHS.binding,
  FLOW_STATUS_PRODUCT_PATHS.renderer,
  FLOW_STATUS_PRODUCT_PATHS.ownership,
  FLOW_STATUS_PRODUCT_PATHS.claudeSettings,
] as const;

const CONFINED_TARGETS = [
  '.omp-flow',
  '.claude',
  FLOW_STATUS_PRODUCT_PATHS.pending,
  FLOW_STATUS_PRODUCT_PATHS.ignore,
  FLOW_STATUS_PRODUCT_PATHS.templateHashes,
  ...INTEGRATION_TARGETS,
  FLOW_STATUS_PRODUCT_PATHS.preference,
] as const;

const CONFINED_DIRECTORY_TARGETS = new Set<string>(['.omp-flow', '.claude']);

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonObject, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function json(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function snapshot(bytes: Buffer | null): ExactBytes {
  return bytes === null
    ? { state: 'absent', bytesBase64: null, sha256: null }
    : { state: 'present', bytesBase64: bytes.toString('base64'), sha256: sha256(bytes) };
}

function existingBytes(file: string): Buffer | null {
  try {
    return fs.readFileSync(file);
  } catch (error) {
    if (isObject(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

function readValidatedReleaseBytes(release: InspectedFlowStatusReleaseArtifacts): {
  provider: Buffer;
  supervisor: Buffer;
  packageMetadata: Buffer;
} {
  const values = {
    provider: fs.readFileSync(release.providerPath),
    supervisor: fs.readFileSync(release.supervisorPath),
    packageMetadata: fs.readFileSync(release.packageMetadataPath),
  };
  if (
    sha256(values.provider) !== release.providerSha256
    || sha256(values.supervisor) !== release.supervisorSha256
    || sha256(values.packageMetadata) !== release.packageMetadataSha256
  ) throw new Error('Verified Flow Status release bytes changed before planning.');
  return values;
}

function operation(oldBytes: Buffer | null, newBytes: Buffer | null): FlowStatusPlanTarget['operation'] {
  if (oldBytes === null && newBytes === null) return 'unchanged';
  if (oldBytes === null) return 'create';
  if (newBytes === null) return 'delete';
  return oldBytes.equals(newBytes) ? 'unchanged' : 'replace';
}

function target(root: string, logicalTarget: string, newBytes: Buffer | null): FlowStatusPlanTarget {
  const absolutePath = path.join(root, ...logicalTarget.split('/'));
  const oldBytes = existingBytes(absolutePath);
  return {
    logicalTarget,
    absolutePath,
    operation: operation(oldBytes, newBytes),
    old: snapshot(oldBytes),
    new: snapshot(newBytes),
  };
}

function unchangedTargets(root: string): FlowStatusPlanTarget[] {
  return [...INTEGRATION_TARGETS, FLOW_STATUS_PRODUCT_PATHS.preference].map(logicalTarget => {
    const absolutePath = path.join(root, ...logicalTarget.split('/'));
    return target(root, logicalTarget, existingBytes(absolutePath));
  });
}

function validateConfinedDestinationTypes(
  root: string,
  confinement: DestinationConfinementSuccess,
): DestinationConfinementResult {
  for (const logicalTarget of CONFINED_TARGETS) {
    const absolutePath = path.join(root, ...logicalTarget.split('/'));
    let metadata: fs.Stats;
    try {
      metadata = fs.lstatSync(absolutePath);
    } catch (error) {
      if (isObject(error) && error.code === 'ENOENT') continue;
      return {
        state: 'conflict',
        code: 'native-check-failed',
        logicalTarget,
        absolutePath,
        detail: `Cannot inspect confined Flow Status destination "${logicalTarget}" before reading it.`,
      };
    }
    const expectedDirectory = CONFINED_DIRECTORY_TARGETS.has(logicalTarget);
    if (expectedDirectory ? !metadata.isDirectory() : !metadata.isFile()) {
      return {
        state: 'conflict',
        code: 'non-ordinary-target',
        logicalTarget,
        absolutePath,
        detail: `Confined Flow Status destination "${logicalTarget}" must be an ordinary ${
          expectedDirectory ? 'directory' : 'file'
        }, but the existing target has the wrong file type.`,
      };
    }
  }
  return confinement;
}

function parseJsonFile(file: string, fallback: JsonObject | null): JsonObject | null {
  const bytes = existingBytes(file);
  if (bytes === null) return fallback === null ? null : structuredClone(fallback);
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (!isObject(value)) throw new Error(`${file} must contain one JSON object.`);
  return value;
}

function exactWidget(value: unknown, expected: typeof ROOT_WIDGET | typeof FLOW_WIDGET): boolean {
  return isObject(value)
    && exactKeys(value, ['id', 'type', 'view'])
    && value.id === expected.id
    && value.type === expected.type
    && value.view === expected.view;
}

function widgetMatches(lines: unknown[][], id: string): Array<{ line: number; position: number; value: unknown }> {
  const found: Array<{ line: number; position: number; value: unknown }> = [];
  lines.forEach((line, lineIndex) => line.forEach((value, index) => {
    if (isObject(value) && value.id === id) {
      found.push({ line: lineIndex + 1, position: index + 1, value });
    }
  }));
  return found;
}

function classifyWidgets(renderer: JsonObject | null): {
  classification: 'empty' | 'exact' | 'foreign' | 'modified' | 'duplicate' | 'swapped' | 'partial';
  lines: unknown[][];
} {
  if (renderer === null) return { classification: 'empty', lines: [[], []] };
  if (!Array.isArray(renderer.lines) || renderer.lines.some(line => !Array.isArray(line))) {
    return { classification: 'modified', lines: [] };
  }
  const lines = renderer.lines as unknown[][];
  const root = widgetMatches(lines, ROOT_WIDGET.id);
  const flow = widgetMatches(lines, FLOW_WIDGET.id);
  if (root.length > 1 || flow.length > 1) return { classification: 'duplicate', lines };
  if (root.length === 0 && flow.length === 0) return { classification: 'empty', lines };
  if (
    root.some(item => isObject(item.value) && item.value.view === 'flow')
    || flow.some(item => isObject(item.value) && item.value.view === 'root-task')
  ) return { classification: 'swapped', lines };
  if (
    root.length === 1 && !exactWidget(root[0]!.value, ROOT_WIDGET)
    || flow.length === 1 && !exactWidget(flow[0]!.value, FLOW_WIDGET)
  ) return { classification: 'modified', lines };
  if (root.length === 1 && flow.length === 1) return { classification: 'exact', lines };
  return { classification: 'partial', lines };
}

function exactPreInstall(value: unknown): value is OwnershipV2['preInstall'] {
  return isObject(value) && (
    exactKeys(value, ['state']) && value.state === 'absent'
    || exactKeys(value, ['state', 'digest'])
      && value.state === 'existing'
      && typeof value.digest === 'string'
      && DIGEST.test(value.digest)
  );
}

function ownershipShape(value: JsonObject | null, configPath: string, lines: unknown[][]): OwnershipV2 | null {
  if (
    value === null
    || !exactKeys(value, [
      'version', 'capability', 'configPath', 'providerDigest', 'buildRevision',
      'widgets', 'preInstall', 'managedPostInstallDigest',
    ])
    || value.version !== 2
    || value.capability !== 'flowStatusWidgetV2'
    || value.configPath !== configPath
    || typeof value.providerDigest !== 'string'
    || !DIGEST.test(value.providerDigest)
    || value.buildRevision !== BUILD_REVISION
    || !Array.isArray(value.widgets)
    || value.widgets.length !== 2
    || !exactPreInstall(value.preInstall)
    || typeof value.managedPostInstallDigest !== 'string'
    || !DIGEST.test(value.managedPostInstallDigest)
  ) return null;
  const widgets = value.widgets;
  for (const [index, expected] of [ROOT_WIDGET, FLOW_WIDGET].entries()) {
    const widget = widgets[index];
    if (!isObject(widget) || !exactKeys(widget, [
      'id', 'type', 'view', 'line', 'position', 'canonicalDigest',
    ])) return null;
    const found = widgetMatches(lines, expected.id);
    if (
      found.length !== 1
      || !exactWidget(found[0]!.value, expected)
      || widget.id !== expected.id
      || widget.type !== expected.type
      || widget.view !== expected.view
      || widget.line !== found[0]!.line
      || widget.position !== found[0]!.position
      || widget.canonicalDigest !== sha256(canonical(expected))
    ) return null;
  }
  return value as unknown as OwnershipV2;
}

function quote(value: string): string {
  return /[\s"]/u.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

function command(supervisor: string, binding: string): string {
  return `${quote(process.execPath)} ${quote(supervisor)} --binding ${quote(binding)}`;
}

function statusCommand(settings: JsonObject | null): { valid: boolean; value: string | null } {
  if (settings === null || settings.statusLine === undefined) return { valid: true, value: null };
  if (
    !isObject(settings.statusLine)
    || settings.statusLine.type !== 'command'
    || typeof settings.statusLine.command !== 'string'
  ) return { valid: false, value: null };
  return { valid: true, value: settings.statusLine.command };
}

function validateBinding(file: string, configPath: string, cwd: string): {
  value: JsonObject;
  providerBytes: Buffer | null;
} | null {
  let value: JsonObject | null;
  try {
    value = parseJsonFile(file, null);
  } catch {
    return null;
  }
  if (
    value === null
    || !exactKeys(value, ['executable', 'configPath', 'cwd', 'expectedExecutableDigest'])
    || typeof value.executable !== 'string'
    || value.configPath !== configPath
    || value.cwd !== cwd
    || typeof value.expectedExecutableDigest !== 'string'
    || !DIGEST.test(value.expectedExecutableDigest)
  ) return null;
  const providerBytes = existingBytes(value.executable);
  if (providerBytes !== null && sha256(providerBytes) !== value.expectedExecutableDigest) return null;
  return { value, providerBytes };
}

function inspectCurrent(root: string, release: InspectedFlowStatusReleaseArtifacts): CurrentInstallation {
  const rendererPath = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.renderer.split('/'));
  const settingsPath = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.claudeSettings.split('/'));
  const ownerPath = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.ownership.split('/'));
  const bindingPath = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.binding.split('/'));
  let renderer: JsonObject | null;
  let settings: JsonObject | null;
  let rawOwnership: JsonObject | null;
  try {
    renderer = parseJsonFile(rendererPath, null);
    settings = parseJsonFile(settingsPath, {});
    rawOwnership = parseJsonFile(ownerPath, null);
  } catch (error) {
    return {
      classification: 'malformed',
      detail: error instanceof Error ? error.message : 'Flow Status JSON is malformed.',
      renderer: null,
      settings: null,
      ownership: null,
      installed: true,
      exactRelease: false,
      canonicalCommand: false,
    };
  }
  const widgets = classifyWidgets(renderer);
  const status = statusCommand(settings);
  const ownership = ownershipShape(rawOwnership, rendererPath, widgets.lines);
  const binding = validateBinding(bindingPath, rendererPath, root);
  const canonicalSupervisor = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.supervisor.split('/'));
  const canonicalStatus = command(canonicalSupervisor, bindingPath);
  const legacySupervisor = fileURLToPath(new URL('./flow-status-supervisor.js', import.meta.url));
  const legacyStatus = command(legacySupervisor, bindingPath);
  const providerTarget = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.provider.split('/'));
  const providerBytes = existingBytes(providerTarget);
  const hasVendor = [
    FLOW_STATUS_PRODUCT_PATHS.provider,
    FLOW_STATUS_PRODUCT_PATHS.supervisor,
    FLOW_STATUS_PRODUCT_PATHS.packageMetadata,
  ].some(item => existingBytes(path.join(root, ...item.split('/'))) !== null);
  const installed = widgets.classification !== 'empty'
    || rawOwnership !== null
    || existingBytes(bindingPath) !== null
    || hasVendor
    || status.value !== null;
  if (!installed) {
    return {
      classification: 'fresh', detail: 'No Flow Status installation is present.', renderer, settings,
      ownership: null, installed: false, exactRelease: false, canonicalCommand: false,
    };
  }
  if (!status.valid) {
    return {
      classification: 'malformed', detail: 'Claude statusLine is malformed.', renderer, settings,
      ownership, installed, exactRelease: false, canonicalCommand: false,
    };
  }
  if (
    widgets.classification === 'empty'
    && status.value !== null
    && rawOwnership === null
    && existingBytes(bindingPath) === null
    && !hasVendor
  ) {
    return {
      classification: 'user-owned', detail: 'Claude statusLine is user-owned.', renderer, settings,
      ownership: null, installed, exactRelease: false, canonicalCommand: false,
    };
  }
  if (widgets.classification !== 'exact') {
    const mapped = widgets.classification === 'duplicate'
      ? 'duplicate'
      : widgets.classification === 'swapped'
        ? 'swapped'
        : widgets.classification === 'partial'
          ? 'partial-owned'
          : widgets.classification === 'modified'
            ? 'modified'
            : 'foreign';
    return {
      classification: mapped,
      detail: `Flow Status widget state is ${mapped}; recover it explicitly before installation.`,
      renderer, settings, ownership, installed, exactRelease: false, canonicalCommand: false,
    };
  }
  if (rawOwnership === null) {
    return {
      classification: 'foreign', detail: 'Exact widget IDs exist without exact ownership.', renderer,
      settings, ownership: null, installed, exactRelease: false, canonicalCommand: false,
    };
  }
  if (ownership === null || binding === null) {
    return {
      classification: 'modified',
      detail: 'Flow Status ownership or binding is foreign, modified, or incomplete.',
      renderer, settings, ownership: null, installed, exactRelease: false, canonicalCommand: false,
    };
  }
  if (status.value !== canonicalStatus && status.value !== legacyStatus) {
    return {
      classification: 'user-owned',
      detail: 'Claude statusLine is user-owned or does not match the exact managed command.',
      renderer, settings, ownership, installed, exactRelease: false, canonicalCommand: false,
    };
  }
  const providerDigest = binding.value.expectedExecutableDigest as string;
  if (providerBytes !== null && sha256(providerBytes) !== ownership.providerDigest) {
    return {
      classification: 'modified', detail: 'The managed project-local provider was modified.', renderer,
      settings, ownership, installed, exactRelease: false, canonicalCommand: status.value === canonicalStatus,
    };
  }
  if (binding.providerBytes !== null && sha256(binding.providerBytes) !== ownership.providerDigest) {
    return {
      classification: 'modified', detail: 'The provider named by the binding was modified.', renderer,
      settings, ownership, installed, exactRelease: false, canonicalCommand: status.value === canonicalStatus,
    };
  }
  const exactRelease = providerDigest === release.providerSha256
    && [
      [FLOW_STATUS_PRODUCT_PATHS.provider, release.providerSha256],
      [FLOW_STATUS_PRODUCT_PATHS.supervisor, release.supervisorSha256],
      [FLOW_STATUS_PRODUCT_PATHS.packageMetadata, release.packageMetadataSha256],
    ].every(([logical, digest]) => {
      const bytes = existingBytes(path.join(root, ...logical!.split('/')));
      return bytes !== null && sha256(bytes) === digest;
    });
  const canonicalBinding = binding.value.executable === providerTarget;
  if (canonicalBinding && ownership.providerDigest === release.providerSha256) {
    for (const [logical, expectedDigest] of [
      [FLOW_STATUS_PRODUCT_PATHS.supervisor, release.supervisorSha256],
      [FLOW_STATUS_PRODUCT_PATHS.packageMetadata, release.packageMetadataSha256],
    ] as const) {
      const bytes = existingBytes(path.join(root, ...logical.split('/')));
      if (bytes !== null && sha256(bytes) !== expectedDigest) {
        return {
          classification: 'modified',
          detail: `The managed Flow Status target "${logical}" was modified.`,
          renderer,
          settings,
          ownership,
          installed,
          exactRelease: false,
          canonicalCommand: status.value === canonicalStatus,
        };
      }
    }
  }
  if (!canonicalBinding || status.value === legacyStatus) {
    return {
      classification: 'migratable-v2',
      detail: 'An exact v2 installation can migrate to canonical project-local artifacts.',
      renderer, settings, ownership, installed, exactRelease, canonicalCommand: false,
    };
  }
  if (exactRelease) {
    return {
      classification: 'exact-owned', detail: 'The exact owned installation matches this release.',
      renderer, settings, ownership, installed, exactRelease, canonicalCommand: true,
    };
  }
  if (providerBytes === null || binding.providerBytes === null) {
    return {
      classification: 'stale-exact-owned', detail: 'Owned machine artifacts are missing and repairable.',
      renderer, settings, ownership, installed, exactRelease: false, canonicalCommand: true,
    };
  }
  return {
    classification: 'stale-exact-owned', detail: 'The exact owned installation requires this release.',
    renderer, settings, ownership, installed, exactRelease: false, canonicalCommand: true,
  };
}

function freshRenderer(): JsonObject {
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

function installRenderer(current: JsonObject | null): JsonObject {
  if (current === null) return freshRenderer();
  const next = structuredClone(current);
  if (!Array.isArray(next.lines) || next.lines.some(line => !Array.isArray(line))) {
    throw new Error('ccstatusline config lines must be arrays.');
  }
  const lines = next.lines as unknown[][];
  while (lines.length < 2) lines.push([]);
  for (const line of lines) {
    for (let index = line.length - 1; index >= 0; index -= 1) {
      const value = line[index];
      if (isObject(value) && (value.id === ROOT_WIDGET.id || value.id === FLOW_WIDGET.id)) {
        line.splice(index, 1);
      }
    }
  }
  lines[0]!.unshift(ROOT_WIDGET);
  lines[1]!.unshift(FLOW_WIDGET);
  return next;
}

function removeRenderer(current: JsonObject): JsonObject {
  const next = structuredClone(current);
  const lines = next.lines as unknown[][];
  for (const line of lines) {
    for (let index = line.length - 1; index >= 0; index -= 1) {
      const value = line[index];
      if (exactWidget(value, ROOT_WIDGET) || exactWidget(value, FLOW_WIDGET)) line.splice(index, 1);
    }
  }
  return next;
}

function ownershipFor(
  rendererPath: string,
  providerDigest: string,
  renderer: JsonObject,
  prior: OwnershipV2 | null,
  oldRenderer: Buffer | null,
): OwnershipV2 {
  const lines = renderer.lines as unknown[][];
  const root = widgetMatches(lines, ROOT_WIDGET.id)[0]!;
  const flow = widgetMatches(lines, FLOW_WIDGET.id)[0]!;
  return {
    version: 2,
    capability: 'flowStatusWidgetV2',
    configPath: rendererPath,
    providerDigest,
    buildRevision: BUILD_REVISION,
    widgets: [
      { ...ROOT_WIDGET, line: root.line, position: root.position, canonicalDigest: sha256(canonical(ROOT_WIDGET)) },
      { ...FLOW_WIDGET, line: flow.line, position: flow.position, canonicalDigest: sha256(canonical(FLOW_WIDGET)) },
    ],
    preInstall: prior?.preInstall ?? (
      oldRenderer === null ? { state: 'absent' } : { state: 'existing', digest: sha256(oldRenderer) }
    ),
    managedPostInstallDigest: sha256(json(renderer)),
  };
}

function preferenceTarget(root: string, enabled: boolean): FlowStatusPlanTarget {
  const plan = planHarnessConfigPatch(root, { flowStatus: enabled });
  return target(root, FLOW_STATUS_PRODUCT_PATHS.preference, Buffer.from(plan.newText, 'utf8'));
}

function report(
  root: string,
  options: Pick<PlanBundledFlowStatusOptions, 'mode' | 'intent'>,
  confinement: DestinationConfinementResult,
  state: FlowStatusProductState,
  classification: FlowStatusOwnershipClassification,
  detail: string,
  preference: boolean | null,
  targets: FlowStatusPlanTarget[],
): FlowStatusProductReport {
  return {
    version: 1, repositoryRoot: root, mode: options.mode, intent: options.intent,
    state, classification, detail, preference, targets, confinement,
  };
}

/**
 * Validate the two independent trust boundaries consumed by pure product planning. The accepted
 * artifact inspector may run its fixed bundled capability probe, and Windows confinement may run
 * its fixed native reparse-point probe. Neither boundary executes a project settings command.
 */
export function validateBundledFlowStatusPlanInputs(
  options: Pick<PlanBundledFlowStatusOptions, 'cwd' | 'artifacts' | 'inspectArtifacts' | 'confine'>,
): FlowStatusPlanInputValidation {
  const root = path.resolve(options.cwd);
  const confine = options.confine ?? confineRepositoryDestinations;
  const confinement = confine(root, CONFINED_TARGETS);
  if (confinement.state === 'conflict') {
    return { state: 'conflict', repositoryRoot: root, confinement, detail: confinement.detail };
  }
  const typedConfinement = validateConfinedDestinationTypes(root, confinement);
  if (typedConfinement.state === 'conflict') {
    return {
      state: 'conflict',
      repositoryRoot: root,
      confinement: typedConfinement,
      detail: typedConfinement.detail,
    };
  }
  try {
    return {
      state: 'validated',
      value: {
        repositoryRoot: root,
        confinement: typedConfinement,
        artifacts: options.artifacts ?? (options.inspectArtifacts ?? inspectFlowStatusReleaseArtifacts)(),
      },
    };
  } catch (error) {
    return {
      state: 'conflict',
      repositoryRoot: root,
      confinement: typedConfinement,
      detail: error instanceof Error ? error.message : 'Bundled Flow Status artifacts failed validation.',
    };
  }
}

/**
 * Pure planning/classification boundary. It consumes already confined and verified inputs, reads
 * project bytes, and never spawns a child process or writes or recovers project state.
 */
export function planBundledFlowStatusFromValidatedInputs(
  options: Pick<PlanBundledFlowStatusOptions, 'mode' | 'intent'>,
  validated: ValidatedFlowStatusPlanInputs,
): FlowStatusProductReport {
  const root = validated.repositoryRoot;
  const confinement = validated.confinement;
  const release = validated.artifacts;
  let releaseBytes;
  try {
    releaseBytes = readValidatedReleaseBytes(release);
  } catch (error) {
    return report(
      root, options, confinement, 'conflict', 'malformed',
      error instanceof Error ? error.message : 'Verified Flow Status release bytes are unavailable.',
      null, unchangedTargets(root),
    );
  }
  let config;
  try {
    config = readHarnessConfig(root, true)!;
  } catch (error) {
    return report(
      root, options, confinement, 'conflict', 'malformed',
      error instanceof Error ? error.message : 'Workflow config is malformed.', null,
      unchangedTargets(root),
    );
  }
  if (!config.harnesses.includes('claude')) {
    const detail = options.intent === 'preserve'
      ? 'Claude is not selected; Flow Status is not applicable.'
      : 'Explicit Flow Status intent requires the Claude harness to be selected.';
    return report(
      root, options, confinement, options.intent === 'preserve' ? 'not-selected' : 'conflict',
      'fresh', detail, null, unchangedTargets(root),
    );
  }
  const desired = options.intent === 'enable'
    ? true
    : options.intent === 'disable'
      ? false
      : config.flowStatus ?? true;
  if (fs.existsSync(path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.pending.split('/')))) {
    return report(
      root, options, confinement, 'recovery-required', 'partial-owned',
      'A pending Flow Status transaction requires the sole transaction owner to recover it.',
      desired, unchangedTargets(root),
    );
  }
  const current = inspectCurrent(root, release);
  const conflictClasses: readonly FlowStatusOwnershipClassification[] = [
    'foreign', 'modified', 'duplicate', 'swapped', 'partial-owned', 'malformed', 'user-owned',
  ];
  if (conflictClasses.includes(current.classification)) {
    return report(
      root, options, confinement, 'conflict', current.classification, current.detail, desired,
      unchangedTargets(root),
    );
  }
  if (!desired) {
    if (!current.installed) {
      const pref = preferenceTarget(root, false);
      return report(
        root, options, confinement, 'disabled', 'fresh',
        pref.operation === 'unchanged'
          ? 'Flow Status is explicitly disabled and no installation is present.'
          : 'Flow Status will be disabled in workflow configuration; no installation is present.',
        false, [pref],
      );
    }
    if (current.renderer === null || current.settings === null || current.ownership === null) {
      return report(
        root, options, confinement, 'conflict', 'partial-owned',
        'Exact removal requires renderer, settings, binding, and ownership evidence.', false,
        unchangedTargets(root),
      );
    }
    const rendererPath = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.renderer.split('/'));
    const oldRenderer = existingBytes(rendererPath)!;
    const withoutWidgets = removeRenderer(current.renderer);
    const rendererBytes = current.ownership.preInstall.state === 'absent'
      && current.ownership.managedPostInstallDigest === sha256(oldRenderer)
      ? null
      : json(withoutWidgets);
    const nextSettings = structuredClone(current.settings);
    delete nextSettings.statusLine;
    const planned = [
      target(root, FLOW_STATUS_PRODUCT_PATHS.provider, null),
      target(root, FLOW_STATUS_PRODUCT_PATHS.supervisor, null),
      target(root, FLOW_STATUS_PRODUCT_PATHS.packageMetadata, null),
      target(root, FLOW_STATUS_PRODUCT_PATHS.binding, null),
      target(root, FLOW_STATUS_PRODUCT_PATHS.renderer, rendererBytes),
      target(root, FLOW_STATUS_PRODUCT_PATHS.ownership, null),
      target(root, FLOW_STATUS_PRODUCT_PATHS.claudeSettings, json(nextSettings)),
      preferenceTarget(root, false),
    ];
    return report(
      root, options, confinement, 'update', current.classification,
      'Exact-owned Flow Status resources will be removed and pre-install behavior restored.',
      false, planned,
    );
  }

  const rendererPath = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.renderer.split('/'));
  const bindingPath = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.binding.split('/'));
  const providerPath = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.provider.split('/'));
  const supervisorPath = path.join(root, ...FLOW_STATUS_PRODUCT_PATHS.supervisor.split('/'));
  const renderer = installRenderer(current.renderer);
  const settings = structuredClone(current.settings ?? {});
  settings.statusLine = { type: 'command', command: command(supervisorPath, bindingPath) };
  const binding = {
    executable: providerPath,
    configPath: rendererPath,
    cwd: root,
    expectedExecutableDigest: release.providerSha256,
  };
  const owner = ownershipFor(
    rendererPath,
    release.providerSha256,
    renderer,
    current.ownership,
    existingBytes(rendererPath),
  );
  const planned = [
    target(root, FLOW_STATUS_PRODUCT_PATHS.provider, releaseBytes.provider),
    target(root, FLOW_STATUS_PRODUCT_PATHS.supervisor, releaseBytes.supervisor),
    target(root, FLOW_STATUS_PRODUCT_PATHS.packageMetadata, releaseBytes.packageMetadata),
    target(root, FLOW_STATUS_PRODUCT_PATHS.binding, json(binding)),
    target(root, FLOW_STATUS_PRODUCT_PATHS.renderer, json(renderer)),
    target(root, FLOW_STATUS_PRODUCT_PATHS.ownership, json(owner)),
    target(root, FLOW_STATUS_PRODUCT_PATHS.claudeSettings, json(settings)),
    preferenceTarget(root, true),
  ];
  const allUnchanged = planned.every(item => item.operation === 'unchanged');
  const state: FlowStatusProductState = allUnchanged
    ? 'unchanged'
    : current.classification === 'fresh'
      ? 'install'
      : current.classification === 'stale-exact-owned' && current.canonicalCommand
        ? current.ownership?.providerDigest === release.providerSha256 ? 'repair' : 'update'
        : 'update';
  return report(
    root, options, confinement, state, current.classification,
    allUnchanged
      ? 'The exact owned Flow Status installation and preference are unchanged.'
      : current.classification === 'fresh'
        ? 'Flow Status will be installed from the verified bundled release.'
        : current.detail,
    true, planned,
  );
}

/** Convenience composition for callers that have not already validated both trust boundaries. */
export function planBundledFlowStatus(options: PlanBundledFlowStatusOptions): FlowStatusProductReport {
  const validation = validateBundledFlowStatusPlanInputs(options);
  if (validation.state === 'conflict') {
    return report(
      validation.repositoryRoot,
      options,
      validation.confinement,
      'conflict',
      'malformed',
      validation.detail,
      null,
      [],
    );
  }
  return planBundledFlowStatusFromValidatedInputs(options, validation.value);
}

export function inspectBundledFlowStatus(
  cwd: string,
  artifacts?: InspectedFlowStatusReleaseArtifacts,
): FlowStatusProductReport {
  return planBundledFlowStatus({ cwd, mode: 'update', intent: 'preserve', artifacts });
}
