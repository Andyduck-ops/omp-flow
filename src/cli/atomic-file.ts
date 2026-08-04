import fs from 'node:fs';
import path from 'node:path';

export interface AtomicFileChange {
  path: string;
  content: string | null;
}

export interface AtomicCommitOptions {
  testOnlyFailAfterRename?: number;
}

function syncDirectory(directory: string): void {
  try {
    const handle = fs.openSync(directory, 'r');
    try {
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    // Windows does not consistently allow directory handles. File fsync + same-directory
    // replacement still prevents readers from observing a torn file.
  }
}

function temporaryPath(target: string, suffix: string): string {
  return path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${Date.now()}.${suffix}.tmp`,
  );
}

function writeAndSync(file: string, content: string): void {
  const handle = fs.openSync(file, 'wx');
  try {
    fs.writeFileSync(handle, content, 'utf8');
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

export function atomicWriteFileSync(target: string, content: string): void {
  const absolute = path.resolve(target);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temp = temporaryPath(absolute, 'write');
  try {
    writeAndSync(temp, content);
    fs.renameSync(temp, absolute);
    syncDirectory(path.dirname(absolute));
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

export function atomicCommitFilesSync(
  changes: readonly AtomicFileChange[],
  options: AtomicCommitOptions = {},
): void {
  const normalized = changes.map(change => ({ ...change, path: path.resolve(change.path) }));
  const seen = new Set<string>();
  for (const change of normalized) {
    const key = process.platform === 'win32' ? change.path.toLowerCase() : change.path;
    if (seen.has(key)) throw new Error(`Duplicate atomic target: ${change.path}`);
    seen.add(key);
  }

  const originals = normalized.map(change => ({
    path: change.path,
    existed: fs.existsSync(change.path),
    content: fs.existsSync(change.path) ? fs.readFileSync(change.path, 'utf8') : null,
  }));
  const prepared: Array<AtomicFileChange & { temp: string | null }> = [];
  const committed: number[] = [];
  try {
    for (let index = 0; index < normalized.length; index += 1) {
      const change = normalized[index]!;
      fs.mkdirSync(path.dirname(change.path), { recursive: true });
      if (change.content === null) {
        prepared.push({ ...change, temp: null });
        continue;
      }
      const temp = temporaryPath(change.path, `commit-${index}`);
      prepared.push({ ...change, temp });
      writeAndSync(temp, change.content);
    }

    for (let index = 0; index < prepared.length; index += 1) {
      const change = prepared[index]!;
      if (change.content === null) {
        if (fs.existsSync(change.path)) fs.unlinkSync(change.path);
      } else {
        fs.renameSync(change.temp!, change.path);
        change.temp = null;
      }
      syncDirectory(path.dirname(change.path));
      committed.push(index);
      if (options.testOnlyFailAfterRename === committed.length) {
        throw new Error(`Injected atomic commit failure after rename ${committed.length}`);
      }
    }
  } catch (error) {
    for (const index of committed.reverse()) {
      const original = originals[index]!;
      if (original.existed) atomicWriteFileSync(original.path, original.content!);
      else if (fs.existsSync(original.path)) fs.unlinkSync(original.path);
    }
    throw error;
  } finally {
    for (const change of prepared) {
      if (change.temp && fs.existsSync(change.temp)) fs.unlinkSync(change.temp);
    }
  }
}
