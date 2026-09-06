import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import activateExtension, { readProjectMaps } from '../src/omp/extension-entry.js';
import type { OMPHookContext } from '../src/omp/extension.js';

export async function runOMPIndexMapTests(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-map-'));
  const originalCwd = process.cwd();
  const wiki = path.join(root, '.omp-flow/wiki/index.md');
  const task = path.join(root, '.omp-flow/tasks/index.md');
  const workflow = path.join(root, '.omp-flow/workflow/index.md');
  const handlers = new Map<string, (event: OMPHookContext, ctx: OMPHookContext) => unknown>();
  try {
    fs.mkdirSync(path.dirname(wiki), { recursive: true });
    fs.mkdirSync(path.dirname(task), { recursive: true });
    fs.mkdirSync(path.dirname(workflow), { recursive: true });
    fs.writeFileSync(workflow, '# Workflow routes\n[Lite](lite.md)\n');
    fs.writeFileSync(wiki, '# Wiki\n[经验](经验/导航.md)\n');
    fs.writeFileSync(task, '# Tasks\n[工作](work/index.md)\n');
    fs.writeFileSync(path.join(root, '.omp-flow/config.json'), '{"schemaVersion":1,"harnesses":["omp"]}');
    process.chdir(root);
    const api = { on: (name: string, callback: (event: OMPHookContext, ctx: OMPHookContext) => unknown) => handlers.set(name, callback) };
    activateExtension(api);
    activateExtension(api);
    assert.equal(handlers.size, 5);
    await handlers.get('session_start')!({}, {});
    const first = handlers.get('before_agent_start')!({}, {}) as { message: { customType: string; content: string; display: boolean } };
    assert.equal(first.message.customType, 'omp-flow-index-maps');
    assert.equal(first.message.display, false);
    assert.match(first.message.content, /经验\/导航.md/);
    assert.match(first.message.content, /work\/index.md/);
    assert.match(first.message.content, /\[Lite\]\(lite.md\)/);
    assert.equal(handlers.get('before_agent_start')!({}, {}), undefined, 'ordinary turns do not repeatedly inject maps');
    fs.writeFileSync(task, '# Updated tasks');
    fs.writeFileSync(workflow, '# Updated routes');
    await handlers.get('session_compact')!({}, {});
    const resumed = handlers.get('before_agent_start')!({}, {}) as typeof first;
    assert.match(resumed.message.content, /Updated tasks/, 'compaction reloads disk contents');
    assert.match(resumed.message.content, /Updated routes/);
    fs.writeFileSync(wiki, 'x'.repeat(6001));
    assert.match(readProjectMaps(root), /exceeds/);
    fs.writeFileSync(wiki, Buffer.from([0xff]));
    assert.match(readProjectMaps(root), /invalid UTF-8/);
    fs.unlinkSync(wiki);
    assert.match(readProjectMaps(root), /unavailable/);
    fs.rmdirSync(path.dirname(wiki));
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'index.md'), 'outside marker');
    // The target is outside the selected project even when the link is inside it.
    const project = path.join(root, 'nested-project');
    fs.mkdirSync(path.join(project, '.omp-flow'), { recursive: true });
    fs.symlinkSync(outside, path.join(project, '.omp-flow/wiki'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.ok(!readProjectMaps(project).includes('outside marker'));
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
}
