import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  type Harness,
} from '../src/cli/harness.js';
import { loadHashes, toPosix } from '../src/cli/template-hash.js';
import { analyzeChanges, interactiveUpdate, type UpdatePlanEntry } from '../src/cli/update.js';

type Check = (condition: unknown, message: string) => asserts condition;

const sourceRoot = process.cwd();
type DelegatedRole = 'research' | 'architect' | 'qbd' | 'implement' | 'check';

const DELEGATED_ROLES: readonly {
  role: DelegatedRole;
  skills: readonly string[];
}[] = [
  { role: 'research', skills: ['.agents/skills/omp-flow-research/SKILL.md'] },
  {
    role: 'architect',
    skills: [
      '.agents/skills/omp-flow-design/SKILL.md',
      '.agents/skills/omp-flow-decompose/SKILL.md',
    ],
  },
  { role: 'qbd', skills: ['.agents/skills/omp-flow-qbd/SKILL.md'] },
  { role: 'implement', skills: ['.agents/skills/omp-flow-implement/SKILL.md'] },
  { role: 'check', skills: ['.agents/skills/omp-flow-check/SKILL.md'] },
];

const ROLE_CARD_FILES: Record<Harness, Record<DelegatedRole, string>> = {
  omp: {
    research: 'researcher.md',
    architect: 'architect.md',
    qbd: 'qbd-auditor.md',
    implement: 'executor.md',
    check: 'reviewer.md',
  },
  codex: {
    research: 'omp-flow-research.toml',
    architect: 'omp-flow-architect.toml',
    qbd: 'omp-flow-qbd.toml',
    implement: 'omp-flow-implement.toml',
    check: 'omp-flow-check.toml',
  },
  claude: {
    research: 'omp-flow-research.md',
    architect: 'omp-flow-architect.md',
    qbd: 'omp-flow-qbd.md',
    implement: 'omp-flow-implement.md',
    check: 'omp-flow-check.md',
  },
  snow: {
    research: 'omp-flow-research.md',
    architect: 'omp-flow-architect.md',
    qbd: 'omp-flow-qbd.md',
    implement: 'omp-flow-implement.md',
    check: 'omp-flow-check.md',
  },
  cursor: {
    research: 'omp-flow-research.md',
    architect: 'omp-flow-architect.md',
    qbd: 'omp-flow-qbd.md',
    implement: 'omp-flow-implement.md',
    check: 'omp-flow-check.md',
  },
};

const COMMON_ARCHITECT_SELECTION = [
  'For a Design assignment, read `.agents/skills/omp-flow-design/SKILL.md` completely and follow it.',
  'For approved work mapping only after linked human QbD 1 approval, read `.agents/skills/omp-flow-decompose/SKILL.md` completely and follow it.',
  'Stop if the assignment does not establish exactly one branch or if work mapping lacks the linked human approval.',
] as const;

const ARCHITECT_SELECTION: Record<Harness, readonly string[]> = {
  omp: COMMON_ARCHITECT_SELECTION,
  codex: COMMON_ARCHITECT_SELECTION,
  claude: COMMON_ARCHITECT_SELECTION,
  snow: [
    '`.agents/skills/omp-flow-design/SKILL.md` for design or `.agents/skills/omp-flow-decompose/SKILL.md` for work mapping.',
  ],
  cursor: [
    'Read `.agents/skills/omp-flow-design/SKILL.md` completely for design work, or `.agents/skills/omp-flow-decompose/SKILL.md` completely for approved work mapping, as named by the bounded assignment.',
  ],
};


function assertUniversalSkillDeployment(root: string, label: string, check: Check): void {
  const skillRoot = path.join('.agents', 'skills');
  const resources = getManagedResources([])
    .filter(resource => toPosix(resource.destinationPath).startsWith('.agents/skills/'))
    .sort((left, right) => left.destinationPath.localeCompare(right.destinationPath));
  const expected = resources
    .map(resource => toPosix(path.relative(skillRoot, resource.destinationPath)))
    .sort();
  const installed = filesBelow(path.join(root, skillRoot));
  check(
    JSON.stringify(installed) === JSON.stringify(expected),
    `${label} installs the exact universal .agents Skill set`,
  );
  for (const resource of resources) {
    const canonical = fs.readFileSync(path.join(sourceRoot, resource.sourcePath), 'utf8');
    const deployed = fs.readFileSync(path.join(root, resource.destinationPath), 'utf8');
    check(
      deployed === canonical,
      `${label} keeps ${toPosix(resource.destinationPath)} byte-equal to its canonical Skill`,
    );
  }
}

