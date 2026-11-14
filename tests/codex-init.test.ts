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
  const freshRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-codex-fresh-')));
  const foreignRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-codex-foreign-')));
  const legacyRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-codex-legacy-')));
  const modifiedRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-codex-modified-')));
  try {
    deployInitResources({ cwd: freshRoot, harnesses: ['codex'] });
    const coreResources = getManagedResources(['codex'])
      .filter(resource => resource.group === 'core')
      .map(resource => resource.destinationPath.replaceAll('\\', '/'));
    check(
      coreResources.includes('.omp-flow/scripts/common/workscope.py')
        && !coreResources.includes('.omp-flow/scripts/common/active_task.py'),
      'fresh init deploys WorkScope and no retired active_task runtime',
    );
    check(
      coreResources.includes('.omp-flow/workflow/spec-formation.md')
        && !coreResources.includes('.omp-flow/wiki/specs/index.md'),
      'fresh init manages Spec Formation but not the project-owned Wiki specs index',
    );
    check(
      fs.existsSync(path.join(freshRoot, '.omp-flow', 'wiki', 'specs', 'index.md'))
        && loadHashes(freshRoot)['.omp-flow/wiki/specs/index.md'] === undefined,
      'fresh init bootstraps the Wiki specs index once without a template hash',
    );
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
    const retiredWorkflow = '# Retired root Workflow\n';
    write(legacyRoot, '.omp-flow/workflow.md', retiredWorkflow);
    const canonicalSkill = fs.readFileSync(
      path.join(process.cwd(), 'templates', 'common', 'skills', 'omp-flow', 'SKILL.md'),
      'utf8',
    );
    write(legacyRoot, '.codex/hooks.json', oldHook);
    write(legacyRoot, '.codex/hooks/session-start.py', oldSession);
    const retiredActiveTask = '# retired active task compatibility\n';
    write(legacyRoot, '.omp-flow/scripts/common/active_task.py', retiredActiveTask);
    write(legacyRoot, '.codex/skills/omp-flow/SKILL.md', canonicalSkill);
    const legacyHashes = {
      '.omp-flow/workflow.md': computeHash(retiredWorkflow),
      '.codex/hooks.json': computeHash(oldHook),
      '.codex/hooks/session-start.py': computeHash(oldSession),
      '.codex/skills/omp-flow/SKILL.md': computeHash(canonicalSkill),
      '.omp-flow/scripts/common/active_task.py': computeHash(retiredActiveTask),
    };
    saveHashes(legacyRoot, legacyHashes);
    const legacyPlan = analyzeChanges(legacyRoot, loadHashes(legacyRoot));
    check(entry(legacyPlan, '.omp-flow/workflow.md')?.action === 'delete',
      'unchanged managed root Workflow is retired during update');
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
      entry(legacyPlan, '.omp-flow/scripts/common/active_task.py')?.action === 'delete',
      'unmodified retired active_task runtime is obsolete',
    );
    const backup = createBackup(legacyRoot);
    for (const relativePath of [
      '.codex/hooks.json',
      '.codex/hooks/session-start.py',
      '.codex/skills/omp-flow/SKILL.md',
      '.omp-flow/scripts/common/active_task.py',
    ]) {
      check(fs.statSync(path.join(backup, relativePath)).isFile(), `backup contains ${relativePath}`);
    }
    executeUpdate(legacyRoot, legacyPlan, loadHashes(legacyRoot));
    check(!fs.existsSync(path.join(legacyRoot, '.omp-flow/workflow.md')),
      'update removes the unchanged root Workflow');
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
      !fs.existsSync(path.join(legacyRoot, '.omp-flow', 'scripts', 'common', 'active_task.py')),
      'update removes the unmodified retired active_task runtime',
    );

    writeHarnessConfig(modifiedRoot);
    const userModifiedHook = `${oldHook.trim()}\n// user modification\n`;
    const oldSpecsIndex = '---\nokf_version: "0.2"\n---\n\n# Durable specifications\n';
    const userWikiSpecsIndex = '# User-owned specs navigation\n\n- keep me\n';
    const customizedLayout = '.omp-flow/workflow/code/how.md';
    const missingLayouts = [
      '.omp-flow/workflow/code/why.md',
      '.omp-flow/workflow/code/architect.md',
      '.omp-flow/workflow/code/interrogate.md',
    ] as const;
    const previousLayout = '# Previously managed code layout\n';
    const userCodeLayout = '# Project coding layout\n\nKeep project-local changes.\n';
    write(modifiedRoot, '.codex/hooks.json', userModifiedHook);
    write(modifiedRoot, '.omp-flow/wiki/specs/index.md', userWikiSpecsIndex);
    write(modifiedRoot, customizedLayout, userCodeLayout);
    saveHashes(modifiedRoot, {
      '.codex/hooks.json': computeHash(oldHook),
      [customizedLayout]: computeHash(previousLayout),
      '.omp-flow/wiki/specs/index.md': computeHash(oldSpecsIndex),
    });
    const modifiedPlan = analyzeChanges(modifiedRoot, loadHashes(modifiedRoot));
    check(
      entry(modifiedPlan, '.codex/hooks.json')?.status === 'changed'
        && entry(modifiedPlan, '.codex/hooks.json')?.action === 'skip',
      'modified formerly-managed Hook definition remains a visible conflict',
    );
    check(
      entry(modifiedPlan, '.omp-flow/wiki/specs/index.md') === undefined,
      'update plans nothing for the project-owned Wiki specs index despite a legacy hash',
    );
    check(
      entry(modifiedPlan, customizedLayout)?.status === 'changed'
        && entry(modifiedPlan, customizedLayout)?.action === 'skip'
        && missingLayouts.every(relativePath =>
          entry(modifiedPlan, relativePath)?.status === 'new'
            && entry(modifiedPlan, relativePath)?.action === 'create',
        ),
      'update preserves a customized code layout while planning the missing nested layouts',
    );
    executeUpdate(modifiedRoot, modifiedPlan, loadHashes(modifiedRoot));
    check(
      fs.readFileSync(path.join(modifiedRoot, '.codex', 'hooks.json'), 'utf8') === userModifiedHook,
      'update preserves a modified formerly-managed Hook definition',
    );
    check(
      fs.readFileSync(path.join(modifiedRoot, '.omp-flow', 'wiki', 'specs', 'index.md'), 'utf8')
        === userWikiSpecsIndex
        && loadHashes(modifiedRoot)['.omp-flow/wiki/specs/index.md'] === undefined,
      'update keeps the customized Wiki specs index and strips its legacy hash',
    );

    for (const linkHashStore of [false, true]) {
      const fixture = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-legacy-hash-')));
      const project = path.join(fixture, 'project');
      const outside = path.join(fixture, 'outside');
      fs.mkdirSync(project);
      fs.mkdirSync(outside);
      try {
        deployInitResources({ cwd: project, harnesses: ['codex'] });
        const specsIndexPath = path.join(project, '.omp-flow', 'wiki', 'specs', 'index.md');
        const specsIndex = fs.readFileSync(specsIndexPath, 'utf8');
        const legacyHashes = {
          ...loadHashes(project),
          '.omp-flow/wiki/specs/index.md': computeHash(specsIndex),
        };
        saveHashes(project, legacyHashes);
        const hashStore = path.join(project, '.omp-flow', '.template-hashes.json');
        const outsideStore = path.join(outside, 'hashes.json');
        const hashStoreContent = fs.readFileSync(hashStore, 'utf8');
        if (linkHashStore) {
          fs.writeFileSync(outsideStore, hashStoreContent, 'utf8');
          fs.rmSync(hashStore);
          fs.symlinkSync(outsideStore, hashStore, 'file');
        }
        const quietPlan = analyzeChanges(project, loadHashes(project));
        check(
          quietPlan.every(item => item.action === 'skip')
            && entry(quietPlan, '.omp-flow/wiki/specs/index.md') === undefined,
          'an otherwise current install plans only skips beside a legacy specs-index hash',
        );
        let error: unknown;
        try {
          executeUpdate(project, quietPlan, loadHashes(project));
        } catch (caught) {
          error = caught;
        }
        if (linkHashStore) {
          check(
            error instanceof Error
              && error.message.includes('Cannot update managed resources')
              && fs.readFileSync(outsideStore, 'utf8') === hashStoreContent
              && fs.readFileSync(specsIndexPath, 'utf8') === specsIndex,
            'legacy-hash-only update refuses a linked hash store before writing outside the repository',
          );
        } else {
          check(
            error === undefined
              && loadHashes(project)['.omp-flow/wiki/specs/index.md'] === undefined
              && fs.readFileSync(specsIndexPath, 'utf8') === specsIndex,
            'legacy-hash-only update strips the hash and keeps the Wiki specs index file',
          );
        }
      } finally {
        fs.rmSync(fixture, { recursive: true, force: true });
      }
    }
    check(
      fs.readFileSync(path.join(modifiedRoot, customizedLayout), 'utf8') === userCodeLayout
        && missingLayouts.every(relativePath =>
          fs.statSync(path.join(modifiedRoot, relativePath)).isFile(),
        ),
      'update keeps project code-layout edits and installs every missing sibling layout',
    );

    for (const operation of ['init', 'update'] as const) {
      const fixture = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-linked-layout-')));
      const project = path.join(fixture, 'project');
      const outside = path.join(fixture, 'outside');
      fs.mkdirSync(project);
      fs.mkdirSync(outside);
      try {
        if (operation === 'update') {
          deployInitResources({ cwd: project, harnesses: ['codex'] });
          const previousHashes = loadHashes(project);
          for (const name of ['how', 'why', 'architect', 'interrogate']) {
            delete previousHashes[`.omp-flow/workflow/code/${name}.md`];
          }
          saveHashes(project, previousHashes);
          fs.rmSync(path.join(project, '.omp-flow', 'workflow', 'code'), { recursive: true });
        }
        const originalIndex = '# Project-owned navigation before rejection\n';
        write(project, '.omp-flow/workflow/index.md', originalIndex);
        write(outside, 'how.md', 'Outside-owned content\n');
        const linked = path.join(project, '.omp-flow', 'workflow', 'code');
        fs.symlinkSync(outside, linked, 'junction');
        let rejected = false;
        try {
          if (operation === 'init') {
            deployInitResources({ cwd: project, harnesses: ['codex'], force: true });
          } else {
            const previousHashes = loadHashes(project);
            const linkedPlan = analyzeChanges(project, previousHashes).map(item =>
              item.status === 'changed' ? { ...item, action: 'overwrite' as const } : item,
            );
            executeUpdate(project, linkedPlan, previousHashes);
          }
        } catch {
          rejected = true;
        }
        check(
          rejected
            && fs.readFileSync(path.join(outside, 'how.md'), 'utf8') === 'Outside-owned content\n'
            && JSON.stringify(fs.readdirSync(outside).sort()) === JSON.stringify(['how.md'])
            && fs.readFileSync(path.join(project, '.omp-flow', 'workflow', 'index.md'), 'utf8')
              === originalIndex,
          `${operation} rejects a linked code-layout directory before outside or earlier managed writes`,
        );
      } finally {
        fs.rmSync(fixture, { recursive: true, force: true });
      }
    }
  } finally {
    fs.rmSync(freshRoot, { recursive: true, force: true });
    fs.rmSync(foreignRoot, { recursive: true, force: true });
    fs.rmSync(legacyRoot, { recursive: true, force: true });
    fs.rmSync(modifiedRoot, { recursive: true, force: true });
  }
}
