import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deployInitResources, getManagedResources } from '../src/cli/init.js';

export type LearnCheck = (condition: unknown, message: string) => asserts condition;

const sourceRoot = process.cwd();
const learnFiles = [
  'index.md',
  'daily/index.md',
  'threads/index.md',
  'retrospectives/index.md',
] as const;
const skillDestinations = [
  '.agents/skills/omp-flow-learn/SKILL.md',
  '.omp/skills/omp-flow-learn/SKILL.md',
  '.claude/skills/omp-flow-learn/SKILL.md',
] as const;

function read(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8');
}

function filesBelow(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  };
  visit(root);
  return files.sort();
}

function hasAll(content: string, expressions: readonly RegExp[]): boolean {
  return expressions.every(expression => expression.test(content));
}

type ProhibitedSkillBehavior = {
  key: string;
  expressions: readonly RegExp[];
};

const prohibitedSkillBehaviors: readonly ProhibitedSkillBehavior[] = [
  {
    key: 'required all-lens sequence',
    expressions: [
      /\b(?:each|every|all)(?:\s+of\s+the)?(?:\s+seven)?\s+lenses?.{0,60}\b(?:is|are|becomes?|forms?)\s+(?:an?\s+)?(?:required|mandatory)\s+(?:stage|step|sequence)/is,
      /\b(?:must|required to|have to)\s+(?:run|use|apply|complete).{0,30}\b(?:all|every)(?:\s+seven)?\s+lenses?\b/is,
    ],
  },
  {
    key: 'fluent explanation proves mastery',
    expressions: [
      /\bfluen\w*.{0,35}\b(?:proves?|demonstrates?|establishes?|guarantees?)\b.{0,25}\b(?:understanding|mastery|comprehension)\b/is,
    ],
  },
  {
    key: 'infallible principal cause',
    expressions: [
      /\bprincipal contradiction\b.{0,35}\b(?:infallible|universal|single true|cannot be wrong|always determines?)\b/is,
      /\bprincipal contradiction\b.{0,35}\b(?:is|reveals?|identifies?)\b.{0,20}\b(?:only|single)\s+(?:real|true|material)?\s*cause\b/is,
    ],
  },
  {
    key: 'deterministic history',
    expressions: [
      /\bhistor\w*.{0,30}\b(?:is|was|becomes?|makes?).{0,15}\b(?:inevitable|predetermined|unavoidable)\b/is,
      /\b(?:econom\w*|material conditions?).{0,30}\b(?:alone|solely|always)\b.{0,25}\bdetermin/is,
    ],
  },
  {
    key: 'questions steer assent',
    expressions: [
      /\bquestions?\b.{0,35}\b(?:must|should|need to|are used to)\b.{0,35}\b(?:steer|guide|lead|move)\b.{0,25}\b(?:assent|agreement|preset|preselected)\b/is,
      /\b(?:steer|guide|lead)\b.{0,25}\b(?:the human|participant|user)\b.{0,30}\b(?:Agent's|preset|preselected)\s+(?:answer|conclusion|position)\b/is,
    ],
  },
  {
    key: 'automatic diagram clarity',
    expressions: [
      /\b(?:all|every|any)\s+(?:diagram|picture|box drawing)\b.{0,30}\b(?:is|are|makes?).{0,15}\b(?:inherently|automatically|always)\s+(?:clear|clarifying|helpful)\b/is,
      /\bdiagrams?\b.{0,25}\b(?:guarantee|prove|ensure)\b.{0,20}\b(?:clarity|understanding|comprehension)\b/is,
    ],
  },
];

const grammaticalNegation =
  /\b(?:not|never|no|cannot|can't|mustn't|shouldn't|isn't|aren't|wasn't|weren't|doesn't|don't|didn't|reject(?:s|ed|ing)?|den(?:y|ies|ied|ying)|refus(?:e|es|ed|ing)|avoid(?:s|ed|ing)?|false)\b/i;

function detectsProhibitedBehavior(content: string, behavior: ProhibitedSkillBehavior): boolean {
  const clauses = content
    .split(/(?<=[.!?])(?:[”’"')\]]*)\s+|[;\n]+/)
    .map(clause => clause.trim())
    .filter(Boolean);

  return clauses.some(clause =>
    behavior.expressions.some(expression => {
      const matcher = new RegExp(expression.source, expression.flags.replace('g', '') + 'g');
      for (const match of clause.matchAll(matcher)) {
        const start = match.index ?? 0;
        const context = clause.slice(Math.max(0, start - 48), start + match[0].length);
        if (!grammaticalNegation.test(context)) return true;
      }
      return false;
    }),
  );
}

function assertContradictoryRegressionFixtures(check: LearnCheck): void {
  const fixtures = [
    {
      key: 'required all-lens sequence',
      contradiction: 'The lenses are not a checklist. Each of the seven lenses is a mandatory stage in the encounter.',
      faithful: [
        'You do not have to apply all seven lenses.',
        'All seven lenses do not form a mandatory sequence.',
      ],
    },
    {
      key: 'fluent explanation proves mastery',
      contradiction: 'Fluency can reveal gaps. A fluent explanation demonstrates mastery of the topic.',
      faithful: [
        'A fluent explanation does not demonstrate mastery.',
        'Fluency never proves understanding.',
      ],
    },
    {
      key: 'infallible principal cause',
      contradiction: 'The ranking is revisable. The principal contradiction identifies the single true cause.',
      faithful: [
        'The principal contradiction is not the single true cause.',
        'Never say the principal contradiction is the only real cause.',
      ],
    },
    {
      key: 'deterministic history',
      contradiction: 'Reject simple inevitability stories. The historical outcome was inevitable once those conditions appeared.',
      faithful: [
        'History was not inevitable.',
        'History never makes the outcome unavoidable.',
      ],
    },
    {
      key: 'questions steer assent',
      contradiction: "Either participant may reject a premise. Questions should guide the participant toward the Agent's preselected conclusion.",
      faithful: [
        'Do not lead the participant toward a preset answer.',
        'Questions should not guide the participant toward a preselected conclusion.',
      ],
    },
    {
      key: 'automatic diagram clarity',
      contradiction: 'Discard unhelpful pictures. Every diagram is automatically clarifying.',
      faithful: [
        'Do not assume every diagram is automatically clarifying.',
        'Diagrams do not ensure understanding.',
      ],
    },
  ] as const;

  for (const { key, contradiction, faithful } of fixtures) {
    const behavior = prohibitedSkillBehaviors.find(candidate => candidate.key === key);
    check(Boolean(behavior && detectsProhibitedBehavior(contradiction, behavior)), `contract helper rejects ${key}`);
    for (const control of faithful) {
      check(
        Boolean(behavior && behavior.expressions.some(expression => expression.test(control))),
        `negated ${key} control exercises the prohibited expression`,
      );
      check(
        Boolean(behavior && !detectsProhibitedBehavior(control, behavior)),
        `contract helper allows faithful negated ${key} rewrite`,
      );
    }
  }
}

function assertIndexContract(check: LearnCheck): void {
  const canonicalRoot = read(sourceRoot, 'templates/.omp-flow/learn/index.md');
  const daily = read(sourceRoot, 'templates/.omp-flow/learn/daily/index.md');
  const threads = read(sourceRoot, 'templates/.omp-flow/learn/threads/index.md');
  const retrospectives = read(sourceRoot, 'templates/.omp-flow/learn/retrospectives/index.md');

  check(
    hasAll(canonicalRoot, [
      /human.present/i,
      /production.{0,40}(?:pause|halt|suspend|stop)/is,
      /human.{0,70}(?:return|resume|switch).{0,35}production/is,
      /daily\/index\.md/,
      /threads\/index\.md/,
      /retrospectives\/index\.md/,
      /YYYY-MM-DD-<topic>\//,
      /authored `index\.md`/i,
      /descriptive Markdown Concepts/i,
      /not.{0,15}exhaustive/is,
      /Daily.{0,100}(?:stand\s+alone|independent|without.{0,15}companion)/is,
      /(?:does not|cannot|never).{0,90}(?:alter|change|control).{0,20}omp-flow Task/is,
      /(?:not|no).{0,15}Wiki.{0,15}authority/is,
      /(?:never|not).{0,25}(?:promoted|publish).{0,20}automatic/is,
    ]),
    'Learn root is a human-present maintenance manual with naming, resumption, pause, and authority boundaries',
  );
  check(
    hasAll(daily, [
      /(?:dated|encounter)/i,
      /correct/i,
      /resum/i,
      /Daily.{0,100}(?:stand\s+alone|independent|without.{0,15}companion)/is,
      /(?:never|not|does not).{0,45}(?:require|force).{0,35}(?:Thread|Retrospective)/is,
    ]),
    'Daily preserves one warranted encounter without companions',
  );
  check(
    hasAll(threads, [
      /continuity/i,
      /(?:across|spans?).{0,20}encounters?/is,
      /shared model/i,
      /disagreement|unresolved|open question/i,
      /Daily.{0,30}(?:not|never|does not).{0,25}require.{0,15}Thread/is,
    ]),
    'Threads preserve only warranted cross-encounter continuity',
  );
  check(
    hasAll(retrospectives, [
      /substantive/i,
      /change|problem|lesson/i,
      /Agent.{0,35}(?:explanations?|assumptions?)/is,
      /collaborat/i,
      /Daily.{0,100}(?:stand\s+alone|independent|without.{0,15}companion)/is,
    ]),
    'Retrospectives preserve substantive learning or collaboration reflection only',
  );
  for (const [name, content] of [['daily', daily], ['threads', threads], ['retrospectives', retrospectives]] as const) {
    check(
      hasAll(content, [/YYYY-MM-DD-<topic>\//, /authored `index\.md`/i, /descriptive Markdown Concepts/i, /not an exhaustive|not exhaustively|need not exhaustively|rather than an exhaustive/i]),
      `${name} documents a dated authored bundle without a closed manifest`,
    );
  }
}

function assertSkillContract(skill: string, check: LearnCheck): void {
  check(/^---\r?\nname: omp-flow-learn\r?\n/m.test(skill), 'Learn Skill uses canonical existing-convention frontmatter');
  check(
    hasAll(skill, [
      /human.present/i,
      /(?:both|either).{0,25}participants?.{0,35}(?:correct|revise|challenge)/is,
      /reciprocal/i,
      /resum/i,
    ]),
    'Learn Skill is human-present, reciprocal, and resumable',
  );
  check(
    hasAll(skill, [
      /known Learn Concept.{0,20}direct/is,
      /start at\s+`.omp-flow\/learn\/index\.md`/i,
      /bootstrap.{0,25}(?:only|minimum).{0,20}root index/is,
      /genuine.{0,15}need/is,
    ]),
    'Learn Skill supports direct/index consultation and need-based bootstrap',
  );
  check(
    hasAll(skill, [
      /YYYY-MM-DD-<topic>\//,
      /judg/i,
      /Daily.{0,100}(?:stand\s+alone|independent|without.{0,15}companion)/is,
      /(?:do not|never).{0,30}(?:manufacture|force|require).{0,35}(?:Thread|Retrospective)/is,
    ]),
    'Learn Skill uses judgment for dated bundles and optional companions',
  );
  check(
    hasAll(skill, [
      /production.{0,40}(?:pause|halt|suspend|stop)/is,
      /human.{0,70}(?:return|resume|switch).{0,35}production/is,
    ]),
    'Learn Skill pauses production until the human returns to it',
  );
  check(
    hasAll(skill, [/cannot .*alter an omp-flow\s+Task/is, /not Wiki\s+authority/i, /never promoted automatically/i]),
    'Learn Skill denies Task and Wiki authority transfer',
  );
  check(
    hasAll(skill, [/autonomous harvesting/i, /one-way tutoring/i, /summary generation is not a substitute/i, /hidden user\s+profile/i, /persistent personal memory/i, /model-weight change/i]),
    'Learn Skill rejects autonomous, one-way, and fictional persistence substitutes',
  );
  check(
    hasAll(skill, [
      /selectable.{0,35}(?:lens|repertoire)/is,
      /(?:not|never).{0,25}(?:stage|checklist)/is,
      /(?:smallest|minimal|fewest).{0,25}(?:lens|approach)/is,
      /combin\w*.{0,50}(?:correct|repair|failure|weakness)/is,
      /\b(?:facts|code|sources|worked cases)\b.{0,80}\b(?:outrank|override|take priority|more authoritative)\b/is,
      /human.{0,30}correction.{0,80}\b(?:outrank|override|take priority|more authoritative)\b/is,
      /(?:stop|end).{0,80}(?:useful|explanation|disagreement|open point|unresolved)/is,
      /(?:do not|never).{0,55}(?:remaining|all|every).{0,25}lenses/is,
    ]),
    'Learn Skill selects the smallest evidence-grounded lens and stops without an exhaustive routine',
  );
  check(
    hasAll(skill, [
      /Feynman-style self-explanation/i,
      /(?:hidden|undefined).{0,20}(?:term|concept)/is,
      /(?:leap|failed application|cannot apply)/i,
      /source|worked case/i,
      /fluenc\w*.{0,45}(?:diagnostic|signal|possible gap)/is,
      /(?:modern|packaged).{0,35}Feynman Technique/is,
    ]),
    'Feynman-style explanation diagnoses and repairs a concrete gap without relying on fluency',
  );
  check(
    hasAll(skill, [
      /Cargo Cult Science integrity/i,
      /consequential/i,
      /contrary|counterevidence/i,
      /alternative/i,
      /uncertain/i,
      /(?:change|revise|update).{0,35}(?:conclusion|claim|view)/is,
      /(?:material|relevant).{0,35}(?:disclos|caveat|information)/is,
      /(?:not|never).{0,70}(?:mandatory|fixed|required|ritual)/is,
    ]),
    'Integrity disclosure preserves material contrary evidence without becoming a fixed inventory',
  );
  check(
    hasAll(skill, [
      /Grounded first principles/i,
      /observed fact/i,
      /definition/i,
      /hard constraint/i,
      /value choice/i,
      /assumption/i,
      /convention/i,
      /premises?.{0,45}(?:chang|affect|alter).{0,25}conclusion/is,
      /(?:revis|chang|update).{0,25}condition|conditions?.{0,25}(?:revis|chang|update)/is,
      /(?:stop|end|cease).{0,45}(?:not help|unhelpful|no longer useful)/is,
      /(?:knowledge|history).{0,35}\bevidence\b/is,
    ]),
    'Grounded first principles types only consequential premises and retains revision and stopping conditions',
  );
  check(
    hasAll(skill, [
      /Practice-led principal-contradiction analysis/i,
      /dominant aspect/i,
      /secondary.{0,15}(?:coupl|factor|effect)/is,
      /(?:revisable|tentative|provisional).{0,35}(?:hypothesis|prioritization|ranking)/is,
      /(?:condition|observation).{0,45}(?:reorder|reprioriti|change the ranking)/is,
      /(?:not|never|does not).{0,45}(?:authorize|permit).{0,35}production/is,
      /(?:not|never|do not).{0,55}(?:universal|single.cause|doctrine)/is,
    ]),
    'Principal-contradiction analysis remains revisable, coupled, practical, and non-doctrinal',
  );
  check(
    hasAll(skill, [
      /Material history or genealogy/i,
      /(?:clarif|explain|illuminate).{0,20}(?:present|current)/is,
      /prior arrangement/i,
      /emergence|adoption/i,
      /discontin|rupture|break/i,
      /(?:caus\w*.{0,35}(?:interpret|tentative|label)|(?:interpret|tentative|label).{0,35}caus\w*)/is,
      /(?:reject|not|never).{0,55}(?:inevitab|present-purpose|predetermin)/is,
      /(?:interacting|multiple|combined).{0,20}causes?/is,
      /source|evidence/i,
    ]),
    'Material history uses sourced, discontinuous, interacting causality without inevitability',
  );
  check(
    hasAll(skill, [
      /Reciprocal Socratic questioning/i,
      /either participant/i,
      /reject.{0,20}premise/is,
      /Agent.{0,20}answer|answer.{0,20}Agent/is,
      /aporia|unresolved|open question/i,
      /questions?.{0,35}(?:yield|give way|stop)/is,
      /(?:direct|plain).{0,20}(?:explanation|answer)|admit.{0,15}uncertainty/is,
    ]),
    'Socratic questioning is reciprocal, answerable, and yields instead of manufacturing assent',
  );
  check(
    hasAll(skill, [
      /Minimal structural box-drawing/i,
      /(?:few|small number of).{0,35}(?:boxes|elements)/is,
      /abstraction level/i,
      /structural inference.{0,35}(?:cheaper|easier|clearer).{0,20}prose/is,
      /(?:check|compare).{0,70}(?:sources|code|examples|participants' model)/is,
      /(?:revise|discard).{0,45}(?:not help|unhelpful|fails)/is,
    ]),
    'Box-drawing serves one checked inference and is discarded when unhelpful',
  );
  check(
    hasAll(skill, [
      /(?:correct|counter|check|friction)/i,
      /hard constraints?.{0,50}history/is,
      /questions?.{0,50}(?:answer|reciprocal)/is,
      /diagrams?.{0,50}(?:prose|source|practice)/is,
    ]),
    'Learn Skill keeps cross-lens corrective friction visible without mandatory pairings',
  );
  check(
    hasAll(skill, [
      /(?:do not|never|must not)\s+introduce/i,
      /entry command/i,
      /fixed encounter stages|stage sequence/i,
      /required\s+transcript|transcript requirement/i,
      /transcript or summary|summary requirement|mandatory summary/i,
      /mandatory headings/i,
      /\bscore\b/i,
      /\bmetric\b/i,
      /completion gate/i,
      /approval ceremony/i,
      /per-edit human approval/i,
      /parsed body schema/i,
      /second task system/i,
    ]),
    'Learn Skill rejects protocol, schema, assessment, and approval machinery',
  );
  for (const behavior of prohibitedSkillBehaviors) {
    check(
      !detectsProhibitedBehavior(skill, behavior),
      `Learn Skill contains no contradictory ${behavior.key} claim`,
    );
  }
  assertContradictoryRegressionFixtures(check);
}

export function runLearnTests(check: LearnCheck): void {
  console.log('--- Learn distribution and contract');

  const expectedFiles = [...learnFiles].sort();
  check(
    JSON.stringify(filesBelow(path.join(sourceRoot, 'templates', '.omp-flow', 'learn'))) === JSON.stringify(expectedFiles),
    'canonical Learn skeleton contains exactly four indexes',
  );
  const canonicalSkill = read(sourceRoot, 'templates/common/skills/omp-flow-learn/SKILL.md');
  for (const destination of skillDestinations) {
    check(canonicalSkill === read(sourceRoot, destination), `${destination} is byte-identical to the canonical Learn Skill`);
  }
  for (const harness of ['codex', 'snow', 'cursor'] as const) {
    check(!fs.existsSync(path.join(sourceRoot, `.${harness}`, 'skills')), `tracked project has no ${harness}-specific Skill tree`);
  }

  const managed = getManagedResources(['omp', 'codex', 'claude', 'snow', 'cursor']);
  for (const relativePath of learnFiles) {
    const destination = `.omp-flow/learn/${relativePath}`;
    const matches = managed.filter(resource => resource.destinationPath.split(path.sep).join('/') === destination);
    check(matches.length === 1 && matches[0]?.group === 'core', `${destination} is registered once as a core resource`);
  }
  for (const destination of skillDestinations) {
    const matches = managed.filter(resource => resource.destinationPath.split(path.sep).join('/') === destination);
    check(matches.length === 1, `${destination} is registered once through normal Skill mapping`);
  }
  check(
    managed.every(resource => !/[\\/](?:\.codex|\.snow|\.cursor)[\\/]skills[\\/]omp-flow-learn/.test(path.join(path.sep, resource.destinationPath))),
    'managed resources contain no Codex, Snow, or Cursor Learn Skill duplicate',
  );

  const installedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-learn-test-'));
  try {
    deployInitResources({ cwd: installedRoot, harnesses: ['omp', 'codex', 'claude', 'snow', 'cursor'] });
    check(
      JSON.stringify(filesBelow(path.join(installedRoot, '.omp-flow', 'learn'))) === JSON.stringify(expectedFiles),
      'fresh install receives exactly the four-file Learn skeleton',
    );
    for (const relativePath of learnFiles) {
      check(
        read(sourceRoot, `templates/.omp-flow/learn/${relativePath}`) === read(installedRoot, `.omp-flow/learn/${relativePath}`),
        `fresh ${relativePath} is byte-identical to canonical`,
      );
    }
    for (const destination of skillDestinations) {
      check(canonicalSkill === read(installedRoot, destination), `fresh ${destination} is byte-identical to canonical`);
    }
    for (const harness of ['codex', 'snow', 'cursor'] as const) {
      check(!fs.existsSync(path.join(installedRoot, `.${harness}`, 'skills')), `fresh install has no ${harness}-specific Skill tree`);
    }
  } finally {
    fs.rmSync(installedRoot, { recursive: true, force: true });
  }

  assertIndexContract(check);
  assertSkillContract(canonicalSkill, check);
}
