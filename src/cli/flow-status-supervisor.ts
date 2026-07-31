import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FLOW_STATUS_SUPERVISOR_TIMEOUT_MS = 400;
export const FLOW_STATUS_SUPERVISOR_MAX_INPUT = 1024 * 1024;
export const FLOW_STATUS_SUPERVISOR_MAX_OUTPUT = 64 * 1024;

export interface ClosedFlowStatusChildSpec {
  executable: string;
  configPath: string;
  cwd: string;
  expectedExecutableDigest: string;
}

export interface FlowStatusSupervisorReceipt {
  spawnedAtUnixMs: number | null;
  killRequestedAtUnixMs: number | null;
  presentationResolvedAtUnixMs: number;
  closeObservedAtUnixMs: number | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  overflow: boolean;
  killReturned: boolean | null;
  killThrew: boolean;
}

export interface SupervisedFlowStatusChild {
  presentation: Promise<Buffer>;
  cleanup: Promise<FlowStatusSupervisorReceipt>;
  child: ChildProcessWithoutNullStreams;
}

interface SupervisorOptions {
  spawnChild?: typeof spawn;
  now?: () => number;
  timeoutMs?: number;
  maxOutput?: number;
}

function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function closedSpec(value: unknown): ClosedFlowStatusChildSpec {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid Flow Status supervisor binding');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'configPath,cwd,executable,expectedExecutableDigest') {
    throw new Error('Invalid Flow Status supervisor binding');
  }
  for (const key of ['executable', 'configPath', 'cwd', 'expectedExecutableDigest'] as const) {
    if (typeof record[key] !== 'string' || record[key].length === 0) {
      throw new Error('Invalid Flow Status supervisor binding');
    }
  }
  const spec = record as unknown as ClosedFlowStatusChildSpec;
  if (
    !path.isAbsolute(spec.executable)
    || !path.isAbsolute(spec.configPath)
    || !path.isAbsolute(spec.cwd)
    || !/^[0-9a-f]{64}$/u.test(spec.expectedExecutableDigest)
  ) throw new Error('Invalid Flow Status supervisor binding');
  if (sha256File(spec.executable) !== spec.expectedExecutableDigest) {
    throw new Error('Flow Status supervisor executable digest mismatch');
  }
  return spec;
}

/**
 * The one production timeout/pipe/termination implementation. The closed spec has no arbitrary
 * argument vector: the child is always the pinned executable with exactly its managed config.
 */
export function runSupervisedChild(
  spec: ClosedFlowStatusChildSpec,
  input: Buffer,
  options: SupervisorOptions = {},
): SupervisedFlowStatusChild {
  const now = options.now ?? Date.now;
  const spawnChild = options.spawnChild ?? spawn;
  const timeoutMs = options.timeoutMs ?? FLOW_STATUS_SUPERVISOR_TIMEOUT_MS;
  const maxOutput = options.maxOutput ?? FLOW_STATUS_SUPERVISOR_MAX_OUTPUT;
  const javascriptExecutable = path.extname(spec.executable).toLowerCase() === '.js';
  const child = spawnChild(
    javascriptExecutable ? process.execPath : spec.executable,
    javascriptExecutable
      ? [spec.executable, '--config', spec.configPath]
      : ['--config', spec.configPath],
    {
      cwd: spec.cwd,
      env: { ...process.env, OMP_FLOW_STATUS_SUPERVISED: '1' },
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  let spawnedAt: number | null = null;
  let killRequestedAt: number | null = null;
  let presentationResolvedAt = now();
  let closeObservedAt: number | null = null;
  let exitCode: number | null = null;
  let signal: NodeJS.Signals | null = null;
  let timedOut = false;
  let overflow = false;
  let killReturned: boolean | null = null;
  let killThrew = false;
  let accepting = true;
  let stdoutLength = 0;
  const chunks: Buffer[] = [];
  let timer: NodeJS.Timeout | null = null;

  let resolvePresentation!: (value: Buffer) => void;
  const presentation = new Promise<Buffer>(resolve => {
    resolvePresentation = resolve;
  });
  let presentationDone = false;
  const finishPresentation = (value: Buffer): void => {
    if (presentationDone) return;
    presentationDone = true;
    presentationResolvedAt = now();
    resolvePresentation(value);
  };

  let resolveCleanup!: (value: FlowStatusSupervisorReceipt) => void;
  const cleanup = new Promise<FlowStatusSupervisorReceipt>(resolve => {
    resolveCleanup = resolve;
  });

  const transitionToEmpty = (): void => {
    if (!accepting) return;
    accepting = false;
    timedOut = true;
    killRequestedAt = now();
    // The order below is normative and tested: stop output, stdin, default kill, stdout/stderr,
    // unref, then semantic-empty presentation.
    child.stdin.destroy();
    try {
      killReturned = child.kill();
    } catch {
      killThrew = true;
    }
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
    finishPresentation(Buffer.alloc(0));
  };

  child.once('spawn', () => {
    spawnedAt = now();
    timer = setTimeout(transitionToEmpty, timeoutMs);
    timer.unref();
    if (input.byteLength > FLOW_STATUS_SUPERVISOR_MAX_INPUT) {
      transitionToEmpty();
      return;
    }
    child.stdin.end(input);
  });
  child.stdout.on('data', (chunk: Buffer | string) => {
    if (!accepting) return;
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    stdoutLength += value.byteLength;
    if (stdoutLength > maxOutput) {
      overflow = true;
      transitionToEmpty();
      return;
    }
    chunks.push(value);
  });
  // stderr is bounded by ignoring its content; it never becomes presentation.
  child.stderr.resume();
  child.once('error', () => {
    if (timer) clearTimeout(timer);
    accepting = false;
    finishPresentation(Buffer.alloc(0));
  });
  child.once('close', (code, closeSignal) => {
    if (timer) clearTimeout(timer);
    closeObservedAt = now();
    exitCode = code;
    signal = closeSignal;
    if (accepting) {
      accepting = false;
      finishPresentation(code === 0 && !overflow ? Buffer.concat(chunks) : Buffer.alloc(0));
    }
    resolveCleanup({
      spawnedAtUnixMs: spawnedAt,
      killRequestedAtUnixMs: killRequestedAt,
      presentationResolvedAtUnixMs: presentationResolvedAt,
      closeObservedAtUnixMs: closeObservedAt,
      exitCode,
      signal,
      timedOut,
      overflow,
      killReturned,
      killThrew,
    });
  });

  return { presentation, cleanup, child };
}

export async function runFlowStatusSupervisorFromBinding(bindingPath: string): Promise<number> {
  const resolved = path.resolve(bindingPath);
  const metadata = fs.statSync(resolved);
  if (!metadata.isFile() || metadata.size > 16 * 1024) return 0;
  const spec = closedSpec(JSON.parse(fs.readFileSync(resolved, 'utf8')));
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.byteLength;
    if (total > FLOW_STATUS_SUPERVISOR_MAX_INPUT) return 0;
    chunks.push(value);
  }
  const supervised = runSupervisedChild(spec, Buffer.concat(chunks));
  const output = await supervised.presentation;
  if (output.byteLength > 0) process.stdout.write(output);
  return 0;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const bindingIndex = process.argv.indexOf('--binding');
  const binding = bindingIndex >= 0 ? process.argv[bindingIndex + 1] : undefined;
  if (!binding) process.exitCode = 0;
  else {
    runFlowStatusSupervisorFromBinding(binding)
      .then(code => {
        process.exitCode = code;
      })
      .catch(() => {
        process.exitCode = 0;
      });
  }
}
