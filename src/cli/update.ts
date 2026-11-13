import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import {
  type ManagedResource,
  getManagedResources,
  OBSOLETE_MANAGED_PATHS,
  renderManagedResource,
  ensureProjectMaps,
  resolvePackageRoot,
} from './init.js';
import { readHarnessConfig } from './harness.js';
import { computeHash, loadHashes, saveHashes, toPosix } from './template-hash.js';
import { confineRepositoryDestinations } from './destination-confinement.js';

declare global {
  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  }
}

export interface UpdateOptions {
  cwd?: string;
  dryRun?: boolean;
  force?: boolean;
  skipAll?: boolean;
  createNew?: boolean;
}

export type FileChangeStatus = 'new' | 'restore' | 'unchanged' | 'autoUpdate' | 'changed' | 'userDeleted' | 'obsolete';

export interface UpdatePlanEntry {
  relativePath: string;
  status: FileChangeStatus;
  action: 'create' | 'skip' | 'overwrite' | 'create-new' | 'preserve-deletion' | 'delete';
}

type ConflictAction = 'overwrite' | 'skip' | 'create-new';

const PROTECTED_USER_DATA_PREFIXES = [
  '.omp-flow/tasks/',
  '.omp-flow/events/',
  '.omp-flow/workspace/',
  '.omp-flow/wiki/',
  '.omp-flow/findings/',
  '.omp-flow/sessions/',
  '.omp-flow/issues/',
] as const;

// Formerly template-hashed; now bootstrapped once and owned by the project and its indexer.
const LEGACY_HASHED_USER_DATA_PATH = '.omp-flow/wiki/specs/index.md';
const TEMPLATE_HASHES_PATH = '.omp-flow/.template-hashes.json';

const STATUS_ORDER: readonly FileChangeStatus[] = [
  'new',
  'restore',
  'unchanged',
  'autoUpdate',
  'changed',
  'userDeleted',
  'obsolete',
];

const COLORS = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
} as const;

export function analyzeChanges(cwd: string, hashes: Record<string, string>): UpdatePlanEntry[] {
  const absoluteCwd = path.resolve(cwd);
  const harnesses = readHarnessConfig(absoluteCwd, true)!.harnesses;
  const packageRoot = resolvePackageRoot(harnesses);
  const resources = getManagedResources(harnesses);
  const normalizedHashes = normalizeHashMap(hashes);

  const managed: UpdatePlanEntry[] = resources.map((resource) => {
    const relativePath = normalizeRelativePath(resource.destinationPath);
    assertManagedPathAllowed(relativePath);

    const sourcePath = path.join(packageRoot, resource.sourcePath);
    const destinationPath = path.join(absoluteCwd, relativePath);
    const storedHash = normalizedHashes[relativePath];
    const destinationExists = fs.existsSync(destinationPath);

    if (!destinationExists) {
      return {
        relativePath,
        status: storedHash === undefined ? 'new' : 'userDeleted',
        action: storedHash === undefined ? 'create' : 'preserve-deletion',
      };
    }

    const currentContent = fs.readFileSync(destinationPath, 'utf8');
    const currentHash = computeHash(currentContent);
    const templateContent = renderManagedResource(sourcePath, fs.readFileSync(sourcePath, 'utf8'));
    const templateHash = computeHash(templateContent);

    if (storedHash === undefined) {
      if (currentHash === templateHash) {
        return {
          relativePath,
          status: 'unchanged',
          action: 'skip',
        };
      }

      return {
        relativePath,
        status: 'changed',
        action: 'skip',
      };
    }

    if (currentHash === templateHash) {
      return {
        relativePath,
        status: 'unchanged',
        action: 'skip',
      };
    }

    if (storedHash === currentHash) {
      return {
        relativePath,
        status: 'autoUpdate',
        action: 'overwrite',
      };
    }

    return {
      relativePath,
      status: 'changed',
      action: 'skip',
    };
  });
  restoreMissingHarnesses(resources, managed);

  const obsolete = OBSOLETE_MANAGED_PATHS.flatMap((obsoletePath): UpdatePlanEntry[] => {
    const relativePath = normalizeRelativePath(obsoletePath);
    assertManagedPathAllowed(relativePath);
    const destinationPath = path.join(absoluteCwd, relativePath);
    if (!fs.existsSync(destinationPath)) return [];
    const storedHash = normalizedHashes[relativePath];
    const currentHash = computeHash(fs.readFileSync(destinationPath, 'utf8'));
    if (storedHash !== undefined && storedHash === currentHash) {
      return [{ relativePath, status: 'obsolete', action: 'delete' }];
    }
    return [{ relativePath, status: 'changed', action: 'skip' }];
  });
  return [...managed, ...obsolete];
}

