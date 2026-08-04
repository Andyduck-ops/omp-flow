import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  deployInitResources,
  getManagedResources,
  renderManagedResource,
} from '../src/cli/init.js';
import {
  HARNESSES,
  normalizeHarnesses,
  readHarnessConfig,
  writeHarnessConfig,
} from '../src/cli/harness.js';
import { loadHashes, toPosix } from '../src/cli/template-hash.js';
import { analyzeChanges, interactiveUpdate, type UpdatePlanEntry } from '../src/cli/update.js';

type Check = (condition: unknown, message: string) => asserts condition;

const sourceRoot = process.cwd();

function filesBelow(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== '__pycache__') visit(absolute);
      else if (entry.isFile() && !entry.name.endsWith('.pyc')) files.push(toPosix(path.relative(root, absolute)));
    }
  };
  visit(root);
  return files.sort();
}

function entryFor(plan: readonly UpdatePlanEntry[], relativePath: string): UpdatePlanEntry {
  const normalized = toPosix(relativePath);
  const entry = plan.find(candidate => candidate.relativePath === normalized);
  if (entry === undefined) throw new Error(`Missing update-plan entry: ${normalized}`);
  return entry;
}

function assertNativeDeployment(root: string, harness: 'snow' | 'cursor', check: Check): void {
  const expected = getManagedResources([harness])
    .filter(resource => resource.group === harness)
    .map(resource => toPosix(path.relative(path.join('templates', harness), resource.sourcePath)))
    .sort();
  const canonical = filesBelow(path.join(sourceRoot, 'templates', harness));
  const installed = filesBelow(path.join(root, `.${harness}`));
  check(JSON.stringify(expected) === JSON.stringify(canonical), `${harness} registers every canonical template exactly once`);
  check(JSON.stringify(installed) === JSON.stringify(canonical), `${harness}-only init installs the exact native resource set`);
}

