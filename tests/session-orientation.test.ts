import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readProjectMaps } from '../src/omp/extension-entry.js';

// Claude Code moves a single hook context over 10,000 characters into a file and shows only a
// 2,000-character preview, so its hook injects each part separately; every part arrives whole.
const HOOK_CONTEXT_CAP = 10_000;
const python = process.platform === 'win32' ? 'python' : 'python3';

function longMap(title: string, lines: number): string {
  const body = Array.from({ length: lines }, (_, index) => `- [${title} entry ${index}](entry-${index}.md) — 中文说明 ${index}`);
  return [`# ${title}`, '', ...body, ''].join('\n');
}

function runHook(harness: string, root: string, payload: object, env: NodeJS.ProcessEnv = {}, args: string[] = []): string {
  const result = spawnSync(
    python,
    ['-X', 'utf8', path.join(process.cwd(), 'templates', harness, 'hooks', 'session-start.py'), ...args],
    { cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, input: JSON.stringify(payload), timeout: 30_000 },
  );
  assert.equal(result.status, 0, `${harness} session-start exits cleanly: ${result.stderr}`);
  const output = JSON.parse(result.stdout) as Record<string, unknown>;
  const nested = output.hookSpecificOutput as Record<string, unknown> | undefined;
  const context = nested?.additionalContext ?? output.additionalContext ?? output.additional_context;
  assert.equal(typeof context, 'string', `${harness} returns orientation text`);
  return context as string;
}

function allContexts(root: string): Record<string, string> {
  return {
    claude: runHook('claude', root, { session_id: 's', cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: '' }),
    codex: runHook('codex', root, { hook_event_name: 'SessionStart', source: 'startup', session_id: 's', cwd: root }),
    cursor: runHook('cursor', root, { hook_event_name: 'sessionStart', conversation_id: 'c', workspace_roots: [root] }),
    snow: runHook('snow', root, { messages: [], messageCount: 0, isResume: false, sessionId: 's', cwd: root }),
    omp: readProjectMaps(root),
  };
}

function claudePart(root: string, part: string): string {
  return runHook('claude', root, { session_id: 's', cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: '' }, [part]);
}

// Returns the rendered brief body every Harness injected, asserting all five are identical.
function injectedBrief(contexts: Record<string, string>): string {
  const bodies = Object.entries(contexts).map(([harness, context]) => {
    assert.match(context, /Wiki brief: \.omp-flow\/wiki\/brief\.md/, `${harness} points to the brief`);
    const start = context.indexOf('--- Wiki brief ---\n');
    const end = context.indexOf('\n--- End Wiki brief ---\n\n--- Wiki map ---');
    assert.ok(start >= 0 && end > start, `${harness} injects the brief directly before the Wiki map`);
    assert.ok(context.indexOf('Wiki brief: ') < context.indexOf('--- Router Skill ---'), `${harness} points to the brief in the head`);
    assert.doesNotMatch(context, /truncated/i, `${harness} never says truncated`);
    return context.slice(start + '--- Wiki brief ---\n'.length, end);
  });
  for (const body of bodies) assert.equal(body, bodies[0], 'all five Harnesses render the same brief');
  return bodies[0];
}

