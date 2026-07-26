import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import {
  HARNESSES,
  type Harness,
  normalizeHarnesses,
  readHarnessConfig,
  writeHarnessConfig,
} from './harness.js';
import { computeHash, loadHashes, saveHashes, toPosix } from './template-hash.js';

export type InitResourceGroup = 'core' | Harness;
export type InitPlanAction = 'create' | 'overwrite' | 'skip' | 'abort';
export type InitPlanReason = 'missing' | 'exists' | 'selected' | 'dry-run';

export interface InitOptions {
  cwd?: string;
  dryRun?: boolean;
  force?: boolean;
  skipExisting?: boolean;
  harnesses?: Harness[];
}

export interface InitPlanEntry {
  source: string;
  destination: string;
  displayPath: string;
  group: InitResourceGroup;
  selected: boolean;
  action: InitPlanAction;
  reason: InitPlanReason;
}

export interface ManagedResource {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly group: InitResourceGroup;
}

const AGENT_FILES = [
  'architect.md',
  'executor.md',
  'explore.md',
  'oracle.md',
  'orchestrator.md',
  'planner.md',
  'qbd-auditor.md',
  'researcher.md',
  'reviewer.md',
] as const;

const SKILL_NAMES = [
  'omp-flow',
  'omp-flow-brainstorm',
  'omp-flow-check',
  'omp-flow-debug',
  'omp-flow-decompose',
  'omp-flow-design',
  'omp-flow-execute',
  'omp-flow-finish',
  'omp-flow-implement',
  'omp-flow-qbd',
  'omp-flow-research',
  'omp-flow-ui-designer',
] as const;

const CODEX_AGENT_FILES = [
  'omp-flow-architect.toml',
  'omp-flow-check.toml',
  'omp-flow-implement.toml',
  'omp-flow-qbd.toml',
  'omp-flow-research.toml',
] as const;

const PYTHON_CORE_FILES = [
  'omp_flow.py',
  'common/__init__.py',
  'common/io.py',
  'common/paths.py',
  'common/active_task.py',
  'common/task_store.py',
  'common/workflow.py',
  'common/topology.py',
  'common/context.py',
  'common/reference.py',
  'common/gates.py',
  'common/evidence.py',
  'common/amend.py',
  'common/currency.py',
  'common/disposition.py',
] as const;

const CORE_RESOURCES: readonly ManagedResource[] = [
  {
    sourcePath: path.join('templates', '.omp-flow', 'workflow.md'),
    destinationPath: path.join('.omp-flow', 'workflow.md'),
    group: 'core',
  },
  ...PYTHON_CORE_FILES.map(fileName => ({
    sourcePath: path.join('templates', '.omp-flow', 'scripts', ...fileName.split('/')),
    destinationPath: path.join('.omp-flow', 'scripts', ...fileName.split('/')),
    group: 'core' as const,
  })),
];

const OMP_RESOURCES: readonly ManagedResource[] = [
  ...AGENT_FILES.map(fileName => ({
    sourcePath: path.join('templates', 'omp', 'agents', fileName),
    destinationPath: path.join('.omp', 'agents', fileName),
    group: 'omp' as const,
  })),
  ...SKILL_NAMES.map(name => ({
    sourcePath: path.join('templates', 'common', 'skills', name, 'SKILL.md'),
    destinationPath: path.join('.omp', 'skills', name, 'SKILL.md'),
    group: 'omp' as const,
  })),
  {
    sourcePath: path.join('templates', 'omp', 'settings.json'),
    destinationPath: path.join('.omp', 'settings.json'),
    group: 'omp',
  },
];

const CODEX_RESOURCES: readonly ManagedResource[] = [
  ...CODEX_AGENT_FILES.map(fileName => ({
    sourcePath: path.join('templates', 'codex', 'agents', fileName),
    destinationPath: path.join('.codex', 'agents', fileName),
    group: 'codex' as const,
  })),
  ...SKILL_NAMES.map(name => ({
    sourcePath: path.join('templates', 'common', 'skills', name, 'SKILL.md'),
    destinationPath: path.join('.codex', 'skills', name, 'SKILL.md'),
    group: 'codex' as const,
  })),
  {
    sourcePath: path.join('templates', 'codex', 'hooks.json'),
    destinationPath: path.join('.codex', 'hooks.json'),
    group: 'codex',
  },
  {
    sourcePath: path.join('templates', 'codex', 'hooks', 'inject-workflow-state.py'),
    destinationPath: path.join('.codex', 'hooks', 'inject-workflow-state.py'),
    group: 'codex',
  },
  {
    sourcePath: path.join('templates', 'codex', 'config.toml'),
    destinationPath: path.join('.codex', 'config.toml'),
    group: 'codex',
  },
];

