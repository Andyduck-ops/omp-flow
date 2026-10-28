import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readProjectMaps } from '../src/omp/extension-entry.js';

// Claude Code moves hook context over 10,000 characters into a file and shows only a
// 2,000-character preview, so every Harness must keep its orientation under that cap.
const HOOK_CONTEXT_CAP = 10_000;
const python = process.platform === 'win32' ? 'python' : 'python3';

function longMap(title: string, lines: number): string {
  const body = Array.from({ length: lines }, (_, index) => `- [${title} entry ${index}](entry-${index}.md) — 中文说明 ${index}`);
  return [`# ${title}`, '', ...body, ''].join('\n');
}

function runHook(harness: string, root: string, payload: object, env: NodeJS.ProcessEnv = {}): string {
  const result = spawnSync(
    python,
    ['-X', 'utf8', path.join(process.cwd(), 'templates', harness, 'hooks', 'session-start.py')],
    { cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, input: JSON.stringify(payload) },
  );
  assert.equal(result.status, 0, `${harness} session-start exits cleanly: ${result.stderr}`);
  const output = JSON.parse(result.stdout) as Record<string, unknown>;
  const nested = output.hookSpecificOutput as Record<string, unknown> | undefined;
  const context = nested?.additionalContext ?? output.additionalContext ?? output.additional_context;
  assert.equal(typeof context, 'string', `${harness} returns orientation text`);
  return context as string;
}

export function runSessionOrientationTests(): void {
  // The native realpath expands Windows 8.3 short names, as a Harness-supplied project root would be.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-orientation-')));
  try {
    spawnSync('git', ['init', '-q'], { cwd: root });
    const write = (relative: string, text: string): void => {
      fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      fs.writeFileSync(path.join(root, relative), text);
    };
    write('.omp-flow/workflow/index.md', `# Workflow Library\n\n## Workflows\n\n- [Lite](lite.md)\n${longMap('Rules', 120)}`);
    write('.omp-flow/tasks/index.md', '# Tasks\n\n- [Small task](small/index.md)\n');
    write('.omp-flow/wiki/index.md', longMap('Wiki', 300));
    const canonical = root;
    write('.omp-flow/tasks/10-01-done/index.md', '# Finished Bundle body\n');
    write('.omp-flow/.runtime/workscope.json', JSON.stringify({ version: 1, taskId: '10-01-done', workspaceRoot: canonical }));
    const contexts: Record<string, string> = {
      claude: runHook('claude', root, { session_id: 's', cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: '' }),
      codex: runHook('codex', root, { hook_event_name: 'SessionStart', source: 'startup', session_id: 's', cwd: root }),
      cursor: runHook('cursor', root, { hook_event_name: 'sessionStart', conversation_id: 'c', workspace_roots: [canonical] }),
      snow: runHook('snow', root, { messages: [], messageCount: 0, isResume: false, sessionId: 's', cwd: root }),
      omp: readProjectMaps(root),
    };
    for (const [harness, context] of Object.entries(contexts)) {
      assert.ok(context.length < HOOK_CONTEXT_CAP, `${harness} orientation (${context.length}) stays under the hook context cap`);
      assert.match(context, /- \[Lite\]\(lite\.md\)/, `${harness} keeps the head of an oversized Workflow map`);
      assert.match(context, /\[Small task\]\(small\/index\.md\)/, `${harness} keeps a short map whole`);
      assert.match(context, /# Wiki/, `${harness} keeps the head of an oversized Wiki map instead of dropping it`);
      assert.match(context, /truncated; read \.omp-flow\/wiki\/index\.md for the rest/, `${harness} points to the truncated map`);
      assert.doesNotMatch(context, /exceeds/, `${harness} never drops a whole map for size`);
      assert.match(context, /Active Task index: \.omp-flow\/tasks\/10-01-done\/index\.md/, `${harness} points to the marker Task`);
      assert.doesNotMatch(context, /Finished Bundle body/, `${harness} does not inject the marker Task body`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
