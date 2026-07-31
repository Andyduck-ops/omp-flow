import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  configureFlowStatus,
  inspectFlowStatusSetup,
  removeFlowStatusManagedResources,
  type FlowStatusScope,
} from './flow-status-setup.js';
import {
  buildRootFlowPublishRequestV2,
  isRootFlowCommandFailureV2,
  type RootFlowPublicationV2,
} from './flow-status-semantic-publisher.js';
import { renderCliBanner } from './banner.js';
import { interactiveInit } from './init.js';
import type { Harness } from './harness.js';
import { interactiveUpdate } from './update.js';

const PYTHON_COMMANDS = new Set([
  'status',
  'task',
  'workflow',
  'operation',
]);

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function requiredFlagValue(args: string[], flag: string): string {
  const value = flagValue(args, flag);
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

function flowStatusScope(args: string[]): FlowStatusScope {
  const value = requiredFlagValue(args, '--scope');
  if (value !== 'project' && value !== 'user') throw new Error('--scope must be project or user');
  return value;
}

function selectedHarnesses(args: string[]): Harness[] | undefined {
  const harnesses: Harness[] = [];
  if (hasFlag(args, '--omp')) harnesses.push('omp');
  if (hasFlag(args, '--codex')) harnesses.push('codex');
  if (hasFlag(args, '--claude')) harnesses.push('claude');
  return harnesses.length ? harnesses : undefined;
}

function runPython(cwd: string, args: string[]): void {
  const script = path.join(cwd, '.omp-flow', 'scripts', 'omp_flow.py');
  if (!fs.existsSync(script)) {
    throw new Error('Portable workflow core is not installed. Run omp-flow init first.');
  }
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const output = execFileSync(
    python,
    ['-X', 'utf8', script, '--cwd', cwd, ...args],
    { cwd, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] },
  );
  if (output.trim()) console.log(output.trim());
}

function portablePython(cwd: string): { command: string; script: string } {
  const script = path.join(cwd, '.omp-flow', 'scripts', 'omp_flow.py');
  if (!fs.existsSync(script)) {
    throw new Error('Portable workflow core is not installed. Run omp-flow init first.');
  }
  return {
    command: process.platform === 'win32' ? 'python' : 'python3',
    script,
  };
}

function readBoundedStdinJson(): unknown {
  const input = fs.readFileSync(0);
  if (input.byteLength > 256 * 1024) {
    return {
      version: 2,
      command: 'publish',
      state: 'error',
      requestId: null,
      code: 'too-large',
      retryable: false,
    };
  }
  try {
    return JSON.parse(input.toString('utf8'));
  } catch {
    return {
      version: 2,
      command: 'publish',
      state: 'error',
      requestId: null,
      code: 'malformed',
      retryable: false,
    };
  }
}

