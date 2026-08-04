import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { atomicCommitFilesSync } from '../dist/cli/atomic-file.js';
import { inspectFlowStatusSetup } from '../dist/cli/flow-status-setup.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-final-repair-'));
try {
  const first = path.join(root, 'first.json');
  const blocker = path.join(root, 'blocker');
  fs.writeFileSync(first, '{"complete":"old"}\n', 'utf8');
  fs.writeFileSync(blocker, 'regular file\n', 'utf8');
  assert.throws(() => atomicCommitFilesSync([
    { path: first, content: '{"complete":"new"}\n' },
    { path: path.join(blocker, 'second.json'), content: '{}\n' },
  ]));
  assert.equal(fs.readFileSync(first, 'utf8'), '{"complete":"old"}\n');
  assert.deepEqual(
    fs.readdirSync(root).filter(name => name.endsWith('.tmp')),
    [],
    'compiled preparation failure leaves no prior temporary file',
  );

  fs.mkdirSync(path.join(root, '.omp-flow'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.omp-flow', 'config.json'),
    '{"schemaVersion":1,"harnesses":["claude"]}\n',
    'utf8',
  );
  const compatibleRoot = path.join(root, 'compatible');
  fs.mkdirSync(compatibleRoot, { recursive: true });
  const executable = path.join(compatibleRoot, 'ccstatusline.js');
  const packageJson = path.join(compatibleRoot, 'package.json');
  const ccConfig = path.join(root, '.claude', 'ccstatusline-settings.json');
  const claudeSettings = path.join(root, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(claudeSettings), { recursive: true });
  fs.writeFileSync(
    executable,
    'process.stdout.write(JSON.stringify({flowStatusWidgetV1:true,'
      + 'upstreamRevision:"83c8ffd551ec700fceeed98fe9ab50de84cb49fa"}));\n',
    'utf8',
  );
  fs.writeFileSync(
    packageJson,
    '{"name":"@omp-flow/ccstatusline","version":"2.2.27-flowstatus.1"}\n',
    'utf8',
  );
  for (const command of [
    'ccstatusline',
    'npx -y ccstatusline@latest',
    `${path.join(root, 'other', 'ccstatusline')} --config ${ccConfig}`,
  ]) {
    fs.writeFileSync(
      claudeSettings,
      `${JSON.stringify({ statusLine: { type: 'command', command } }, null, 2)}\n`,
      'utf8',
    );
    const report = inspectFlowStatusSetup(root, executable, packageJson, claudeSettings, ccConfig);
    assert.notEqual(report.claude.setup, 'ready', `unpinned/mismatched command was ready: ${command}`);
  }
  console.log('PASS: compiled atomic preparation cleanup and pinned doctor ownership regressions');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
