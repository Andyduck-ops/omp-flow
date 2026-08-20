import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import inquirer from 'inquirer';

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
  userName?: string;
  isTTY?: boolean;
  promptHarnesses?: HarnessPrompt;
  gitRunner?: GitRunner;
}

export interface HarnessPromptRequest {
  choices: readonly Harness[];
  defaults: readonly Harness[];
}

export type HarnessPrompt = (request: HarnessPromptRequest) => Promise<readonly Harness[]>;

export interface GitCommandResult {
  error?: Error;
  status: number | null;
  stdout: string;
  stderr: string;
}

export type GitRunner = (cwd: string, args: readonly string[]) => GitCommandResult;

export function assertCompatibleInitOptions(
  options: Pick<InitOptions, 'force' | 'skipExisting'>,
): void {
  if (options.force === true && options.skipExisting === true) {
    throw new Error('Cannot use force and skipExisting together');
  }
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
  'omp-flow-workflow-maintainer',
  'omp-flow-qbd',
  'omp-flow-research',
  'omp-flow-sleep',
  'omp-flow-ui-designer',
  'omp-flow-wiki',
] as const;

const FLOW_STATUS_SKILL_NAME = 'flow-status' as const;
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
  'common/flow_status.py',
  'common/paths.py',
  'common/active_task.py',
  'common/task_store.py',
  'common/operation_store.py',
  'common/sleep_store.py',
] as const;

const WORKFLOW_LIBRARY_FILES = [
  'index.md',
  'full-delivery.md',
  'lite.md',
  'research.md',
  'experiment.md',
  'workflow-maintenance.md',
] as const;

const CORE_RESOURCES: readonly ManagedResource[] = [
  {
    sourcePath: path.join('templates', '.omp-flow', 'gitignore'),
    destinationPath: path.join('.omp-flow', '.gitignore'),
    group: 'core',
  },
  {
    sourcePath: path.join('templates', '.omp-flow', 'workflow.md'),
    destinationPath: path.join('.omp-flow', 'workflow.md'),
    group: 'core',
  },
  ...WORKFLOW_LIBRARY_FILES.map(fileName => ({
    sourcePath: path.join('templates', '.omp-flow', 'workflow', fileName),
    destinationPath: path.join('.omp-flow', 'workflow', fileName),
    group: 'core' as const,
  })),
  ...PYTHON_CORE_FILES.map(fileName => ({
    sourcePath: path.join('templates', '.omp-flow', 'scripts', ...fileName.split('/')),
    destinationPath: path.join('.omp-flow', 'scripts', ...fileName.split('/')),
    group: 'core' as const,
  })),
];

const UNIVERSAL_AGENT_SKILL_RESOURCES: readonly ManagedResource[] = SKILL_NAMES.map(name => ({
  sourcePath: path.join('templates', 'common', 'skills', name, 'SKILL.md'),
  destinationPath: path.join('.agents', 'skills', name, 'SKILL.md'),
  group: 'core' as const,
}));

const FLOW_STATUS_AGENT_RESOURCE: ManagedResource = {
  sourcePath: path.join('templates', 'common', 'skills', FLOW_STATUS_SKILL_NAME, 'SKILL.md'),
  destinationPath: path.join('.agents', 'skills', FLOW_STATUS_SKILL_NAME, 'SKILL.md'),
  group: 'core',
};

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
  {
    sourcePath: path.join('templates', 'codex', 'config.toml'),
    destinationPath: path.join('.codex', 'config.toml'),
    group: 'codex',
  },
  {
    sourcePath: path.join('templates', 'codex', 'hooks.json'),
    destinationPath: path.join('.codex', 'hooks.json'),
    group: 'codex',
  },
  ...['session-start.py', 'protect-runtime.py'].map(fileName => ({
    sourcePath: path.join('templates', 'codex', 'hooks', fileName),
    destinationPath: path.join('.codex', 'hooks', fileName),
    group: 'codex' as const,
  })),
];