function previousRootFlowPublication(
  cwd: string,
  host: string,
  session: string,
): RootFlowPublicationV2 | null {
  const portable = portablePython(cwd);
  const result = spawnSync(
    portable.command,
    [
      '-X', 'utf8', portable.script, '--cwd', cwd,
      'status', 'inspect', '--host', host, '--session', session, '--json',
    ],
    {
      cwd,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: 128 * 1024,
      env: { ...process.env, OMP_FLOW_CONTEXT_ID: session },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  try {
    const parsed: unknown = JSON.parse(String(result.stdout));
    if (
      typeof parsed === 'object'
      && parsed !== null
      && 'snapshot' in parsed
      && typeof parsed.snapshot === 'object'
      && parsed.snapshot !== null
      && 'rootFlow' in parsed.snapshot
      && typeof parsed.snapshot.rootFlow === 'object'
      && parsed.snapshot.rootFlow !== null
      && 'state' in parsed.snapshot.rootFlow
      && parsed.snapshot.rootFlow.state === 'available'
      && 'publication' in parsed.snapshot.rootFlow
    ) {
      return parsed.snapshot.rootFlow.publication as RootFlowPublicationV2;
    }
  } catch {
    // Missing, expired, or malformed cache gives the pure builder a null previous projection.
  }
  return null;
}

function runPortableFlowStatus(
  cwd: string,
  action: 'receive' | 'renew' | 'clear',
  host: string,
  session: string,
  actorId: string,
  input: unknown,
): void {
  const portable = portablePython(cwd);
  const result = spawnSync(
    portable.command,
    [
      '-X', 'utf8', portable.script, '--cwd', cwd,
      'flow-status', action,
      '--host', host,
      '--session', session,
      '--actor-id', actorId,
    ],
    {
      cwd,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 128 * 1024,
      input: JSON.stringify(input),
      env: { ...process.env, OMP_FLOW_CONTEXT_ID: session },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  if (result.stdout) process.stdout.write(String(result.stdout));
  if (result.stderr) process.stderr.write(String(result.stderr));
  process.exitCode = result.error ? 3 : (result.status ?? 3);
}

function printHelp(): void {
  console.log([
    renderCliBanner(),
    '',
    'Bootstrap:',
    '  omp-flow init [--omp] [--codex] [--claude] [--dry-run|--force|--skip-existing]',
    '  omp-flow update [--dry-run|--force|--skip-all|--create-new]',
    '  omp-flow flow-status doctor [--ccstatusline-bin <path> --ccstatusline-package-json <path>',
    '    --ccstatusline-config <path> --claude-settings <path>]',
    '  omp-flow flow-status setup|update --scope <project|user> --ccstatusline-bin <path>',
    '    --ccstatusline-package-json <path> --ccstatusline-config <path>',
    '    --claude-settings <path> --root-task-line 1 --root-task-position <1..64>',
    '    --flow-line 2 --flow-position <1..64> [--dry-run|--yes]',
    '  omp-flow flow-status remove --scope <project|user> --ccstatusline-config <path>',
    '    --claude-settings <path> [--dry-run|--yes]',
    '  omp-flow flow-status publish|renew|clear --host <claude|codex|oh-my-pi>',
    '    --session <id> --actor-id <id> < closed-input.json',
    '',
    'Portable workflow:',
    '  omp-flow status',
    '  omp-flow task create "Title" [--slug name] [--no-start]',
    '  omp-flow task current|list|show|select|clear|archive',
    '  omp-flow workflow state',
    '  omp-flow operation start|show|list|finish',
    '',
    'These commands delegate to .omp-flow/scripts/omp_flow.py.',
  ].join('\n'));
}

export async function runCLI(args: string[] = process.argv): Promise<void> {
  const command = args[2] ?? 'help';
  const cwd = process.cwd();

  if (command === 'init') {
    await interactiveInit({
      cwd,
      dryRun: hasFlag(args, '--dry-run'),
      force: hasFlag(args, '--force'),
      skipExisting: hasFlag(args, '--skip-existing'),
      harnesses: selectedHarnesses(args),
    });
    if (!hasFlag(args, '--dry-run')) console.log('Initialized omp-flow project resources.');
    return;
  }

  if (command === 'update') {
    await interactiveUpdate({
      cwd,
      dryRun: hasFlag(args, '--dry-run'),
      force: hasFlag(args, '--force'),
      skipAll: hasFlag(args, '--skip-all'),
      createNew: hasFlag(args, '--create-new'),
    });
    if (!hasFlag(args, '--dry-run')) console.log('Updated omp-flow managed resources.');
    return;
  }

  if (command === 'flow-status') {
    const action = args[3] ?? 'doctor';
    if (action === 'publish' || action === 'renew' || action === 'clear') {
      const host = requiredFlagValue(args, '--host');
      if (!['claude', 'codex', 'oh-my-pi'].includes(host)) {
        throw new Error('--host must be claude, codex, or oh-my-pi');
      }
      const session = requiredFlagValue(args, '--session');
      const actorId = requiredFlagValue(args, '--actor-id');
      const input = readBoundedStdinJson();
      if (
        typeof input === 'object'
        && input !== null
        && 'state' in input
        && input.state === 'error'
      ) {
        const failure = { ...input, command: action };
        process.stderr.write(`${JSON.stringify(failure)}\n`);
        process.exitCode = 2;
        return;
      }
      if (action === 'publish') {
        const previous = previousRootFlowPublication(cwd, host, session);
        const built = buildRootFlowPublishRequestV2(previous, input);
        if (isRootFlowCommandFailureV2(built)) {
          process.stderr.write(`${JSON.stringify(built)}\n`);
          process.exitCode = 2;
          return;
        }
        runPortableFlowStatus(cwd, 'receive', host, session, actorId, built);
        return;
      }
      runPortableFlowStatus(cwd, action, host, session, actorId, input);
      return;
    }
    if (action === 'doctor') {
      console.log(JSON.stringify(
        inspectFlowStatusSetup(
          cwd,
          flagValue(args, '--ccstatusline-bin'),
          flagValue(args, '--ccstatusline-package-json'),
          flagValue(args, '--claude-settings'),
          flagValue(args, '--ccstatusline-config'),
        ),
        null,
        2,
      ));
      return;
    }
    if (action === 'setup' || action === 'update') {
      const rootTaskLine = Number(requiredFlagValue(args, '--root-task-line'));
      const rootTaskPosition = Number(requiredFlagValue(args, '--root-task-position'));
      const flowLine = Number(requiredFlagValue(args, '--flow-line'));
      const flowPosition = Number(requiredFlagValue(args, '--flow-position'));
      if (rootTaskLine !== 1) throw new Error('--root-task-line must be 1');
      if (flowLine !== 2) throw new Error('--flow-line must be 2');
      if (
        !Number.isSafeInteger(rootTaskPosition)
        || rootTaskPosition < 1
        || rootTaskPosition > 64
        || !Number.isSafeInteger(flowPosition)
        || flowPosition < 1
        || flowPosition > 64
      ) throw new Error('Flow Status positions must be integers in 1..64');
      console.log(JSON.stringify(configureFlowStatus({
        cwd,
        scope: flowStatusScope(args),
        ccstatuslineExecutable: requiredFlagValue(args, '--ccstatusline-bin'),
        ccstatuslinePackageJson: requiredFlagValue(args, '--ccstatusline-package-json'),
        ccstatuslineConfig: requiredFlagValue(args, '--ccstatusline-config'),
        claudeSettings: requiredFlagValue(args, '--claude-settings'),
        rootTaskLine: 1,
        rootTaskPosition,
        flowLine: 2,
        flowPosition,
        mode: action,
        dryRun: hasFlag(args, '--dry-run'),
        yes: hasFlag(args, '--yes'),
      }), null, 2));
      return;
    }
    if (action === 'remove') {
      console.log(JSON.stringify(
        removeFlowStatusManagedResources({
          cwd,
          scope: flowStatusScope(args),
          ccstatuslineConfig: requiredFlagValue(args, '--ccstatusline-config'),
          claudeSettings: requiredFlagValue(args, '--claude-settings'),
          dryRun: hasFlag(args, '--dry-run'),
          yes: hasFlag(args, '--yes'),
        }),
        null,
        2,
      ));
      return;
    }
    throw new Error('Unknown flow-status command: ' + action + '. Use doctor, setup, update, or remove.');
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (PYTHON_COMMANDS.has(command)) {
    runPython(cwd, args.slice(2));
    return;
  }

  throw new Error('Unknown command: ' + command + '. Run omp-flow help.');
}
