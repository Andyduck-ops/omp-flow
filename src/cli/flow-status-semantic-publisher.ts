import { createHash } from 'node:crypto';
import path from 'node:path';

export const FLOW_POSITIONS_V2 = [
  'explore',
  'design',
  'qbd-1',
  'decompose',
  'qbd-2',
  'execute',
  'integrate',
  'wiki',
  'finish',
] as const;

export type FlowPositionV2 = (typeof FLOW_POSITIONS_V2)[number];
export type FlowMovementV2 =
  | 'initial'
  | 'same'
  | 'forward'
  | 'backtrack'
  | 'resume'
  | 'reopen';
export type FlowStatusHostV2 = 'claude' | 'codex' | 'oh-my-pi';
type RecordValue = Record<string, unknown>;

export interface BoundedMeasureV2 {
  owner:
    | 'explore-local'
    | 'design-local'
    | 'audit-local'
    | 'work-map-local'
    | 'accepted-work'
    | 'integration-checks'
    | 'wiki-harvest'
    | 'finish-checks';
  label: string;
  current: number;
  total: number;
  unit: string;
  unitSetRevision: string;
  sourceRevision: string;
}

export interface WorkCatalogEntryV2 {
  workId: string;
  title: string | null;
  currentWorkRevision: string;
  currentHandoff: null | {
    workRevision: string;
    handoffRevision: string;
    implementerActorId: string;
  };
  currentIndependentReview: null | {
    workRevision: string;
    handoffRevision: string;
    reviewId: string;
    reviewRevision: string;
    reviewerActorId: string;
    reviewRound: number;
    independence: 'different-actor';
    result: 'pending' | 'changes-requested' | 'accepted';
  };
}

export type WorkSetBaselineV2 =
  | {
      state: 'unavailable';
      reason: 'not-authored' | 'not-required' | 'not-supplied';
    }
  | {
      state: 'available';
      workSetRevision: string;
      catalogRevision: string;
      workTotal: number;
      currentExecution: null | {
        workId: string;
        focus: 'implement' | 'review' | 'rework' | 'accepted';
        reworkRound: number;
      };
      works: WorkCatalogEntryV2[];
    };

export interface AcceptedWorkAttestationV2 {
  workSetRevision: string;
  workId: string;
  workRevision: string;
  handoffRevision: string;
  implementerActorId: string;
  reviewId: string;
  reviewRevision: string;
  reviewerActorId: string;
  reviewRound: number;
  independence: 'different-actor';
  result: 'accepted';
}

export interface WaveDrilldownV2 {
  waveId: string;
  title: string | null;
  revision: string;
  workSetRevision: string;
  ordinal: number;
  total: number;
  focusWorkIds: string[];
}

export type FlowDetailInputV2 =
  | {
      kind: 'explore';
      mode: 'brainstorm' | 'research';
      round: number;
      focus: string | null;
      reframe: 'none' | 'evidence' | 'synthesis' | 'audit' | 'review' | 'implementation';
    }
  | {
      kind: 'design';
      focus: 'prd' | 'design' | 'decision' | 'interface';
      detail: string | null;
    }
  | {
      kind: 'qbd-1' | 'qbd-2';
      auditId: string;
      attempt: number;
      verdict: 'pending' | 'fail' | 'needs-evidence' | 'pass';
      calibration: 'not-requested' | 'awaiting' | 'approved' | 'rejected';
      sourceRevision: string;
    }
  | {
      kind: 'decompose';
      workSetRevision: string;
      workTotal: number;
      focus: string | null;
    }
  | { kind: 'execute' }
  | {
      kind: 'integrate';
      focus: 'checks' | 'package' | 'cutover';
      detail: string | null;
    }
  | {
      kind: 'wiki';
      focus: 'harvest' | 'curate' | 'link';
      detail: string | null;
    }
  | {
      kind: 'finish';
      focus: 'completion-audit' | 'checks' | 'commit' | 'archive';
      completionAudit: null | {
        auditId: string;
        attempt: number;
        verdict: 'pending' | 'fail' | 'needs-evidence' | 'pass';
        calibration: 'not-requested' | 'awaiting' | 'approved' | 'rejected';
        sourceRevision: string;
      };
      detail: string | null;
    };