const CLAUDE_AGENT_FILES = [
  'omp-flow-research.md',
  'omp-flow-architect.md',
  'omp-flow-qbd.md',
  'omp-flow-implement.md',
  'omp-flow-check.md',
] as const;

const CLAUDE_HOOK_FILES = [
  'session-start.py',
  'inject-agent-identity.py',
  'protect-runtime.py',
  'flow-status-observe.py',
  'flow-status-task-update-guard.py',
] as const;

const CLAUDE_RESOURCES: readonly ManagedResource[] = [
  ...CLAUDE_HOOK_FILES.map(fileName => ({
    sourcePath: path.join('templates', 'claude', 'hooks', fileName),
    destinationPath: path.join('.claude', 'hooks', fileName),
    group: 'claude' as const,
  })),
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
  ...SKILL_NAMES.map(name => ({
    sourcePath: path.join('templates', 'common', 'skills', name, 'SKILL.md'),
    destinationPath: path.join('.claude', 'skills', name, 'SKILL.md'),
    group: 'claude' as const,
  })),
];

const SNOW_AGENT_FILES = [
  'omp-flow-research.md',
  'omp-flow-architect.md',
  'omp-flow-qbd.md',
  'omp-flow-implement.md',
  'omp-flow-check.md',
] as const;

const SNOW_RESOURCES: readonly ManagedResource[] = [
  ...SNOW_AGENT_FILES.map(fileName => ({
    sourcePath: path.join('templates', 'snow', 'agents', fileName),
    destinationPath: path.join('.snow', 'agents', fileName),
    group: 'snow' as const,
  })),
  ...['onSessionStart.json', 'beforeToolCall.json'].map(fileName => ({
    sourcePath: path.join('templates', 'snow', 'hooks', fileName),
    destinationPath: path.join('.snow', 'hooks', fileName),
    group: 'snow' as const,
  })),
  ...['session-start.py', 'protect-runtime.py'].map(fileName => ({
    sourcePath: path.join('templates', 'snow', 'hooks', fileName),
    destinationPath: path.join('.snow', 'hooks', fileName),
    group: 'snow' as const,
  })),
];

const CURSOR_AGENT_FILES = [
  'omp-flow-research.md',
  'omp-flow-architect.md',
  'omp-flow-qbd.md',
  'omp-flow-implement.md',
  'omp-flow-check.md',
] as const;

const CURSOR_RESOURCES: readonly ManagedResource[] = [
  ...CURSOR_AGENT_FILES.map(fileName => ({
    sourcePath: path.join('templates', 'cursor', 'agents', fileName),
    destinationPath: path.join('.cursor', 'agents', fileName),
    group: 'cursor' as const,
  })),
  {
    sourcePath: path.join('templates', 'cursor', 'hooks.json'),
    destinationPath: path.join('.cursor', 'hooks.json'),
    group: 'cursor',
  },
  ...['session-start.py', 'protect-runtime.py'].map(fileName => ({
    sourcePath: path.join('templates', 'cursor', 'hooks', fileName),
    destinationPath: path.join('.cursor', 'hooks', fileName),
    group: 'cursor' as const,
  })),
];

const ALL_MANAGED_RESOURCES: readonly ManagedResource[] = [
  ...CORE_RESOURCES,
  ...UNIVERSAL_AGENT_SKILL_RESOURCES,
  FLOW_STATUS_AGENT_RESOURCE,
  ...OMP_RESOURCES,
  ...CODEX_RESOURCES,
  ...CLAUDE_RESOURCES,
  ...SNOW_RESOURCES,
  ...CURSOR_RESOURCES,
];

const RETIRED_VERIFIABLE_CLAIMS_FILES = [
  'SKILL.md',
  'knowledge/index.md',
  'knowledge/knowhow/detector-pathologies.md',
  'knowledge/knowhow/index.md',
  'knowledge/specs/index.md',
  'knowledge/specs/verifiable-claim.md',
] as const;

