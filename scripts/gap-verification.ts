import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { SharedContextStore } from '../src/core/shared-context-store.ts';
import type { ContextEntry } from '../src/core/shared-context-store.ts';
import { UnifiedWorkspaceManager } from '../src/core/state.ts';
import { createTaskSeed } from '../src/core/task-seed.ts';
import { OMPFlowExtension } from '../src/omp/extension.ts';
import type { OMPHookContext } from '../src/omp/extension.ts';
import activateExtension from '../src/omp/extension-entry.ts';

type CheckResult = {
  name: string;
  pass: boolean;
  detail: string;
};

type GapVerificationResult = {
  passed: boolean;
  checks: CheckResult[];
};

type HookHandler = (ctx: OMPHookContext) => OMPHookContext;

type CommandResult = {
  exitCode: number;
};

const CONTEXT_PACK_MARKER = '<!-- omp-flow-context-pack -->';
const TASK_SLUG = 'gap-verify';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const checkNames = [
  'task-seed skeleton',
  'session_compact registration',
  'post-compaction reinjection',
  'regression commands',
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function failAllChecks(detail: string): GapVerificationResult {
  return {
    passed: false,
    checks: checkNames.map((name) => ({ name, pass: false, detail })),
  };
}

function runCheck(name: string, verify: () => string): CheckResult {
  try {
    return {
      name,
      pass: true,
      detail: verify(),
    };
  } catch (error) {
    return {
      name,
      pass: false,
      detail: toErrorMessage(error),
    };
  }
}

function runCommand(command: string, cwd: string): CommandResult {
  try {
    execSync(command, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return { exitCode: 0 };
  } catch (error) {
    const exitCode =
      typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 1;
    return { exitCode };
  }
}

function makeEntry(entryId: string, type: ContextEntry['type'], title: string, summary: string, entryPath: string, status?: ContextEntry['status']): ContextEntry {
  const timestamp = new Date().toISOString();
  return {
    entryId,
    type,
    title,
    summary,
    parentTaskId: TASK_SLUG,
    createdAt: timestamp,
    updatedAt: timestamp,
    path: entryPath,
    status,
  };
}

function readFirstInjectedMessage(ctx: OMPHookContext): string {
  assert(Array.isArray(ctx.messages), 'First onContext call did not inject a messages array');
  assert(ctx.messages.length >= 1, 'First onContext call injected an empty messages array');

  const firstMessage = ctx.messages[0] as { content?: unknown } | undefined;
  assert(firstMessage && typeof firstMessage.content === 'string', 'Injected message content was not a string');
  return firstMessage.content;
}

function verifyTaskSeedSkeleton(tmpDir: string): string {
  const workspace = path.join(tmpDir, 'check-1');
  const result = createTaskSeed(TASK_SLUG, { workspaceDir: workspace });
  const contextIndexPath = path.join(result.taskDir, 'context', 'index.json');
  const referenceReadmePath = path.join(result.taskDir, 'reference', 'README.md');

  assert(fs.existsSync(contextIndexPath), 'context/index.json was not created');
  const parsedIndex = JSON.parse(fs.readFileSync(contextIndexPath, 'utf-8')) as {
    version?: unknown;
    entries?: unknown;
  };
  assert(parsedIndex.version === '1.0.0', `context/index.json version was ${String(parsedIndex.version)}`);
  assert(Array.isArray(parsedIndex.entries), 'context/index.json entries was not an array');
  assert(parsedIndex.entries.length === 0, `context/index.json entries length was ${parsedIndex.entries.length}`);

  const requiredSubdirs = ['brief', 'interface', 'decision', 'finding'];
  for (const subdir of requiredSubdirs) {
    const fullPath = path.join(result.taskDir, 'context', subdir);
    assert(fs.existsSync(fullPath), `context/${subdir} was not created`);
    assert(fs.statSync(fullPath).isDirectory(), `context/${subdir} was not a directory`);
  }

  assert(fs.existsSync(referenceReadmePath), 'reference/README.md was not created');
  const readmeContent = fs.readFileSync(referenceReadmePath, 'utf-8');
  assert(readmeContent.includes('Tier 1 reference repos'), 'reference/README.md missing Tier 1 reference repos text');
  assert(readmeContent.includes('ReferenceDigester.digestFile()'), 'reference/README.md missing ReferenceDigester.digestFile() text');
  assert(result.filesCreated.includes('reference/README.md'), 'filesCreated did not include reference/README.md');

  return 'Verified context/index.json version=1.0.0 with empty entries, 4 context subdirectories, reference/README.md content, and filesCreated manifest entry.';
}

function verifySessionCompactRegistration(): string {
  const registered = new Map<string, HookHandler>();
  activateExtension({
    on: (event: string, handler: HookHandler) => {
      registered.set(event, handler);
    },
    registerTool: () => {},
    sendMessage: () => {},
  });

  assert(registered.has('session_compact'), 'activateExtension did not register session_compact');
  return `Registered hooks: ${Array.from(registered.keys()).join(', ')}`;
}

function verifyPostCompactionReinjection(tmpDir: string): string {
  const workspace = path.join(tmpDir, 'check-3');
  const stateMgr = new UnifiedWorkspaceManager(workspace);
  stateMgr.initWorkspace();
  createTaskSeed(TASK_SLUG, { workspaceDir: workspace });
  stateMgr.setActiveTask(TASK_SLUG);

  const store = new SharedContextStore(workspace, TASK_SLUG);
  store.put(
    makeEntry('dec-1', 'decision', 'Test Decision', 'test', 'decision/dec-1.md', 'accepted'),
    'Decision body for reinjection verification.'
  );
  store.put(
    makeEntry('int-1', 'interface', 'Test Interface', 'test', 'interface/int-1.md'),
    'Interface body for reinjection verification.'
  );

  const extension = new OMPFlowExtension(workspace);
  extension.onSessionCompact({});

  const firstContext = extension.onContext({});
  const firstMessageContent = readFirstInjectedMessage(firstContext);
  assert(firstMessageContent.includes(CONTEXT_PACK_MARKER), 'Injected message was missing the context-pack marker');
  assert(firstMessageContent.includes('<omp-flow-context-pack>'), 'Injected message was missing the context-pack block');

  const secondContext = extension.onContext({});
  assert(secondContext.messages === undefined, 'Second onContext call should not inject messages after the one-shot reinjection');

  return `Injected ${firstContext.messages?.length ?? 0} message(s); first message contained both context-pack markers; second onContext call returned no messages.`;
}

function verifyRegressionCommands(): string {
  const tscResult = runCommand('npx tsc', repoRoot);
  const testResult = runCommand('npx tsx tests/omp-flow.test.ts', repoRoot);
  assert(tscResult.exitCode === 0, `npx tsc exited with code ${tscResult.exitCode}`);
  assert(testResult.exitCode === 0, `npx tsx tests/omp-flow.test.ts exited with code ${testResult.exitCode}`);
  return `npx tsc exit ${tscResult.exitCode}; npx tsx tests/omp-flow.test.ts exit ${testResult.exitCode}`;
}

export function runGapVerification(workspaceDir?: string): GapVerificationResult {
  let tmpDir: string;

  try {
    const tempParentDir = workspaceDir ? path.resolve(workspaceDir) : os.tmpdir();
    fs.mkdirSync(tempParentDir, { recursive: true });
    tmpDir = fs.mkdtempSync(path.join(tempParentDir, 'gap-verify-'));
  } catch (error) {
    return failAllChecks(`temp workspace creation failed: ${toErrorMessage(error)}`);
  }

  try {
    const checks = [
      runCheck('task-seed skeleton', () => verifyTaskSeedSkeleton(tmpDir)),
      runCheck('session_compact registration', () => verifySessionCompactRegistration()),
      runCheck('post-compaction reinjection', () => verifyPostCompactionReinjection(tmpDir)),
      runCheck('regression commands', () => verifyRegressionCommands()),
    ];

    return {
      passed: checks.every((check) => check.pass),
      checks,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }
}

function main(): void {
  const result = runGapVerification();
  for (const check of result.checks) {
    if (check.pass) {
      console.log(`[PASS] ${check.name}`);
    } else {
      console.log(`[FAIL] ${check.name} — ${check.detail}`);
    }
  }
  process.exit(result.passed ? 0 : 1);
}

const directExecutionRequested = import.meta.url === `file://${process.argv[1]}`;
const normalizedExecutionMatch =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (directExecutionRequested || normalizedExecutionMatch) {
  main();
}