// A selected Harness whose managed files are all gone was lost as a whole (an ignored or
// uncloned directory), not pruned file by file; restore it instead of creating only new files.
function restoreMissingHarnesses(resources: readonly ManagedResource[], plan: UpdatePlanEntry[]): void {
  const groups = new Set(resources.map(resource => resource.group).filter(group => group !== 'core'));
  for (const group of groups) {
    const entries = plan.filter((_, index) => resources[index].group === group);
    const allMissing = entries.every(entry => entry.status === 'new' || entry.status === 'userDeleted');
    if (!allMissing || !entries.some(entry => entry.status === 'userDeleted')) continue;
    for (const entry of entries) {
      if (entry.status === 'userDeleted') Object.assign(entry, { status: 'restore', action: 'create' });
    }
  }
}

export function createBackup(cwd: string): string {
  const absoluteCwd = path.resolve(cwd);
  const resources = getManagedResources(readHarnessConfig(absoluteCwd, true)!.harnesses);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = createUniqueBackupDir(absoluteCwd, timestamp);

  const backupPaths = [
    ...resources.map(resource => resource.destinationPath),
    ...OBSOLETE_MANAGED_PATHS,
  ];
  for (const managedPath of backupPaths) {
    const relativePath = normalizeRelativePath(managedPath);
    assertManagedPathAllowed(relativePath);

    const source = path.join(absoluteCwd, relativePath);
    if (!fs.existsSync(source)) {
      continue;
    }

    const stat = fs.statSync(source);
    if (!stat.isFile()) {
      continue;
    }

    const destination = path.join(backupDir, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }

  return backupDir;
}

export function printPlan(plan: UpdatePlanEntry[]): void {
  const counts = createEmptyStatusCounts();
  for (const entry of plan) {
    counts[entry.status] += 1;
  }

  console.log('omp-flow update plan');
  console.log('status       action             path');
  console.log('-----------  -----------------  ----');

  for (const entry of plan) {
    const status = colorStatus(entry.status, entry.status.padEnd(11));
    console.log(`${status}  ${entry.action.padEnd(17)}  ${entry.relativePath}`);
  }

  const summary = STATUS_ORDER.map((status) => `${status}: ${counts[status]}`).join(', ');
  console.log(`Summary: ${summary}`);
}

export async function promptConflictResolution(entry: UpdatePlanEntry): Promise<ConflictAction> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    for (;;) {
      console.log(`\nFile: ${entry.relativePath} (modified by user)`);
      console.log('[1] Overwrite - Replace with new template version');
      console.log('[2] Skip - Keep your current version');
      console.log(`[3] Create copy - Save new version as ${entry.relativePath}.new`);

      const answer = (await question(rl, 'Choose [1/2/3]: ')).trim();
      if (answer === '1') {
        return 'overwrite';
      }
      if (answer === '2' || answer === '') {
        return 'skip';
      }
      if (answer === '3') {
        return 'create-new';
      }

      console.log('Please enter 1, 2, or 3.');
    }
  } finally {
    rl.close();
  }
}

// Returns whether the hash store was confined along with the planned file writes.
function assertUpdateDestinationsConfined(cwd: string, plan: readonly UpdatePlanEntry[]): boolean {
  const targets: string[] = [];
  for (const entry of plan) {
    assertManagedPathAllowed(entry.relativePath);
    if (entry.action === 'skip' || entry.action === 'preserve-deletion') continue;
    targets.push(entry.action === 'create-new' ? `${entry.relativePath}.new` : entry.relativePath);
  }
  if (!targets.length) return false;
  targets.push(TEMPLATE_HASHES_PATH);
  assertConfined(cwd, targets);
  return true;
}

function assertConfined(cwd: string, targets: readonly string[]): void {
  const confined = confineRepositoryDestinations(cwd, targets);
  if (confined.state !== 'confined') {
    throw new Error(`Cannot update managed resources: ${JSON.stringify(confined)}`);
  }
}