const CLAUDE_AGENT_FILES = [
  'omp-flow-research.md',
  'omp-flow-architect.md',
  'omp-flow-qbd.md',
  'omp-flow-implement.md',
  'omp-flow-check.md',
] as const;

const CLAUDE_HOOK_FILES = [
  // Shared in-process control-plane shim (07-22-dispatch-stutter B-A001--001):
  // imported by the event-bound hooks, never bound in settings.json itself.
  '_omp_core.py',
  'session-start.py',
  'inject-workflow-state.py',
  'inject-agent-context.py',
  'inject-agent-identity.py',
  'protect-python-owned.py',
] as const;

const CLAUDE_RESOURCES: readonly ManagedResource[] = [
  {
    sourcePath: path.join('templates', 'claude', 'settings.json'),
    destinationPath: path.join('.claude', 'settings.json'),
    group: 'claude',
  },
  ...CLAUDE_AGENT_FILES.map(fileName => ({
    sourcePath: path.join('templates', 'claude', 'agents', fileName),
    destinationPath: path.join('.claude', 'agents', fileName),
    group: 'claude' as const,
  })),
  ...CLAUDE_HOOK_FILES.map(fileName => ({
    sourcePath: path.join('templates', 'claude', 'hooks', fileName),
    destinationPath: path.join('.claude', 'hooks', fileName),
    group: 'claude' as const,
  })),
  ...SKILL_NAMES.map(name => ({
    sourcePath: path.join('templates', 'common', 'skills', name, 'SKILL.md'),
    destinationPath: path.join('.claude', 'skills', name, 'SKILL.md'),
    group: 'claude' as const,
  })),
];

export const ALL_MANAGED_RESOURCES: readonly ManagedResource[] = [
  ...CORE_RESOURCES,
  ...OMP_RESOURCES,
  ...CODEX_RESOURCES,
  ...CLAUDE_RESOURCES,
];

export const OBSOLETE_MANAGED_PATHS = [
  path.join('.omp-flow', 'scripts', 'get_context.py'),
  ...['omp-flow-architect', 'omp-flow-debugger', 'omp-flow-executor', 'omp-flow-harvester', 'omp-flow-researcher', 'omp-flow-reviewer']
    .flatMap(name => [
      path.join('.omp', 'skills', name, 'SKILL.md'),
      path.join('.codex', 'skills', name, 'SKILL.md'),
    ]),
] as const;

export function getManagedResources(harnesses: readonly Harness[]): ManagedResource[] {
  const selected = new Set(harnesses);
  return ALL_MANAGED_RESOURCES.filter(resource => resource.group === 'core' || selected.has(resource.group));
}

export function renderManagedResource(sourcePath: string, content: string): string {
  const posixSource = toPosix(sourcePath);
  if (posixSource.endsWith('templates/codex/hooks.json') || posixSource.endsWith('templates/claude/settings.json')) {
    return content.replaceAll('{{PYTHON_CMD}}', process.platform === 'win32' ? 'python' : 'python3');
  }
  return content;
}

export function resolvePackageRoot(harnesses: readonly Harness[] = HARNESSES): string {
  const currentFile = fileURLToPath(import.meta.url);
  const packageRoot = path.resolve(path.dirname(currentFile), '..', '..');
  for (const resource of getManagedResources(harnesses)) {
    const source = path.join(packageRoot, resource.sourcePath);
    if (!fs.existsSync(source)) {
      throw new Error(`Required init resource is missing: ${source}`);
    }
  }
  return packageRoot;
}