function assertMappedInstallation(
  root: string,
  harnesses: readonly Harness[],
  label: string,
  check: Check,
): void {
  const resources = getManagedResources(harnesses);
  const destinations = resources.map(resource => toPosix(resource.destinationPath));
  check(
    new Set(destinations).size === destinations.length,
    `${label} has exactly one managed mapping for every destination`,
  );
  for (const harness of harnesses) {
    check(
      resources.some(resource => resource.group === harness),
      `${label} includes ${harness} managed resources`,
    );
  }
  const mismatch = resources.find(resource => {
    const sourcePath = path.join(sourceRoot, resource.sourcePath);
    const destinationPath = path.join(root, resource.destinationPath);
    if (!fs.existsSync(destinationPath)) return true;
    const canonical = fs.readFileSync(sourcePath, 'utf8');
    return fs.readFileSync(destinationPath, 'utf8') !== renderManagedResource(sourcePath, canonical);
  });
  const mismatchPath = mismatch === undefined ? '' : `: ${toPosix(mismatch.destinationPath)}`;
  check(
    mismatch === undefined,
    `${label} deploys every mapped resource from its canonical content${mismatchPath}`,
  );
}

function assertHarnessCardContracts(root: string, harness: Harness, label: string, check: Check): void {
  for (const { role, skills } of DELEGATED_ROLES) {
    const fileName = ROLE_CARD_FILES[harness][role];
    const canonical = fs.readFileSync(path.join(sourceRoot, 'templates', harness, 'agents', fileName), 'utf8');
    const deployed = fs.readFileSync(path.join(root, `.${harness}`, 'agents', fileName), 'utf8');
    check(deployed === canonical, `${label} ${role} card is byte-equal to its canonical template`);
    const delegated = deployed.match(/\.agents\/skills\/[a-z0-9-]+\/SKILL\.md/g) ?? [];
    check(
      JSON.stringify(delegated) === JSON.stringify(skills),
      `${label} ${role} card delegates to only its exact matching universal Skill path${role === 'architect' ? 's' : ''}`,
    );
    if (role === 'architect') {
      const prose = deployed.replace(/\s+/g, ' ').trim();
      for (const anchor of ARCHITECT_SELECTION[harness]) {
        check(prose.includes(anchor), `${label} Architect preserves its exact Design/Decompose selection`);
      }
    }
  }
}

