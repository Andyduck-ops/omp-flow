import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import activateExtension, { readProjectMaps } from '../src/omp/extension-entry.js';
import type { OMPHookContext } from '../src/omp/extension.js';

export async function runOMPIndexMapTests(): Promise<void> {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-map-')));
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
    const activeTaskDir = path.join(root, '.omp-flow/tasks/10-16-active');
    fs.mkdirSync(activeTaskDir, { recursive: true });
    fs.writeFileSync(path.join(activeTaskDir, 'index.md'), '# Active Bundle Map\n- [Design](design.md)\n');
    fs.mkdirSync(path.join(root, '.omp-flow/.runtime'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.omp-flow/.runtime/workscope.json'),
      JSON.stringify({ version: 1, taskId: '10-16-active', workspaceRoot: fs.realpathSync(root) }),
    );
    const withActive = readProjectMaps(root);
    assert.match(withActive, /Active Task index: \.omp-flow\/tasks\/10-16-active\/index\.md/);
    assert.doesNotMatch(withActive, /# Active Bundle Map/, 'the local marker contributes a pointer, not the Bundle body');
    assert.doesNotMatch(withActive, /Wiki brief/, 'a missing brief adds nothing');
    const brief = path.join(root, '.omp-flow/wiki/brief.md');
    const warning = (actual: number): string => `[WARNING: .omp-flow/wiki/brief.md exceeds 2000 chars (actual: ${actual}); `
      + 'remainder omitted at startup. Run Sleep or trim brief.md and move detail into domain Concepts.]';
    const briefBody = (content: string): string => {
      const match = /\n\n--- Wiki brief ---\n([\s\S]*)\n--- End Wiki brief ---\n\n--- Wiki map ---\n/.exec(content);
      assert.ok(match, 'the brief sits directly before the Wiki map');
      assert.match(content, /Wiki index: \.omp-flow\/wiki\/index\.md\n\nWiki brief: \.omp-flow\/wiki\/brief\.md\n\nActive Task index:/);
      assert.doesNotMatch(content, /truncated/i);
      return match[1];
    };
    fs.writeFileSync(brief, '- 结论 [Hooks](hooks/index.md#startup)\r\n- second\r\n\r\n');
    assert.equal(briefBody(readProjectMaps(root)), '- 结论 [Hooks](hooks/index.md#startup)\n- second', 'CRLF is normalized and trailing newlines dropped');
    // Session compaction rereads the brief from disk with the maps.
    fs.writeFileSync(brief, 'compacted brief');
    await handlers.get('session_compact')!({}, {});
    const compacted = handlers.get('before_agent_start')!({}, {}) as typeof first;
    assert.equal(briefBody(compacted.message.content), 'compacted brief');
    // Exactly 2,000 code points after CRLF normalization is injected whole.
    const exact = `${'a'.repeat(999)}\n${'🚀'.repeat(1_000)}`;
    fs.writeFileSync(brief, exact.replace('\n', '\r\n'));
    assert.equal(briefBody(readProjectMaps(root)), exact, 'astral characters count as one code point each');
    // Over budget with lines: keep whole lines within 2,000 code points, then warn.
    const lines = Array.from({ length: 41 }, (_, index) => `${String(index).padStart(2, '0')} ${'🚀'.repeat(46)}`);
    fs.writeFileSync(brief, lines.join('\r\n'));
    assert.equal(briefBody(readProjectMaps(root)), `${lines.slice(0, 40).join('\n')}\n${warning(2_049)}`);
    // No newline in the first 2,000 code points: hard cut on a code-point boundary.
    fs.writeFileSync(brief, `${'🚀'.repeat(2_500)}\nlater`);
    assert.equal(briefBody(readProjectMaps(root)), `${'🚀'.repeat(2_000)}\n${warning(2_506)}`);
    // Failures stay local to the brief.
    const unavailable = (reason: string): void => {
      const content = readProjectMaps(root);
      assert.ok(content.includes(`Wiki brief: unavailable (${reason})`), `head reports ${reason}`);
      assert.ok(content.includes(`Wiki brief content: unavailable (${reason})\n\n--- Wiki map ---`), `body reports ${reason}`);
      assert.match(content, /\[经验\]\(经验\/导航.md\)/, `the Wiki map survives ${reason}`);
      assert.match(content, /Updated tasks/, `the Task map survives ${reason}`);
      assert.doesNotMatch(content, /LINKED-BODY/, `a link is never followed for ${reason}`);
    };
    fs.writeFileSync(brief, Buffer.from([0x61, 0xff]));
    unavailable('invalid UTF-8');
    fs.unlinkSync(brief);
    fs.writeFileSync(path.join(root, 'linked.md'), 'LINKED-BODY');
    fs.symlinkSync(path.join(root, 'linked.md'), brief);
    unavailable('brief must not be a symlink');
    fs.unlinkSync(brief);
    fs.mkdirSync(brief);
    unavailable('brief is not a regular file');
    fs.rmdirSync(brief);
    if (process.platform !== 'win32') {
      assert.equal(spawnSync('mkfifo', [brief]).status, 0);
      unavailable('brief is not a regular file');
      fs.unlinkSync(brief);
    }
    assert.doesNotMatch(readProjectMaps(root), /Wiki brief/, 'removing the brief restores the original output');
    fs.writeFileSync(wiki, `# Big wiki\n${'line\n'.repeat(5000)}`);
    const whole = readProjectMaps(root);
    assert.match(whole, /# Big wiki/);
    assert.ok(whole.length > 25_000 && !/truncated/.test(whole), 'a long map is injected whole');
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