export const OBSOLETE_MANAGED_PATHS = [
  path.join('.omp-flow', 'scripts', 'get_context.py'),
  path.join('.omp', 'extensions', 'omp-flow', 'index.ts'),
  ...['trellis-check.md', 'trellis-implement.md', 'trellis-research.md']
    .map(fileName => path.join('.omp', 'agents', fileName)),
  ...[
    'before-dev',
    'brainstorm',
    'break-loop',
    'check-cross-layer',
    'check',
    'create-command',
    'finish-work',
    'improve-ut',
    'integrate-skill',
    'onboard',
    'record-session',
    'start',
    'update-spec',
  ].map(name => path.join('.codex', 'skills', name, 'SKILL.md')),
  ...[...SKILL_NAMES, FLOW_STATUS_SKILL_NAME]
    .map(name => path.join('.codex', 'skills', name, 'SKILL.md')),
  ...[
    'workflow.py',
    'topology.py',
    'context.py',
    'reference.py',
    'gates.py',
    'evidence.py',
    'amend.py',
    'currency.py',
    'disposition.py',
  ].map(fileName => path.join('.omp-flow', 'scripts', 'common', fileName)),
  path.join('.codex', 'hooks', 'inject-workflow-state.py'),
  ...[
    '_omp_core.py',
    'inject-workflow-state.py',
    'inject-agent-context.py',
    'protect-python-owned.py',
  ].map(fileName => path.join('.claude', 'hooks', fileName)),
  ...['omp-flow-architect', 'omp-flow-debugger', 'omp-flow-executor', 'omp-flow-harvester', 'omp-flow-researcher', 'omp-flow-reviewer']
    .flatMap(name => [
      path.join('.agents', 'skills', name, 'SKILL.md'),
      path.join('.omp', 'skills', name, 'SKILL.md'),
      path.join('.codex', 'skills', name, 'SKILL.md'),
    ]),
  ...['.agents', '.omp', '.codex', '.claude'].flatMap(harnessRoot =>
    RETIRED_VERIFIABLE_CLAIMS_FILES.map(relativePath =>
      path.join(harnessRoot, 'skills', 'omp-flow-verifiable-claims', ...relativePath.split('/')),
    ),
  ),
] as const;

export function getManagedResources(harnesses: readonly Harness[]): ManagedResource[] {
  const selected = new Set(harnesses);
  return ALL_MANAGED_RESOURCES.filter(resource => resource.group === 'core' || selected.has(resource.group));
}

export function renderManagedResource(sourcePath: string, content: string): string {
  const posixSource = toPosix(sourcePath);
  if (
    posixSource.endsWith('templates/codex/hooks.json')
    || posixSource.endsWith('templates/claude/settings.json')
    || posixSource.endsWith('templates/snow/hooks/onSessionStart.json')
    || posixSource.endsWith('templates/snow/hooks/beforeToolCall.json')
    || posixSource.endsWith('templates/cursor/hooks.json')
  ) {
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
  assertCompatibleInitOptions(options);
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
    ensureWikiRoot(cwd);
  }
  return plan;
}

function ensureWikiRoot(cwd: string): void {
  const wikiIndex = path.join(cwd, '.omp-flow', 'wiki', 'index.md');
  if (fs.existsSync(wikiIndex)) return;

  fs.mkdirSync(path.dirname(wikiIndex), { recursive: true });
  fs.writeFileSync(
    wikiIndex,
    '---\nokf_version: "0.2"\n---\n\n# Project Wiki\n\nDurable project knowledge belongs here.\n',
    'utf8',
  );
}

