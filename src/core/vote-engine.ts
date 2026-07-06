/**
 * Adversarial 3-Vote Synthesis Engine
 *
 * Runs a simulated 3-agent panel (prosecutor / defender / judge) over a set of
 * findings treated as evidence, producing a weighted-consensus verdict.
 *
 * Weights: prosecutor 0.25, defender 0.25, judge 0.50.
 */

import type {
  Finding,
  FindingSeverity,
  FindingConfidence,
} from './finding.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoteRole = 'prosecutor' | 'defender' | 'judge';
export type VoteStance = 'support' | 'oppose' | 'abstain';

/** Individual vote cast by one panel role. */
export interface VoteResult {
  role: VoteRole;
  stance: VoteStance;
  rationale: string;
  confidence: number;
  evidenceIndices: number[];
}

/** Weighted-consensus verdict returned by a complete vote round. */
export interface Verdict {
  topic: string;
  outcome: VoteStance;
  confidence: number;
  details: string;
  consensus: boolean;
  votes: VoteResult[];
}

// ---------------------------------------------------------------------------
// Default weights
// ---------------------------------------------------------------------------

export const VOTE_WEIGHTS: Record<VoteRole, number> = {
  prosecutor: 0.25,
  defender: 0.25,
  judge: 0.50,
};

// ---------------------------------------------------------------------------
// Scorers per role
// ---------------------------------------------------------------------------

/**
 * Convert FindingSeverity to a numeric weight (0-1).
 * Critical=1.0, High=0.8, Medium=0.5, Low=0.2, Info=0.0
 */
function severityScore(severity: FindingSeverity): number {
  switch (severity) {
    case 'critical': return 1.0;
    case 'high': return 0.8;
    case 'medium': return 0.5;
    case 'low': return 0.2;
    case 'info': return 0.0;
  }
}

/**
 * Convert FindingConfidence to a numeric weight (0-1).
 */
function confidenceScore(confidence: FindingConfidence): number {
  switch (confidence) {
    case 'high': return 1.0;
    case 'medium': return 0.6;
    case 'low': return 0.2;
  }
}

/** Score evidence from the prosecutor's perspective — favours severe findings. */
function prosecutorScore(finding: Finding): number {
  return (
    severityScore(finding.severity) * 0.6 +
    confidenceScore(finding.confidence) * 0.4
  );
}

/** Score evidence from the defender's perspective — favours weak findings. */
function defenderScore(finding: Finding): number {
  const sev = severityScore(finding.severity);
  const conf = confidenceScore(finding.confidence);
  return (1 - sev) * 0.4 + (1 - conf) * 0.6;
}

/** Score evidence from the judge's perspective — balanced view. */
function judgeScore(finding: Finding): number {
  const sev = severityScore(finding.severity);
  const conf = confidenceScore(finding.confidence);
  return sev * 0.4 + conf * 0.6;
}

// ---------------------------------------------------------------------------
// Vote helpers
// ---------------------------------------------------------------------------

/** Threshold above which a score is considered "supporting" evidence. */
const SUPPORT_THRESHOLD = 0.5;
/** Threshold below which a score is considered "opposing" evidence. */
const OPPOSE_THRESHOLD = 0.3;

function pickStance(score: number): VoteStance {
  if (score >= SUPPORT_THRESHOLD) return 'support';
  if (score <= OPPOSE_THRESHOLD) return 'oppose';
  return 'abstain';
}