export interface RootFlowSemanticInputV2 {
  version: 2;
  capability: 'rootFlowSemanticInputV2';
  requestId: string;
  expectedPreviousPublicationRevision: string | null;
  scope: {
    repositoryRoot: string;
    host: FlowStatusHostV2;
    hostSessionId: string;
  };
  rootTask: {
    taskId: string;
    title: string | null;
    selectionRevision: string;
  };
  orientation: {
    position: FlowPositionV2;
    movement: FlowMovementV2;
    fromPosition: FlowPositionV2 | null;
    resumeFrom: null | {
      hostSessionId: string;
      publicationRevision: string;
      position: FlowPositionV2;
    };
    detailInput: FlowDetailInputV2;
    measureInput: BoundedMeasureV2 | null;
  };
  workSetBaseline: WorkSetBaselineV2;
  drilldown: { wave: WaveDrilldownV2 | null };
  publisher: {
    publisherId: string;
    actorId: string;
    sourceRevision: string;
    publicationRevision: string;
  };
  semanticObservedAtUnixMs: number;
  lease: {
    leaseId: string;
    leaseRevision: string;
    durationMs: number;
  };
}

export interface ExecuteCurrentWorkV2 {
  workId: string;
  title: string | null;
  workRevision: string;
  focus: 'implement' | 'review' | 'rework' | 'accepted';
  reviewRound: number;
  reworkRound: number;
  reviewVerdict: 'none' | 'pending' | 'changes-requested' | 'accepted';
  handoffRevision: string | null;
}

export type FlowDetailV2 =
  | Exclude<FlowDetailInputV2, { kind: 'execute' }>
  | {
      kind: 'execute';
      workSetRevision: string;
      workTotal: number;
      workCatalogRevision: string;
      workCatalogDigest: string;
      acceptedWork: number;
      acceptanceSetRevision: string;
      acceptanceDigest: string;
      currentWork: ExecuteCurrentWorkV2 | null;
    };

export interface RootFlowPublishRequestV2 {
  version: 2;
  capability: 'orchestratorFlowPublicationV2';
  requestId: string;
  expectedPreviousPublicationRevision: string | null;
  scope: RootFlowSemanticInputV2['scope'];
  rootTask: RootFlowSemanticInputV2['rootTask'];
  orientation: {
    position: FlowPositionV2;
    movement: FlowMovementV2;
    fromPosition: FlowPositionV2 | null;
    resumeFrom: RootFlowSemanticInputV2['orientation']['resumeFrom'];
    detail: FlowDetailV2;
    measure: BoundedMeasureV2 | null;
  };
  workSetBaseline: WorkSetBaselineV2;
  executeAcceptance: AcceptedWorkAttestationV2[] | null;
  drilldown: RootFlowSemanticInputV2['drilldown'];
  publisher: RootFlowSemanticInputV2['publisher'];
  semanticObservedAtUnixMs: number;
  lease: {
    leaseId: string;
    leaseRevision: string;
    ownerActorId: string;
    selectionRevision: string;
    issuedAtUnixMs: number;
    expiresAtUnixMs: number;
    durationMs: number;
  };
}

export interface RootFlowPublicationV2
  extends Omit<RootFlowPublishRequestV2, 'expectedPreviousPublicationRevision' | 'workSetBaseline' | 'executeAcceptance'> {
  requestDigest: string;
}

export interface RootFlowCommandFailureV2 {
  version: 2;
  command: 'publish';
  state: 'error';
  requestId: string | null;
  code:
    | 'malformed'
    | 'too-large'
    | 'unsupported-version'
    | 'invalid-relation'
    | 'repository-mismatch'
    | 'selection-mismatch'
    | 'host-mismatch'
    | 'session-mismatch'
    | 'actor-mismatch'
    | 'stale'
    | 'expired'
    | 'future'
    | 'compare-failed'
    | 'replay'
    | 'conflict'
    | 'not-published'
    | 'io-failure';
  retryable: boolean;
}

export type BuildRootFlowPublishResultV2 = RootFlowPublishRequestV2 | RootFlowCommandFailureV2;

