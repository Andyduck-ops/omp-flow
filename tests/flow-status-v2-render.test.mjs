import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const manifestPath = path.join(root, 'integrations', 'ccstatusline', 'flow-status-build.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const patchPath = path.join(root, 'integrations', 'ccstatusline', manifest.patch.path);
const patch = fs.readFileSync(patchPath, 'utf8');

test('reviewed production patch owns both views and executable golden coverage', () => {
  assert.equal(
    createHash('sha256').update(fs.readFileSync(patchPath)).digest('hex'),
    manifest.patch.sha256,
    'the tested renderer is the reviewed pinned production patch',
  );
  for (const productionAnchor of [
    'export class FlowStatusProvider',
    'export class FlowStatusWidget',
    "view: z.enum(['root-task', 'flow']).optional()",
    "Flow 6/9 · Execute │ Work 4/13 ████░░░░░░░░░ │ Review · Round 2 · Claude Hook",
    "Task · unavailable",
  ]) assert.ok(patch.includes(productionAnchor), `missing production renderer/test anchor: ${productionAnchor}`);
  assert.match(patch, /Task · [^·\r\n]+ · TUI control/u, 'production Task fixture is missing');
});

test('persistent renderer has no Wave view and fixtures are location independent', () => {
  assert.ok(!patch.includes("view: 'wave'"), 'Wave is never a persistent status-line view');
  const fixtureRoot = path.join(root, 'tests', 'fixtures');
  const fixtures = fs.existsSync(fixtureRoot)
    ? fs.readdirSync(fixtureRoot, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
    : [];
  assert.ok(
    fixtures.every(content => !/\.omp-flow\/tasks\/[^/]+\/fixtures/u.test(content)),
    'fixtures do not depend on the active Bundle path and survive archive moves',
  );
});

test('Bundle-local navigation survives an archive move', () => {
  const bundle = path.join(root, 'tests', 'fixtures', 'flow-status-bundle');
  assert.ok(fs.existsSync(bundle), 'version-controlled Flow Status Bundle fixture is available');
  const archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-status-archive-links-'));
  const archived = path.join(archiveRoot, '2026-07', path.basename(bundle));
  try {
    const markdownFiles = fs.readdirSync(bundle, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => path.join(entry.parentPath, entry.name));
    let checked = 0;
    for (const source of markdownFiles) {
      const relativeSource = path.relative(bundle, source);
      const links = [...fs.readFileSync(source, 'utf8').matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)]
        .map(match => match[1].split('#', 1)[0])
        .filter(target => target && !target.includes('://') && !path.isAbsolute(target));
      for (const target of links) {
        const activeTarget = path.resolve(path.dirname(source), target);
        const relativeTarget = path.relative(bundle, activeTarget);
        if (relativeTarget === '..' || relativeTarget.startsWith(`..${path.sep}`)) continue;
        assert.ok(fs.existsSync(activeTarget), `active Bundle link is broken: ${relativeSource} -> ${target}`);
        const archivedTarget = path.resolve(path.dirname(path.join(archived, relativeSource)), target);
        assert.equal(
          path.normalize(path.relative(archived, archivedTarget)),
          path.normalize(relativeTarget),
          `archive move changes Bundle-local navigation: ${relativeSource} -> ${target}`,
        );
        checked += 1;
      }
    }
    assert.ok(checked > 20, 'archive-aware navigation test exercised authored Bundle links');
  } finally {
    fs.rmSync(archiveRoot, { recursive: true, force: true });
  }
});