export function executeUpdate(cwd: string, plan: UpdatePlanEntry[], hashes: Record<string, string>): void {
  const absoluteCwd = path.resolve(cwd);
  const hashStoreConfined = assertUpdateDestinationsConfined(absoluteCwd, plan);
  const harnesses = readHarnessConfig(absoluteCwd, true)!.harnesses;
  const packageRoot = resolvePackageRoot(harnesses);
  const resources = getManagedResources(harnesses);
  const nextHashes = normalizeHashMap(hashes);
  let hashesChanged = false;

  for (const entry of plan) {
    if (entry.action === 'skip' || entry.action === 'preserve-deletion') {
      continue;
    }

    if (entry.action === 'delete') {
      const destinationPath = path.join(absoluteCwd, entry.relativePath);
      fs.unlinkSync(destinationPath);
      if (entry.relativePath in nextHashes) {
        delete nextHashes[entry.relativePath];
        hashesChanged = true;
      }
      continue;
    }

    const resource = resources.find(
      (candidate) => normalizeRelativePath(candidate.destinationPath) === entry.relativePath,
    );
    if (resource === undefined) {
      throw new Error(`Cannot update unmanaged template path: ${entry.relativePath}`);
    }

    const templatePath = path.join(packageRoot, resource.sourcePath);
    const templateContent = renderManagedResource(templatePath, fs.readFileSync(templatePath, 'utf8'));
    const destinationPath = path.join(absoluteCwd, entry.relativePath);

    if (entry.action === 'create-new') {
      const newPath = `${destinationPath}.new`;
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
      fs.writeFileSync(newPath, templateContent, 'utf8');
      continue;
    }

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, templateContent, 'utf8');

    const nextHash = computeHash(templateContent);
    if (nextHashes[entry.relativePath] !== nextHash) {
      nextHashes[entry.relativePath] = nextHash;
      hashesChanged = true;
    }
  }

  // Drop the legacy hash key only; the project-owned file on disk is never touched.
  if (LEGACY_HASHED_USER_DATA_PATH in nextHashes) {
    delete nextHashes[LEGACY_HASHED_USER_DATA_PATH];
    hashesChanged = true;
  }

  if (hashesChanged) {
    if (!hashStoreConfined) assertConfined(absoluteCwd, [TEMPLATE_HASHES_PATH]);
    saveHashes(absoluteCwd, nextHashes);
  }
}

export async function interactiveUpdate(options: UpdateOptions = {}): Promise<UpdatePlanEntry[]> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const hashes = loadHashes(cwd);
  const plan = analyzeChanges(cwd, hashes);

  if (options.dryRun === true) {
    printPlan(plan);
    return plan;
  }

  const resolvedPlan = await resolvePlan(plan, options);
  assertUpdateDestinationsConfined(cwd, resolvedPlan);
  if (hasFileSystemModifications(resolvedPlan)) {
    createBackup(cwd);
  }

  executeUpdate(cwd, resolvedPlan, hashes);
  ensureProjectMaps(cwd);
  return resolvedPlan;
}

async function resolvePlan(plan: UpdatePlanEntry[], options: UpdateOptions): Promise<UpdatePlanEntry[]> {
  const resolved: UpdatePlanEntry[] = [];

  for (const entry of plan) {
    if (entry.status !== 'changed') {
      resolved.push(entry);
      continue;
    }

    if (options.force === true) {
      resolved.push({ ...entry, action: 'overwrite' });
      continue;
    }

    if (options.skipAll === true) {
      resolved.push({ ...entry, action: 'skip' });
      continue;
    }

    if (options.createNew === true) {
      resolved.push({ ...entry, action: 'create-new' });
      continue;
    }

    const action = await promptConflictResolution(entry);
    resolved.push({ ...entry, action });
  }

  return resolved;
}

function question(rl: readline.Interface, query: string): Promise<string> {
  const { promise, resolve } = Promise.withResolvers<string>();
  rl.question(query, resolve);
  return promise;
}

function normalizeHashMap(hashes: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(hashes)) {
    normalized[normalizeRelativePath(key)] = value;
  }

  return normalized;
}

function normalizeRelativePath(relativePath: string): string {
  return toPosix(relativePath);
}

function assertManagedPathAllowed(relativePath: string): void {
  const normalized = normalizeRelativePath(relativePath);
  const isProtected = PROTECTED_USER_DATA_PREFIXES.some((prefix) => {
    const directory = prefix.slice(0, -1);
    return normalized === directory || normalized.startsWith(prefix);
  });

  if (isProtected) {
    throw new Error(`Refusing to update protected user data path: ${normalized}`);
  }
}

function createUniqueBackupDir(cwd: string, timestamp: string): string {
  const baseBackupDir = path.join(cwd, '.omp-flow', `.backup-${timestamp}`);
  let backupDir = baseBackupDir;
  let suffix = 1;

  while (fs.existsSync(backupDir)) {
    backupDir = `${baseBackupDir}-${suffix}`;
    suffix += 1;
  }

  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function createEmptyStatusCounts(): Record<FileChangeStatus, number> {
  return {
    new: 0,
    restore: 0,
    unchanged: 0,
    autoUpdate: 0,
    changed: 0,
    userDeleted: 0,
    obsolete: 0,
  };
}

function colorStatus(status: FileChangeStatus, text: string): string {
  if (status === 'new' || status === 'restore' || status === 'autoUpdate') {
    return `${COLORS.green}${text}${COLORS.reset}`;
  }

  if (status === 'changed') {
    return `${COLORS.yellow}${text}${COLORS.reset}`;
  }

  if (status === 'userDeleted') {
    return `${COLORS.red}${text}${COLORS.reset}`;
  }

  return `${COLORS.gray}${text}${COLORS.reset}`;
}

function hasFileSystemModifications(plan: UpdatePlanEntry[]): boolean {
  return plan.some((entry) => ['create', 'overwrite', 'create-new', 'delete'].includes(entry.action));
}