const REVISION = /^[A-Za-z0-9._:-]{16,128}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const HOSTS = new Set<FlowStatusHostV2>(['claude', 'codex', 'oh-my-pi']);
const MOVEMENTS = new Set<FlowMovementV2>([
  'initial', 'same', 'forward', 'backtrack', 'resume', 'reopen',
]);
const POSITIONS = new Set<FlowPositionV2>(FLOW_POSITIONS_V2);
const MEASURE_OWNER: Record<FlowPositionV2, BoundedMeasureV2['owner']> = {
  explore: 'explore-local',
  design: 'design-local',
  'qbd-1': 'audit-local',
  decompose: 'work-map-local',
  'qbd-2': 'audit-local',
  execute: 'accepted-work',
  integrate: 'integration-checks',
  wiki: 'wiki-harvest',
  finish: 'finish-checks',
};

function failure(
  code: RootFlowCommandFailureV2['code'],
  requestId: string | null,
  retryable = false,
): RootFlowCommandFailureV2 {
  return { version: 2, command: 'publish', state: 'error', requestId, code, retryable };
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}

function cleanString(value: unknown, maxBytes: number): value is string {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > maxBytes) {
    return false;
  }
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0xd800 && code <= 0xdfff)) {
      return false;
    }
  }
  return true;
}

function revision(value: unknown): value is string {
  return typeof value === 'string' && REVISION.test(value);
}

function integer(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function displayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (
      code >= 0x1100
      && (
        code <= 0x115f
        || code === 0x2329
        || code === 0x232a
        || (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f)
        || (code >= 0xac00 && code <= 0xd7a3)
        || (code >= 0xf900 && code <= 0xfaff)
        || (code >= 0xfe10 && code <= 0xfe19)
        || (code >= 0xfe30 && code <= 0xfe6f)
        || (code >= 0xff00 && code <= 0xff60)
        || (code >= 0xffe0 && code <= 0xffe6)
        || (code >= 0x1f300 && code <= 0x1faff)
        || (code >= 0x20000 && code <= 0x3fffd)
      )
    ) width += 2;
    else if (!(code >= 0x300 && code <= 0x36f)) width += 1;
  }
  return width;
}

function displayString(value: unknown, max: number, nullable = false): boolean {
  if (nullable && value === null) return true;
  return cleanString(value, 512) && displayWidth(value) <= max;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableValue(value[key])]),
  );
}

