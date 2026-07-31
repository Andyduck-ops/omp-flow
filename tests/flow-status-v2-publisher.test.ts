import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildRootFlowPublishRequestV2,
  isRootFlowCommandFailureV2,
  type RootFlowSemanticInputV2,
} from '../src/cli/flow-status-semantic-publisher.js';

type Check = (condition: unknown, message: string) => asserts condition;

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
}
