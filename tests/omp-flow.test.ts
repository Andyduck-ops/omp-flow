import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { renderCliBanner, supportsBannerColor } from '../src/cli/banner.js';
import { deployInitResources, getManagedResources } from '../src/cli/init.js';
import { analyzeChanges, executeUpdate } from '../src/cli/update.js';
import { computeHash, loadHashes, saveHashes } from '../src/cli/template-hash.js';
import { OMPFlowExtension } from '../src/omp/extension.js';
import { runDestinationConfinementTests } from './destination-confinement.test.js';
import { runCodexInitTests } from './codex-init.test.js';
import { runInitCLITests } from './init-cli.test.js';
import { runSnowCursorManagedResourceTests } from './snow-cursor-managed-resources.test.js';
import { runOMPIndexMapTests } from './omp-index-maps.test.js';
import { runSessionOrientationTests } from './session-orientation.test.js';

const python = process.platform === 'win32' ? 'python' : 'python3';
let checks = 0;

function check(condition: unknown, message: string): asserts condition {
  assert(condition, message);
  checks += 1;
}

function run(root: string, args: string[], context: string | null = 'test-session'): string {
  const env = { ...process.env };
  if (context === null) {
    for (const key of [
      'OMP_FLOW_CONTEXT_ID',
      'OMP_SESSION_ID',
      'PI_SESSION_ID',
      'CODEX_THREAD_ID',
      'CODEX_SESSION_ID',
      'SNOW_SESSION_ID',
    ]) {
      delete env[key];
    }
  } else {
    env.OMP_FLOW_CONTEXT_ID = context;
  }
  return execFileSync(
    python,
    ['-X', 'utf8', path.join(root, '.omp-flow', 'scripts', 'omp_flow.py'), '--cwd', root, ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim();
}

function json<T>(root: string, args: string[], context: string | null = 'test-session'): T {
  return JSON.parse(run(root, args, context)) as T;
}

function failure(root: string, args: string[], expected: string, context = 'test-session'): void {
  const result = spawnSync(
    python,
    ['-X', 'utf8', path.join(root, '.omp-flow', 'scripts', 'omp_flow.py'), '--cwd', root, ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, OMP_FLOW_CONTEXT_ID: context },
    },
  );
  check(result.status === 2, `expected failure for ${args.join(' ')}`);
  check(result.stderr.includes(expected), `failure should include ${expected}: ${result.stderr}`);
}

function writeConcept(file: string, type: string, title: string, body: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `---\ntype: ${JSON.stringify(type)}\ntitle: ${JSON.stringify(title)}\n---\n\n# ${title}\n\n${body}\n`,
    'utf8',
  );
}

interface CreatedTask {
  taskId: string;
  taskDir: string;
}

interface Operation {
  id: string;
  actor_id: string;
  state: string;
  predecessor: string | null;
  output_path: string;
}

interface Started {
  operation: Operation;
  assignment: string;
}

interface SleepSource {
  ready: boolean;
  receipt: string;
  sourceCommit: string;
  sourceTree: string;
  archivedPath: string;
  reason?: string;
}

interface ArchivedTask {
  archivedTo: string;
  sleepSource: SleepSource;
}

interface SleepRun {
  receipt: string;
  actorId: string;
  state: string;
  runOutput: string;
  candidateRoot: string;
  candidates: string[];
  assignment?: string;
}

interface StartedSleep {
  run: SleepRun;
  assignment: string;
}