export function canonicalFlowStatusJsonV2(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function digestFlowStatusValueV2(value: unknown): string {
  return createHash('sha256').update(canonicalFlowStatusJsonV2(value), 'utf8').digest('hex');
}

function validateScope(value: unknown): value is RootFlowSemanticInputV2['scope'] {
  if (!isRecord(value) || !exactKeys(value, ['repositoryRoot', 'host', 'hostSessionId'])) return false;
  if (
    !cleanString(value.repositoryRoot, 1024)
    || !path.isAbsolute(value.repositoryRoot)
    || path.resolve(value.repositoryRoot) !== value.repositoryRoot
    || !HOSTS.has(value.host as FlowStatusHostV2)
    || !cleanString(value.hostSessionId, 128)
  ) return false;
  return true;
}

function validateRootTask(value: unknown): value is RootFlowSemanticInputV2['rootTask'] {
  return isRecord(value)
    && exactKeys(value, ['taskId', 'title', 'selectionRevision'])
    && cleanString(value.taskId, 128)
    && displayString(value.title, 96, true)
    && revision(value.selectionRevision);
}

function validateAudit(value: RecordValue): boolean {
  return cleanString(value.auditId, 128)
    && integer(value.attempt, 1, 99)
    && ['pending', 'fail', 'needs-evidence', 'pass'].includes(String(value.verdict))
    && ['not-requested', 'awaiting', 'approved', 'rejected'].includes(String(value.calibration))
    && revision(value.sourceRevision)
    && (value.calibration !== 'approved' || value.verdict === 'pass');
}

function validateDetailInput(value: unknown, position: FlowPositionV2): value is FlowDetailInputV2 {
  if (!isRecord(value) || value.kind !== position) return false;
  switch (position) {
    case 'explore':
      return exactKeys(value, ['kind', 'mode', 'round', 'focus', 'reframe'])
        && ['brainstorm', 'research'].includes(String(value.mode))
        && integer(value.round, 1, 99)
        && displayString(value.focus, 160, true)
        && ['none', 'evidence', 'synthesis', 'audit', 'review', 'implementation'].includes(
          String(value.reframe),
        );
    case 'design':
      return exactKeys(value, ['kind', 'focus', 'detail'])
        && ['prd', 'design', 'decision', 'interface'].includes(String(value.focus))
        && displayString(value.detail, 160, true);
    case 'qbd-1':
    case 'qbd-2':
      return exactKeys(value, ['kind', 'auditId', 'attempt', 'verdict', 'calibration', 'sourceRevision'])
        && validateAudit(value);
    case 'decompose':
      return exactKeys(value, ['kind', 'workSetRevision', 'workTotal', 'focus'])
        && revision(value.workSetRevision)
        && integer(value.workTotal, 0, 64)
        && displayString(value.focus, 160, true);
    case 'execute':
      return exactKeys(value, ['kind']);
    case 'integrate':
      return exactKeys(value, ['kind', 'focus', 'detail'])
        && ['checks', 'package', 'cutover'].includes(String(value.focus))
        && displayString(value.detail, 160, true);
    case 'wiki':
      return exactKeys(value, ['kind', 'focus', 'detail'])
        && ['harvest', 'curate', 'link'].includes(String(value.focus))
        && displayString(value.detail, 160, true);
    case 'finish': {
      if (
        !exactKeys(value, ['kind', 'focus', 'completionAudit', 'detail'])
        || !['completion-audit', 'checks', 'commit', 'archive'].includes(String(value.focus))
        || !displayString(value.detail, 160, true)
      ) return false;
      if (value.focus === 'completion-audit') {
        return isRecord(value.completionAudit)
          && exactKeys(value.completionAudit, [
            'auditId', 'attempt', 'verdict', 'calibration', 'sourceRevision',
          ])
          && validateAudit(value.completionAudit);
      }
      return value.completionAudit === null;
    }
  }
}

function validateMeasure(value: unknown, position: FlowPositionV2): value is BoundedMeasureV2 | null {
  if (value === null) return true;
  if (
    !isRecord(value)
    || !exactKeys(value, [
      'owner', 'label', 'current', 'total', 'unit', 'unitSetRevision', 'sourceRevision',
    ])
    || value.owner !== MEASURE_OWNER[position]
    || !displayString(value.label, 32)
    || !integer(value.total, 1, 64)
    || !integer(value.current, 0, Number(value.total))
    || !displayString(value.unit, 24)
    || !revision(value.unitSetRevision)
    || !revision(value.sourceRevision)
  ) return false;
  return true;
}

function validateCatalogEntry(value: unknown): value is WorkCatalogEntryV2 {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      'workId', 'title', 'currentWorkRevision', 'currentHandoff', 'currentIndependentReview',
    ])
    || !cleanString(value.workId, 128)
    || !displayString(value.title, 96, true)
    || !revision(value.currentWorkRevision)
  ) return false;
  const handoff = value.currentHandoff;
  if (handoff !== null) {
    if (
      !isRecord(handoff)
      || !exactKeys(handoff, ['workRevision', 'handoffRevision', 'implementerActorId'])
      || handoff.workRevision !== value.currentWorkRevision
      || !revision(handoff.handoffRevision)
      || !cleanString(handoff.implementerActorId, 128)
    ) return false;
  }
  const review = value.currentIndependentReview;
  if (review !== null) {
    if (
      handoff === null
      || !isRecord(review)
      || !exactKeys(review, [
        'workRevision', 'handoffRevision', 'reviewId', 'reviewRevision', 'reviewerActorId',
        'reviewRound', 'independence', 'result',
      ])
      || review.workRevision !== handoff.workRevision
      || review.handoffRevision !== handoff.handoffRevision
      || !cleanString(review.reviewId, 128)
      || !revision(review.reviewRevision)
      || !cleanString(review.reviewerActorId, 128)
      || !integer(review.reviewRound, 1, 99)
      || review.independence !== 'different-actor'
      || !['pending', 'changes-requested', 'accepted'].includes(String(review.result))
      || review.reviewerActorId === handoff.implementerActorId
    ) return false;
  }
  return true;
}

