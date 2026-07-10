import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HASH_FILE = '.omp-flow/.template-hashes.json';
const HASH_SCHEMA_VERSION = 1;

interface StoredHashes {
  __version: number;
  hashes: Record<string, string>;
}

export function computeHash(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function loadHashes(cwd: string): Record<string, string> {
  const hashesPath = path.join(cwd, HASH_FILE);
  if (!fs.existsSync(hashesPath)) {
    return {};
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(hashesPath, 'utf8'));
  if (!isStoredHashes(parsed)) {
    throw new Error(`Invalid omp-flow template hash file: ${hashesPath}`);
  }
  return normalizeHashKeys(parsed.hashes);
}

export function saveHashes(cwd: string, hashes: Record<string, string>): void {
  const hashesPath = path.join(cwd, HASH_FILE);
  fs.mkdirSync(path.dirname(hashesPath), { recursive: true });

  const stored: StoredHashes = {
    __version: HASH_SCHEMA_VERSION,
    hashes: normalizeHashKeys(hashes),
  };

  fs.writeFileSync(hashesPath, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
}

export function isTemplateModified(
  cwd: string,
  relativePath: string,
  hashes: Record<string, string>,
): boolean {
  const storedHash = hashes[toPosix(relativePath)];
  if (storedHash === undefined) {
    return true;
  }

  const templatePath = path.join(cwd, relativePath);
  if (!fs.existsSync(templatePath)) {
    return true;
  }

  const currentHash = computeHash(fs.readFileSync(templatePath, 'utf8'));
  return currentHash !== storedHash;
}

export function removeHash(cwd: string, relativePath: string): void {
  const hashes = loadHashes(cwd);
  delete hashes[toPosix(relativePath)];
  saveHashes(cwd, hashes);
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/').replace(/\\/g, '/');
}


function normalizeHashKeys(hashes: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(hashes)) {
    normalized[toPosix(key)] = value;
  }

  return normalized;
}

function isStoredHashes(value: unknown): value is StoredHashes {
  if (!isRecord(value) || value.__version !== HASH_SCHEMA_VERSION || !isRecord(value.hashes)) {
    return false;
  }

  return Object.values(value.hashes).every((hash) => typeof hash === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
