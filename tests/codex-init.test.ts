import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deployInitResources, getManagedResources } from '../src/cli/init.js';
import { computeHash, loadHashes, saveHashes } from '../src/cli/template-hash.js';
import { analyzeChanges, createBackup, executeUpdate } from '../src/cli/update.js';

type Check = (condition: unknown, message: string) => asserts condition;

function writeHarnessConfig(root: string): void {
  fs.mkdirSync(path.join(root, '.omp-flow'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.omp-flow', 'config.json'),
    `${JSON.stringify({ schemaVersion: 1, harnesses: ['codex'] }, null, 2)}\n`,
    'utf8',
  );
}

function write(root: string, relativePath: string, content: string): void {
  const destination = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content, 'utf8');
}

function entry(plan: ReturnType<typeof analyzeChanges>, relativePath: string) {
  return plan.find(candidate => candidate.relativePath === relativePath);
}

export function runCodexInitTests(check: Check): void {
  console.log('--- Codex native resources and migration');
  const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-codex-fresh-'));
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-codex-foreign-'));
  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-codex-legacy-'));
  const modifiedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-codex-modified-'));
  try {
    deployInitResources({ cwd: freshRoot, harnesses: ['codex'] });
    const codexResources = getManagedResources(['codex'])
      .filter(resource => resource.group === 'codex')
      .map(resource => resource.destinationPath.replaceAll('\\', '/'));
    check(
      codexResources.includes('.codex/hooks.json')
        && codexResources.includes('.codex/hooks/session-start.py')
        && codexResources.includes('.codex/hooks/protect-runtime.py'),
      'Codex owns the exact Hook config and both handlers',
    );
    check(
      codexResources.every(relativePath => !relativePath.startsWith('.codex/skills/')),
      'Codex managed resources contain no Harness-specific Skill duplicates',
    );
    check(!fs.existsSync(path.join(freshRoot, '.codex', 'skills')), 'fresh Codex init creates no .codex/skills');
    check(
      fs.readdirSync(path.join(freshRoot, '.agents', 'skills')).length > 1,
      'fresh Codex init discovers shared Skills through .agents/skills',
    );
    const installedHooks = JSON.parse(fs.readFileSync(path.join(freshRoot, '.codex', 'hooks.json'), 'utf8'));
    check(
      JSON.stringify(Object.keys(installedHooks.hooks).sort())
        === JSON.stringify(['PreToolUse', 'SessionStart']),
      'fresh Codex Hook config has exactly two native events',
    );
    for (const file of ['session-start.py', 'protect-runtime.py']) {
      check(
        fs.readFileSync(path.join(freshRoot, '.codex', 'hooks', file), 'utf8')
          === fs.readFileSync(path.join(process.cwd(), 'templates', 'codex', 'hooks', file), 'utf8'),
        `${file} installs byte-identically`,
      );
    }

    write(foreignRoot, '.codex/hooks.json', '{"foreign":true}\n');
    write(foreignRoot, '.codex/hooks/session-start.py', '# foreign session hook\n');
    const foreignInitPlan = deployInitResources({ cwd: foreignRoot, harnesses: ['codex'] });
    check(
      foreignInitPlan.find(candidate => candidate.displayPath.replaceAll('\\', '/') === '.codex/hooks.json')
        ?.action === 'skip',
      'normal init skips a foreign Hook definition',
    );
    check(
      fs.readFileSync(path.join(foreignRoot, '.codex', 'hooks.json'), 'utf8') === '{"foreign":true}\n',
      'normal init leaves foreign Hook content unchanged',
    );
    const foreignPlan = analyzeChanges(foreignRoot, {});
    check(
      entry(foreignPlan, '.codex/hooks.json')?.status === 'changed'
        && entry(foreignPlan, '.codex/hooks.json')?.action === 'skip',
      'update preserves a foreign Hook definition without merging',
    );
    check(
      entry(foreignPlan, '.codex/hooks/session-start.py')?.status === 'changed'
        && entry(foreignPlan, '.codex/hooks/session-start.py')?.action === 'skip',
      'update preserves a foreign handler without claiming ownership',
    );
    executeUpdate(foreignRoot, foreignPlan, {});
    check(
      fs.readFileSync(path.join(foreignRoot, '.codex', 'hooks.json'), 'utf8') === '{"foreign":true}\n',
      'foreign Hook content remains unchanged after update',
    );

    writeHarnessConfig(legacyRoot);
    const oldHook = '{"description":"old managed omp-flow hook"}\n';
    const oldSession = '# old managed session handler\n';
    const canonicalSkill = fs.readFileSync(
      path.join(process.cwd(), 'templates', 'common', 'skills', 'omp-flow', 'SKILL.md'),
      'utf8',
    );
    const canonicalFlowStatus = fs.readFileSync(
      path.join(process.cwd(), 'templates', 'common', 'skills', 'flow-status', 'SKILL.md'),
      'utf8',
    );
    write(legacyRoot, '.codex/hooks.json', oldHook);
    write(legacyRoot, '.codex/hooks/session-start.py', oldSession);
    write(legacyRoot, '.codex/skills/omp-flow/SKILL.md', canonicalSkill);
    write(
      legacyRoot,
      '.codex/skills/flow-status/SKILL.md',
      `${canonicalFlowStatus}\n<!-- user modification -->\n`,
    );
    const legacyHashes = {
      '.codex/hooks.json': computeHash(oldHook),
      '.codex/hooks/session-start.py': computeHash(oldSession),
      '.codex/skills/omp-flow/SKILL.md': computeHash(canonicalSkill),
      '.codex/skills/flow-status/SKILL.md': computeHash(canonicalFlowStatus),
    };
    saveHashes(legacyRoot, legacyHashes);
    const legacyPlan = analyzeChanges(legacyRoot, loadHashes(legacyRoot));
    check(
      legacyPlan.filter(candidate => candidate.relativePath === '.codex/hooks.json').length === 1
        && entry(legacyPlan, '.codex/hooks.json')?.status === 'autoUpdate',
      'legacy managed hooks.json migrates once as a managed update, never as obsolete deletion',
    );
    check(
      legacyPlan.filter(candidate => candidate.relativePath === '.codex/hooks/session-start.py').length === 1
        && entry(legacyPlan, '.codex/hooks/session-start.py')?.status === 'autoUpdate',
      'legacy managed SessionStart migrates once as a managed update, never as obsolete deletion',
    );
    check(
      entry(legacyPlan, '.codex/skills/omp-flow/SKILL.md')?.action === 'delete',
      'unmodified legacy Codex Skill duplicate is obsolete',
    );
    check(
      entry(legacyPlan, '.codex/skills/flow-status/SKILL.md')?.status === 'changed'
        && entry(legacyPlan, '.codex/skills/flow-status/SKILL.md')?.action === 'skip',
      'modified legacy Codex Skill duplicate remains a visible conflict',
    );
    const backup = createBackup(legacyRoot);
    for (const relativePath of [
      '.codex/hooks.json',
      '.codex/hooks/session-start.py',
      '.codex/skills/omp-flow/SKILL.md',
      '.codex/skills/flow-status/SKILL.md',
    ]) {
      check(fs.statSync(path.join(backup, relativePath)).isFile(), `backup contains ${relativePath}`);
    }
    executeUpdate(legacyRoot, legacyPlan, loadHashes(legacyRoot));
    check(
      fs.readFileSync(path.join(legacyRoot, '.codex', 'hooks.json'), 'utf8')
        === fs.readFileSync(path.join(process.cwd(), 'templates', 'codex', 'hooks.json'), 'utf8'),
      'unmodified legacy Hook definition updates to the new canonical definition',
    );
    check(
      fs.readFileSync(path.join(legacyRoot, '.codex', 'hooks', 'session-start.py'), 'utf8')
        === fs.readFileSync(path.join(process.cwd(), 'templates', 'codex', 'hooks', 'session-start.py'), 'utf8'),
      'unmodified legacy SessionStart updates to the new canonical handler',
    );
    check(
      !fs.existsSync(path.join(legacyRoot, '.codex', 'skills', 'omp-flow', 'SKILL.md')),
      'update removes the unmodified legacy Codex Skill duplicate',
    );
    check(
      fs.readFileSync(path.join(legacyRoot, '.codex', 'skills', 'flow-status', 'SKILL.md'), 'utf8')
        .includes('user modification'),
      'update preserves the modified legacy Codex Skill duplicate',
    );

    writeHarnessConfig(modifiedRoot);
    const userModifiedHook = `${oldHook.trim()}\n// user modification\n`;
    write(modifiedRoot, '.codex/hooks.json', userModifiedHook);
    saveHashes(modifiedRoot, { '.codex/hooks.json': computeHash(oldHook) });
    const modifiedPlan = analyzeChanges(modifiedRoot, loadHashes(modifiedRoot));
    check(
      entry(modifiedPlan, '.codex/hooks.json')?.status === 'changed'
        && entry(modifiedPlan, '.codex/hooks.json')?.action === 'skip',
      'modified formerly-managed Hook definition remains a visible conflict',
    );
    executeUpdate(modifiedRoot, modifiedPlan, loadHashes(modifiedRoot));
    check(
      fs.readFileSync(path.join(modifiedRoot, '.codex', 'hooks.json'), 'utf8') === userModifiedHook,
      'update preserves a modified formerly-managed Hook definition',
    );
  } finally {
    fs.rmSync(freshRoot, { recursive: true, force: true });
    fs.rmSync(foreignRoot, { recursive: true, force: true });
    fs.rmSync(legacyRoot, { recursive: true, force: true });
    fs.rmSync(modifiedRoot, { recursive: true, force: true });
  }
}
