import fs from 'node:fs';
import path from 'node:path';

// This order is the persisted and interactive normalization contract.
export const HARNESSES = ['omp', 'codex', 'claude', 'snow', 'cursor'] as const;
export type Harness = typeof HARNESSES[number];

export interface HarnessConfig {
  schemaVersion: 1;
  harnesses: Harness[];
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

  const value: unknown = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.harnesses)) {
    throw new Error(`Invalid omp-flow harness config: ${configPath}`);
  }
  if (!value.harnesses.every(item => typeof item === 'string' && isHarness(item))) {
    throw new Error(`Unknown harness in omp-flow config: ${configPath}`);
  }
  return { schemaVersion: 1, harnesses: normalizeHarnesses(value.harnesses as Harness[]) };
}

export function writeHarnessConfig(cwd: string, harnesses: readonly Harness[]): HarnessConfig {
  const config: HarnessConfig = { schemaVersion: 1, harnesses: normalizeHarnesses(harnesses) };
  if (config.harnesses.length === 0) {
    throw new Error('At least one harness must be configured');
  }
  const configPath = path.join(path.resolve(cwd), HARNESS_CONFIG_PATH);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return config;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