function validateWorkSet(value: unknown): value is WorkSetBaselineV2 {
  if (!isRecord(value) || typeof value.state !== 'string') return false;
  if (value.state === 'unavailable') {
    return exactKeys(value, ['state', 'reason'])
      && ['not-authored', 'not-required', 'not-supplied'].includes(String(value.reason));
  }
  if (
    value.state !== 'available'
    || !exactKeys(value, [
      'state', 'workSetRevision', 'catalogRevision', 'workTotal', 'currentExecution', 'works',
    ])
    || !revision(value.workSetRevision)
    || !revision(value.catalogRevision)
    || !integer(value.workTotal, 0, 64)
    || !Array.isArray(value.works)
    || value.works.length !== value.workTotal
    || value.works.some(item => !validateCatalogEntry(item))
  ) return false;
  const ids = new Set(value.works.map(item => item.workId));
  if (ids.size !== value.works.length) return false;
  if (value.currentExecution !== null) {
    const current = value.currentExecution;
    if (
      !isRecord(current)
      || !exactKeys(current, ['workId', 'focus', 'reworkRound'])
      || !ids.has(String(current.workId))
      || !['implement', 'review', 'rework', 'accepted'].includes(String(current.focus))
      || !integer(current.reworkRound, 0, 99)
    ) return false;
  }
  const allAccepted = value.works.every(entry => entry.currentIndependentReview?.result === 'accepted');
  return (value.currentExecution === null) === allAccepted;
}

function deriveAcceptance(baseline: Extract<WorkSetBaselineV2, { state: 'available' }>): AcceptedWorkAttestationV2[] {
  return baseline.works
    .filter(entry => entry.currentHandoff !== null && entry.currentIndependentReview?.result === 'accepted')
    .map(entry => {
      const handoff = entry.currentHandoff!;
      const review = entry.currentIndependentReview!;
      return {
        workSetRevision: baseline.workSetRevision,
        workId: entry.workId,
        workRevision: entry.currentWorkRevision,
        handoffRevision: handoff.handoffRevision,
        implementerActorId: handoff.implementerActorId,
        reviewId: review.reviewId,
        reviewRevision: review.reviewRevision,
        reviewerActorId: review.reviewerActorId,
        reviewRound: review.reviewRound,
        independence: 'different-actor' as const,
        result: 'accepted' as const,
      };
    })
    .sort((left, right) => left.workId.localeCompare(right.workId, 'en'));
}

function deriveExecute(
  baseline: Extract<WorkSetBaselineV2, { state: 'available' }>,
  acceptanceRevision: string,
): { detail: Extract<FlowDetailV2, { kind: 'execute' }>; acceptance: AcceptedWorkAttestationV2[] } | null {
  const works = [...baseline.works].sort((left, right) => left.workId.localeCompare(right.workId, 'en'));
  const acceptance = deriveAcceptance(baseline);
  const currentExecution = baseline.currentExecution;
  let currentWork: ExecuteCurrentWorkV2 | null = null;
  if (currentExecution !== null) {
    const entry = baseline.works.find(item => item.workId === currentExecution.workId)!;
    const handoff = entry.currentHandoff;
    const review = entry.currentIndependentReview;
    const common = {
      workId: entry.workId,
      title: entry.title,
      workRevision: entry.currentWorkRevision,
      focus: currentExecution.focus,
      reworkRound: currentExecution.reworkRound,
      handoffRevision: handoff?.handoffRevision ?? null,
    };
    if (currentExecution.focus === 'implement') {
      if (currentExecution.reworkRound !== 0 || handoff !== null || review !== null) return null;
      currentWork = { ...common, focus: 'implement', reviewRound: 0, reworkRound: 0, reviewVerdict: 'none' };
    } else if (currentExecution.focus === 'review') {
      if (
        handoff === null
        || review === null
        || review.result !== 'pending'
        || currentExecution.reworkRound > review.reviewRound
      ) return null;
      currentWork = {
        ...common,
        focus: 'review',
        reviewRound: review.reviewRound,
        reviewVerdict: 'pending',
      };
    } else if (currentExecution.focus === 'rework') {
      if (
        handoff === null
        || review === null
        || review.result !== 'changes-requested'
        || currentExecution.reworkRound < 1
      ) return null;
      currentWork = {
        ...common,
        focus: 'rework',
        reviewRound: review.reviewRound,
        reviewVerdict: 'changes-requested',
      };
    } else {
      if (handoff === null || review === null || review.result !== 'accepted') return null;
      currentWork = {
        ...common,
        focus: 'accepted',
        reviewRound: review.reviewRound,
        reviewVerdict: 'accepted',
      };
    }
  }
  return {
    detail: {
      kind: 'execute',
      workSetRevision: baseline.workSetRevision,
      workTotal: baseline.workTotal,
      workCatalogRevision: baseline.catalogRevision,
      workCatalogDigest: digestFlowStatusValueV2(works),
      acceptedWork: acceptance.length,
      acceptanceSetRevision: acceptanceRevision,
      acceptanceDigest: digestFlowStatusValueV2(acceptance),
      currentWork,
    },
    acceptance,
  };
}