function runBriefOrientationTests(): void {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-brief-')));
  const outside = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-brief-outside-')));
  try {
    spawnSync('git', ['init', '-q'], { cwd: root });
    const write = (relative: string, data: string | Buffer): void => {
      fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      fs.writeFileSync(path.join(root, relative), data);
    };
    const brief = '.omp-flow/wiki/brief.md';
    const briefPath = path.join(root, brief);
    // The real Router plus a domain-only Wiki index, as an installed project would have.
    write('.agents/skills/omp-flow/SKILL.md', fs.readFileSync(path.join(process.cwd(), 'templates', 'common', 'skills', 'omp-flow', 'SKILL.md')));
    write('.omp-flow/workflow/index.md', '# Workflow Library\n\n- [Lite](lite.md)\n');
    write('.omp-flow/tasks/index.md', '# Tasks\n\n- [Small task](small/index.md)\n');
    write('.omp-flow/wiki/index.md', '# Wiki\n\n- [Brief](brief.md) — counter-default conclusions\n\n## Domains\n\n- [Hooks](hooks/index.md) — startup injection; enter when changing hooks\n');

    const absent = allContexts(root);
    for (const [harness, context] of Object.entries(absent)) {
      assert.doesNotMatch(context, /Wiki brief/, `${harness} adds nothing without a brief`);
    }

    // A brief within budget is injected whole, Chinese text and #heading links included.
    const line = '- 启动注入不截断地图；见 [Hooks](hooks/index.md#startup-injection) 的结论。\n';
    let small = '';
    while (Array.from(small + line).length <= 2_000) small += line;
    small += 'x'.repeat(2_000 - Array.from(small).length);
    assert.equal(Array.from(small).length, 2_000);
    write(brief, small);
    assert.equal(injectedBrief(allContexts(root)), small, 'a 2,000-character brief is injected whole');
    for (const part of ['router', 'wiki']) {
      const text = claudePart(root, part);
      assert.ok(text.length < HOOK_CONTEXT_CAP, `Claude ${part} part (${text.length}) stays under the host cap`);
    }
    assert.match(claudePart(root, 'wiki'), /^--- Wiki brief ---\n[\s\S]*--- End Wiki brief ---\n\n--- Wiki map ---/);
    assert.doesNotMatch(claudePart(root, 'router'), /--- Wiki brief ---/, 'the brief body travels in the Wiki part');

    // CRLF is normalized before counting: over 2,000 bytes raw but exactly 2,000 code points is whole.
    const crlfLines = Array.from({ length: 40 }, (_, index) => `${String(index).padStart(2, '0')} ${'b'.repeat(45)}`);
    const exact = crlfLines.join('\n') + '\n' + 'c'.repeat(2_000 - Array.from(crlfLines.join('\n') + '\n').length);
    assert.equal(Array.from(exact).length, 2_000);
    write(brief, exact.replace(/\n/g, '\r\n'));
    assert.ok(fs.statSync(briefPath).size > 2_000);
    assert.equal(injectedBrief(allContexts(root)), exact, 'CRLF normalized to exactly 2,000 is not capped');

    // Over budget with lines: cut at the last line boundary within 2,000 code points, then warn.
    const longLines = Array.from({ length: 41 }, (_, index) => `${String(index).padStart(2, '0')} ${'d'.repeat(46)}`);
    const over = longLines.join('\n');
    assert.equal(Array.from(over).length, 2_049);
    write(brief, `${over}\n`.replace(/\n/g, '\r\n'));
    const cut = injectedBrief(allContexts(root));
    const [kept, warning] = [cut.slice(0, cut.lastIndexOf('\n')), cut.slice(cut.lastIndexOf('\n') + 1)];
    assert.ok(Array.from(kept).length <= 2_000);
    assert.equal(kept, longLines.slice(0, 40).join('\n'), 'the cut keeps whole lines only');
    assert.equal(
      warning,
      '[WARNING: .omp-flow/wiki/brief.md exceeds 2000 chars (actual: 2050); remainder omitted at startup. '
        + 'Run Sleep or trim brief.md and move detail into domain Concepts.]',
    );

    // One line with no newline falls back to a hard cut at 2,000 code points, astral characters included.
    const single = '🚀'.repeat(500) + 'e'.repeat(2_000);
    write(brief, single);
    const hard = injectedBrief(allContexts(root));
    assert.equal(hard.slice(0, hard.indexOf('\n')), Array.from(single).slice(0, 2_000).join(''));
    assert.match(hard, /\n\[WARNING: \.omp-flow\/wiki\/brief\.md exceeds 2000 chars \(actual: 2500\);/);

    // Every brief failure stays local: the Router and other maps still arrive.
    const symlink = 'brief must not be a symlink';
    const notRegular = 'brief is not a regular file';
    const failures: Array<[string, string, () => void]> = [
      ['an in-repository symlink', symlink, () => { write('.omp-flow/wiki/real.md', 'LINKED-INSIDE-BODY'); fs.symlinkSync('real.md', briefPath); }],
      ['an outside symlink', symlink, () => { fs.writeFileSync(path.join(outside, 'brief.md'), 'LINKED-OUTSIDE-BODY'); fs.symlinkSync(path.join(outside, 'brief.md'), briefPath); }],
      ['a symlinked wiki directory', symlink, () => {
        fs.writeFileSync(path.join(outside, 'brief.md'), 'LINKED-OUTSIDE-BODY');
        fs.rmSync(path.dirname(briefPath), { recursive: true });
        fs.symlinkSync(outside, path.dirname(briefPath), process.platform === 'win32' ? 'junction' : 'dir');
      }],
      ['a directory', notRegular, () => fs.mkdirSync(briefPath)],
      ['invalid UTF-8', 'invalid UTF-8', () => write(brief, Buffer.from([0x61, 0xff]))],
      ['a file where the wiki directory belongs', 'brief unavailable', () => { fs.rmSync(path.dirname(briefPath), { recursive: true }); write('.omp-flow/wiki', 'not a directory'); }],
    ];
    if (process.platform !== 'win32') failures.push(['a FIFO', notRegular, () => assert.equal(spawnSync('mkfifo', [briefPath]).status, 0)]);
    for (const [label, reason, arrange] of failures) {
      fs.rmSync(path.join(root, '.omp-flow/wiki'), { recursive: true, force: true });
      write('.omp-flow/wiki/index.md', '# Wiki\n');
      try {
        arrange();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EPERM') continue;
        throw error;
      }
      for (const [harness, context] of Object.entries(allContexts(root))) {
        assert.ok(context.includes(`Wiki brief: unavailable (${reason})`), `${harness} reports ${label} in the head`);
        assert.ok(context.includes(`Wiki brief content: unavailable (${reason})\n\n`), `${harness} reports ${label} before the Wiki map`);
        assert.match(context, /# OMP-Flow/i, `${harness} keeps the Router with ${label}`);
        assert.match(context, /\[Small task\]\(small\/index\.md\)/, `${harness} keeps the Task map with ${label}`);
        assert.doesNotMatch(context, /LINKED-(INSIDE|OUTSIDE)-BODY/, `${harness} never follows ${label}`);
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
}

export function runSessionOrientationTests(): void {
  runBriefOrientationTests();
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
    write('.omp-flow/wiki/index.md', longMap('Wiki', 200));
    write('.agents/skills/omp-flow/SKILL.md', '# OMP-Flow Router\n\nRouter rule body\n');
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
      assert.match(context, /Router rule body/, `${harness} injects the Router Skill whole`);
      assert.match(context, /- \[Lite\]\(lite\.md\)/, `${harness} injects the Workflow map`);
      assert.match(context, /\[Rules entry 119\]/, `${harness} keeps the end of a long Workflow map`);
      assert.match(context, /\[Small task\]\(small\/index\.md\)/, `${harness} injects the Task map`);
      assert.match(context, /\[Wiki entry 199\]/, `${harness} injects a long Wiki map whole`);
      assert.doesNotMatch(context, /truncated/, `${harness} never truncates a map`);
      assert.match(context, /Active Task index: \.omp-flow\/tasks\/10-01-done\/index\.md/, `${harness} points to the marker Task`);
      assert.doesNotMatch(context, /Finished Bundle body/, `${harness} does not inject the marker Task body`);
    }
    // Claude registers one command per part, so each part is its own injection under the host cap.
    const claudeParts = ['router', 'workflow', 'task', 'wiki'].map(part =>
      runHook('claude', root, { session_id: 's', cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: '' }, [part]));
    assert.ok(contexts.claude.length > HOOK_CONTEXT_CAP, 'the fixture exceeds one injection, so parts matter');
    for (const part of claudeParts) assert.ok(part.length < HOOK_CONTEXT_CAP, `Claude part (${part.length}) stays under the cap`);
    assert.match(claudeParts[0], /Router rule body/);
    assert.match(claudeParts[3], /\[Wiki entry 199\]/);
    const settings = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'templates', 'claude', 'settings.json'), 'utf8')) as {
      hooks: { SessionStart: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
    };
    const sessionStart = settings.hooks.SessionStart;
    assert.deepEqual(sessionStart.map(entry => entry.matcher), ['startup|clear|compact'], 'resume and fork keep their original injection');
    assert.deepEqual(
      sessionStart[0].hooks.map(hook => hook.command.split(' ').at(-1)),
      ['router', 'workflow', 'task', 'wiki'],
      'Claude injects each part as its own hook',
    );
    // A brief failure in the long-map fixture leaves the Router rule body and Task map intact.
    fs.mkdirSync(path.join(root, '.omp-flow/wiki/brief.md'));
    for (const [harness, context] of Object.entries(allContexts(root))) {
      assert.match(context, /Wiki brief content: unavailable \(brief is not a regular file\)/, `${harness} isolates the brief`);
      assert.match(context, /Router rule body/, `${harness} keeps the Router rule body`);
      assert.match(context, /Small task/, `${harness} keeps the Task map`);
    }
    fs.rmdirSync(path.join(root, '.omp-flow/wiki/brief.md'));
    fs.rmSync(path.join(root, '.agents'), { recursive: true });
    assert.match(
      runHook('claude', root, { session_id: 's', cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: '' }, ['router']),
      /Router Skill content: unavailable/,
      'a missing Router is reported, not invented',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