function assertIdentityStops(root: string, harness: 'snow' | 'cursor', label: string, check: Check): void {
  const required = harness === 'snow'
    ? [
        'Snow 0.8.24 cannot expose or reserve the unique native execution ID before operation creation',
        'this agent definition ID is not a unique execution ID',
        'strict omp-flow operation dispatch through this Snow card is unavailable: stop without doing the assignment, writing its output, or finishing its receipt',
        'Do not represent this card ID or name as `actorId`',
      ]
    : [
        "This card does not prove that Cursor's generated native subagent ID was caller-selected as `actorId`",
        'Never create a receipt, infer a predecessor, alias an agent name or generated ID, or rewrite the descriptor after dispatch',
        'If exact native-item correlation is required without a pre-dispatch proof, stop and report the operation path unavailable',
      ];
  for (const { role } of DELEGATED_ROLES) {
    const fileName = ROLE_CARD_FILES[harness][role];
    const content = fs.readFileSync(path.join(root, `.${harness}`, 'agents', fileName), 'utf8')
      .replace(/\s+/g, ' ')
      .trim();
    for (const anchor of required) {
      check(content.includes(anchor), `${label} ${role} card preserves the ${harness}-specific identity stop`);
    }
    check(
      !/\b(?:is|are|becomes?|made)\s+(?:now\s+)?runnable\b/i.test(content)
        && !/\b(?:native identity|actorId)\s+(?:is|has been)\s+(?:proved|reserved|satisfied)\b/i.test(content),
      `${label} ${role} card makes no runnable-identity claim`,
    );
  }
}

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
    assertUniversalSkillDeployment(snowRoot, 'Snow-only init', check);
    assertMappedInstallation(snowRoot, ['snow'], 'Snow-only init', check);
    assertHarnessCardContracts(snowRoot, 'snow', 'Snow-only init', check);
    assertIdentityStops(snowRoot, 'snow', 'Snow-only init', check);
    check(!fs.existsSync(path.join(snowRoot, '.cursor')), 'Snow-only init does not create Cursor resources');

    deployInitResources({ cwd: cursorRoot, harnesses: ['cursor'] });
    assertNativeDeployment(cursorRoot, 'cursor', check);
    assertUniversalSkillDeployment(cursorRoot, 'Cursor-only init', check);
    assertMappedInstallation(cursorRoot, ['cursor'], 'Cursor-only init', check);
    assertHarnessCardContracts(cursorRoot, 'cursor', 'Cursor-only init', check);
    assertIdentityStops(cursorRoot, 'cursor', 'Cursor-only init', check);
    check(!fs.existsSync(path.join(cursorRoot, '.snow')), 'Cursor-only init does not create Snow resources');

    deployInitResources({ cwd: combinedRoot, harnesses: HARNESSES });
    assertMappedInstallation(combinedRoot, HARNESSES, 'all-five-Harness init', check);
    assertUniversalSkillDeployment(combinedRoot, 'all-five-Harness init', check);
    for (const harness of HARNESSES) {
      assertHarnessCardContracts(combinedRoot, harness, 'all-five-Harness init', check);
    }
    assertIdentityStops(combinedRoot, 'snow', 'all-five-Harness init', check);
    assertIdentityStops(combinedRoot, 'cursor', 'all-five-Harness init', check);
    check(
      JSON.stringify(readHarnessConfig(combinedRoot, true)?.harnesses) === JSON.stringify(HARNESSES),
      'combined init persists all five Harnesses in stable order',
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
    check(fs.existsSync(path.join(combinedRoot, '.agents', 'skills')), 'all five Harnesses use the shared .agents/skills tree');
    check(!fs.existsSync(path.join(combinedRoot, '.snow', 'skills')), 'Snow install has no duplicate Skill tree');
    check(!fs.existsSync(path.join(combinedRoot, '.cursor', 'skills')), 'Cursor install has no duplicate Skill tree');
    check(!fs.existsSync(path.join(combinedRoot, '.cursor', 'rules')), 'Cursor install has no duplicate rule');
    check(!fs.existsSync(path.join(sourceRoot, 'templates', 'snow', 'skills')), 'package source has no Snow Skill duplicate');
    check(!fs.existsSync(path.join(sourceRoot, 'templates', 'cursor', 'skills')), 'package source has no Cursor Skill duplicate');
    check(!fs.existsSync(path.join(sourceRoot, 'templates', 'cursor', 'rules')), 'package source has no Cursor rule duplicate');
    check(!fs.existsSync(path.join(sourceRoot, '.snow')), 'repository has no invented Snow deployment');
    check(!fs.existsSync(path.join(sourceRoot, '.cursor')), 'repository has no invented Cursor deployment');
    check(
      !getManagedResources(['snow']).some(resource => toPosix(resource.destinationPath).startsWith('.snow/skills/')),
      'Snow mapping invents no Harness-specific Skill deployment',
    );
    check(
      !getManagedResources(['cursor']).some(resource => toPosix(resource.destinationPath).startsWith('.cursor/skills/')),
      'Cursor mapping invents no Harness-specific Skill deployment',
    );

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

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let checks = 0;
  const check: Check = (condition, message): asserts condition => {
    assert(condition, message);
    checks += 1;
  };
  await runSnowCursorManagedResourceTests(check);
  console.log(`PASS: ${checks} Snow/Cursor managed-resource checks`);
}