function validateWave(
  value: unknown,
  position: FlowPositionV2,
  detail: FlowDetailV2,
): value is WaveDrilldownV2 | null {
  if (value === null) return true;
  if (
    !['decompose', 'execute', 'integrate'].includes(position)
    || !isRecord(value)
    || !exactKeys(value, [
      'waveId', 'title', 'revision', 'workSetRevision', 'ordinal', 'total', 'focusWorkIds',
    ])
    || !cleanString(value.waveId, 128)
    || !displayString(value.title, 96, true)
    || !revision(value.revision)
    || !revision(value.workSetRevision)
    || !integer(value.total, 1, 64)
    || !integer(value.ordinal, 1, Number(value.total))
    || !Array.isArray(value.focusWorkIds)
    || value.focusWorkIds.length > 64
    || value.focusWorkIds.some(item => !cleanString(item, 128))
    || new Set(value.focusWorkIds).size !== value.focusWorkIds.length
  ) return false;
  const detailWorkSet = 'workSetRevision' in detail ? detail.workSetRevision : null;
  return detailWorkSet === null || value.workSetRevision === detailWorkSet;
}

function validateMovement(
  input: RootFlowSemanticInputV2,
  previous: RootFlowPublicationV2 | null,
): boolean {
  const { movement, position, fromPosition, resumeFrom } = input.orientation;
  const expected = input.expectedPreviousPublicationRevision;
  if (movement === 'initial') {
    return previous === null && expected === null && fromPosition === null && resumeFrom === null;
  }
  if (movement === 'resume') {
    return previous === null
      && expected === null
      && fromPosition === position
      && resumeFrom !== null
      && cleanString(resumeFrom.hostSessionId, 128)
      && resumeFrom.hostSessionId !== input.scope.hostSessionId
      && revision(resumeFrom.publicationRevision)
      && POSITIONS.has(resumeFrom.position)
      && resumeFrom.position === position;
  }
  if (
    previous === null
    || expected !== previous.publisher.publicationRevision
    || fromPosition !== previous.orientation.position
    || resumeFrom !== null
    || input.scope.repositoryRoot !== previous.scope.repositoryRoot
    || input.scope.host !== previous.scope.host
    || input.scope.hostSessionId !== previous.scope.hostSessionId
    || input.rootTask.taskId !== previous.rootTask.taskId
    || input.rootTask.selectionRevision !== previous.rootTask.selectionRevision
    || input.publisher.publisherId !== previous.publisher.publisherId
    || input.publisher.actorId !== previous.publisher.actorId
    || input.publisher.publicationRevision === previous.publisher.publicationRevision
    || input.publisher.sourceRevision === previous.publisher.sourceRevision
    || input.requestId === previous.requestId
  ) return false;
  const from = FLOW_POSITIONS_V2.indexOf(fromPosition);
  const to = FLOW_POSITIONS_V2.indexOf(position);
  if (movement === 'same') return from === to;
  if (movement === 'forward') return from < to;
  if (movement === 'backtrack') return from > to;
  return movement === 'reopen' && from >= to;
}