export async function interactiveInit(options: InitOptions = {}): Promise<InitPlanEntry[]> {
  assertCompatibleInitOptions(options);
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const userName = normalizeUserName(options.userName);

  const harnesses = options.harnesses?.length
    ? normalizeHarnesses(options.harnesses)
    : await resolveInteractiveHarnesses(
      cwd,
      options.promptHarnesses ?? promptHarnessesWithInquirer,
      options.isTTY ?? Boolean(process.stdin.isTTY && process.stdout.isTTY),
    );

  if (userName !== undefined && options.dryRun !== true) {
    const gitRunner = options.gitRunner ?? runGit;
    ensureLocalGitRepository(cwd, gitRunner);
    writeLocalGitUserName(cwd, userName, gitRunner);
  }
  const displayedUserName = userName ?? readGitUserName(cwd, options.gitRunner ?? runGit);
  if (displayedUserName !== undefined) {
    const label = options.dryRun === true && userName !== undefined ? 'Git user (dry-run)' : 'Git user';
    console.log(`${label}: ${displayedUserName}`);
  }

  const plan = deployInitResources({ ...options, cwd, harnesses });

  if (options.dryRun !== true) {
    for (const relative of [
      ['.omp-flow', 'tasks', 'archive'],
      ['.omp-flow', '.runtime', 'sessions'],
    ]) {
      fs.mkdirSync(path.join(cwd, ...relative), { recursive: true });
    }
  }

  for (const entry of plan) {
    console.log(`${entry.action}: ${entry.displayPath} (${entry.group})`);
  }
  return plan;
}

export async function promptHarnessesWithInquirer(
  request: HarnessPromptRequest,
): Promise<readonly Harness[]> {
  const defaults = new Set(request.defaults);
  const answer = await inquirer.prompt<{ harnesses: Harness[] }>([
    {
      type: 'checkbox',
      name: 'harnesses',
      message: 'Select harnesses',
      choices: request.choices.map(harness => ({
        name: harness,
        value: harness,
        checked: defaults.has(harness),
      })),
      loop: false,
    },
  ]);
  return answer.harnesses;
}

async function resolveInteractiveHarnesses(
  cwd: string,
  promptHarnesses: HarnessPrompt,
  isTTY: boolean,
): Promise<Harness[]> {
  if (!isTTY) {
    throw new Error('Select at least one harness with --omp, --codex, --claude, --snow, and/or --cursor');
  }

  const configured = readHarnessConfig(cwd)?.harnesses;
  const selected = await promptHarnesses({
    choices: HARNESSES,
    defaults: configured?.length ? configured : HARNESSES,
  });
  return requireHarnesses(normalizeHarnesses(selected as Harness[]));
}

function normalizeUserName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) throw new Error('Git user name must not be empty');
  return normalized;
}

function runGit(cwd: string, args: readonly string[]): GitCommandResult {
  const result = spawnSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return {
    error: result.error,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function ensureLocalGitRepository(cwd: string, gitRunner: GitRunner): void {
  const worktree = gitRunner(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (worktree.error) {
    throw new Error(`Cannot initialize Git repository: ${worktree.error.message}`);
  }
  if (worktree.status === 0 && worktree.stdout.trim() === 'true') return;

  const initialized = gitRunner(cwd, ['init', '--quiet']);
  if (initialized.error) {
    throw new Error(`Cannot initialize Git repository: ${initialized.error.message}`);
  }
  if (initialized.status !== 0) {
    const detail = initialized.stderr.trim();
    throw new Error(`Failed to initialize Git repository${detail ? `: ${detail}` : ''}`);
  }
}

function readGitUserName(cwd: string, gitRunner: GitRunner): string | undefined {
  const result = gitRunner(cwd, ['config', 'user.name']);
  if (result.error) {
    return undefined;
  }
  if (result.status !== 0) return undefined;
  const value = result.stdout.trim();
  return value || undefined;
}

function writeLocalGitUserName(cwd: string, userName: string, gitRunner: GitRunner): void {
  const result = gitRunner(cwd, ['config', '--local', 'user.name', userName]);
  if (result.error) {
    throw new Error(`Failed to set repository-local Git user name: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim();
    throw new Error(`Failed to set repository-local Git user name${detail ? `: ${detail}` : ''}`);
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
