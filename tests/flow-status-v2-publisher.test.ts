import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildRootFlowPublishRequestV2,
  isRootFlowCommandFailureV2,
  type FlowStatusHostV2,
  type RootFlowSemanticInputV2,
} from '../src/cli/flow-status-semantic-publisher.js';

type Check = (condition: unknown, message: string) => asserts condition;

type RuntimeEvidence = {
  nativeHarness?: FlowStatusHostV2;
  OMP_FLOW_HOST?: string;
  OMP_FLOW_CONTEXT_ID?: string;
  CODEX_THREAD_ID?: string;
  OMP_SESSION_ID?: string;
  PI_SESSION_ID?: string;
  SNOW_SESSION_ID?: string;
};

type ResolvedRuntimeScope = { host: FlowStatusHostV2; session: string } | null;

const FLOW_STATUS_HOSTS = new Set<FlowStatusHostV2>([
  'claude',
  'codex',
  'oh-my-pi',
  'snow',
  'cursor',
]);

function present(value: string | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function resolveRuntimeEvidenceContract(evidence: RuntimeEvidence): ResolvedRuntimeScope {
  const explicitValue = present(evidence.OMP_FLOW_HOST);
  if (explicitValue !== null && !FLOW_STATUS_HOSTS.has(explicitValue as FlowStatusHostV2)) {
    return null;
  }
  const explicitHost = explicitValue as FlowStatusHostV2 | null;
  const codexSession = present(evidence.CODEX_THREAD_ID);
  const ompSession = present(evidence.OMP_SESSION_ID);
  const piSession = present(evidence.PI_SESSION_ID);
  const snowSession = present(evidence.SNOW_SESSION_ID);
  const contextSession = present(evidence.OMP_FLOW_CONTEXT_ID);
  const hostClaims = new Set<FlowStatusHostV2>();
  if (explicitHost !== null) hostClaims.add(explicitHost);
  if (evidence.nativeHarness !== undefined) hostClaims.add(evidence.nativeHarness);
  if (codexSession !== null) hostClaims.add('codex');
  if (ompSession !== null || piSession !== null) hostClaims.add('oh-my-pi');
  if (snowSession !== null) hostClaims.add('snow');
  if (hostClaims.size !== 1) return null;

  const host = [...hostClaims][0];
  if (host === 'cursor' && explicitHost !== 'cursor') return null;
  let sessionClaims: (string | null)[];
  switch (host) {
    case 'claude':
      sessionClaims = [contextSession];
      break;
    case 'codex':
      if (codexSession === null) return null;
      sessionClaims = [codexSession, contextSession];
      break;
    case 'oh-my-pi':
      sessionClaims = [contextSession, ompSession, piSession];
      break;
    case 'snow':
      if (snowSession === null) return null;
      sessionClaims = [snowSession, contextSession];
      break;
    case 'cursor':
      sessionClaims = [contextSession];
      break;
  }
  const sessions = [...new Set(sessionClaims.filter((value): value is string => value !== null))];
  return sessions.length === 1 ? { host, session: sessions[0] } : null;
}

function baseInput(root: string): RootFlowSemanticInputV2 {
  const now = Date.now();
  return {
    version: 2,
    capability: 'rootFlowSemanticInputV2',
    requestId: 'request-explore-0001',
    expectedPreviousPublicationRevision: null,
    scope: { repositoryRoot: root, host: 'claude', hostSessionId: 'session-flow-v2' },
    rootTask: {
      taskId: '07-30-omp-flow-tui-control',
      title: 'TUI 状态栏返工',
      selectionRevision: 'selection-revision-0001',
    },
    orientation: {
      position: 'explore',
      movement: 'initial',
      fromPosition: null,
      resumeFrom: null,
      detailInput: {
        kind: 'explore',
        mode: 'research',
        round: 1,
        focus: '状态栏契约',
        reframe: 'none',
      },
      measureInput: {
        owner: 'explore-local',
        label: 'Questions',
        current: 2,
        total: 4,
        unit: 'questions',
        unitSetRevision: 'question-set-revision-0001',
        sourceRevision: 'question-source-revision-0001',
      },
    },
    workSetBaseline: { state: 'unavailable', reason: 'not-authored' },
    drilldown: { wave: null },
    publisher: {
      publisherId: 'omp-flow-orchestrator',
      actorId: 'orchestrator-main',
      sourceRevision: 'semantic-source-revision-0001',
      publicationRevision: 'publication-revision-0001',
    },
    semanticObservedAtUnixMs: now,
    lease: {
      leaseId: 'lease-identifier-0001',
      leaseRevision: 'lease-revision-0001',
      durationMs: 600_000,
    },
  };
}

export function runFlowStatusV2PublisherTests(rootValue: string, check: Check): void {
  const root = path.resolve(rootValue);
  const explore = baseInput(root);
  const built = buildRootFlowPublishRequestV2(null, explore);
  check(
    !isRootFlowCommandFailureV2(built),
    `v2 publisher builds one closed Explore publication: ${JSON.stringify(built)}`,
  );
  assert(!isRootFlowCommandFailureV2(built));
  const publicationKeys = Object.keys(built).sort();
  for (const host of ['claude', 'codex', 'oh-my-pi', 'snow', 'cursor'] as FlowStatusHostV2[]) {
    const hostInput = structuredClone(explore);
    hostInput.scope.host = host;
    const hostBuilt = buildRootFlowPublishRequestV2(null, hostInput);
    check(
      !isRootFlowCommandFailureV2(hostBuilt),
      `v2 publisher accepts the closed ${host} host`,
    );
    assert(!isRootFlowCommandFailureV2(hostBuilt));
    check(
      JSON.stringify(Object.keys(hostBuilt).sort()) === JSON.stringify(publicationKeys),
      `${host} does not grow the v2 publication shape`,
    );
  }
  const unknownHost = structuredClone(explore) as RootFlowSemanticInputV2;
  unknownHost.scope.host = 'unknown' as FlowStatusHostV2;
  const unknownBuilt = buildRootFlowPublishRequestV2(null, unknownHost);
  check(
    isRootFlowCommandFailureV2(unknownBuilt) && unknownBuilt.code === 'malformed',
    'publisher rejects an unknown host without manufacturing a publication',
  );
  check(built.orientation.detail.kind === 'explore', 'publisher preserves authored Explore detail');
  check(
    built.lease.ownerActorId === explore.publisher.actorId
      && built.lease.expiresAtUnixMs - built.lease.issuedAtUnixMs === 600_000,
    'publisher derives the lease relation without reading repository semantics',
  );

  const workSet = {
    state: 'available' as const,
    workSetRevision: 'work-set-revision-0001',
    catalogRevision: 'catalog-revision-0001',
    workTotal: 2,
    currentExecution: { workId: 'work-b', focus: 'implement' as const, reworkRound: 0 },
    works: [
      {
        workId: 'work-b',
        title: '实现渲染',
        currentWorkRevision: 'work-revision-b-0001',
        currentHandoff: null,
        currentIndependentReview: null,
      },
      {
        workId: 'work-a',
        title: '发布契约',
        currentWorkRevision: 'work-revision-a-0001',
        currentHandoff: {
          workRevision: 'work-revision-a-0001',
          handoffRevision: 'handoff-revision-a-0001',
          implementerActorId: 'implementer-a',
        },
        currentIndependentReview: {
          workRevision: 'work-revision-a-0001',
          handoffRevision: 'handoff-revision-a-0001',
          reviewId: 'review-a',
          reviewRevision: 'review-revision-a-0001',
          reviewerActorId: 'reviewer-a',
          reviewRound: 1,
          independence: 'different-actor' as const,
          result: 'accepted' as const,
        },
      },
    ],
  };
  const executeInput: RootFlowSemanticInputV2 = {
    ...baseInput(root),
    requestId: 'request-execute-0001',
    orientation: {
      position: 'execute',
      movement: 'initial',
      fromPosition: null,
      resumeFrom: null,
      detailInput: { kind: 'execute' },
      measureInput: {
        owner: 'accepted-work',
        label: 'Work',
        current: 1,
        total: 2,
        unit: 'work',
        unitSetRevision: workSet.workSetRevision,
        sourceRevision: 'semantic-source-revision-0001',
      },
    },
    workSetBaseline: workSet,
  };
  const execute = buildRootFlowPublishRequestV2(null, executeInput);
  check(!isRootFlowCommandFailureV2(execute), 'Execute derives progress from the complete Work catalog');
  assert(!isRootFlowCommandFailureV2(execute));
  assert(execute.orientation.detail.kind === 'execute');
  check(
    execute.orientation.detail.acceptedWork === 1
      && execute.orientation.detail.workTotal === 2
      && execute.orientation.detail.currentWork?.workId === 'work-b',
    'accepted and current Work facts are catalog-derived',
  );
  check(
    execute.executeAcceptance?.length === 1
      && execute.executeAcceptance[0]?.workId === 'work-a',
    'accepted Work requires a linked independent-review attestation',
  );

  const forged = structuredClone(executeInput);
  forged.workSetBaseline = structuredClone(workSet);
  if (forged.workSetBaseline.state === 'available') {
    forged.workSetBaseline.workTotal = 1;
  }
  const rejected = buildRootFlowPublishRequestV2(null, forged);
  check(
    isRootFlowCommandFailureV2(rejected) && rejected.code === 'invalid-relation',
    'publisher rejects incomplete or contradictory Work catalogs',
  );

  const sourceRoot = process.cwd();
  const canonicalSkill = fs.readFileSync(
    path.join(sourceRoot, 'templates', 'common', 'skills', 'flow-status', 'SKILL.md'),
    'utf8',
  );
  const deployedSkill = fs.readFileSync(
    path.join(root, '.agents', 'skills', 'flow-status', 'SKILL.md'),
    'utf8',
  );
  check(deployedSkill === canonicalSkill, 'canonical and deployed Flow Status Skills are byte-identical');
  for (const evidence of [
    '| `claude` | Native Claude Skill execution',
    '| `codex` | `CODEX_THREAD_ID`',
    '| `oh-my-pi` | Native Oh My Pi Skill execution',
    '| `snow` | `SNOW_SESSION_ID`',
    '| `cursor` | Hook-injected `OMP_FLOW_HOST=cursor`',
    'A valid value is authoritative explicit evidence',
    '`OMP_FLOW_CONTEXT_ID` alone does not identify a',
    'claims more than one host, report ambiguous evidence and stop',
    'Never read `.omp-flow/config.json`,',
  ]) {
    check(canonicalSkill.includes(evidence), `Flow Status Skill retains runtime-evidence rule: ${evidence}`);
  }
  check(
    canonicalSkill.includes('status inspect --host <host> --session <host-session-id> --json')
      && !canonicalSkill.includes('status inspect --host codex --json'),
    'Flow Status inspection uses the selected exact host/session instead of Codex hardcoding',
  );

  const validRuntimeEvidence: [string, RuntimeEvidence, Exclude<ResolvedRuntimeScope, null>][] = [
    [
      'Claude native execution and bridged session',
      { nativeHarness: 'claude', OMP_FLOW_CONTEXT_ID: 'claude-session' },
      { host: 'claude', session: 'claude-session' },
    ],
    [
      'Codex thread identity without a new host variable',
      { CODEX_THREAD_ID: 'codex-thread' },
      { host: 'codex', session: 'codex-thread' },
    ],
    [
      'Oh My Pi native execution and tunneled session',
      { nativeHarness: 'oh-my-pi', OMP_FLOW_CONTEXT_ID: 'omp-session' },
      { host: 'oh-my-pi', session: 'omp-session' },
    ],
    [
      'Snow native session identity without a new host variable',
      { SNOW_SESSION_ID: 'snow-session' },
      { host: 'snow', session: 'snow-session' },
    ],
    [
      'Cursor authoritative Hook evidence and conversation identity',
      {
        nativeHarness: 'cursor',
        OMP_FLOW_HOST: 'cursor',
        OMP_FLOW_CONTEXT_ID: 'cursor-conversation',
      },
      { host: 'cursor', session: 'cursor-conversation' },
    ],
  ];
  for (const [label, evidence, expected] of validRuntimeEvidence) {
    check(
      JSON.stringify(resolveRuntimeEvidenceContract(evidence)) === JSON.stringify(expected),
      `Flow Status resolves exact valid runtime evidence: ${label}`,
    );
  }

  for (const [label, evidence] of [
    ['all evidence absent', {}],
    ['Claude session absent', { nativeHarness: 'claude' }],
    ['Codex session absent', { nativeHarness: 'codex' }],
    ['Oh My Pi session absent', { nativeHarness: 'oh-my-pi' }],
    ['Snow session absent', { nativeHarness: 'snow' }],
    [
      'Cursor explicit host absent',
      { nativeHarness: 'cursor', OMP_FLOW_CONTEXT_ID: 'cursor-conversation' },
    ],
    [
      'invalid explicit host',
      { OMP_FLOW_HOST: 'unknown', CODEX_THREAD_ID: 'codex-thread' },
    ],
  ] satisfies [string, RuntimeEvidence][]) {
    check(resolveRuntimeEvidenceContract(evidence) === null, `Flow Status fails closed: ${label}`);
  }

  for (const [label, evidence] of [
    [
      'native Claude execution with inherited Codex identity',
      {
        nativeHarness: 'claude',
        OMP_FLOW_CONTEXT_ID: 'claude-session',
        CODEX_THREAD_ID: 'inherited-codex-thread',
      },
    ],
    [
      'Codex thread and generic context disagree',
      { CODEX_THREAD_ID: 'codex-thread', OMP_FLOW_CONTEXT_ID: 'other-session' },
    ],
    [
      'Oh My Pi native session variables disagree',
      { OMP_SESSION_ID: 'omp-session', PI_SESSION_ID: 'pi-session' },
    ],
    [
      'Snow session and generic context disagree',
      { SNOW_SESSION_ID: 'snow-session', OMP_FLOW_CONTEXT_ID: 'other-session' },
    ],
    [
      'Cursor explicit authority conflicts with inherited Codex identity',
      {
        OMP_FLOW_HOST: 'cursor',
        OMP_FLOW_CONTEXT_ID: 'cursor-conversation',
        CODEX_THREAD_ID: 'inherited-codex-thread',
      },
    ],
    [
      'Cursor explicit authority conflicts with native Snow execution',
      {
        nativeHarness: 'snow',
        OMP_FLOW_HOST: 'cursor',
        OMP_FLOW_CONTEXT_ID: 'cursor-conversation',
        SNOW_SESSION_ID: 'snow-session',
      },
    ],
  ] satisfies [string, RuntimeEvidence][]) {
    check(resolveRuntimeEvidenceContract(evidence) === null, `Flow Status rejects conflict: ${label}`);
  }

  const configuredHarnessesCannotSelect = {
    configuredHarnesses: ['cursor', 'snow', 'codex'],
  } as RuntimeEvidence;
  check(
    resolveRuntimeEvidenceContract(configuredHarnessesCannotSelect) === null,
    'combined Harness configuration never selects the current Flow Status host',
  );

  const canonicalRouter = fs.readFileSync(
    path.join(sourceRoot, 'templates', 'common', 'skills', 'omp-flow', 'SKILL.md'),
    'utf8',
  );
  for (const harnessRoot of ['.agents', '.omp', '.claude']) {
    const deployedRouter = fs.readFileSync(
      path.join(root, harnessRoot, 'skills', 'omp-flow', 'SKILL.md'),
      'utf8',
    );
    check(
      deployedRouter === canonicalRouter,
      `canonical and ${harnessRoot} omp-flow Skills are byte-identical`,
    );
  }
  const exactPublisherHostSet = '<claude|codex|oh-my-pi|snow|cursor>';
  check(
    canonicalRouter.split(exactPublisherHostSet).length - 1 === 3
      && !canonicalRouter.includes('<claude|codex|oh-my-pi>'),
    'publish, renew, and clear guidance pins the exact five-host set',
  );
}