function validateCounterTransition(
  previous: RootFlowPublicationV2 | null,
  input: RootFlowSemanticInputV2,
): boolean {
  const detail = input.orientation.detailInput;
  if (detail.kind === 'explore') {
    const prior = previous?.orientation.detail.kind === 'explore'
      ? previous.orientation.detail
      : null;
    if (input.orientation.movement === 'initial') return detail.round === 1 && detail.reframe === 'none';
    if (input.orientation.movement === 'resume') return detail.reframe === 'none';
    if (!prior) {
      return ['backtrack', 'reopen'].includes(input.orientation.movement)
        ? detail.reframe !== 'none'
        : detail.round >= 1;
    }
    if (input.orientation.movement === 'same') {
      return detail.reframe === 'none'
        ? detail.round === prior.round
        : detail.round === prior.round + 1;
    }
    if (['backtrack', 'reopen'].includes(input.orientation.movement)) {
      return detail.reframe !== 'none' && detail.round === prior.round + 1;
    }
  }
  if (detail.kind === 'qbd-1' || detail.kind === 'qbd-2') {
    const prior = previous?.orientation.detail.kind === detail.kind
      ? previous.orientation.detail
      : null;
    if (input.orientation.movement === 'initial') return detail.attempt === 1;
    if (input.orientation.movement === 'resume') return detail.attempt >= 1;
    if (prior) {
      const sameAudit = detail.auditId === prior.auditId;
      return detail.attempt === prior.attempt + (sameAudit ? 0 : 1);
    }
  }
  if (detail.kind === 'finish' && detail.completionAudit) {
    const prior = previous?.orientation.detail.kind === 'finish'
      ? previous.orientation.detail.completionAudit
      : null;
    if (input.orientation.movement === 'initial') return detail.completionAudit.attempt === 1;
    if (prior) {
      const sameAudit = detail.completionAudit.auditId === prior.auditId;
      return detail.completionAudit.attempt === prior.attempt + (sameAudit ? 0 : 1);
    }
  }
  return true;
}

function previousValid(value: unknown): value is RootFlowPublicationV2 | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return value.version === 2
    && value.capability === 'orchestratorFlowPublicationV2'
    && isRecord(value.scope)
    && isRecord(value.rootTask)
    && isRecord(value.orientation)
    && isRecord(value.publisher)
    && isRecord(value.lease)
    && revision(value.requestId)
    && typeof value.requestDigest === 'string'
    && HEX64.test(value.requestDigest);
}

/**
 * Sole production constructor for explicit root Task/Flow publication.
 *
 * It deliberately accepts already-authored values only. It performs no filesystem, Git,
 * Markdown, Bundle, receipt, handoff, review, prompt, or transcript read.
 */
