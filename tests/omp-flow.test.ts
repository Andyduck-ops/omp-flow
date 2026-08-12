import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { renderCliBanner, supportsBannerColor } from '../src/cli/banner.js';
import { deployInitResources, getManagedResources } from '../src/cli/init.js';
import { analyzeChanges } from '../src/cli/update.js';
import { loadHashes } from '../src/cli/template-hash.js';
import { OMPFlowExtension } from '../src/omp/extension.js';
import { runFlowStatusSetupTests } from './flow-status-v2-setup.test.js';
import { runFlowStatusV2PublisherTests } from './flow-status-v2-publisher.test.js';
import { runFlowStatusV2SupervisorTests } from './flow-status-v2-supervisor.test.js';
import { runCodexInitTests } from './codex-init.test.js';
import { runInitCLITests } from './init-cli.test.js';
import { runLearnTests } from './learn.test.js';
import { runOMPFlowStatusTests } from './omp-flow-status.test.js';
import { runSnowCursorManagedResourceTests } from './snow-cursor-managed-resources.test.js';

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
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-okf-'));
try {
  console.log('--- cli banner');
  const wideBanner = [
    ' █████  ██   ██ ██████              ███████ ██       █████  ██   ██',
    '██   ██ ███ ███ ██   ██             ██      ██      ██   ██ ██   ██',
    '██   ██ ██ █ ██ ██████     ━━◆━━    ██████  ██      ██   ██ ██ █ ██',
    '██   ██ ██   ██ ██                  ██      ██      ██   ██ ███ ███',
    ' █████  ██   ██ ██                  ██      ███████  █████   ██ ██ ',
    '          agent-native workflow orchestration',
  ].join('\n');
  const mediumBanner = [
    '▄▀▀▄ █▄ ▄█ █▀▀▄         █▀▀ █    ▄▀▀▄ █   █',
    '█  █ █ █ █ █▄▄▀  ━━◆━━  █▀  █    █  █ █ █ █',
    ' ▀▀  █   █ █            █   █▄▄   ▀▀   ▀▄▀ ',
    '          agent-native workflow orchestration',
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
  runLearnTests(check);
  await runSnowCursorManagedResourceTests(check);
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

  console.log('--- install');
  deployInitResources({ cwd: root, harnesses: ['omp', 'codex', 'claude'] });
  const resources = getManagedResources(['omp', 'codex', 'claude']);
  check(resources.length > 0, 'managed resources are declared');
  for (const resource of resources) {
    check(fs.statSync(path.join(root, resource.destinationPath)).isFile(), `deployed ${resource.destinationPath}`);
  }

  console.log('--- shared responsibility and native delegation contracts');
  const workflowContract = fs.readFileSync(
    path.join(sourceRoot, 'templates', '.omp-flow', 'workflow.md'),
    'utf8',
  );
  check(
    fs.readFileSync(path.join(root, '.omp-flow', 'workflow.md'), 'utf8') === workflowContract,
    'Workflow temporary installation is byte-identical',
  );

  const sharedSkillNames = [
    'omp-flow',
    'omp-flow-brainstorm',
    'omp-flow-research',
    'omp-flow-design',
    'omp-flow-qbd',
    'omp-flow-decompose',
    'omp-flow-implement',
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

  const responsibilityContracts = [
    {
      name: 'Workflow',
      text: workflowContract,
      anchors: ['provisional first-principles anchor（第一性锚定）'],
      responsibilities: ['concrete problem, irreducible outcome', 'evidence that would revise it'],
    },
    {
      name: 'Router',
      text: sharedSkillText['omp-flow'],
      anchors: ['principal contradiction（主要矛盾）'],
      responsibilities: ['preserve the current concrete decision', 'do not pre-commit a hypothetical mechanism'],
    },
    {
      name: 'Brainstorm',
      text: sharedSkillText['omp-flow-brainstorm'],
      anchors: ['first-principles anchor（第一性锚定）', 'principal contradiction（主要矛盾）'],
      responsibilities: ['concrete actors and action', 'evidence that would revise the framing'],
    },
    {
      name: 'Research',
      text: sharedSkillText['omp-flow-research'],
      anchors: ['principal contradiction'],
      responsibilities: [
        'test the framing against practice',
        'distinguish what evidence proves, does not prove, and merely makes possible',
        'Brainstorm-return signal',
      ],
    },
    {
      name: 'Design',
      text: sharedSkillText['omp-flow-design'],
      anchors: ['evidenced principal contradiction'],
      responsibilities: [
        'concrete causal purpose in plain language',
        'assigned PRD/Design/decision/interface outputs',
      ],
    },
    {
      name: 'QbD',
      text: sharedSkillText['omp-flow-qbd'],
      anchors: ['current principal contradiction'],
      responsibilities: [
        'reconstruct the concrete problem without solution jargon',
        'preserve the mechanical safety analysis',
        'assigned audit Concept',
      ],
    },
    {
      name: 'Decompose',
      text: sharedSkillText['omp-flow-decompose'],
      anchors: ['linked human QbD 1 approval'],
      responsibilities: [
        'bounded, independently reviewable work Concepts',
        'authored prose execution view',
      ],
    },
    {
      name: 'Implement',
      text: sharedSkillText['omp-flow-implement'],
      anchors: ['return the approved Design to practice'],
      responsibilities: ['code, execution, and real verification', 'Design-return signal', 'assigned handoff'],
    },
    {
      name: 'Check',
      text: sharedSkillText['omp-flow-check'],
      anchors: ['principal-problem framing'],
      responsibilities: ['intended work/Design consequence', 'practice result', 'assigned Review Concept'],
    },
  ];
  const normalizeContract = (text: string): string => text.replace(/\s+/g, ' ').trim();
  const hasResponsibilityCoupling = (
    text: string,
    anchors: string[],
    responsibilities: string[],
  ): boolean => {
    const normalized = normalizeContract(text);
    return anchors.every(anchor => normalized.includes(anchor))
      && responsibilities.every(responsibility => normalized.includes(responsibility));
  };
  for (const { name, text, anchors, responsibilities } of responsibilityContracts) {
    check(
      hasResponsibilityCoupling(text, anchors, responsibilities),
      `${name} couples its named anchors to the responsibility that owns them`,
    );
    const withoutResponsibilities = responsibilities.reduce(
      (mutant, responsibility) => mutant.replaceAll(responsibility, ''),
      normalizeContract(text),
    );
    check(
      !hasResponsibilityCoupling(withoutResponsibilities, anchors, responsibilities),
      `${name} contract rejects a bare philosophy vocabulary list`,
    );
    const withoutAnchors = anchors.reduce(
      (mutant, anchor) => mutant.replaceAll(anchor, ''),
      normalizeContract(text),
    );
    check(
      !hasResponsibilityCoupling(withoutAnchors, anchors, responsibilities),
      `${name} contract rejects responsibility prose with its required anchor erased`,
    );
  }

  const dualContextContracts = [
    {
      name: 'Research',
      skill: 'omp-flow-research',
      positive: [
        'complete bounded Research responsibility and assigned output',
        'test the framing against practice',
        'Brainstorm-return signal',
      ],
    },
    {
      name: 'Design',
      skill: 'omp-flow-design',
      positive: [
        'complete bounded Design responsibility and assigned PRD/Design/decision/interface outputs',
        'concrete causal purpose in plain language',
      ],
    },
    {
      name: 'QbD',
      skill: 'omp-flow-qbd',
      positive: [
        'complete bounded independent audit and assigned audit Concept',
        'report the required verdict, findings, evidence, and contradictions through that output boundary',
      ],
    },
    {
      name: 'Decompose',
      skill: 'omp-flow-decompose',
      positive: [
        'complete bounded Decompose responsibility and assigned work outputs',
        'bounded, independently reviewable work Concepts and an authored prose execution view',
      ],
    },
    {
      name: 'Implement',
      skill: 'omp-flow-implement',
      positive: [
        'complete bounded implementation and assigned handoff',
        'Design-return signal',
      ],
    },
    {
      name: 'Check',
      skill: 'omp-flow-check',
      positive: [
        'complete bounded independent Review and assigned Review Concept',
        'principal-problem framing through that output',
      ],
    },
  ];
  for (const { name, skill, positive } of dualContextContracts) {
    const contract = normalizeContract(sharedSkillText[skill]);
    const authorityBoundary = contract.toLowerCase();
    check(
      [
        'only main/coordinator may dispatch',
        'correlate operations/receipts',
        'obtain or record human calibration',
        'choose a workflow transition',
        'inapplicable to an already-dispatched',
        'must not dispatch or self-redispatch',
        'govern',
        'calibrate',
        'transition',
      ].every(anchor => authorityBoundary.includes(anchor)),
      `${name} denies coordinator authority and self-redispatch to its already-dispatched leaf`,
    );
    check(
      positive.every(anchor => contract.includes(anchor)),
      `${name} retains its positive bounded leaf duty and assigned output or return signal`,
    );
  }

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
  }
  for (const card of nativeCardContracts.filter(card => card.harness === 'claude')) {
    const contract = normalizeContract(nativeCardText[card.name]);
    check(
      [
        'tools:',
        'no `Agent` or `Task` tool',
        'first non-blank assignment line',
        '{"ompFlowDispatch":{...}}',
        '`bundle`',
        '`entry`',
        '`output`',
        '`actorId`',
        '`receipt`',
        '`predecessor`',
        '<!-- omp-flow-claude-identity:v1 -->',
        'non-empty native `agentId`',
        '<!-- omp-flow-claude-binding-request:v1 -->',
        'TaskUpdate` object unchanged',
        'same immutable `flowStatusBindingV1` plus one closed `flowStatusProgressV1`',
        'never set status, owner again, dependencies, subject, description, or another Task',
        'write and progress boundaries',
        'fail-closed requirements remain authoritative',
      ].every(anchor => contract.includes(anchor)),
      `${card.name} preserves startup, binding, progress, tool/write, descriptor, and fail-closed guards`,
    );
  }

  const thinNativeCards = Object.values(nativeCardText).join('\n');
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
    'native cards contain no copied methodology or duplicated role-method sections',
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
    'native cards add no second Skill tree, methodology state/parser/checklist, prompt snapshot, or cognition guarantee',
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
      'active_task.py',
      'flow_status.py',
      'io.py',
      'operation_store.py',
      'paths.py',
      'sleep_store.py',
      'task_store.py',
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
  const flowStatusSkill = fs.readFileSync(
    path.join(sourceRoot, 'templates', 'common', 'skills', 'flow-status', 'SKILL.md'),
    'utf8',
  );
  check(
    fs.readFileSync(path.join(root, '.agents', 'skills', 'flow-status', 'SKILL.md'), 'utf8') === flowStatusSkill
      && !fs.existsSync(path.join(root, '.codex', 'skills', 'flow-status', 'SKILL.md')),
    'flow-status deploys only through the universal .agents Skill root for Codex',
  );
  check(
    !fs.existsSync(path.join(root, '.omp', 'skills', 'flow-status', 'SKILL.md'))
      && !fs.existsSync(path.join(root, '.claude', 'skills', 'flow-status', 'SKILL.md')),
    'flow-status does not claim an OMP or Claude Skill surface',
  );
  check(
    !flowStatusSkill.includes('tui.status_line')
      || flowStatusSkill.includes('Do not') && flowStatusSkill.includes('read-only'),
    'flow-status makes no persistent Codex footer claim',
  );
  runFlowStatusV2PublisherTests(root, check);
  await runFlowStatusV2SupervisorTests(check);
  execFileSync(python, ['-X', 'utf8', path.join(sourceRoot, 'tests', 'flow-status-v2.test.py'), root], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  execFileSync(python, ['-X', 'utf8', path.join(sourceRoot, 'tests', 'flow-status-v2-detail.test.py'), root], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  execFileSync(python, ['-X', 'utf8', path.join(sourceRoot, 'tests', 'flow-status.test.py'), root], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['--test', path.join(sourceRoot, 'tests', 'flow-status-v2-render.test.mjs')], {
    cwd: sourceRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  execFileSync(
    process.execPath,
    [path.join(sourceRoot, 'tests', 'flow-status-v2-archive-finalization.test.mjs'), '--mode', 'auto'],
    {
      cwd: sourceRoot,
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );
  execFileSync(python, ['-X', 'utf8', path.join(sourceRoot, 'tests', 'claude-flow-status.test.py')], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  runOMPFlowStatusTests(root, check);
  runFlowStatusSetupTests(root, check);
  const ompObserveNow = Date.now();
  const ompObserve = spawnSync(
    python,
    [
      '-X', 'utf8',
      path.join(root, '.omp-flow', 'scripts', 'omp_flow.py'),
      '--cwd', root,
      'status', 'observe',
      '--host', 'oh-my-pi',
      '--session', 'typescript-omp-session',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {},
      input: JSON.stringify({
        version: 1,
        taskSet: {
          state: 'available',
          evidence: {
            capability: 'ompTaskBatchV1',
            piVersion: '17.2.1',
            upstreamRevision: '7a2ced50bea8b97dbab7d9bd579329c4ea704de0',
            toolCallId: 'typescript-task-call',
            adapterSequence: 1,
          },
          sourceId: 'typescript-omp-tasks',
          repositoryRoot: root,
          hostSessionId: 'typescript-omp-session',
          taskSetId: 'typescript-task-set',
          membershipRevision: 'typescript-membership-1',
          completeness: 'complete',
          observedAtUnixMs: ompObserveNow,
          maxAgeMs: 30_000,
          members: [
            { taskId: 'task-0', label: 'TypeScript caller', state: 'active' },
          ],
          currentTaskId: 'task-0',
        },
        assignment: null,
        progress: null,
        attention: [],
      }),
    },
  );
  const ompObserveJson = JSON.parse(ompObserve.stdout);
  check(
    ompObserve.status === 0
      && ompObserveJson.state === 'stored'
      && ompObserveJson.snapshot.scope.host === 'oh-my-pi',
    `TypeScript Oh My Pi caller uses stdin observation boundary: ${ompObserve.stderr}`,
  );
  const managedFlowStatus = path.join(root, '.agents', 'skills', 'flow-status', 'SKILL.md');
  fs.writeFileSync(managedFlowStatus, `${flowStatusSkill}\n<!-- user change -->\n`, 'utf8');
  deployInitResources({ cwd: root, harnesses: ['codex'] });
  check(
    fs.readFileSync(managedFlowStatus, 'utf8').includes('user change'),
    'normal init preserves a modified flow-status Skill',
  );
  deployInitResources({ cwd: root, harnesses: ['codex'], force: true });
  check(
    fs.readFileSync(managedFlowStatus, 'utf8') === flowStatusSkill,
    'force init intentionally restores the managed flow-status Skill',
  );
  const claudeSettings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
  check(!('UserPromptSubmit' in claudeSettings.hooks), 'Claude has no per-turn semantic state hook');
  const preToolUse = claudeSettings.hooks.PreToolUse as Array<{
    matcher: string;
    hooks: Array<{ command: string }>;
  }>;
  check(
    preToolUse.some(item => item.matcher === 'Write' && item.hooks[0]?.command.includes('protect-runtime.py'))
      && preToolUse.some(item => item.matcher === 'Edit' && item.hooks[0]?.command.includes('protect-runtime.py'))
      && preToolUse.some(item => item.matcher === 'TaskUpdate'
        && item.hooks[0]?.command.includes('flow-status-task-update-guard.py'))
      && preToolUse.some(item => item.matcher === 'AskUserQuestion|Elicitation'
        && item.hooks[0]?.command.includes('flow-status-observe.py')),
    'Claude protects runtime writes and guards only the managed TaskUpdate/attention boundaries',
  );
  check(
    claudeSettings.hooks.PostToolUse.length === 1
      && claudeSettings.hooks.PostToolUse[0].matcher
        === 'TaskList|TaskCreate|TaskUpdate|AskUserQuestion|Elicitation'
      && claudeSettings.hooks.PostToolUse[0].hooks.length === 1
      && claudeSettings.hooks.PostToolUse[0].hooks[0].command.includes('flow-status-observe.py'),
    'Claude observes structured task and correlated attention results for Flow Status',
  );
  for (const skill of ['omp-flow-debug', 'omp-flow-ui-designer', 'omp-flow-wiki', 'omp-flow-sleep']) {
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

  console.log('--- session, path, operation, review');
  const current = json<{ taskId: string }>(root, ['task', 'current']);
  check(current.taskId === created.taskId, 'creation selects the Bundle for the current session');
  const other = json<CreatedTask>(root, ['task', 'create', 'Other session', '--slug', 'other-session'], 'other');
  check(
    json<{ taskId: string }>(root, ['task', 'current'], 'other').taskId === other.taskId
      && json<{ taskId: string }>(root, ['task', 'current']).taskId === created.taskId,
    'active task selection is session isolated',
  );
  const localSelection = json<{ taskId: string; contextKey: string }>(
    root,
    ['task', 'select', created.taskId],
    null,
  );
  check(
    localSelection.taskId === created.taskId && localSelection.contextKey.startsWith('local-'),
    'task selection remains available when a Harness shell exposes no session identity',
  );
  check(
    json<{ taskId: string }>(root, ['task', 'current'], null).taskId === created.taskId,
    'the repository-local terminal lane reads back its selected task',
  );
  check(
    json<Operation[]>(root, ['operation', 'list', '--task', created.taskId], 'other').length === 0,
    'an explicit task takes precedence over another selected task',
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
      canonicalCard.includes('<!-- omp-flow-claude-identity:v1 -->')
        && canonicalCard.includes(`agentType\` exactly \`${agentType}`)
        && !canonicalCard.includes('<!-- omp-flow-claude-dispatch:v1 -->'),
      `${cardName} retains independent native identity without the retired prompt marker`,
    );
  }
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
  failure(root, ['task', 'archive'], 'Task has active runtime operations');
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
  execFileSync('git', ['init', '-q'], { cwd: root });
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
    json<{ active: null }>(root, ['status'], null).active === null,
    'explicit archive does not require a Harness session selection',
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
  const uncheckpointedArchive = json<ArchivedTask>(root, ['task', 'archive']);
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

  console.log(`PASS: ${checks} focused checks`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
