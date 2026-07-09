import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { UnifiedWorkspaceManager } from '../core/state.js';

export type InitResourceGroup = 'agents' | 'settings' | 'templates';
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

const MANAGED_RESOURCES: readonly ManagedResource[] = [
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
    sourcePath: path.join('templates', '.omp-flow', 'state.json'),
    destinationPath: path.join('.omp-flow', 'state.json'),
    group: 'templates',
  },
  {
    sourcePath: path.join('templates', '.omp-flow', 'workflow.md'),
    destinationPath: path.join('.omp-flow', 'workflow.md'),
    group: 'templates',
  },
];

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
  const plan = buildDeploymentPlan(options);

  for (const entry of plan) {
    if (entry.action === 'abort') {
      throw new Error('Cannot use force and skipExisting together');
    }
    if (entry.action === 'skip' || options.dryRun === true) {
      continue;
    }

    fs.mkdirSync(path.dirname(entry.destination), { recursive: true });
    fs.copyFileSync(entry.source, entry.destination);
  }

  return plan;
}

export async function interactiveInit(options: InitOptions = {}): Promise<InitPlanEntry[]> {
  const stateMgr = new UnifiedWorkspaceManager();
  stateMgr.initWorkspace();

  const plan = deployInitResources(options);
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