export function buildRootFlowPublishRequestV2(
  previousValue: RootFlowPublicationV2 | null,
  semanticValue: unknown,
): BuildRootFlowPublishResultV2 {
  const requestId = isRecord(semanticValue) && revision(semanticValue.requestId)
    ? semanticValue.requestId
    : null;
  if (!previousValid(previousValue) || !isRecord(semanticValue)) return failure('malformed', requestId);
  if (semanticValue.version !== 2) return failure('unsupported-version', requestId);
  const required = [
    'version', 'capability', 'requestId', 'expectedPreviousPublicationRevision', 'scope',
    'rootTask', 'orientation', 'workSetBaseline', 'drilldown', 'publisher',
    'semanticObservedAtUnixMs', 'lease',
  ];
  if (
    !exactKeys(semanticValue, required)
    || semanticValue.capability !== 'rootFlowSemanticInputV2'
    || !revision(semanticValue.requestId)
    || (
      semanticValue.expectedPreviousPublicationRevision !== null
      && !revision(semanticValue.expectedPreviousPublicationRevision)
    )
    || !validateScope(semanticValue.scope)
    || !validateRootTask(semanticValue.rootTask)
  ) return failure('malformed', requestId);
  const input = semanticValue as unknown as RootFlowSemanticInputV2;
  const orientation = semanticValue.orientation;
  if (
    !isRecord(orientation)
    || !exactKeys(orientation, [
      'position', 'movement', 'fromPosition', 'resumeFrom', 'detailInput', 'measureInput',
    ])
    || !POSITIONS.has(orientation.position as FlowPositionV2)
    || !MOVEMENTS.has(orientation.movement as FlowMovementV2)
    || (orientation.fromPosition !== null && !POSITIONS.has(orientation.fromPosition as FlowPositionV2))
    || (
      orientation.resumeFrom !== null
      && (
        !isRecord(orientation.resumeFrom)
        || !exactKeys(orientation.resumeFrom, ['hostSessionId', 'publicationRevision', 'position'])
      )
    )
    || !validateDetailInput(orientation.detailInput, orientation.position as FlowPositionV2)
    || !validateMeasure(orientation.measureInput, orientation.position as FlowPositionV2)
    || !validateWorkSet(semanticValue.workSetBaseline)
  ) return failure('invalid-relation', requestId);
  if (
    !isRecord(semanticValue.drilldown)
    || !exactKeys(semanticValue.drilldown, ['wave'])
    || !isRecord(semanticValue.publisher)
    || !exactKeys(semanticValue.publisher, [
      'publisherId', 'actorId', 'sourceRevision', 'publicationRevision',
    ])
    || !cleanString(semanticValue.publisher.publisherId, 128)
    || !cleanString(semanticValue.publisher.actorId, 128)
    || !revision(semanticValue.publisher.sourceRevision)
    || !revision(semanticValue.publisher.publicationRevision)
    || !integer(semanticValue.semanticObservedAtUnixMs, 0, Number.MAX_SAFE_INTEGER)
    || semanticValue.semanticObservedAtUnixMs > Date.now() + 30_000
    || !isRecord(semanticValue.lease)
    || !exactKeys(semanticValue.lease, ['leaseId', 'leaseRevision', 'durationMs'])
    || !revision(semanticValue.lease.leaseId)
    || !revision(semanticValue.lease.leaseRevision)
    || !integer(semanticValue.lease.durationMs, 600_000, 900_000)
  ) return failure(
    Number(semanticValue.semanticObservedAtUnixMs) > Date.now() + 30_000 ? 'future' : 'malformed',
    requestId,
  );

  if (!validateMovement(input, previousValue) || !validateCounterTransition(previousValue, input)) {
    return failure('invalid-relation', requestId);
  }

  let detail: FlowDetailV2 = input.orientation.detailInput as Exclude<FlowDetailInputV2, { kind: 'execute' }>;
  let executeAcceptance: AcceptedWorkAttestationV2[] | null = null;
  if (input.orientation.position === 'execute') {
    if (input.workSetBaseline.state !== 'available') return failure('invalid-relation', requestId);
    const derived = deriveExecute(input.workSetBaseline, input.publisher.sourceRevision);
    if (!derived) return failure('invalid-relation', requestId);
    detail = derived.detail;
    executeAcceptance = derived.acceptance;
  } else if (input.orientation.detailInput.kind === 'decompose') {
    if (
      input.orientation.detailInput.workTotal > 0
      && (
        input.workSetBaseline.state !== 'available'
        || input.orientation.detailInput.workSetRevision !== input.workSetBaseline.workSetRevision
        || input.orientation.detailInput.workTotal !== input.workSetBaseline.workTotal
      )
    ) return failure('invalid-relation', requestId);
  }

  const measure = input.orientation.measureInput;
  if (
    measure?.owner === 'accepted-work'
    && (
      detail.kind !== 'execute'
      || measure.current !== detail.acceptedWork
      || measure.total !== detail.workTotal
      || measure.unitSetRevision !== detail.workSetRevision
      || measure.sourceRevision !== detail.acceptanceSetRevision
    )
  ) return failure('invalid-relation', requestId);
  if (!validateWave(input.drilldown.wave, input.orientation.position, detail)) {
    return failure('invalid-relation', requestId);
  }

  const request: RootFlowPublishRequestV2 = {
    version: 2,
    capability: 'orchestratorFlowPublicationV2',
    requestId: input.requestId,
    expectedPreviousPublicationRevision: input.expectedPreviousPublicationRevision,
    scope: input.scope,
    rootTask: input.rootTask,
    orientation: {
      position: input.orientation.position,
      movement: input.orientation.movement,
      fromPosition: input.orientation.fromPosition,
      resumeFrom: input.orientation.resumeFrom,
      detail,
      measure,
    },
    workSetBaseline: input.workSetBaseline,
    executeAcceptance,
    drilldown: input.drilldown,
    publisher: input.publisher,
    semanticObservedAtUnixMs: input.semanticObservedAtUnixMs,
    lease: {
      leaseId: input.lease.leaseId,
      leaseRevision: input.lease.leaseRevision,
      ownerActorId: input.publisher.actorId,
      selectionRevision: input.rootTask.selectionRevision,
      issuedAtUnixMs: input.semanticObservedAtUnixMs,
      expiresAtUnixMs: input.semanticObservedAtUnixMs + input.lease.durationMs,
      durationMs: input.lease.durationMs,
    },
  };
  if (Buffer.byteLength(canonicalFlowStatusJsonV2(request), 'utf8') > 256 * 1024) {
    return failure('too-large', requestId);
  }
  return request;
}

export function isRootFlowCommandFailureV2(
  value: BuildRootFlowPublishResultV2,
): value is RootFlowCommandFailureV2 {
  return 'state' in value && value.state === 'error';
}
