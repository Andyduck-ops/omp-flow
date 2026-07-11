import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { interactiveInit } from './init.js';
import type { Harness } from './harness.js';
import { interactiveUpdate } from './update.js';

const PYTHON_COMMANDS = new Set([
  'status',
  'doctor',
  'task',
  'workflow',
  'context',
  'reference',
  'topology',
  'gate',
  'evidence',
]);

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function selectedHarnesses(args: string[]): Harness[] | undefined {
  const harnesses: Harness[] = [];
  if (hasFlag(args, '--omp')) harnesses.push('omp');
  if (hasFlag(args, '--codex')) harnesses.push('codex');
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

function printHelp(): void {
  console.log([
    'omp-flow CLI',
    '',
    'Bootstrap:',
    '  omp-flow init [--omp] [--codex] [--dry-run|--force|--skip-existing]',
    '  omp-flow update [--dry-run|--force|--skip-all|--create-new]',
    '',
    'Portable workflow:',
    '  omp-flow status',
    '  omp-flow doctor',
    '  omp-flow task create "Title" [--slug name] [--no-start]',
    '  omp-flow task current|list|start|finish|archive|select|clear',
    '  omp-flow workflow state|select-synthesis',
    '  omp-flow context --role <role> [--row <fullId>]',
    '  omp-flow reference digest-file|list|render',
    '  omp-flow topology validate|ready|mark-result',
    '  omp-flow gate prepare|inspect|decide qbd1|qbd2',
    '  omp-flow evidence submit ...',
    '',
    'These commands delegate to .omp-flow/scripts/omp_flow.py.',
  ].join('\n'));
}

export async function runCLI(args: string[] = process.argv): Promise<void> {
  const command = args[2] ?? 'status';
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