function buildRationale(role: string, stance: VoteStance, hits: number, total: number): string {
  if (total === 0) return 'No evidence provided.';
  const pct = Math.round((hits / total) * 100);
  if (stance === 'support') {
    return `${role} finds ${hits}/${total} evidence items compelling (${pct}%).`;
  }
  if (stance === 'oppose') {
    return `${role} finds ${hits}/${total} evidence items unconvincing (${pct}% weakness).`;
  }
  return `${role} finds mixed evidence (${hits}/${total} at threshold).`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run one adversarial vote round over a set of findings (evidence).
 *
 * @param topic  Short label describing what is being voted on.
 * @param evidence  Array of Findings to evaluate. An empty array returns a
 *                  low-confidence abstain.
 * @returns A `Verdict` containing each role's vote and the weighted consensus.
 */
export function runVoteRound(topic: string, evidence: Finding[]): Verdict {
  if (evidence.length === 0) {
    const emptyVote: VoteResult[] = [
      { role: 'prosecutor', stance: 'abstain', rationale: 'No evidence.', confidence: 0, evidenceIndices: [] },
      { role: 'defender', stance: 'abstain', rationale: 'No evidence.', confidence: 0, evidenceIndices: [] },
      { role: 'judge', stance: 'abstain', rationale: 'No evidence.', confidence: 0, evidenceIndices: [] },
    ];
    return {
      topic,
      outcome: 'abstain',
      confidence: 0,
      details: 'No evidence to evaluate.',
      consensus: true,
      votes: emptyVote,
    };
  }

  // --- Prosecutor ---
  const pIndices = evidence
    .map((f, i) => ({ score: prosecutorScore(f), i }))
    .filter(({ score }) => score >= SUPPORT_THRESHOLD)
    .map(({ i }) => i);
  const pScore = pIndices.length / evidence.length;
  const pStance = pickStance(pScore);
  const pConfidence = pIndices.length > 0
    ? Math.min(1, pIndices.reduce((sum, i) => sum + prosecutorScore(evidence[i]), 0) / pIndices.length * 0.5 + 0.5)
    : 0.1;
  const prosecutor: VoteResult = {
    role: 'prosecutor',
    stance: pStance,
    rationale: buildRationale('Prosecutor', pStance, pIndices.length, evidence.length),
    confidence: Math.round(pConfidence * 100) / 100,
    evidenceIndices: pIndices,
  };

  // --- Defender ---
  const dIndices = evidence
    .map((f, i) => ({ score: defenderScore(f), i }))
    .filter(({ score }) => score >= SUPPORT_THRESHOLD)
    .map(({ i }) => i);
  const dScore = dIndices.length / evidence.length;
  const dStance = pickStance(dScore);
  const dConfidence = dIndices.length > 0
    ? Math.min(1, dIndices.reduce((sum, i) => sum + defenderScore(evidence[i]), 0) / dIndices.length * 0.5 + 0.5)
    : 0.1;
  const defender: VoteResult = {
    role: 'defender',
    stance: dStance,
    rationale: buildRationale('Defender', dStance, dIndices.length, evidence.length),
    confidence: Math.round(dConfidence * 100) / 100,
    evidenceIndices: dIndices,
  };

  // --- Judge ---
  const jIndices = evidence
    .map((f, i) => ({ score: judgeScore(f), i }))
    .filter(({ score }) => score >= SUPPORT_THRESHOLD)
    .map(({ i }) => i);
  const jScore = jIndices.length / evidence.length;
  const jStance = pickStance(jScore);
  const jConfidence = jIndices.length > 0
    ? Math.min(1, jIndices.reduce((sum, i) => sum + judgeScore(evidence[i]), 0) / jIndices.length * 0.5 + 0.5)
    : 0.1;
  const judge: VoteResult = {
    role: 'judge',
    stance: jStance,
    rationale: buildRationale('Judge', jStance, jIndices.length, evidence.length),
    confidence: Math.round(jConfidence * 100) / 100,
    evidenceIndices: jIndices,
  };

  const votes: VoteResult[] = [prosecutor, defender, judge];

  // --- Weighted consensus ---
  const weights = VOTE_WEIGHTS;
  const weightMap: Record<VoteStance, number> = { support: 0, oppose: 0, abstain: 0 };

  for (const vote of votes) {
    weightMap[vote.stance] += weights[vote.role] * vote.confidence;
  }

  // Determine outcome: highest weighted total wins
  let outcome: VoteStance = 'abstain';
  let topWeight = 0;
  for (const [stance, w] of Object.entries(weightMap)) {
    if (w > topWeight) {
      topWeight = w;
      outcome = stance as VoteStance;
    }
  }
  // Scale confidence: base is the winner's share of total weight
  const totalWeight = weightMap.support + weightMap.oppose + weightMap.abstain || 1;
  const confidence = Math.round((topWeight / totalWeight) * 100) / 100;

  // Consensus: all non-abstain votes agree (ignoring abstains), or all abstain
  const nonAbstain = votes.filter((v) => v.stance !== 'abstain');
  const allSameStance = nonAbstain.length === 0 || nonAbstain.every((v) => v.stance === nonAbstain[0].stance);
  const consensus = votes.length === 0 || allSameStance;

  const details = outcome === 'abstain'
    ? 'No clear consensus — most votes are abstain or evenly split.'
    : `Verdict: ${outcome} (confidence ${confidence}). Prosecutor ${prosecutor.stance}, defender ${defender.stance}, judge ${judge.stance}.`;

  return {
    topic,
    outcome,
    confidence,
    details,
    consensus,
    votes,
  };
}
