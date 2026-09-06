import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { renderCliBanner } from './banner.js';
import { assertCompatibleInitOptions, interactiveInit } from './init.js';
import { normalizeHarnesses, type Harness } from './harness.js';
import { interactiveUpdate } from './update.js';

const PYTHON_COMMANDS = new Set([
  'task',
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

export interface ParsedInitArguments {
  dryRun: boolean;
  force: boolean;
  skipExisting: boolean;
  harnesses?: Harness[];
  userName?: string;
}

export interface CLIRuntime {
  cwd?: string;
  isTTY?: boolean;
}

export function parseInitArguments(args: readonly string[]): ParsedInitArguments {
  const harnesses: Harness[] = [];
  let dryRun = false;
  let force = false;
  let skipExisting = false;
  let userName: string | undefined;
  let hasUserName = false;

  const setUserName = (rawValue: string, option: string): void => {
    if (hasUserName) throw new Error('-u/--user may only be specified once');
    const value = rawValue.trim();
    if (!value) throw new Error(`${option} requires a non-empty value`);
    hasUserName = true;
    userName = value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case '--omp':
        harnesses.push('omp');
        break;
      case '--codex':
        harnesses.push('codex');
        break;
      case '--claude':
        harnesses.push('claude');
        break;
      case '--snow':
        harnesses.push('snow');
        break;
      case '--cursor':
        harnesses.push('cursor');
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--force':
        force = true;
        break;
      case '--skip-existing':
        skipExisting = true;
        break;
      case '-u':
      case '--user': {
        const value = args[index + 1];
        if (value === undefined || value.startsWith('-')) {
          throw new Error(`${argument} requires a value`);
        }
        setUserName(value, argument);
        index += 1;
        break;
      }
      default:
        if (argument.startsWith('--user=')) {
          setUserName(argument.slice('--user='.length), '--user');
          break;
        }
        throw new Error(
          argument.startsWith('-')
            ? `Unknown init option: ${argument}`
            : `Unexpected init argument: ${argument}`,
        );
    }
  }

  const normalizedHarnesses = normalizeHarnesses(harnesses);
  const parsed = {
    dryRun,
    force,
    skipExisting,
    harnesses: normalizedHarnesses.length ? normalizedHarnesses : undefined,
    userName,
  };
  assertCompatibleInitOptions(parsed);
  return parsed;
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

function printHelp(): void {
  console.log([
    renderCliBanner(),
    '',
    'Bootstrap:',
    '  omp-flow init [-u|--user <name>] [--omp] [--codex] [--claude] [--snow] [--cursor]',
    '    [--dry-run|--force|--skip-existing]',
    '  omp-flow update [--dry-run|--force|--skip-all|--create-new]',
    '',
    'Portable workflow:',
    '  omp-flow task create "Title" [--slug name] [--no-start]',
    '  omp-flow task create|list|open|show|archive',
    '  omp-flow operation start|show|list|finish',
    '',
    'These commands delegate to .omp-flow/scripts/omp_flow.py.',
  ].join('\n'));
}

export async function runCLI(args: string[] = process.argv, runtime: CLIRuntime = {}): Promise<void> {
  const command = args[2] ?? 'help';
  const cwd = path.resolve(runtime.cwd ?? process.cwd());

  if (command === 'init') {
    const options = parseInitArguments(args.slice(3));
    const isTTY = runtime.isTTY ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
    if (isTTY) console.log(renderCliBanner());
    await interactiveInit({
      cwd,
      ...options,
      isTTY,
    });
    if (!options.dryRun) console.log('Initialized omp-flow project resources.');
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