export async function runSnowCursorManagedResourceTests(check: Check): Promise<void> {
  console.log('--- Snow and Cursor managed-resource integration');

  check(
    JSON.stringify(HARNESSES) === JSON.stringify(['omp', 'codex', 'claude', 'snow', 'cursor']),
    'Harness normalization has one documented five-Harness order',
  );
  check(
    JSON.stringify(normalizeHarnesses(['cursor', 'snow', 'omp', 'cursor']))
      === JSON.stringify(['omp', 'snow', 'cursor']),
    'Harness normalization deduplicates without caller-order drift',
  );

  const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-adapter-config-'));
  const snowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-snow-only-'));
  const cursorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-cursor-only-'));
  const combinedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-snow-cursor-'));
  const mixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-adapter-mixed-'));
  const updateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-adapter-update-'));
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-adapter-foreign-'));
  const roots = [configRoot, snowRoot, cursorRoot, combinedRoot, mixedRoot, updateRoot, foreignRoot];

  try {
    writeHarnessConfig(configRoot, ['cursor', 'snow', 'omp', 'cursor']);
    check(
      JSON.stringify(readHarnessConfig(configRoot, true)?.harnesses) === JSON.stringify(['omp', 'snow', 'cursor']),
      'Snow/Cursor config round-trips in stable order',
    );
    fs.writeFileSync(
      path.join(configRoot, '.omp-flow', 'config.json'),
      JSON.stringify({ schemaVersion: 1, harnesses: ['snow', 'unknown'] }),
      'utf8',
    );
    let unknownRejected = false;
    try {
      readHarnessConfig(configRoot, true);
    } catch (error) {
      unknownRejected = error instanceof Error && error.message.includes('Unknown harness');
    }
    check(unknownRejected, 'config validation rejects unknown Harness values');

    deployInitResources({ cwd: snowRoot, harnesses: ['snow'] });
    assertNativeDeployment(snowRoot, 'snow', check);
    check(!fs.existsSync(path.join(snowRoot, '.cursor')), 'Snow-only init does not create Cursor resources');

    deployInitResources({ cwd: cursorRoot, harnesses: ['cursor'] });
    assertNativeDeployment(cursorRoot, 'cursor', check);
    check(!fs.existsSync(path.join(cursorRoot, '.snow')), 'Cursor-only init does not create Snow resources');

    deployInitResources({ cwd: combinedRoot, harnesses: ['cursor', 'snow'] });
    assertNativeDeployment(combinedRoot, 'snow', check);
    assertNativeDeployment(combinedRoot, 'cursor', check);
    check(
      JSON.stringify(readHarnessConfig(combinedRoot, true)?.harnesses) === JSON.stringify(['snow', 'cursor']),
      'combined init persists Snow and Cursor in stable order',
    );
    for (const relativePath of [
      '.snow/hooks/onSessionStart.json',
      '.snow/hooks/beforeToolCall.json',
      '.cursor/hooks.json',
    ]) {
      const content = fs.readFileSync(path.join(combinedRoot, relativePath), 'utf8');
      JSON.parse(content);
      check(!content.includes('{{PYTHON_CMD}}'), `${relativePath} renders the platform Python command`);
      check(content.includes(process.platform === 'win32' ? 'python' : 'python3'), `${relativePath} uses the platform Python command`);
      check(!content.includes(path.resolve(combinedRoot)), `${relativePath} keeps project-relative Hook script paths`);
    }
    check(fs.existsSync(path.join(combinedRoot, '.agents', 'skills')), 'Snow/Cursor use the shared .agents/skills tree');
    check(!fs.existsSync(path.join(combinedRoot, '.snow', 'skills')), 'Snow install has no duplicate Skill tree');
    check(!fs.existsSync(path.join(combinedRoot, '.cursor', 'skills')), 'Cursor install has no duplicate Skill tree');
    check(!fs.existsSync(path.join(combinedRoot, '.cursor', 'rules')), 'Cursor install has no duplicate rule');
    check(!fs.existsSync(path.join(sourceRoot, 'templates', 'snow', 'skills')), 'package source has no Snow Skill duplicate');
    check(!fs.existsSync(path.join(sourceRoot, 'templates', 'cursor', 'skills')), 'package source has no Cursor Skill duplicate');
    check(!fs.existsSync(path.join(sourceRoot, 'templates', 'cursor', 'rules')), 'package source has no Cursor rule duplicate');

    deployInitResources({ cwd: mixedRoot, harnesses: ['snow'] });
    deployInitResources({ cwd: mixedRoot, harnesses: ['cursor'] });
    check(
      JSON.stringify(readHarnessConfig(mixedRoot, true)?.harnesses) === JSON.stringify(['snow', 'cursor']),
      'mixed existing config adds Cursor without dropping or reordering Snow',
    );
    assertNativeDeployment(mixedRoot, 'snow', check);
    assertNativeDeployment(mixedRoot, 'cursor', check);

    deployInitResources({ cwd: updateRoot, harnesses: ['snow', 'cursor'] });
    const unchangedPlan = analyzeChanges(updateRoot, loadHashes(updateRoot));
    for (const resource of getManagedResources(['snow', 'cursor']).filter(item => item.group === 'snow' || item.group === 'cursor')) {
      check(entryFor(unchangedPlan, resource.destinationPath).status === 'unchanged', `${resource.destinationPath} is unchanged after init`);
    }

    const deletedSnow = '.snow/agents/omp-flow-research.md';
    const deletedCursor = '.cursor/agents/omp-flow-research.md';
    const modifiedSnow = '.snow/hooks/beforeToolCall.json';
    const modifiedCursor = '.cursor/hooks.json';
    fs.unlinkSync(path.join(updateRoot, deletedSnow));
    fs.unlinkSync(path.join(updateRoot, deletedCursor));
    fs.writeFileSync(path.join(updateRoot, modifiedSnow), '{"user":"snow"}\n', 'utf8');
    fs.writeFileSync(path.join(updateRoot, modifiedCursor), '{"user":"cursor"}\n', 'utf8');
    const changedPlan = analyzeChanges(updateRoot, loadHashes(updateRoot));
    check(entryFor(changedPlan, deletedSnow).status === 'userDeleted', 'update preserves a user-deleted Snow file');
    check(entryFor(changedPlan, deletedCursor).status === 'userDeleted', 'update preserves a user-deleted Cursor file');
    check(entryFor(changedPlan, modifiedSnow).status === 'changed', 'update reports a user-modified Snow file as conflict');
    check(entryFor(changedPlan, modifiedCursor).status === 'changed', 'update reports a user-modified Cursor file as conflict');

    await interactiveUpdate({ cwd: updateRoot, force: true });
    check(!fs.existsSync(path.join(updateRoot, deletedSnow)), 'forced update still preserves Snow deletion');
    check(!fs.existsSync(path.join(updateRoot, deletedCursor)), 'forced update still preserves Cursor deletion');
    for (const relativePath of [modifiedSnow, modifiedCursor]) {
      const resource = getManagedResources(['snow', 'cursor'])
        .find(candidate => toPosix(candidate.destinationPath) === relativePath);
      if (resource === undefined) throw new Error(`Missing resource: ${relativePath}`);
      const expected = renderManagedResource(
        path.join(sourceRoot, resource.sourcePath),
        fs.readFileSync(path.join(sourceRoot, resource.sourcePath), 'utf8'),
      );
      check(fs.readFileSync(path.join(updateRoot, relativePath), 'utf8') === expected, `${relativePath} force-updates without JSON merge`);
    }
    const backup = fs.readdirSync(path.join(updateRoot, '.omp-flow'))
      .find(name => name.startsWith('.backup-'));
    check(backup !== undefined, 'updating conflicts creates a backup');
    check(
      fs.readFileSync(path.join(updateRoot, '.omp-flow', backup!, modifiedSnow), 'utf8').includes('"user":"snow"')
        && fs.readFileSync(path.join(updateRoot, '.omp-flow', backup!, modifiedCursor), 'utf8').includes('"user":"cursor"'),
      'backup preserves the pre-update Snow and Cursor conflicts',
    );

    const foreignSnow = path.join(foreignRoot, '.snow', 'hooks', 'beforeToolCall.json');
    const foreignCursor = path.join(foreignRoot, '.cursor', 'hooks.json');
    fs.mkdirSync(path.dirname(foreignSnow), { recursive: true });
    fs.mkdirSync(path.dirname(foreignCursor), { recursive: true });
    fs.writeFileSync(foreignSnow, '{"foreign":"snow"}\n', 'utf8');
    fs.writeFileSync(foreignCursor, '{"foreign":"cursor"}\n', 'utf8');
    deployInitResources({ cwd: foreignRoot, harnesses: ['snow', 'cursor'] });
    check(fs.readFileSync(foreignSnow, 'utf8').includes('"foreign":"snow"'), 'init preserves a foreign Snow event file');
    check(fs.readFileSync(foreignCursor, 'utf8').includes('"foreign":"cursor"'), 'init preserves a foreign Cursor hooks file');
    const foreignPlan = analyzeChanges(foreignRoot, loadHashes(foreignRoot));
    check(entryFor(foreignPlan, '.snow/hooks/beforeToolCall.json').status === 'changed', 'update reports foreign Snow JSON without merging');
    check(entryFor(foreignPlan, '.cursor/hooks.json').status === 'changed', 'update reports foreign Cursor JSON without merging');

    const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8')) as { files?: string[] };
    check(packageJson.files?.includes('templates'), 'npm package includes the canonical native template roots');
  } finally {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  }
}