export function buildDeploymentPlan(options: InitOptions): InitPlanEntry[] {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const harnesses = requireHarnesses(options.harnesses);
  const packageRoot = resolvePackageRoot(harnesses);

  return getManagedResources(harnesses).map(resource => {
    const source = path.join(packageRoot, resource.sourcePath);
    const destination = path.join(cwd, resource.destinationPath);
    const exists = fs.existsSync(destination);
    return {
      source,
      destination,
      displayPath: path.relative(cwd, destination),
      group: resource.group,
      selected: true,
      action: determineInitialAction(exists, options),
      reason: determineInitialReason(exists, options),
    };
  });
}

export function deployInitResources(options: InitOptions): InitPlanEntry[] {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const selectedHarnesses = requireHarnesses(options.harnesses);
  const existingHarnesses = readHarnessConfig(cwd)?.harnesses ?? [];
  const configuredHarnesses = normalizeHarnesses([...existingHarnesses, ...selectedHarnesses]);
  const plan = buildDeploymentPlan({ ...options, harnesses: selectedHarnesses });
  const hashes = loadHashes(cwd);
  let hashesChanged = false;

  for (const entry of plan) {
    if (entry.action === 'abort') {
      throw new Error('Cannot use force and skipExisting together');
    }
    if (entry.action === 'skip' || options.dryRun === true) continue;

    fs.mkdirSync(path.dirname(entry.destination), { recursive: true });
    const content = renderManagedResource(entry.source, fs.readFileSync(entry.source, 'utf8'));
    fs.writeFileSync(entry.destination, content, 'utf8');
    hashes[toPosix(path.relative(cwd, entry.destination))] = computeHash(content);
    hashesChanged = true;
  }

  if (options.dryRun !== true) {
    if (hashesChanged) saveHashes(cwd, hashes);
    writeHarnessConfig(cwd, configuredHarnesses);
  }
  return plan;
}

export async function interactiveInit(options: InitOptions = {}): Promise<InitPlanEntry[]> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const harnesses = options.harnesses?.length
    ? normalizeHarnesses(options.harnesses)
    : await resolveInteractiveHarnesses(cwd);
  const plan = deployInitResources({ ...options, cwd, harnesses });

  if (options.dryRun !== true) {
    for (const relative of [
      ['.omp-flow', 'tasks', 'archive'],
      ['.omp-flow', '.runtime', 'sessions'],
      ['.omp-flow', 'specs'],
      ['.omp-flow', 'knowhow'],
    ]) {
      fs.mkdirSync(path.join(cwd, ...relative), { recursive: true });
    }
  }

  for (const entry of plan) {
    console.log(`${entry.action}: ${entry.displayPath} (${entry.group})`);
  }
  if (harnesses.includes('codex')) {
    console.log('Codex: enable [features].hooks = true in ~/.codex/config.toml and approve project hooks with /hooks.');
  }
  return plan;
}

async function resolveInteractiveHarnesses(cwd: string): Promise<Harness[]> {
  const configured = readHarnessConfig(cwd)?.harnesses;
  if (configured?.length) return configured;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Select at least one harness with --omp, --codex, and/or --claude');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question('Select harnesses (comma-separated: omp,codex,claude) [omp,codex,claude]: ')).trim();
    const values = (answer || HARNESSES.join(',')).split(',').map(value => value.trim());
    const invalid = values.filter(value => !(HARNESSES as readonly string[]).includes(value));
    if (invalid.length) throw new Error(`Unknown harness: ${invalid.join(', ')}`);
    return normalizeHarnesses(values as Harness[]);
  } finally {
    rl.close();
  }
}

function requireHarnesses(harnesses: Harness[] | undefined): Harness[] {
  const normalized = normalizeHarnesses(harnesses ?? []);
  if (!normalized.length) throw new Error('At least one harness must be selected');
  return normalized;
}

function determineInitialAction(exists: boolean, options: InitOptions): InitPlanAction {
  if (options.force === true && options.skipExisting === true) return 'abort';
  if (exists && options.skipExisting === true) return 'skip';
  if (exists) return options.force === true ? 'overwrite' : 'skip';
  return 'create';
}

function determineInitialReason(exists: boolean, options: InitOptions): InitPlanReason {
  if (options.dryRun === true) return 'dry-run';
  if (exists) return options.force === true ? 'selected' : 'exists';
  return 'missing';
}
