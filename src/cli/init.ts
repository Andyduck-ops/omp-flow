import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeHash, loadHashes, saveHashes, toPosix } from './template-hash.js';

export type InitResourceGroup = 'agents' | 'settings' | 'templates' | 'codex';
export type InitPlanAction = 'create' | 'overwrite' | 'skip' | 'abort';
export type InitPlanReason = 'missing' | 'exists' | 'selected' | 'dry-run';

export interface InitOptions {
  cwd?: string;
  dryRun?: boolean;
  force?: boolean;
  skipExisting?: boolean;
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

interface ManagedResource {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly group: InitResourceGroup;
}

const CANONICAL_AGENT_FILES = [
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
] as const;

export const MANAGED_RESOURCES: readonly ManagedResource[] = [
  ...CANONICAL_AGENT_FILES.map((fileName) => ({
    sourcePath: path.join('.omp', 'agents', fileName),
    destinationPath: path.join('.omp', 'agents', fileName),
    group: 'agents' as const,
  })),
  {
    sourcePath: path.join('.omp', 'settings.json'),
    destinationPath: path.join('.omp', 'settings.json'),
    group: 'settings',
  },
  {
    sourcePath: path.join('templates', '.omp-flow', 'workflow.md'),
    destinationPath: path.join('.omp-flow', 'workflow.md'),
    group: 'templates',
  },
  ...PYTHON_CORE_FILES.map((fileName) => ({
    sourcePath: path.join('templates', '.omp-flow', 'scripts', ...fileName.split('/')),
    destinationPath: path.join('.omp-flow', 'scripts', ...fileName.split('/')),
    group: 'templates' as const,
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
];

export const OBSOLETE_MANAGED_PATHS = [
  path.join('.omp-flow', 'scripts', 'get_context.py'),
] as const;

export function renderManagedResource(sourcePath: string, content: string): string {
  if (toPosix(sourcePath).endsWith('templates/codex/hooks.json')) {
    return content.replaceAll('{{PYTHON_CMD}}', process.platform === 'win32' ? 'python' : 'python3');
  }
  return content;
}

export function resolvePackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const packageRoot = path.resolve(currentDir, '..', '..');

  for (const resource of MANAGED_RESOURCES) {
    const source = path.join(packageRoot, resource.sourcePath);
    if (!fs.existsSync(source)) {
      throw new Error(`Required init resource is missing: ${source}`);
    }
  }

  return packageRoot;
}

export function buildDeploymentPlan(options: InitOptions = {}): InitPlanEntry[] {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const packageRoot = resolvePackageRoot();

  return MANAGED_RESOURCES.map((resource) => {
    const source = path.join(packageRoot, resource.sourcePath);
    const destination = path.join(cwd, resource.destinationPath);
    const exists = fs.existsSync(destination);
    const selected = true;
    const action: InitPlanAction = determineInitialAction(exists, options);
    const reason: InitPlanReason = determineInitialReason(exists, options);

    return {
      source,
      destination,
      displayPath: path.relative(cwd, destination),
      group: resource.group,
      selected,
      action,
      reason,
    };
  });
}

export function deployInitResources(options: InitOptions = {}): InitPlanEntry[] {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const plan = buildDeploymentPlan(options);
  const hashes = loadHashes(cwd);
  let hashesChanged = false;

  for (const entry of plan) {
    if (entry.action === 'abort') {
      throw new Error('Cannot use force and skipExisting together');
    }
    if (entry.action === 'skip' || options.dryRun === true) {
      continue;
    }

    fs.mkdirSync(path.dirname(entry.destination), { recursive: true });
    const content = renderManagedResource(entry.source, fs.readFileSync(entry.source, 'utf8'));
    fs.writeFileSync(entry.destination, content, 'utf8');
    hashes[toPosix(path.relative(cwd, entry.destination))] = computeHash(content);
    hashesChanged = true;
  }

  if (hashesChanged && options.dryRun !== true) {
    saveHashes(cwd, hashes);
  }

  return plan;
}

export async function interactiveInit(options: InitOptions = {}): Promise<InitPlanEntry[]> {
  const plan = deployInitResources(options);
  if (options.dryRun !== true) {
    const cwd = path.resolve(options.cwd ?? process.cwd());
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

  return plan;
}

function determineInitialAction(exists: boolean, options: InitOptions): InitPlanAction {
  if (options.force === true && options.skipExisting === true) {
    return 'abort';
  }

  if (exists && options.skipExisting === true) {
    return 'skip';
  }

  if (exists) {
    return options.force === true ? 'overwrite' : 'skip';
  }

  return 'create';
}

function determineInitialReason(exists: boolean, options: InitOptions): InitPlanReason {
  if (options.dryRun === true) {
    return 'dry-run';
  }

  if (exists) {
    return options.force === true ? 'selected' : 'exists';
  }

  return 'missing';
}
