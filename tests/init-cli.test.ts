import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  interactiveInit,
  type GitCommandResult,
  type GitRunner,
  type HarnessPromptRequest,
} from '../src/cli/init.js';
import { parseInitArguments, runCLI } from '../src/cli/index.js';

type Check = (condition: unknown, message: string) => asserts condition;

async function expectFailure(
  promise: Promise<unknown>,
  expected: string,
  check: Check,
): Promise<void> {
  try {
    await promise;
    check(false, `expected failure containing ${expected}`);
  } catch (error) {
    check(error instanceof Error && error.message.includes(expected), `failure should include ${expected}`);
  }
}

async function captureLogs(action: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => logs.push(values.map(String).join(' '));
  try {
    await action();
  } finally {
    console.log = original;
  }
  return logs;
}

export async function runInitCLITests(check: Check): Promise<void> {
  console.log('--- init CLI experience');

  const shortUser = parseInitArguments(['-u', ' alice ', '--codex', '--dry-run']);
  check(shortUser.userName === 'alice', '-u trims and captures the Git user name');
  check(shortUser.dryRun && shortUser.harnesses?.[0] === 'codex', '-u composes with init flags');

  const longUser = parseInitArguments(['--user', 'bob', '--claude', '--omp', '--force']);
  check(longUser.userName === 'bob' && longUser.force, '--user captures the Git user name');
  check(
    JSON.stringify(longUser.harnesses) === JSON.stringify(['omp', 'claude']),
    'explicit Harness flags normalize to stable order',
  );
  check(parseInitArguments(['--user=carol']).userName === 'carol', '--user=value is accepted');

  for (const [args, expected] of [
    [['-u'], '-u requires a value'],
    [['--user', '   '], '--user requires a non-empty value'],
    [['-u', 'alice', '--user', 'bob'], '-u/--user may only be specified once'],
    [['--force', '--skip-existing'], 'Cannot use force and skipExisting together'],
    [['--wat'], 'Unknown init option: --wat'],
    [['codex，claude'], 'Unexpected init argument: codex，claude'],
  ] as const) {
    try {
      parseInitArguments(args);
      check(false, `expected parser failure for ${args.join(' ')}`);
    } catch (error) {
      check(error instanceof Error && error.message.includes(expected), `parser failure should include ${expected}`);
    }
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-init-cli-'));
  const configuredRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-init-configured-'));
  const gitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-init-git-'));
  const bootstrapRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-init-bootstrap-'));
  const dryRunRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-init-dry-run-'));
  const noUserRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-init-no-user-'));
  const gitFailureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-init-git-failure-'));
  try {
    let request: HarnessPromptRequest | undefined;
    await interactiveInit({
      cwd: root,
      dryRun: true,
      isTTY: true,
      promptHarnesses: async value => {
        request = value;
        return ['codex'];
      },
    });
    check(
      JSON.stringify(request?.choices) === JSON.stringify(['omp', 'codex', 'claude']),
      'prompt receives the fixed Harness choices',
    );
    check(
      JSON.stringify(request?.defaults) === JSON.stringify(['omp', 'codex', 'claude']),
      'new projects default all Harnesses to checked',
    );
    check(!fs.existsSync(path.join(root, '.omp-flow')), 'prompted dry-run does not write project files');

    fs.mkdirSync(path.join(configuredRoot, '.omp-flow'), { recursive: true });
    fs.writeFileSync(
      path.join(configuredRoot, '.omp-flow', 'config.json'),
      JSON.stringify({ schemaVersion: 1, harnesses: ['claude'] }),
      'utf8',
    );
    let configuredDefaults: readonly string[] = [];
    await interactiveInit({
      cwd: configuredRoot,
      dryRun: true,
      isTTY: true,
      promptHarnesses: async value => {
        configuredDefaults = value.defaults;
        return ['claude'];
      },
    });
    check(JSON.stringify(configuredDefaults) === JSON.stringify(['claude']), 'existing config checks its Harnesses');

    await expectFailure(
      interactiveInit({
        cwd: root,
        dryRun: true,
        isTTY: true,
        userName: 'alice',
        promptHarnesses: async () => [],
      }),
      'At least one harness must be selected',
      check,
    );
    check(!fs.existsSync(path.join(root, '.git')), 'empty Harness selection does not bootstrap Git');
    await expectFailure(
      interactiveInit({
        cwd: root,
        dryRun: true,
        isTTY: true,
        userName: 'alice',
        promptHarnesses: async () => {
          throw new Error('selection cancelled');
        },
      }),
      'selection cancelled',
      check,
    );
    check(!fs.existsSync(path.join(root, '.git')), 'cancelled Harness selection does not bootstrap Git');
    await expectFailure(
      interactiveInit({ cwd: root, dryRun: true, isTTY: false }),
      'Select at least one harness',
      check,
    );

    let explicitPromptCalls = 0;
    await interactiveInit({
      cwd: root,
      dryRun: true,
      harnesses: ['omp'],
      promptHarnesses: async () => {
        explicitPromptCalls += 1;
        return ['claude'];
      },
    });
    check(explicitPromptCalls === 0, 'explicit Harness flags bypass the prompt adapter');

    const ttyLogs = await captureLogs(async () => {
      await runCLI(['node', 'omp-flow', 'init', '--codex', '--dry-run'], { cwd: root, isTTY: true });
    });
    check(ttyLogs.some(line => line.includes('agent-native workflow')), 'TTY init prints the art Banner');
    const nonTTYLogs = await captureLogs(async () => {
      await runCLI(['node', 'omp-flow', 'init', '--codex', '--dry-run'], { cwd: root, isTTY: false });
    });
    check(!nonTTYLogs.some(line => line.includes('agent-native workflow')), 'non-TTY init omits the art Banner');

    const beforeInvalid = fs.existsSync(path.join(root, '.omp-flow'));
    const invalidLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...values: unknown[]) => invalidLogs.push(values.map(String).join(' '));
    try {
      await expectFailure(
        runCLI(['node', 'omp-flow', 'init', '--wat'], { cwd: root, isTTY: true }),
        'Unknown init option',
        check,
      );
    } finally {
      console.log = originalLog;
    }
    check(!invalidLogs.some(line => line.includes('agent-native workflow')), 'invalid args fail before Banner output');
    check(fs.existsSync(path.join(root, '.omp-flow')) === beforeInvalid, 'invalid args fail before filesystem writes');

    execFileSync('git', ['init', '-q'], { cwd: gitRoot });
    execFileSync('git', ['config', '--local', 'user.name', 'before'], { cwd: gitRoot });

    const conflictLogs: string[] = [];
    const originalConflictLog = console.log;
    console.log = (...values: unknown[]) => conflictLogs.push(values.map(String).join(' '));
    try {
      await expectFailure(
        runCLI(
          ['node', 'omp-flow', 'init', '-u', 'after', '--codex', '--force', '--skip-existing'],
          { cwd: gitRoot, isTTY: true },
        ),
        'Cannot use force and skipExisting together',
        check,
      );
    } finally {
      console.log = originalConflictLog;
    }
    check(!conflictLogs.some(line => line.includes('agent-native workflow')), 'conflicting flags fail before Banner');
    check(
      execFileSync('git', ['config', '--local', 'user.name'], { cwd: gitRoot, encoding: 'utf8' }).trim() === 'before',
      'CLI conflicting flags leave the prior local Git user unchanged',
    );
    check(!fs.existsSync(path.join(gitRoot, '.omp-flow')), 'CLI conflicting flags fail before project writes');

    let conflictPromptCalls = 0;
    await expectFailure(
      interactiveInit({
        cwd: gitRoot,
        userName: 'after',
        force: true,
        skipExisting: true,
        isTTY: true,
        promptHarnesses: async () => {
          conflictPromptCalls += 1;
          return ['codex'];
        },
      }),
      'Cannot use force and skipExisting together',
      check,
    );
    check(conflictPromptCalls === 0, 'direct conflicting options fail before prompting');
    check(
      execFileSync('git', ['config', '--local', 'user.name'], { cwd: gitRoot, encoding: 'utf8' }).trim() === 'before',
      'direct conflicting options leave the prior local Git user unchanged',
    );
    check(!fs.existsSync(path.join(gitRoot, '.omp-flow')), 'direct conflicting options fail before project writes');

    await interactiveInit({ cwd: gitRoot, dryRun: true, harnesses: ['codex'], userName: 'preview' });
    check(
      execFileSync('git', ['config', '--local', 'user.name'], { cwd: gitRoot, encoding: 'utf8' }).trim() === 'before',
      'dry-run leaves repository-local Git user name unchanged',
    );
    check(!fs.existsSync(path.join(gitRoot, '.omp-flow')), 'dry-run with -u leaves project files unchanged');

    await interactiveInit({ cwd: gitRoot, harnesses: ['codex'], userName: 'alice' });
    check(
      execFileSync('git', ['config', '--local', 'user.name'], { cwd: gitRoot, encoding: 'utf8' }).trim() === 'alice',
      'explicit user name is written to repository-local Git config',
    );
    check(
      fs.existsSync(path.join(gitRoot, '.omp-flow', 'config.json')),
      'successful Git user initialization continues through resource deployment',
    );

    await interactiveInit({
      cwd: bootstrapRoot,
      isTTY: true,
      userName: 'bootstrap-user',
      promptHarnesses: async () => {
        check(!fs.existsSync(path.join(bootstrapRoot, '.git')), 'Harness selection happens before Git bootstrap');
        return ['codex'];
      },
    });
    check(fs.existsSync(path.join(bootstrapRoot, '.git')), 'explicit -u bootstraps a Git repository');
    check(
      execFileSync('git', ['config', '--local', 'user.name'], { cwd: bootstrapRoot, encoding: 'utf8' }).trim()
        === 'bootstrap-user',
      'bootstrapped repository receives the local Git user name',
    );
    check(
      fs.existsSync(path.join(bootstrapRoot, '.omp-flow', 'config.json')),
      'Git bootstrap continues through omp-flow resource deployment',
    );

    await interactiveInit({
      cwd: dryRunRoot,
      dryRun: true,
      harnesses: ['codex'],
      userName: 'preview-user',
    });
    check(!fs.existsSync(path.join(dryRunRoot, '.git')), 'dry-run -u does not bootstrap Git');
    check(!fs.existsSync(path.join(dryRunRoot, '.omp-flow')), 'dry-run -u does not deploy project resources');

    await interactiveInit({ cwd: noUserRoot, harnesses: ['codex'] });
    check(!fs.existsSync(path.join(noUserRoot, '.git')), 'init without -u does not bootstrap Git');
    check(
      fs.existsSync(path.join(noUserRoot, '.omp-flow', 'config.json')),
      'init without -u still deploys omp-flow resources',
    );

    const gitFailure = (
      result: Partial<GitCommandResult> = {},
    ): GitCommandResult => ({ status: 0, stdout: '', stderr: '', ...result });
    const failingRunner = (
      failure: (args: readonly string[]) => GitCommandResult,
    ): GitRunner => (_cwd, args) => failure(args);

    await expectFailure(
      interactiveInit({
        cwd: gitFailureRoot,
        harnesses: ['codex'],
        userName: 'alice',
        gitRunner: failingRunner(() => gitFailure({ status: null, error: new Error('spawn git ENOENT') })),
      }),
      'Cannot initialize Git repository: spawn git ENOENT',
      check,
    );
    check(!fs.existsSync(path.join(gitFailureRoot, '.omp-flow')), 'Git startup failure precedes project writes');

    await expectFailure(
      interactiveInit({
        cwd: gitFailureRoot,
        harnesses: ['codex'],
        userName: 'alice',
        gitRunner: failingRunner(args => args[0] === 'rev-parse'
          ? gitFailure({ status: 128, stderr: 'not a repository' })
          : gitFailure({ status: 1, stderr: 'permission denied' })),
      }),
      'Failed to initialize Git repository: permission denied',
      check,
    );
    check(!fs.existsSync(path.join(gitFailureRoot, '.omp-flow')), 'git init failure precedes project writes');

    await expectFailure(
      interactiveInit({
        cwd: gitFailureRoot,
        harnesses: ['codex'],
        userName: 'alice',
        gitRunner: failingRunner(args => args[0] === 'rev-parse'
          ? gitFailure({ stdout: 'true\n' })
          : gitFailure({ status: 1, stderr: 'config is locked' })),
      }),
      'Failed to set repository-local Git user name: config is locked',
      check,
    );
    check(!fs.existsSync(path.join(gitFailureRoot, '.omp-flow')), 'Git config failure precedes project writes');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(configuredRoot, { recursive: true, force: true });
    fs.rmSync(gitRoot, { recursive: true, force: true });
    fs.rmSync(bootstrapRoot, { recursive: true, force: true });
    fs.rmSync(dryRunRoot, { recursive: true, force: true });
    fs.rmSync(noUserRoot, { recursive: true, force: true });
    fs.rmSync(gitFailureRoot, { recursive: true, force: true });
  }
}