const sourceRoot = process.cwd();
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-okf-')));
try {
  console.log('--- cli banner');
  const wideBanner = [
    '╭───────────────────────── ✦  O M P ━ F L O W  ✦ ──────────────────────────╮',
    '│  ██████╗ ███╗   ███╗██████╗          ███████╗██╗      ██████╗ ██╗    ██╗ │',
    '│ ██╔═══██╗████╗ ████║██╔══██╗   ───   ██╔════╝██║     ██╔═══██╗██║    ██║ │',
    '│ ██║   ██║██╔████╔██║██████╔╝  ━━◆━━  █████╗  ██║     ██║   ██║██║ █╗ ██║ │',
    '│ ██║   ██║██║╚██╔╝██║██╔═══╝    ───   ██╔══╝  ██║     ██║   ██║██║███╗██║ │',
    '│ ╚██████╔╝██║ ╚═╝ ██║██║              ██║     ███████╗╚██████╔╝╚███╔███╔╝ │',
    '│  ╚═════╝ ╚═╝     ╚═╝╚═╝              ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝  │',
    '╰────────────── ◆  agent-native workflow orchestration  ◆ ─────────────────╯',
  ].join('\n');
  const mediumBanner = [
    '╭──────────── ✦  O M P ━ F L O W  ✦ ────────────╮',
    '│  ▄▀▀▄ █▄ ▄█ █▀▀▄         █▀▀ █    ▄▀▀▄ █   █  │',
    '│  █  █ █ █ █ █▄▄▀  ━━◆━━  █▀  █    █  █ █ █ █  │',
    '│   ▀▀  █   █ █            █   █▄▄   ▀▀   ▀▄▀   │',
    '╰─── ◆ agent-native workflow orchestration ◆ ───╯',
  ].join('\n');
  const compactBanner = '◆ OMP━FLOW\n  agent-native workflow';
  check(renderCliBanner({ columns: 76, color: false }) === wideBanner, '76 columns use exact five-line wide art');
  check(
    renderCliBanner({ columns: 76, color: false }).split('\n').every(line => [...line].length <= 76),
    'wide Banner does not overflow 76 columns',
  );
  check(renderCliBanner({ columns: 52, color: false }) === mediumBanner, '52 columns use exact three-line art');
  check(renderCliBanner({ columns: 28, color: false }) === compactBanner, '28 columns use exact two-line art');
  check(renderCliBanner({ columns: 27, color: false }) === '◆ omp-flow', '27 columns use exact single-line art');
  check(!supportsBannerColor({ NO_COLOR: '' }, true), 'NO_COLOR disables banner color');
  check(supportsBannerColor({ FORCE_COLOR: '1' }, false), 'FORCE_COLOR enables banner color');
  await runInitCLITests(check);
  await runSnowCursorManagedResourceTests(check);
  await runOMPIndexMapTests();
  runSessionOrientationTests();
  runCodexInitTests(check);
  execFileSync(python, ['-X', 'utf8', path.join(sourceRoot, 'tests', 'wiki-sleep.test.py')], {
    cwd: sourceRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  execFileSync(python, ['-X', 'utf8', path.join(sourceRoot, 'tests', 'codex-hooks.test.py')], {
    cwd: sourceRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  execFileSync(python, ['-X', 'utf8', path.join(sourceRoot, 'tests', 'snow-hooks.test.py')], {
    cwd: sourceRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  execFileSync(python, ['-X', 'utf8', path.join(sourceRoot, 'tests', 'cursor-hooks.test.py')], {
    cwd: sourceRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });

  execFileSync(python, ['-X', 'utf8', path.join(sourceRoot, 'tests', 'dynamic-index-injection.test.py')], {
    cwd: sourceRoot, encoding: 'utf8', stdio: 'inherit',
  });

  console.log('--- install');
  deployInitResources({ cwd: root, harnesses: ['omp', 'codex', 'claude'] });
  const resources = getManagedResources(['omp', 'codex', 'claude']);
  check(resources.length > 0, 'managed resources are declared');
  for (const resource of resources) {
    check(fs.statSync(path.join(root, resource.destinationPath)).isFile(), `deployed ${resource.destinationPath}`);
  }

  console.log('--- shared responsibility and native delegation contracts');
  const workflowContract = fs.readFileSync(
    path.join(sourceRoot, 'templates', '.omp-flow', 'workflow', 'full-delivery.md'),
    'utf8',
  );
  check(
    fs.readFileSync(path.join(root, '.omp-flow', 'workflow', 'full-delivery.md'), 'utf8') === workflowContract,
    'Workflow temporary installation is byte-identical',
  );

  const workflowLibraryFiles = [
    'index.md',
    'full-delivery.md',
    'lite.md',
    'research.md',
    'experiment.md',
    'workflow-maintenance.md',
  ] as const;
  for (const fileName of workflowLibraryFiles) {
    const canonical = fs.readFileSync(
      path.join(sourceRoot, 'templates', '.omp-flow', 'workflow', fileName),
      'utf8',
    );
    check(
      fs.readFileSync(path.join(root, '.omp-flow', 'workflow', fileName), 'utf8') === canonical,
      `Workflow Library temporary installation is byte-identical for ${fileName}`,
    );
  }

  check(
    workflowLibraryFiles.includes('index.md') &&
      fs.readFileSync(path.join(root, '.omp-flow', 'workflow', 'index.md'), 'utf8').includes('research.md'),
    'Workflow Library index exposes authored workflow choices',
  );
  const sharedSkillNames = [
    'omp-flow',
    'omp-flow-brainstorm',
    'omp-flow-research',
    'omp-flow-design',
    'omp-flow-qbd',
    'omp-flow-decompose',
    'omp-flow-implement',
    'omp-flow-workflow-maintainer',
    'omp-flow-check',
  ] as const;
  const sharedSkillText: Record<string, string> = {};
  for (const skill of sharedSkillNames) {
    const canonical = fs.readFileSync(
      path.join(sourceRoot, 'templates', 'common', 'skills', skill, 'SKILL.md'),
      'utf8',
    );
    sharedSkillText[skill] = canonical;
    for (const harnessRoot of ['.agents', '.omp', '.claude']) {
      check(
        fs.readFileSync(path.join(sourceRoot, harnessRoot, 'skills', skill, 'SKILL.md'), 'utf8') === canonical,
        `${skill} canonical and ${harnessRoot} repository deployment are byte-identical`,
      );
      check(
        fs.readFileSync(path.join(root, harnessRoot, 'skills', skill, 'SKILL.md'), 'utf8') === canonical,
        `${skill} temporary installation is byte-identical in ${harnessRoot}`,
      );
    }
  }

  // Wording is reviewed as authored guidance; tests protect navigation and deployment.
  const normalizeContract = (text: string): string => text.replace(/\s+/g, ' ').trim();
  check(!sharedSkillText['omp-flow'].includes('.omp-flow/workflow.md'), 'Router has no retired Workflow fallback');

  const nativeCardContracts = [
    {
      name: 'OMP Router',
      harness: 'omp',
      canonical: ['templates', 'omp', 'agents', 'orchestrator.md'],
      deployed: ['.omp', 'agents', 'orchestrator.md'],
      skills: ['.agents/skills/omp-flow/SKILL.md'],
      output: '',
    },
    {
      name: 'OMP Research',
      harness: 'omp',
      canonical: ['templates', 'omp', 'agents', 'researcher.md'],
      deployed: ['.omp', 'agents', 'researcher.md'],
      skills: ['.agents/skills/omp-flow-research/SKILL.md'],
      output: 'assigned output',
    },
    {
      name: 'OMP Architect',
      harness: 'omp',
      canonical: ['templates', 'omp', 'agents', 'architect.md'],
      deployed: ['.omp', 'agents', 'architect.md'],
      skills: [
        '.agents/skills/omp-flow-design/SKILL.md',
        '.agents/skills/omp-flow-decompose/SKILL.md',
      ],
      output: 'assigned output',
    },
    {
      name: 'OMP QbD',
      harness: 'omp',
      canonical: ['templates', 'omp', 'agents', 'qbd-auditor.md'],
      deployed: ['.omp', 'agents', 'qbd-auditor.md'],
      skills: ['.agents/skills/omp-flow-qbd/SKILL.md'],
      output: 'assigned audit output',
    },
    {
      name: 'OMP Implement',
      harness: 'omp',
      canonical: ['templates', 'omp', 'agents', 'executor.md'],
      deployed: ['.omp', 'agents', 'executor.md'],
      skills: ['.agents/skills/omp-flow-implement/SKILL.md'],
      output: 'assigned handoff',
    },
    {
      name: 'OMP Check',
      harness: 'omp',
      canonical: ['templates', 'omp', 'agents', 'reviewer.md'],
      deployed: ['.omp', 'agents', 'reviewer.md'],
      skills: ['.agents/skills/omp-flow-check/SKILL.md'],
      output: 'assigned Review Concept',
    },
    ...[
      ['Research', 'omp-flow-research.toml', '.agents/skills/omp-flow-research/SKILL.md', 'assigned output'],
      ['QbD', 'omp-flow-qbd.toml', '.agents/skills/omp-flow-qbd/SKILL.md', 'assigned audit output'],
      ['Implement', 'omp-flow-implement.toml', '.agents/skills/omp-flow-implement/SKILL.md', 'assigned handoff'],
      ['Check', 'omp-flow-check.toml', '.agents/skills/omp-flow-check/SKILL.md', 'assigned Review Concept'],
    ].map(([role, file, skill, output]) => ({
      name: `Codex ${role}`,
      harness: 'codex',
      canonical: ['templates', 'codex', 'agents', file],
      deployed: ['.codex', 'agents', file],
      skills: [skill],
      output,
    })),
    {
      name: 'Codex Architect',
      harness: 'codex',
      canonical: ['templates', 'codex', 'agents', 'omp-flow-architect.toml'],
      deployed: ['.codex', 'agents', 'omp-flow-architect.toml'],
      skills: [
        '.agents/skills/omp-flow-design/SKILL.md',
        '.agents/skills/omp-flow-decompose/SKILL.md',
      ],
      output: 'assigned output',
    },
    ...[
      ['Research', 'omp-flow-research.md', '.agents/skills/omp-flow-research/SKILL.md', 'assigned output'],
      ['QbD', 'omp-flow-qbd.md', '.agents/skills/omp-flow-qbd/SKILL.md', 'assigned audit output'],
      ['Implement', 'omp-flow-implement.md', '.agents/skills/omp-flow-implement/SKILL.md', 'assigned handoff'],
      ['Check', 'omp-flow-check.md', '.agents/skills/omp-flow-check/SKILL.md', 'assigned Review Concept'],
    ].map(([role, file, skill, output]) => ({
      name: `Claude ${role}`,
      harness: 'claude',
      canonical: ['templates', 'claude', 'agents', file],
      deployed: ['.claude', 'agents', file],
      skills: [skill],
      output,
    })),
    {
      name: 'Claude Architect',
      harness: 'claude',
      canonical: ['templates', 'claude', 'agents', 'omp-flow-architect.md'],
      deployed: ['.claude', 'agents', 'omp-flow-architect.md'],
      skills: [
        '.agents/skills/omp-flow-design/SKILL.md',
        '.agents/skills/omp-flow-decompose/SKILL.md',
      ],
      output: 'assigned output',
    },
  ];
  const nativeCardText: Record<string, string> = {};
  for (const card of nativeCardContracts) {
    const canonical = fs.readFileSync(path.join(sourceRoot, ...card.canonical), 'utf8');
    const deployed = fs.readFileSync(path.join(sourceRoot, ...card.deployed), 'utf8');
    nativeCardText[card.name] = canonical;
    check(canonical === deployed, `${card.name} canonical and repository deployment are byte-identical`);
    check(
      fs.readFileSync(path.join(root, ...card.deployed), 'utf8') === canonical,
      `${card.name} temporary installation is byte-identical`,
    );
    const loadedSkills = [...new Set(
      canonical.match(/\.agents\/skills\/omp-flow(?:-[a-z]+)?\/SKILL\.md/g) ?? [],
    )].sort();
    check(
      JSON.stringify(loadedSkills) === JSON.stringify([...card.skills].sort()),
      `${card.name} delegates through only its exact universal Skill path`,
    );
    check(
      card.skills.every(skill => normalizeContract(canonical).includes(`read \`${skill}\` completely and follow it`)),
      `${card.name} explicitly loads every selected universal Skill`,
    );
    if (card.output) {
      const normalized = normalizeContract(canonical);
      check(
        [
          'already dispatched',
          'cannot redispatch yourself',
          'calibrate human decisions',
          'transition the workflow',
          'exercise coordinator governance',
          'supplies the positive bounded',
          card.output,
        ].every(anchor => normalized.includes(anchor)),
        `${card.name} keeps the leaf no-authority boundary and delegates its positive bounded output`,
      );
    }
  }

  for (const name of ['OMP Architect', 'Codex Architect', 'Claude Architect']) {
    const architect = normalizeContract(nativeCardText[name]);
    check(
      [
        'Select exactly one Skill from the bounded assignment before role work',
        'For a Design assignment, read `.agents/skills/omp-flow-design/SKILL.md` completely and follow it',
        'For approved work mapping only after linked human QbD 1 approval, read `.agents/skills/omp-flow-decompose/SKILL.md` completely and follow it',
        'Stop if the assignment does not establish exactly one branch',
        'work mapping lacks the linked human approval',
      ].every(anchor => architect.includes(anchor)),
      `${name} selects exactly one Design-or-approved-Decompose branch and otherwise stops`,
    );
  }

  const ompRouter = normalizeContract(nativeCardText['OMP Router']);
  check(
    [
      'native Main orchestrator selected by this Harness',
      'Use native `task`',
      '`operation start` is the sole producer',
      'strict v1 `ompFlowDispatch` JSON as the first non-blank line',
      '`id` to the returned operation',
      'same actor ID',
      'Do not edit runtime/session operation records',
      'hard blocker',
    ].every(anchor => ompRouter.includes(anchor)),
    'OMP Router preserves native task, strict descriptor/actor/receipt/output, and fail-closed mechanics',
  );
  for (const card of nativeCardContracts.filter(card => card.harness === 'omp' && card.output)) {
    const contract = normalizeContract(nativeCardText[card.name]);
    check(
      contract.includes('tools:')
        && contract.includes('Do not spawn')
        && contract.includes('Require the task Bundle root')
        && contract.includes('actor ID')
        && contract.includes('receipt')
        && /Missing [^.]+(?:hard )?blocker/.test(contract),
      `${card.name} preserves tools, no-subagent, strict assignment/receipt/output, and fail-closed guards`,
    );
  }
  for (const card of nativeCardContracts.filter(card => card.harness === 'codex')) {
    const contract = normalizeContract(nativeCardText[card.name]);
    check(
      contract.includes('sandbox_mode = "workspace-write"')
        && contract.includes('Do not spawn')
        && contract.includes('actorId')
        && contract.includes('receipt')
        && contract.includes('multi_agent = false')
        && contract.includes('enabled = false')
        && /Missing [^.]+(?:hard )?blocker/.test(contract),
      `${card.name} preserves native identity, strict boundaries, multi-agent disablement, and fail-closed guards`,
    );
    check(
      contract.includes('first non-blank assignment line')
        && contract.includes('{"ompFlowDispatch":{...}}')
        && /Require its role to be `[a-z-]+`/.test(contract),
      `${card.name} checks the descriptor role at startup`,
    );
  }
  for (const card of nativeCardContracts.filter(card => card.harness === 'claude')) {
    const contract = normalizeContract(nativeCardText[card.name]);
    check(
      [
        'disallowedTools: Agent',
        'no `Agent` or `Task` tool',
        'first non-blank assignment line',
        '{"ompFlowDispatch":{...}}',
        '`bundle`',
        '`entry`',
        '`output`',
        '`actorId`',
        '`receipt`',
        '`predecessor`',
        'Require its role',
        'fail-closed requirements remain authoritative',
      ].every(anchor => contract.includes(anchor))
        && !contract.includes('omp-flow-claude-identity'),
      `${card.name} preserves tool/write, descriptor role, and fail-closed guards without an injected identity marker`,
    );
  }

  const thinNativeCards = Object.values(nativeCardText).join('\n');
  check(
    !/card's native\s+identity/.test(thinNativeCards),
    'no agent definition claims an identity guard that dispatch no longer enforces',
  );
  check(
    [
      /第一性锚定/,
      /主要矛盾/,
      /实践论/,
      /实事求是/,
      /Feynman|费曼/i,
      /strongest counter-evidence/i,
      /confirms?, revises?, or falsifies/i,
      /^#{1,2} (?:Workflow|Design Work|Work Mapping|Design and Work Mapping)$/m,
    ].every(pattern => !pattern.test(thinNativeCards)),
    'agent definitions contain no copied methodology or duplicated role-method sections',
  );
  check(
    [
      /\.omp\/skills\/|\.claude\/skills\//,
      /reader.?context|methodologyState|dialecticalState/i,
      /(?:methodology|dialectic|anchor|contradiction|evidence).{0,40}(?:descriptor|runtime state|state field)/i,
      /methodology parser|parse (?:the )?(?:methodology|anchor|contradiction)/i,
      /required (?:methodology )?(?:heading|checklist)/i,
      /prompt snapshot/i,
      /model (?:understands|comprehends)|cogniti(?:on|ve) guarantee/i,
    ].every(pattern => !pattern.test(thinNativeCards)),
    'agent definitions add no second Skill tree, methodology state/parser/checklist, prompt snapshot, or cognition guarantee',
  );

  const retiredPromptSemantics = [
    /missing or contradictory required evidence[^\n]*NEEDS_EVIDENCE[^\n]*never PASS/i,
    /FAIL,\s*NEEDS_EVIDENCE,\s*or human reject[^\n]*repair[^\n]*fresh independent audit/i,
    /FAIL\s*\/\s*NEEDS_EVIDENCE\s*->\s*repair\s*->\s*fresh audit/i,
  ];
  const affectedPrompts = [
    workflowContract,
    ...Object.values(sharedSkillText),
    ...Object.values(nativeCardText),
  ].join('\n');
  check(
    retiredPromptSemantics.every(pattern => !pattern.test(affectedPrompts)),
    'affected prompts omit generalized missing-evidence and automatic fresh-audit semantics',
  );
  check(
    !/accepted risk[^\n]{0,120}(?:permits|allows|lets)[^\n]{0,80}(?:FAIL|NEEDS_EVIDENCE)/i.test(affectedPrompts),
    'affected prompts do not turn accepted risk into an active-blocker bypass',
  );

  const deployedCore = fs.readdirSync(path.join(root, '.omp-flow', 'scripts', 'common')).sort();
  check(
    JSON.stringify(deployedCore) === JSON.stringify([
      '__init__.py',
      'io.py',
      'operation_store.py',
      'paths.py',
      'sleep_store.py',
      'task_store.py',
      'workscope.py',
    ]),
    `runtime kernel is minimal: ${deployedCore.join(', ')}`,
  );
  for (const legacy of [
    'workflow.py',
    'topology.py',
    'context.py',
    'reference.py',
    'gates.py',
    'evidence.py',
    'amend.py',
    'currency.py',
    'disposition.py',
  ]) {
    check(!fs.existsSync(path.join(root, '.omp-flow', 'scripts', 'common', legacy)), `${legacy} is retired`);
  }
  const codexHooks = JSON.parse(fs.readFileSync(path.join(root, '.codex', 'hooks.json'), 'utf8'));
  check(
    JSON.stringify(Object.keys(codexHooks.hooks).sort()) === JSON.stringify(['PreToolUse', 'SessionStart']),
    'Codex installs only SessionStart orientation and the apply_patch runtime guard',
  );
  for (const obsolete of [
    ['.agents', 'skills', 'flow-status', 'SKILL.md'],
    ['.omp-flow', 'scripts', 'common', 'flow_status.py'],
    ['.claude', 'hooks', 'flow-status-observe.py'],
    ['.claude', 'hooks', 'flow-status-task-update-guard.py'],
  ]) {
    check(!fs.existsSync(path.join(root, ...obsolete)), `fresh init excludes ${obsolete.join('/')}`);
  }
  runDestinationConfinementTests(check);
  const managedSkill = path.join(root, '.agents', 'skills', 'omp-flow-debug', 'SKILL.md');
  const originalSkill = fs.readFileSync(managedSkill, 'utf8');
  fs.writeFileSync(managedSkill, `${originalSkill}\n<!-- user change -->\n`, 'utf8');
  deployInitResources({ cwd: root, harnesses: ['codex'] });
  check(fs.readFileSync(managedSkill, 'utf8').includes('user change'), 'normal init preserves user Skill changes');
  deployInitResources({ cwd: root, harnesses: ['codex'], force: true });
  check(fs.readFileSync(managedSkill, 'utf8') === originalSkill, 'force init restores the managed Skill');
  const claudeSettings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
  check(!('UserPromptSubmit' in claudeSettings.hooks), 'Claude has no per-turn semantic state hook');
  const preToolUse = claudeSettings.hooks.PreToolUse as Array<{
    matcher: string;
    hooks: Array<{ command: string }>;
  }>;
  check(
    preToolUse.some(item => item.matcher === 'Write' && item.hooks[0]?.command.includes('protect-runtime.py'))
      && preToolUse.some(item => item.matcher === 'Edit' && item.hooks[0]?.command.includes('protect-runtime.py')),
    'Claude retains runtime write protection',
  );
  check(!JSON.stringify(claudeSettings).includes('flow-status'), 'Claude settings contain no status observers');
  check(
    !('SubagentStart' in claudeSettings.hooks)
      && !JSON.stringify(claudeSettings).includes('inject-agent-identity')
      && !fs.existsSync(path.join(root, '.claude', 'hooks', 'inject-agent-identity.py')),
    'Claude deployment has no SubagentStart identity hook',
  );
  for (const skill of ['omp-flow-debug', 'omp-flow-ui-designer', 'omp-flow-wiki', 'omp-flow-adr', 'omp-flow-restate', 'omp-flow-sleep']) {
    const canonical = fs.readFileSync(
      path.join(sourceRoot, 'templates', 'common', 'skills', skill, 'SKILL.md'),
      'utf8',
    );
    for (const harnessRoot of ['.agents', '.omp', '.claude']) {
      check(
        fs.readFileSync(path.join(sourceRoot, harnessRoot, 'skills', skill, 'SKILL.md'), 'utf8') === canonical,
        `${skill} is synchronized to ${harnessRoot}`,
      );
    }
    for (const harnessRoot of ['.agents', '.omp', '.claude']) {
      check(
        fs.readFileSync(path.join(root, harnessRoot, 'skills', skill, 'SKILL.md'), 'utf8') === canonical,
        `${skill} deploys identically to ${harnessRoot}`,
      );
    }
    if (skill === 'omp-flow-sleep') {
      check(
        ['ompFlowSleep', 'sourceReceipt', 'sourceTree', 'runOutput', 'candidateRoot', 'harvesterRevision']
          .every(required => canonical.includes(required)),
        'Sleep Skill requires the runtime-produced archived-source descriptor',
      );
      check(
        canonical.includes('Zero `--candidate` arguments is valid')
          && canonical.includes('Do not use embedding')
          && canonical.includes('not Wiki authority'),
        'Sleep Skill preserves zero-output, semantic-OKF, and promotion boundaries',
      );
    } else if (skill === 'omp-flow-adr') {
      check(
        ['decisions/<context>--<question>--<YYYY-MM-DD>.md', 'Do not number records', '## Confirmation', '`proposed`', 'An agent may accept a decision', 'A human must', '`rejected`', '`superseded`', 'MADR 4.0.0']
          .every(required => canonical.includes(required)),
        'ADR Skill defines placement, evidence-based agent acceptance with human escalation, and supersession',
      );
    } else if (skill === 'omp-flow-restate') {
      check(
        ['**Purpose:**', '**End state:**', '**Limits:**', 'teach-back', 'commander\'s intent', 'ISO 25964', 'term rule in the `omp-flow` router Skill', 'continue with the work in the same message']
          .every(required => canonical.includes(required)),
        'Restate Skill aligns on goal and problem with standard terms and without becoming a gate',
      );
    } else if (skill !== 'omp-flow-wiki') {
      check(
        ['Bundle root', 'entry Concept', 'output boundary', 'operation receipt']
          .every(required => canonical.includes(required)),
        `${skill} requires Bundle entry/output/receipt inputs`,
      );
      check(
        !/task\/row IDs|assigned row|row boundary|accepted context|context package|Python Evidence|downstream rows/i
          .test(canonical),
        `${skill} contains no retired row, context-pack, or Evidence consumer`,
      );
    }
  }
  const finishCanonical = fs.readFileSync(
    path.join(sourceRoot, 'templates', 'common', 'skills', 'omp-flow-finish', 'SKILL.md'),
  );
  const finishText = finishCanonical.toString('utf8').replace(/\s+/g, ' ');
  check(
    [
      'Normal `sleep start` delivery is primary',
      'capturing the complete',
      'through successful process completion',
      'parsing all',
      'requiring string `run.assignment`',
      'sole native assignment input',
      'including its trailing LF',
      'diagnostic only',
      'never copy or parse it',
      'prefix or suffix',
      'reconstruct or reserialize',
      'fall back to `sleep list`',
      'duplicate `sleep start`',
      'nonzero exit',
      'incomplete capture',
      'invalid JSON',
      'missing or',
      'stop before native dispatch',
    ].every(required => finishText.includes(required)),
    'Finish Skill specifies complete programmatic show recovery and fail-closed native forwarding',
  );
  for (const harnessRoot of ['.agents', '.omp', '.claude']) {
    check(
      fs.readFileSync(
        path.join(sourceRoot, harnessRoot, 'skills', 'omp-flow-finish', 'SKILL.md'),
      ).equals(finishCanonical),
      `omp-flow-finish is synchronized to ${harnessRoot}`,
    );
    check(
      fs.readFileSync(
        path.join(root, harnessRoot, 'skills', 'omp-flow-finish', 'SKILL.md'),
      ).equals(finishCanonical),
      `omp-flow-finish deploys identically to ${harnessRoot}`,
    );
  }

  console.log('--- Bundle scaffold and Explore spiral');
  const created = json<CreatedTask>(root, ['task', 'create', 'Semantic dogfood', '--slug', 'semantic-dogfood']);
  const taskRoot = created.taskDir;
  check(
    fs.readFileSync(path.join(taskRoot, 'index.md'), 'utf8')
      .includes('Update this map in the same change'),
    'Task Bundle index declares same-change map stewardship',
  );
  check(
    JSON.stringify(fs.readdirSync(taskRoot).sort()) === JSON.stringify(['brainstorm.md', 'index.md', 'task.md']),
    'new task has only the minimal Bundle seed',
  );
  check(fs.readFileSync(path.join(taskRoot, 'index.md'), 'utf8').includes('okf_version: "0.2"'), 'root declares OKF v0.2');
  for (const retired of [
    'task.json',
    'tasks.csv',
    'evidence.csv',
    'implement.jsonl',
    'check.jsonl',
    'context/index.json',
    '.task',
    '.summaries',
  ]) {
    check(!fs.existsSync(path.join(taskRoot, retired)), `scaffold omits ${retired}`);
  }

  fs.mkdirSync(path.join(taskRoot, 'research'), { recursive: true });
  fs.mkdirSync(path.join(taskRoot, 'work'), { recursive: true });
  fs.mkdirSync(path.join(taskRoot, 'review'), { recursive: true });
  fs.mkdirSync(path.join(taskRoot, 'qbd'), { recursive: true });
  writeConcept(
    path.join(taskRoot, 'research', 'cache-observation.md'),
    'Research',
    'Cache observation',
    'This evidence reframes the open question. Return to [brainstorm](../brainstorm.md).',
  );
  fs.appendFileSync(
    path.join(taskRoot, 'brainstorm.md'),
    '\nEvidence loop: [cache observation](research/cache-observation.md).\n',
    'utf8',
  );
  writeConcept(
    path.join(taskRoot, 'design.md'),
    'Technical Design',
    'Selected direction',
    'Derived from [the reframed question](brainstorm.md).',
  );
  writeConcept(
    path.join(taskRoot, 'qbd', 'human-decision.md'),
    'Human Decision',
    'Proceed with grouped work',
    'The human accepted [the selected design](../design.md).',
  );
  writeConcept(
    path.join(taskRoot, 'work', 'first-change.md'),
    'Work',
    'First descriptive change',
    'Implement [the selected design](../design.md).',
  );
  writeConcept(
    path.join(taskRoot, 'work', 'second-change.md'),
    'Work',
    'Second descriptive change',
    'Can run beside [the first change](first-change.md).',
  );
  writeConcept(
    path.join(taskRoot, 'work', 'index.md'),
    'Work Map',
    'Work grouping',
    'Parallel group: [first](first-change.md) and [second](second-change.md).',
  );
  fs.appendFileSync(
    path.join(taskRoot, 'index.md'),
    '\n- [Research](research/cache-observation.md)\n- [Design](design.md)\n'
      + '- [Human decision](qbd/human-decision.md)\n- [Grouped work](work/index.md)\n',
    'utf8',
  );
  check(
    fs.readFileSync(path.join(taskRoot, 'brainstorm.md'), 'utf8').includes('research/cache-observation.md'),
    'brainstorm and research are linked in both reasoning directions',
  );

  console.log('--- WorkScope, path, operation, review');
  execFileSync('git', ['init', '-q'], { cwd: root });
  const opened = json<{ taskId: string; workspaceRoot: string }>(root, [
    'task', 'open', created.taskId, '--workspace', root, '--replace',
  ]);
  check(
    opened.taskId === created.taskId && path.resolve(opened.workspaceRoot) === path.resolve(root),
    'explicit task open binds the Bundle to its validated workspace',
  );
  failure(root, ['task', 'show', '..'], 'Task path escapes task root');
  failure(
    root,
    ['operation', 'start', '--entry', '../other.md', '--output', 'src', '--role', 'executor', '--actor-id', 'x', '--objective', 'x'],
    'Path escapes repository root',
  );
  failure(
    root,
    ['operation', 'start', '--entry', 'work/missing.md', '--output', 'src', '--role', 'executor', '--actor-id', 'x', '--objective', 'x'],
    'Required entry Concept not found',
  );

  const implementation = json<Started>(root, [
    'operation', 'start',
    '--entry', 'work/first-change.md',
    '--output', `.omp-flow/tasks/${created.taskId}/work/first-handoff.md`,
    '--role', 'executor',
    '--actor-id', 'implementer-native-id',
    '--objective', 'Implement the first linked work',
    '--require-external-receipt',
  ]);
  const firstLine = implementation.assignment.split(/\r?\n/).find(line => line.trim())!;
  const descriptor = JSON.parse(firstLine).ompFlowDispatch;
  check(
    descriptor.receipt === implementation.operation.id
      && descriptor.actorId === 'implementer-native-id'
      && descriptor.entry.endsWith('/work/first-change.md'),
    'runtime produces a strict path-and-receipt assignment',
  );
  const claudeCards = [
    ['omp-flow-research.md', 'researcher', 'omp-flow-research'],
    ['omp-flow-architect.md', 'architect', 'omp-flow-architect'],
    ['omp-flow-qbd.md', 'qbd-auditor', 'omp-flow-qbd'],
    ['omp-flow-implement.md', 'executor', 'omp-flow-implement'],
    ['omp-flow-check.md', 'reviewer', 'omp-flow-check'],
  ] as const;
  check(
    Object.keys(JSON.parse(firstLine).ompFlowDispatch).sort().join(',') ===
      'actorId,bundle,entry,objective,output,predecessor,predecessorOutput,receipt,role,version',
    'operation assignment first line has the exact strict-v1 descriptor shape',
  );
  for (const [cardName, expectedRole, agentType] of claudeCards) {
    const canonicalCard = fs.readFileSync(
      path.join(sourceRoot, 'templates', 'claude', 'agents', cardName),
      'utf8',
    );
    const deployedCard = fs.readFileSync(path.join(root, '.claude', 'agents', cardName), 'utf8');
    check(canonicalCard === deployedCard, `${cardName} deploys byte-identically`);
    check(
      canonicalCard.includes('first non-blank assignment line')
        && canonicalCard.includes('{"ompFlowDispatch":{...}}')
        && canonicalCard.includes('Require its role')
        && canonicalCard.includes(`\`${expectedRole}\``)
        && ['bundle', 'entry', 'output', 'actorId', 'receipt', 'predecessor']
          .every(field => canonicalCard.includes(`\`${field}\``)),
      `${cardName} accepts and reads the operation-produced descriptor`,
    );
    check(
      canonicalCard.includes(`name: ${agentType}`)
        && !canonicalCard.includes('omp-flow-claude-identity')
        && !canonicalCard.includes('<!-- omp-flow-claude-dispatch:v1 -->'),
      `${cardName} is identified by its own card without injected or prompt markers`,
    );
  }
  const routerSkill = fs.readFileSync(
    path.join(sourceRoot, 'templates', 'common', 'skills', 'omp-flow', 'SKILL.md'),
    'utf8',
  );
  check(
    claudeCards.every(([, expectedRole, agentType]) =>
      routerSkill.includes(`| \`${expectedRole}\` | \`${expectedRole}\` | \`${agentType}\` |`))
      && !fs.readdirSync(path.join(sourceRoot, 'templates', 'common', 'skills')).some(name =>
        /native item `id`|id = actor_id = actorId/.test(
          fs.readFileSync(path.join(sourceRoot, 'templates', 'common', 'skills', name, 'SKILL.md'), 'utf8'),
        )),
    'shared Skills map each descriptor role to its native agent without requiring native id binding',
  );

  writeConcept(
    path.join(taskRoot, 'work', 'first-handoff.md'),
    'Implementation Handoff',
    'First change handoff',
    'Completed [the assigned work](first-change.md). Native implementation receipt recorded in the operation runtime.',
  );
  json<Operation>(root, [
    'operation', 'finish', implementation.operation.id,
    '--state', 'completed',
    '--actor-id', 'implementer-native-id',
    '--external-receipt', 'native-implementation-result',
  ]);
  failure(
    root,
    [
      'operation', 'start',
      '--entry', 'work/first-change.md',
      '--output', `.omp-flow/tasks/${created.taskId}/review/first-review.md`,
      '--role', 'reviewer',
      '--actor-id', 'implementer-native-id',
      '--objective', 'Review',
      '--predecessor', implementation.operation.id,
    ],
    'Independent review actor must differ',
  );
  const review = json<Started>(root, [
    'operation', 'start',
    '--entry', 'work/first-change.md',
    '--output', `.omp-flow/tasks/${created.taskId}/review/first-review.md`,
    '--role', 'reviewer',
    '--actor-id', 'reviewer-native-id',
    '--objective', 'Independently review the linked handoff and code',
    '--predecessor', implementation.operation.id,
  ]);
  check(
    review.operation.predecessor === implementation.operation.id
      && review.operation.actor_id !== implementation.operation.actor_id,
    'review receipt preserves predecessor correlation and actor independence',
  );
  failure(root, ['task', 'archive', created.taskId], 'Task has active runtime operations');
  writeConcept(
    path.join(taskRoot, 'review', 'first-review.md'),
    'Review',
    'Independent review',
    'PASS. Reviewed [the work](../work/first-change.md) and [handoff](../work/first-handoff.md).',
  );
  json<Operation>(root, [
    'operation', 'finish', review.operation.id,
    '--state', 'completed',
    '--actor-id', 'reviewer-native-id',
  ]);

  console.log('--- native OMP role/descriptor seam');
  const extension = new OMPFlowExtension(root);
  const managedRoles = [
    'architect',
    'executor',
    'explore',
    'oracle',
    'orchestrator',
    'planner',
    'qbd-auditor',
    'researcher',
    'reviewer',
  ];
  for (const role of managedRoles) {
    const actorId = `native-${role}`;
    const startArgs = [
      'operation', 'start',
      '--entry', 'work/first-change.md',
      '--output', `.omp-flow/tasks/${created.taskId}/adapter/${role}.md`,
      '--role', role,
      '--actor-id', actorId,
      '--objective', `Probe ${role} through the native adapter`,
    ];
    if (role === 'reviewer') {
      startArgs.push('--predecessor', implementation.operation.id);
    }
    const started = json<Started>(root, startArgs);
    const sessionManager = {
      getSessionId: () => 'test-session',
      taskDepth: 0,
    };
    const valid = extension.onToolCall({
      toolName: 'task',
      input: {
        agent: role,
        id: actorId,
        assignment: started.assignment,
      },
      sessionManager,
    });
    check(valid.block !== true, `${role} valid strict descriptor reaches native dispatch`);
    check(
      (valid.input as Record<string, unknown>).assignment === started.assignment,
      `${role} assignment is forwarded unchanged`,
    );
    const malformed = extension.onToolCall({
      toolName: 'task',
      input: {
        agent: role,
        id: actorId,
        assignment: 'not-a-descriptor',
      },
      sessionManager,
    });
    check(malformed.block === true, `${role} malformed descriptor fails closed`);
    const unboundNativeId = extension.onToolCall({
      toolName: 'task',
      input: {
        agent: role,
        id: `${role}-ui-label`,
        assignment: started.assignment,
      },
      sessionManager,
    });
    check(unboundNativeId.block !== true, `${role} native task id need not equal the descriptor actorId`);
    const wrongAgent = extension.onToolCall({
      toolName: 'task',
      input: {
        agent: role === 'reviewer' ? 'executor' : 'reviewer',
        id: actorId,
        assignment: started.assignment,
      },
      sessionManager,
    });
    check(wrongAgent.block === true, `${role} descriptor dispatched to a different native role fails closed`);
    json<Operation>(root, [
      'operation', 'finish', started.operation.id,
      '--state', 'failed',
      '--actor-id', actorId,
    ]);
  }
  const missingQbd = extension.onToolCall({
    toolName: 'task',
    input: {
      agent: 'qbd-auditor',
      id: 'native-qbd-missing',
    },
    sessionManager: {
      getSessionId: () => 'test-session',
      taskDepth: 0,
    },
  });
  check(missingQbd.block === true, 'qbd-auditor missing descriptor fails closed');

  console.log('--- duplicate side effect claim');
  const duplicateOne = json<Started>(root, [
    'operation', 'start',
    '--entry', 'work/second-change.md',
    '--output', `.omp-flow/tasks/${created.taskId}/work/second-handoff.md`,
    '--role', 'executor',
    '--actor-id', 'side-effect-one',
    '--objective', 'Claim one native side effect',
    '--require-external-receipt',
  ]);
  const duplicateTwo = json<Started>(root, [
    'operation', 'start',
    '--entry', 'work/second-change.md',
    '--output', `.omp-flow/tasks/${created.taskId}/work/second-handoff.md`,
    '--role', 'executor',
    '--actor-id', 'side-effect-two',
    '--objective', 'Attempt the same native side effect',
    '--require-external-receipt',
  ]);
  json<Operation>(root, [
    'operation', 'finish', duplicateOne.operation.id,
    '--state', 'completed',
    '--actor-id', 'side-effect-one',
    '--external-receipt', 'same-native-receipt',
  ]);
  failure(
    root,
    [
      'operation', 'finish', duplicateTwo.operation.id,
      '--state', 'completed',
      '--actor-id', 'side-effect-two',
      '--external-receipt', 'same-native-receipt',
    ],
    'External action receipt is already claimed',
  );
  json<Operation>(root, [
    'operation', 'finish', duplicateTwo.operation.id,
    '--state', 'failed',
    '--actor-id', 'side-effect-two',
  ]);

  console.log('--- Git boundary and archive');
  fs.mkdirSync(path.join(root, '.omp-flow', 'cache', 'repos', 'upstream'), { recursive: true });
  fs.writeFileSync(path.join(root, '.omp-flow', 'cache', 'repos', 'upstream', 'HEAD'), 'revision', 'utf8');
  const trackedStatus = execFileSync('git', ['status', '--short', '--', `.omp-flow/tasks/${created.taskId}`], {
    cwd: root,
    encoding: 'utf8',
  });
  check(trackedStatus.trim().length > 0, 'task Bundle changes are Git-visible');
  const ignored = execFileSync(
    'git',
    ['check-ignore', '.omp-flow/.runtime', '.omp-flow/cache/repos/upstream/HEAD'],
    { cwd: root, encoding: 'utf8' },
  );
  check(ignored.includes('.runtime') && ignored.includes('cache/repos'), 'runtime and clone cache are ignored');
  execFileSync('git', ['config', 'user.name', 'OMP Flow Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'omp-flow-test@example.invalid'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'test: checkpoint task before archive'], { cwd: root });
  const archive = json<ArchivedTask>(root, ['task', 'archive', created.taskId], null);
  check(
    !fs.existsSync(path.join(root, '.omp-flow', '.runtime', 'workscope.json')),
    'explicit archive clears the matching local WorkScope marker',
  );
  const archivedRoot = path.join(root, archive.archivedTo);
  check(fs.statSync(archivedRoot).isDirectory(), 'archive relocates the whole Bundle');
  check(
    fs.existsSync(path.resolve(path.dirname(path.join(archivedRoot, 'work', 'first-handoff.md')), 'first-change.md'))
      && fs.readFileSync(path.join(archivedRoot, 'review', 'first-review.md'), 'utf8').includes('../work/first-handoff.md'),
    'relative work/handoff/review navigation survives archive',
  );
  const archivedStatus = execFileSync('git', ['status', '--short', '--', archive.archivedTo], {
    cwd: root,
    encoding: 'utf8',
  });
  check(archivedStatus.trim().length > 0, 'archive relocation remains Git-visible');

  console.log('--- skill-driven Wiki Sleep');
  check(
    archive.sleepSource.ready
      && archive.sleepSource.archivedPath === archive.archivedTo
      && archive.sleepSource.sourceCommit.length === 40
      && archive.sleepSource.sourceTree.length === 40,
    'archive returns a reproducible archived-source receipt',
  );
  check(
    fs.existsSync(path.join(root, '.omp-flow', '.runtime', 'sleep', 'sources', `${archive.sleepSource.receipt}.json`)),
    'archive persists the opaque Sleep source under ignored runtime',
  );
  const sleepShowHelp = run(root, ['sleep', 'show', '--help']);
  check(
    sleepShowHelp.replace(/\s+/g, ' ').includes('active revised run contains its recoverable assignment'),
    'installed sleep show help identifies active assignment recovery',
  );
  failure(root, ['sleep', 'assignment'], 'invalid choice');
  const sleep = json<StartedSleep>(root, [
    'sleep', 'start',
    '--source', archive.sleepSource.receipt,
    '--actor-id', 'sleep-native-id',
  ]);
  const sleepFirstLine = sleep.assignment.split(/\r?\n/).find(line => line.trim())!;
  const sleepDescriptor = JSON.parse(sleepFirstLine).ompFlowSleep;
  check(
    sleepDescriptor.version === 1
      && sleepDescriptor.receipt === sleep.run.receipt
      && sleepDescriptor.sourceReceipt === archive.sleepSource.receipt
      && sleepDescriptor.sourceTask === archive.archivedTo
      && sleepDescriptor.actorId === 'sleep-native-id',
    'sleep start emits an exact archived-source assignment independent of the active Task',
  );
  check(
    fs.readFileSync(path.join(root, '.omp-flow', 'sleep', 'index.md'), 'utf8').includes('# Wiki Sleep')
      && fs.statSync(path.join(root, '.omp-flow', 'sleep', 'candidates')).isDirectory(),
    'sleep start bootstraps only the minimal Git-visible Sleep knowledge root',
  );
  for (const duplicateActor of ['sleep-native-id', 'another-sleep-actor']) {
    failure(
      root,
      ['sleep', 'start', '--source', archive.sleepSource.receipt, '--actor-id', duplicateActor],
      'Sleep run already exists',
    );
  }
  check(
    sleep.run.state === 'active'
      && typeof sleep.run.assignment === 'string'
      && sleep.run.assignment === sleep.assignment
      && sleep.assignment.endsWith('\n'),
    'sleep start returns one exact stored active assignment including its trailing LF',
  );
  const sleepRunFile = path.join(
    root,
    '.omp-flow',
    '.runtime',
    'sleep',
    'runs',
    `${sleep.run.receipt}.json`,
  );
  const activeRunBytes = fs.readFileSync(sleepRunFile);
  const persistedActive = JSON.parse(activeRunBytes.toString('utf8')) as SleepRun;
  check(
    persistedActive.assignment === sleep.assignment && persistedActive.state === 'active',
    'the installed runtime persists the assignment in the complete active record',
  );
  const capturedShow = spawnSync(
    python,
    [
      '-X',
      'utf8',
      path.join(root, '.omp-flow', 'scripts', 'omp_flow.py'),
      '--cwd',
      root,
      'sleep',
      'show',
      sleep.run.receipt,
    ],
    {
      cwd: root,
      env: { ...process.env, OMP_FLOW_CONTEXT_ID: 'test-session' },
    },
  );
  check(
    capturedShow.status === 0,
    `programmatic sleep show capture succeeds: ${capturedShow.stderr.toString('utf8')}`,
  );
  const showStdout = capturedShow.stdout;
  check(showStdout.at(-1) === 0x0a, 'programmatic sleep show capture reaches the final stdout LF');
  const shownActive = JSON.parse(showStdout.toString('utf8')) as SleepRun;
  check(
    typeof shownActive.assignment === 'string'
      && Buffer.from(shownActive.assignment, 'utf8').equals(Buffer.from(sleep.assignment, 'utf8')),
    'complete show JSON parse and run.assignment extraction recover the exact lost start bytes',
  );
  const soleNativeInput = shownActive.assignment;
  check(
    Buffer.from(soleNativeInput, 'utf8').equals(Buffer.from(sleep.assignment, 'utf8')),
    'the extracted string is unchanged as the sole native assignment input',
  );
  const listedActive = json<SleepRun[]>(root, ['sleep', 'list'])
    .find(runValue => runValue.receipt === sleep.run.receipt);
  check(
    listedActive?.assignment === sleep.assignment,
    'sleep list inspects the same stored active representation',
  );
  const repeatedShow = json<SleepRun>(root, ['sleep', 'show', sleep.run.receipt]);
  const repeatedList = json<SleepRun[]>(root, ['sleep', 'list'])
    .find(runValue => runValue.receipt === sleep.run.receipt);
  check(
    JSON.stringify(repeatedShow) === JSON.stringify(shownActive)
      && JSON.stringify(repeatedList) === JSON.stringify(listedActive)
      && fs.readFileSync(sleepRunFile).equals(activeRunBytes),
    'repeated installed show/list reads preserve bytes, state, timestamps, outputs, and assignment',
  );
  failure(
    root,
    ['sleep', 'finish', sleep.run.receipt, '--state', 'completed', '--actor-id', 'sleep-native-id'],
    'Sleep run receipt output is missing',
  );
  check(
    fs.readFileSync(sleepRunFile).equals(activeRunBytes),
    'rejected completed finish leaves the recoverable active record unchanged',
  );
  writeConcept(
    path.join(root, sleep.run.runOutput),
    'Sleep Run',
    'Archived Task knowledge harvest',
    `Read [the archived Task](../../../../tasks/archive/${path.basename(path.dirname(archive.archivedTo))}/${created.taskId}/index.md).`,
  );
  failure(
    root,
    [
      'sleep', 'finish', sleep.run.receipt,
      '--state', 'completed',
      '--actor-id', 'sleep-native-id',
      '--candidate', 'missing.md',
    ],
    'Sleep candidate Markdown not found',
  );
  check(
    fs.readFileSync(sleepRunFile).equals(activeRunBytes),
    'rejected Candidate validation preserves the active assignment',
  );
  const candidateRelative = 'exported-symbol-change-safety.md';
  const candidateFile = path.join(root, sleep.run.candidateRoot, candidateRelative);
  writeConcept(
    candidateFile,
    'Wiki Sleep Candidate',
    'Exported symbol change safety',
    `Supported by [the archived Review](../../tasks/archive/${path.basename(path.dirname(archive.archivedTo))}/${created.taskId}/review/first-review.md).`,
  );
  const archivedTaskFile = path.join(archivedRoot, 'task.md');
  const archivedTaskText = fs.readFileSync(archivedTaskFile, 'utf8');
  fs.appendFileSync(archivedTaskFile, '\nsource drift\n', 'utf8');
  failure(
    root,
    [
      'sleep', 'finish', sleep.run.receipt,
      '--state', 'completed',
      '--actor-id', 'sleep-native-id',
      '--candidate', candidateRelative,
    ],
    'Archived Sleep source has drifted',
  );
  check(
    fs.readFileSync(sleepRunFile).equals(activeRunBytes),
    'rejected source validation preserves the active assignment',
  );
  fs.writeFileSync(archivedTaskFile, archivedTaskText, 'utf8');
  const completedSleep = json<SleepRun>(root, [
    'sleep', 'finish', sleep.run.receipt,
    '--state', 'completed',
    '--actor-id', 'sleep-native-id',
    '--candidate', candidateRelative,
  ]);
  check(
    completedSleep.state === 'completed'
      && completedSleep.candidates.length === 1
      && completedSleep.candidates[0].endsWith(`/candidates/${candidateRelative}`)
      && completedSleep.assignment === undefined,
    'sleep finish accepts a real Run handoff and removes the active assignment',
  );
  const shownCompleted = json<SleepRun>(root, ['sleep', 'show', sleep.run.receipt]);
  const listedCompleted = json<SleepRun[]>(root, ['sleep', 'list'])
    .find(runValue => runValue.receipt === sleep.run.receipt);
  check(
    shownCompleted.assignment === undefined
      && listedCompleted?.assignment === undefined
      && (JSON.parse(fs.readFileSync(sleepRunFile, 'utf8')) as SleepRun).assignment === undefined,
    'installed show, list, and persisted terminal record expose no assignment',
  );
  for (const duplicateActor of ['sleep-native-id', 'another-sleep-actor']) {
    failure(
      root,
      ['sleep', 'start', '--source', archive.sleepSource.receipt, '--actor-id', duplicateActor],
      'Sleep run already exists',
    );
  }
  failure(
    root,
    ['sleep', 'finish', sleep.run.receipt, '--state', 'completed', '--actor-id', 'sleep-native-id'],
    'Sleep run is already terminal',
  );

  const uncheckpointed = json<CreatedTask>(root, [
    'task', 'create', 'Uncheckpointed Sleep source', '--slug', 'uncheckpointed-sleep-source',
  ]);
  const uncheckpointedArchive = json<ArchivedTask>(root, ['task', 'archive', uncheckpointed.taskId]);
  check(
    uncheckpointed.taskId !== created.taskId
      && !uncheckpointedArchive.sleepSource.ready
      && Boolean(uncheckpointedArchive.sleepSource.reason)
      && fs.statSync(path.join(root, uncheckpointedArchive.archivedTo)).isDirectory(),
    'archive succeeds but reports Sleep unavailable when no reproducible Task checkpoint exists',
  );

  console.log('--- update and Hook boundary');
  const plan = analyzeChanges(root, loadHashes(root));
  check(plan.every(item => item.status === 'unchanged'), 'fresh install is unchanged under update analysis');

  const migrationRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-migration-')));
  fs.cpSync(root, migrationRoot, { recursive: true });
  for (const fileName of workflowLibraryFiles) {
    fs.rmSync(path.join(migrationRoot, '.omp-flow', 'workflow', fileName), { force: true });
  }
  fs.rmSync(path.join(migrationRoot, '.omp-flow', '.template-hashes.json'), { force: true });
  const migrationPlan = analyzeChanges(migrationRoot, {});
  check(
    workflowLibraryFiles.every(fileName => {
      const item = migrationPlan.find(
        candidate => candidate.relativePath === `.omp-flow/workflow/${fileName}`,
      );
      return item?.status === 'new' && item.action === 'create';
    }),
    'legacy project update creates missing Workflow Library files',
  );
  executeUpdate(migrationRoot, migrationPlan, {});
  check(
    workflowLibraryFiles.every(fileName =>
      fs.statSync(path.join(migrationRoot, '.omp-flow', 'workflow', fileName)).isFile(),
    ),
    'legacy project update writes every missing Workflow Library file',
  );
  check(
    !fs.existsSync(path.join(migrationRoot, '.omp-flow', 'workflow.md')),
    'migration does not install the retired root Workflow',
  );
  const retiredHook = '.claude/hooks/inject-agent-identity.py';
  const retiredHookText = '# retired identity hook\n';
  fs.mkdirSync(path.join(migrationRoot, '.claude', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(migrationRoot, retiredHook), retiredHookText);
  saveHashes(migrationRoot, { ...loadHashes(migrationRoot), [retiredHook]: computeHash(retiredHookText) });
  const retiredPlan = analyzeChanges(migrationRoot, loadHashes(migrationRoot));
  check(
    retiredPlan.find(item => item.relativePath === retiredHook)?.action === 'delete',
    'update plans deletion of the unmodified retired Claude identity hook',
  );
  executeUpdate(migrationRoot, retiredPlan, loadHashes(migrationRoot));
  check(!fs.existsSync(path.join(migrationRoot, retiredHook)), 'update removes the retired Claude identity hook');
  const guard = spawnSync(
    python,
    ['-X', 'utf8', path.join(root, '.claude', 'hooks', 'protect-runtime.py')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: path.join(root, '.omp-flow', '.runtime', 'operations', 'forbidden.json') },
      }),
    },
  );
  check(guard.status === 0 && guard.stdout.includes('"permissionDecision": "deny"'), 'Claude denies direct runtime writes');
  const conceptWrite = spawnSync(
    python,
    ['-X', 'utf8', path.join(root, '.claude', 'hooks', 'protect-runtime.py')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: path.join(archivedRoot, 'new-concept.md') },
      }),
    },
  );
  check(conceptWrite.status === 0 && conceptWrite.stdout === '', 'Claude allows normal Bundle Concept writes');
  const configGuard = spawnSync(
    python,
    ['-X', 'utf8', path.join(root, '.claude', 'hooks', 'protect-runtime.py')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: '' },
      input: JSON.stringify({
        cwd: root,
        tool_name: 'MultiEdit',
        tool_input: { file_path: '.omp-flow/config.json' },
      }),
    },
  );
  check(
    configGuard.status === 0 && configGuard.stdout.includes('"permissionDecision": "deny"'),
    'Claude denies MultiEdit on .omp-flow/config.json using payload cwd fallback',
  );
  for (const skillDir of fs.readdirSync(path.join(sourceRoot, 'templates', 'common', 'skills'))) {
    const skillFile = path.join(sourceRoot, 'templates', 'common', 'skills', skillDir, 'SKILL.md');
    if (fs.statSync(skillFile).isFile()) {
      const content = fs.readFileSync(skillFile, 'utf8');
      check(
        /^description:\s+Use when\b/m.test(content),
        `${skillDir} uses SDO trigger-only description`,
      );
    }
  }
  check(
    fs.readFileSync(path.join(sourceRoot, 'templates', '.omp-flow', 'workflow', 'index.md'), 'utf8')
      .includes('## Progression and Session Roles'),
    'Workflow index includes Progression and Session Roles spine',
  );

  console.log('--- frontmatter single-source-of-truth indexing');
  fs.mkdirSync(path.join(root, '.omp-flow', 'wiki', 'runbooks'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.omp-flow', 'wiki', 'runbooks', 'incident-drill.md'),
    [
      '---',
      'type: "Runbook"',
      'title: "Incident drill SOP"',
      'description: "Step-by-step recovery drill for non-TTY hangs."',
      'tags: ["ops", "recovery"]',
      '---',
      '',
      '# Incident drill SOP',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(root, '.omp-flow', 'wiki', 'runbooks', 'legacy-drill.md'),
    [
      '---',
      'type: "Runbook"',
      'title: "Retired drill"',
      'description: "Superseded by Incident drill SOP."',
      'tags: ["legacy"]',
      'status: "deprecated"',
      '---',
      '',
      '# Retired drill',
    ].join('\n'),
    'utf8',
  );
  const questionDir = path.join(root, '.omp-flow', 'wiki', 'decisions');
  fs.mkdirSync(questionDir, { recursive: true });
  for (const [file, title, status] of [
    ['dispatch--native-binding--2026-07-11.md', 'Native binding: strict', 'superseded'],
    ['dispatch--native-binding--2026-10-27.md', 'Native binding: role only', 'proposed'],
    ['dispatch--native-binding--2026-10-28.md', 'Native binding: per-harness ids', 'rejected'],
    ['dispatch--record-format--2026-10-27.md', 'Record format: minimal', 'accepted'],
  ] as const) {
    fs.writeFileSync(
      path.join(questionDir, file),
      ['---', 'type: "ADR"', `title: "${title}"`, 'description: "Decision record."', `status: "${status}"`, '---', '', `# ${title}`].join('\n'),
      'utf8',
    );
  }
  const archivedDir = path.join(root, '.omp-flow', 'wiki', 'archive', '2026-10-27--replaced', 'runbooks');
  fs.mkdirSync(archivedDir, { recursive: true });
  fs.writeFileSync(
    path.join(archivedDir, 'moved-without-status.md'),
    ['---', 'type: "Runbook"', 'title: "Moved drill"', 'description: "Moved but status not updated."', '---', '', '# Moved drill'].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(archivedDir, 'old-drill.md'),
    ['---', 'type: "Runbook"', 'title: "Old drill"', 'description: "Archived drill."', 'status: "archived"', '---', '', '# Old drill'].join('\n'),
    'utf8',
  );
  const indexed = json<{ target: string; updated: string[] }>(root, ['index', 'all']);
  check(
    indexed.updated.includes('.omp-flow/wiki/runbooks/index.md')
      && indexed.updated.includes('.omp-flow/wiki/index.md'),
    'index all discovers custom Wiki domains and regenerates domain + root maps',
  );
  const runbooksIndex = fs.readFileSync(path.join(root, '.omp-flow', 'wiki', 'runbooks', 'index.md'), 'utf8');
  check(
    runbooksIndex.includes('[Incident drill SOP](incident-drill.md) `[type:Runbook, ops, recovery]` — Step-by-step recovery drill for non-TTY hangs')
      && runbooksIndex.includes('## Inactive')
      && runbooksIndex.includes('[Retired drill](legacy-drill.md) `[type:Runbook, deprecated, legacy]`'),
    'generated domain index renders open-set type badges, tags, descriptions, and deprecated section',
  );
  const decisionsIndex = fs.readFileSync(path.join(root, '.omp-flow', 'wiki', 'decisions', 'index.md'), 'utf8');
  const [decisionsActive, decisionsInactive = ''] = decisionsIndex.split('## Inactive');
  const wikiRoot = fs.readFileSync(path.join(root, '.omp-flow', 'wiki', 'index.md'), 'utf8');
  check(
    decisionsActive.includes('[Native binding: role only](dispatch--native-binding--2026-10-27.md) `[type:ADR, proposed]`')
      && decisionsInactive.includes('[Native binding: strict](dispatch--native-binding--2026-07-11.md) `[type:ADR, superseded]`')
      && decisionsInactive.includes('[Native binding: per-harness ids](dispatch--native-binding--2026-10-28.md) `[type:ADR, rejected]`')
      && decisionsActive.includes('[Record format: minimal](dispatch--record-format--2026-10-27.md) `[type:ADR]`')
      && !decisionsActive.includes('Native binding: strict')
      && !decisionsActive.includes('per-harness ids')
      && wikiRoot.includes('[Decision Records](decisions/index.md) `[2]`')
      && !wikiRoot.includes('Native binding: role only')
      && !wikiRoot.includes('Record format: minimal')
      && !wikiRoot.includes('Native binding: strict')
      && !wikiRoot.includes('per-harness ids')
      && wikiRoot.includes('[Archive](archive/index.md) `[0]`')
      && !wikiRoot.includes('Old drill')
      && !wikiRoot.includes('Moved drill'),
    'decision and archived statuses stay out of the active Wiki map, and the root map lists decisions by count only',
  );

  console.log(`PASS: ${checks} focused checks`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
