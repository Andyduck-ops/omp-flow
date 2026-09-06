import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

// This order is the persisted and interactive normalization contract.
export const HARNESSES = ['omp', 'codex', 'claude', 'snow', 'cursor'] as const;
export type Harness = typeof HARNESSES[number];

export interface HarnessConfig {
  schemaVersion: 1;
  harnesses: Harness[];
  /** The validated source object, including unknown installation fields. */
  source: Record<string, unknown>;
  /** Exact bytes read from disk. */
  sourceText: string;
}

export interface HarnessConfigPatch {
  harnesses?: readonly Harness[];
}

export interface HarnessConfigPatchPlan {
  path: string;
  oldText: string | null;
  newText: string;
  oldSha256: string | null;
  newSha256: string;
  config: HarnessConfig;
}

export const HARNESS_CONFIG_PATH = path.join('.omp-flow', 'config.json');

export function isHarness(value: string): value is Harness {
  return (HARNESSES as readonly string[]).includes(value);
}

export function normalizeHarnesses(values: readonly Harness[]): Harness[] {
  return HARNESSES.filter(harness => values.includes(harness));
}

export function readHarnessConfig(cwd: string, required = false): HarnessConfig | null {
  const configPath = path.join(path.resolve(cwd), HARNESS_CONFIG_PATH);
  if (!fs.existsSync(configPath)) {
    if (required) {
      throw new Error('omp-flow is not initialized: missing .omp-flow/config.json');
    }
    return null;
  }

  const sourceText = fs.readFileSync(configPath, 'utf8');
  return parseHarnessConfig(sourceText, configPath);
}

export function parseHarnessConfig(sourceText: string, configPath = HARNESS_CONFIG_PATH): HarnessConfig {
  let value: unknown;
  try {
    value = JSON.parse(sourceText);
  } catch {
    throw new Error(`Invalid omp-flow harness config JSON: ${configPath}`);
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.harnesses)) {
    throw new Error(`Invalid omp-flow harness config: ${configPath}`);
  }
  if (!value.harnesses.every(item => typeof item === 'string' && isHarness(item))) {
    throw new Error(`Unknown harness in omp-flow config: ${configPath}`);
  }
  return {
    schemaVersion: 1,
    harnesses: normalizeHarnesses(value.harnesses as Harness[]),
    source: structuredClone(value),
    sourceText,
  };
}

export function planHarnessConfigPatch(cwd: string, patch: HarnessConfigPatch): HarnessConfigPatchPlan {
  const configPath = path.join(path.resolve(cwd), HARNESS_CONFIG_PATH);
  const oldText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;
  const current = oldText === null
    ? {
        schemaVersion: 1 as const,
        harnesses: [] as Harness[],
        source: { schemaVersion: 1, harnesses: [] } as Record<string, unknown>,
        sourceText: '',
      }
    : parseHarnessConfig(oldText, configPath);
  const source = structuredClone(current.source);
  if (patch.harnesses !== undefined) {
    const harnesses = normalizeHarnesses(patch.harnesses);
    if (harnesses.length === 0) throw new Error('At least one harness must be configured');
    source.harnesses = harnesses;
  }
  const newText = `${JSON.stringify(source, null, 2)}\n`;
  const config = parseHarnessConfig(newText, configPath);
  return {
    path: configPath,
    oldText,
    newText,
    oldSha256: oldText === null ? null : sha256(oldText),
    newSha256: sha256(newText),
    config,
  };
}

export function writeHarnessConfig(cwd: string, harnesses: readonly Harness[]): HarnessConfig {
  const plan = planHarnessConfigPatch(cwd, { harnesses });
  fs.mkdirSync(path.dirname(plan.path), { recursive: true });
  fs.writeFileSync(plan.path, plan.newText, 'utf8');
  return plan.config;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
