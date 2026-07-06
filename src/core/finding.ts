/**
 * Finding Schema - Standardized JSON contract for all reviewer and diagnostic outputs.
 * Modeled after Maestro-Flow's finding-schema.json (JSON Schema draft 2020-12).
 *
 * Used by: omp-flow-reviewer, omp-flow-debugger, drift-check, grill audit.
 */

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingConfidence = 'high' | 'medium' | 'low';
export type FindingSource = 'tool' | 'llm' | 'tool+llm' | 'manual';
export type FindingDimensionLevel = 'critical' | 'moderate' | 'advisory';

export interface DimensionReadinessEntry {
  dimension: FindingDimension;
  level: FindingDimensionLevel;
  score: number;
  maxScore: number;
  findingsCount: number;
}

export type FixStrategy = 'minimal' | 'refactor' | 'rewrite' | 'defer';
export type FixComplexity = 'trivial' | 'low' | 'medium' | 'high';
export type FindingStatus = 'open' | 'fixing' | 'fixed' | 'deferred';

export type FindingDimension =
  | 'security'
  | 'correctness'
  | 'performance'
  | 'maintainability'
  | 'testing'
  | 'architecture'
  | 'documentation'
  | 'dependency'
  | 'ui-ux'
  | 'accessibility';

export interface FindingLocation {
  file: string;
  line: number;
  end_line?: number;
  code_snippet?: string;
}

export interface FindingRootCause {
  description: string;
  related_findings: string[];
  is_symptom: boolean;
}

export interface FindingImpact {
  scope: 'critical' | 'high' | 'medium' | 'low';
  affected_files: string[];
  blast_radius: string;
}

export interface FindingOptimization {
  approach: string;
  alternative?: string;
  tradeoff?: string;
}

/**
 * Outcome of the most recent re-verify pass after a reviewer-applied fix.
 * Persisted on Finding.last_recheck_result.
 */
export interface RecheckResult {
  boundary_ok: boolean;
  build_ok: boolean;
  diagnostics: string[];
}

export interface Finding {
  id: string;
  dimension: FindingDimension;
  category: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  location: FindingLocation;
  source: FindingSource;
  tool_rule?: string;
  suggested_fix: string;
  references: string[];
  effort: FixComplexity;
  confidence: FindingConfidence;
  root_cause?: FindingRootCause;
  impact?: FindingImpact;
  optimization?: FindingOptimization;
  fix_strategy: FixStrategy;
  fix_complexity: FixComplexity;
  fix_dependencies: string[];
  status: FindingStatus;
  fix_attempts: number;
  fixed_by?: string;
  fixed_at?: string;
  last_fix_summary?: string;
  last_recheck_result?: RecheckResult;
}

/**
 * Issue Analysis schema for gap detection and root-cause tracking.
 * Modeled after Maestro-Flow's IssueAnalysis from issue-gaps-analyze.
 */
export interface IssueAnalysis {
  iss_id: string;
  root_cause: string;
  affected_files: string[];
  impact_scope: string;
  fix_direction: string;
  confidence: FindingConfidence;
  cross_refs: string[];
  analyzed_at: string;
  tool?: string;
  depth: 'quick' | 'standard' | 'deep';
}

/**
 * Generates a finding ID with dimension prefix.
 * e.g., "SEC-001", "COR-002", "PRF-003"
 */
export function generateFindingId(dimension: FindingDimension, index: number): string {
  const prefixMap: Record<FindingDimension, string> = {
    'security': 'SEC',
    'correctness': 'COR',
    'performance': 'PRF',
    'maintainability': 'MNT',
    'testing': 'TST',
    'architecture': 'ARC',
    'documentation': 'DOC',
    'dependency': 'DEP',
    'ui-ux': 'UIX',
    'accessibility': 'A11Y',
  };
  return `${prefixMap[dimension]}-${String(index).padStart(3, '0')}`;
}

/**
 * Sort findings by severity for topological fix ordering.
 * Critical → High → Medium → Low → Info
 */
export function sortFindingsBySeverity(findings: Finding[]): Finding[] {
  const order: Record<FindingSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * Filter unresolved findings at or above a severity threshold.
 */
export function filterBySeverity(
  findings: Finding[],
  minSeverity: FindingSeverity = 'medium'
): Finding[] {
  const order: Record<FindingSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  const threshold = order[minSeverity];
  return findings.filter((f) => f.status !== 'fixed' && f.status !== 'deferred' && order[f.severity] <= threshold);
}

/**
 * Factory that constructs a Finding with lifecycle defaults applied.
 * Sets `status='open'` and `fix_attempts=0`; generates an `id` when absent.
 * Does NOT mutate the input partial; returns a new object.
 */
export function createFinding(partial: Partial<Finding>): Finding {
  const status: FindingStatus = partial.status ?? 'open';
  const fix_attempts: number = partial.fix_attempts ?? 0;
  const id: string = partial.id ?? generateFindingId(partial.dimension ?? 'correctness', Date.now() % 1000);
  return { ...partial, id, status, fix_attempts } as Finding;
}

/**
 * Pure state-transition for a Finding's fix lifecycle.
 * Returns a new Finding with `status` set to `newStatus` and, when transitioning
 * to 'fixed', stamps `fixed_at` (and `fixed_by` when `agentId` is provided).
 * When transitioning out of 'fixed', clears `fixed_at`/`fixed_by`.
 * Never mutates the input.
 */
export function transitionFindingStatus(f: Finding, newStatus: FindingStatus, agentId?: string): Finding {
  const now = new Date().toISOString();
  const base: Finding = { ...f, status: newStatus };
  if (newStatus === 'fixed') {
    base.fixed_at = now;
    if (agentId !== undefined) {
      base.fixed_by = agentId;
    }
  } else if (f.status === 'fixed') {
    base.fixed_at = undefined;
    base.fixed_by = undefined;
  }
  return base;
}

/**
 * Core 6 dimensions used in the 6-Dimension x 3-Level readiness model.
 */
const CORE_DIMENSIONS: FindingDimension[] = [
  'security',
  'correctness',
  'performance',
  'maintainability',
  'testing',
  'architecture',
];

/**
 * Compute per-dimension readiness entries from a set of findings.
 * Each dimension gets a level and score based on the severest finding in it:
 * - critical (blocking) → score 2/10, any critical/high-severity finding present
 * - moderate (should-fix) → score 6/10, any medium-severity finding present
 * - advisory (optional) → score 10/10, only low/info findings or none
 *
 * The 6 core dimensions are always represented; absent findings default to advisory.
 */
export function computeDimensionReadiness(findings: Finding[]): DimensionReadinessEntry[] {
  return CORE_DIMENSIONS.map((dim) => {
    const dimFindings = findings.filter((f) => f.dimension === dim);

    if (dimFindings.length === 0) {
      return { dimension: dim, level: 'advisory' as const, score: 10, maxScore: 10, findingsCount: 0 };
    }

    const hasCritical = dimFindings.some(
      (f) => f.severity === 'critical' || f.severity === 'high'
    );
    const hasModerate = dimFindings.some((f) => f.severity === 'medium');

    if (hasCritical) {
      return { dimension: dim, level: 'critical' as const, score: 2, maxScore: 10, findingsCount: dimFindings.length };
    }
    if (hasModerate) {
      return { dimension: dim, level: 'moderate' as const, score: 6, maxScore: 10, findingsCount: dimFindings.length };
    }
    return { dimension: dim, level: 'advisory' as const, score: 10, maxScore: 10, findingsCount: dimFindings.length };
  });
}
