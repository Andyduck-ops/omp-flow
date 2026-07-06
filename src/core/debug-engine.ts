/**
 * Debug Investigation Engine — 3-Strike Hypothesis Cap + Backward-Tracing Root Cause
 *
 * Modeled after Maestro's learn-investigate 4-phase method:
 * 1. Generate up to 3 hypotheses from available findings.
 * 2. Backward-trace from symptom through root cause chain (5-whys style).
 * 3. Persist evidence to evidence.ndjson.
 * 4. Escalate via AskUserQuestion when all hypotheses exhaust.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { type Finding, type FindingConfidence, type IssueAnalysis } from './finding.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HypothesisStatus = 'active' | 'confirmed' | 'rejected' | 'exceeded_cap';

/**
 * A single debug hypothesis — what might be causing the symptom.
 */
export interface Hypothesis {
  id: string;
  description: string;
  status: HypothesisStatus;
  confidence: FindingConfidence;
  evidenceFor: string[];
  evidenceAgainst: string[];
  created_at: string;
  updated_at: string;
  findingRef?: string;
}

/**
 * One step in a 5-whys backward-trace chain.
 */
export interface RootCauseEntry {
  why: string;
  because: string;
  depth: number;
}

/**
 * Complete backward-trace result from symptom to root cause.
 */
export interface RootCauseTrace {
  symptom: string;
  chain: RootCauseEntry[];
  root_cause: string;
  rootCauseFindingId: string | null;
  completed_at: string;
}

/**
 * Human-in-the-loop escalation question.
 */
export interface AskUserQuestion {
  question: string;
  context: string[];
  hypotheses_tried: Hypothesis[];
  suggestions: string[];
  escalated_at: string;
}

/**
 * Complete investigation result returned by investigate().
 */
export interface InvestigationResult {
  investigation_id: string;
  symptom: string;
  hypotheses: Hypothesis[];
  root_cause_trace: RootCauseTrace | null;
  issue_analyses: IssueAnalysis[];
  escalation: AskUserQuestion | null;
  exhausted: boolean;
  completed_at: string;
}

/**
 * Configuration for the investigation engine.
 */
export interface InvestigationConfig {
  /** Max hypotheses to generate (capped at 3 internally). */
  maxHypotheses: number;
  /** Directory where evidence.ndjson is persisted. */
  evidenceDir: string;
  /** Workspace root directory for pattern search. */
  workspaceDir: string;
}

/**
 * Result of Phase 2 pattern analysis — working examples, structural differences, and
 * recommendations to inform hypothesis generation.
 */
export interface PatternAnalysisResult {
  /** Similar working implementations found in the workspace. */
  workingExamples: Array<{ file: string; pattern: string; description: string }>;
  /** Structural differences between working and failing code. */
  differences: string[];
  /** Hints for hypothesis generation derived from pattern comparison. */
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type EvidenceType =
  | 'hypothesis_generated'
  | 'hypothesis_updated'
  | 'evidence_collected'
  | 'root_cause_found'
  | 'escalated';

interface EvidenceEntry {
  ts: string;
  type: EvidenceType;
  investigation_id: string;
  data: Record<string, unknown>;
}

function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rand}`;
}

function appendEvidence(evidenceDir: string, entry: EvidenceEntry): void {
  const evidencePath = path.join(evidenceDir, 'evidence.ndjson');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.appendFileSync(evidencePath, `${JSON.stringify(entry)}\n`, 'utf-8');
}

function computeConfidence(
  evidenceFor: string[],
  evidenceAgainst: string[],
): FindingConfidence {
  if (evidenceFor.length === 0 && evidenceAgainst.length === 0) return 'low';
  if (evidenceAgainst.length > evidenceFor.length) return 'low';
  if (evidenceFor.length >= 3 && evidenceAgainst.length === 0) return 'high';
  if (evidenceFor.length >= 1 && evidenceAgainst.length === 0) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Investigate a symptom by generating up to `maxHypotheses` (capped at 3)
 * from available findings, then backward-tracing the root cause.
 *
 * If all hypotheses are rejected or no root cause can be determined, an
 * escalation (AskUserQuestion) is returned in the result.
 *
 * Evidence is appended to `<evidenceDir>/evidence.ndjson` as structured
 * ndjson entries throughout the lifecycle.
 */
export function investigate(
  symptom: string,
  findings: Finding[],
  config: InvestigationConfig,
): InvestigationResult {
  const investigationId = generateId('INV');
  const cap = Math.min(Math.max(config.maxHypotheses, 1), 3);
  const evidenceDir = config.evidenceDir;

  // Phase 1 — Root cause / evidence gathering
  const rootCauseTrace = traceRootCause(symptom, findings, evidenceDir);
  if (rootCauseTrace !== null) {
    appendEvidence(evidenceDir, {
      ts: rootCauseTrace.completed_at,
      type: 'root_cause_found',
      investigation_id: investigationId,
      data: {
        chainLength: rootCauseTrace.chain.length,
        rootCause: rootCauseTrace.root_cause,
      },
    });
  }

  // Phase 2 — Pattern Analysis (NEW): search workspace for working examples
  const patterns = patternAnalysis(symptom, findings, config.workspaceDir);

  // Phase 3 — Hypothesis generation (informed by pattern analysis)
  const hypotheses = generateHypotheses(symptom, findings, cap, investigationId, evidenceDir, patterns);

  // Build IssueAnalysis from root cause
  const issueAnalyses = buildIssueAnalyses(rootCauseTrace, findings);

  // Phase 4 — Escalate if all hypotheses exhausted and no root cause found
  const exhausted = hypotheses.every(
    (h) => h.status === 'rejected' || h.status === 'exceeded_cap',
  );
  const hasRootCause = rootCauseTrace !== null && rootCauseTrace.chain.length > 0;

  let escalation: AskUserQuestion | null = null;
  if ((hypotheses.length === 0 || exhausted) && !hasRootCause) {
    escalation = escalate(symptom, hypotheses, {
      question: `Unable to determine root cause for symptom: "${symptom}". Provide additional context or guidance.`,
      suggestions: [
        'Review failure logs for unhandled error codes or stack traces.',
        'Check for recent changes in affected files listed in findings.',
        'Verify input data or environment state at time of failure.',
      ],
    });

    appendEvidence(evidenceDir, {
      ts: escalation.escalated_at,
      type: 'escalated',
      investigation_id: investigationId,
      data: {
        question: escalation.question,
        hypothesisCount: hypotheses.length,
      },
    });
  }

  return {
    investigation_id: investigationId,
    symptom,
    hypotheses,
    root_cause_trace: rootCauseTrace,
    issue_analyses: issueAnalyses,
    escalation,
    exhausted,
    completed_at: new Date().toISOString(),
  };
}

/**
 * Backward-trace from a symptom through a 5-whys root-cause chain using
 * available findings. Returns `null` when no symptom findings exist.
 *
 * Each finding with `root_cause.is_symptom === true` is a downstream effect;
 * the engine follows `related_findings[]` to reach the root cause
 * (`is_symptom === false`).
 *
 * Evidence is persisted to `<evidenceDir>/evidence.ndjson`.
 */
export function traceRootCause(
  symptom: string,
  findings: Finding[],
  evidenceDir?: string,
): RootCauseTrace | null {
  const symptomFindings = findings.filter(
    (f) => f.root_cause?.is_symptom === true,
  );
  if (symptomFindings.length === 0) return null;

  const chain: RootCauseEntry[] = [];
  let rootCauseFindingId: string | null = null;
  let rootCauseDescription = '';

  for (const symptomF of symptomFindings) {
    const relatedIds = symptomF.root_cause!.related_findings;
    if (relatedIds.length === 0) continue;

    // Build chain up to 5-whys depth
    let depth = 0;
    let currentId: string | undefined = relatedIds[0];

    while (currentId && depth < 5) {
      const currentFinding = findings.find((f) => f.id === currentId);
      if (!currentFinding) break;

      const isRootCause = currentFinding.root_cause?.is_symptom === false;

      chain.push({
        why: depth === 0 ? `Why does "${symptomF.title}" occur?` : 'Why does this happen?',
        because: currentFinding.description,
        depth: depth + 1,
      });

      appendEvidence(evidenceDir ?? process.cwd(), {
        ts: new Date().toISOString(),
        type: 'root_cause_found',
        investigation_id: 'trace',
        data: {
          depth: depth + 1,
          description: currentFinding.description,
          isRootCause,
        },
      });

      if (isRootCause) {
        rootCauseFindingId = currentFinding.id;
        rootCauseDescription = currentFinding.description;
        break;
      }

      // Follow related findings chain
      const nextRelated = currentFinding.root_cause?.related_findings;
      currentId = nextRelated && nextRelated.length > 0 ? nextRelated[0] : undefined;
      depth++;
    }
  }

  return {
    symptom,
    chain,
    root_cause: rootCauseDescription || symptom,
    rootCauseFindingId,
    completed_at: new Date().toISOString(),
  };
}

/**
 * Generate an AskUserQuestion escalation when hypotheses are exhausted.
 *
 * Returns a structured escalation object suitable for human-in-the-loop
 * intervention.
 */
export function escalate(
  symptom: string,
  hypotheses: Hypothesis[],
  overrides?: Partial<{
    question: string;
    suggestions: string[];
  }>,
): AskUserQuestion {
  const context: string[] = [
    `Symptom: ${symptom}`,
    `Hypotheses tried: ${hypotheses.length}`,
    ...hypotheses.map(
      (h) => `  [${h.status}] ${h.id}: ${h.description} (confidence: ${h.confidence})`,
    ),
  ];

  return {
    question:
      overrides?.question ??
      `Unable to determine root cause for symptom: "${symptom}". Provide additional context or guidance.`,
    context,
    hypotheses_tried: hypotheses,
    suggestions:
      overrides?.suggestions ?? [
        'Review failure logs for unhandled error codes or stack traces.',
        'Check for recent changes in affected files listed in findings.',
        'Verify input data or environment state at time of failure.',
      ],
    escalated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

/**
 * Build the evidenceFor array for a hypothesis, including pattern analysis
 * differences when available.
 */
function buildEvidenceFor(
  finding: Finding,
  patterns: PatternAnalysisResult | undefined,
): string[] {
  const evidence: string[] = [];

  if (finding.root_cause?.is_symptom === false) {
    evidence.push('Marked as root cause in findings');
  }

  if (patterns && patterns.differences.length > 0) {
    for (const diff of patterns.differences) {
      evidence.push(`Pattern difference: ${diff}`);
    }
  }

  if (patterns && patterns.recommendations.length > 0) {
    for (const rec of patterns.recommendations) {
      evidence.push(`Pattern recommendation: ${rec}`);
    }
  }

  return evidence;
}

const COMMON_WORDS: Record<string, true> = {
  this: true, that: true, with: true, from: true, have: true, been: true,
  were: true, what: true, when: true, where: true, which: true, their: true,
  there: true, would: true, could: true, should: true, about: true,
  after: true, before: true, into: true, over: true, other: true, than: true,
  then: true, also: true, because: true, while: true, until: true, more: true,
  some: true, each: true, every: true, both: true, most: true, many: true,
  much: true, such: true, only: true, very: true, well: true, even: true,
  still: true, already: true, always: true, never: true, often: true,
  however: true, though: true, through: true, without: true, within: true,
  across: true, along: true, during: true, since: true,
  either: true, neither: true, whether: true, rather: true, almost: true,
  enough: true, quite: true,
};
const SYMPTOM_TERM_MIN_LENGTH = 3;

/**
 * Phase 2: Pattern Analysis — search the workspace for working examples of
 * similar patterns, compare structure, and return differences / recommendations
 * that inform hypothesis generation.
 *
 * 1. Extracts meaningful terms from the symptom description.
 * 2. Uses grep to find files in src/ that implement the same pattern.
 * 3. Filters out files already flagged in findings (these are the failing code).
 * 4. Compares imports between failing and working files.
 * 5. Returns structural differences and actionable recommendations.
 */
function patternAnalysis(
  symptom: string,
  findings: Finding[],
  workspaceDir: string,
): PatternAnalysisResult {
  const workingExamples: PatternAnalysisResult['workingExamples'] = [];
  const differences: string[] = [];
  const recommendations: string[] = [];

  // Step 1 — Extract meaningful pattern terms from the symptom
  const terms = symptom
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter((t) => t.length > SYMPTOM_TERM_MIN_LENGTH && !COMMON_WORDS[t]);

  if (terms.length === 0) {
    recommendations.push('Symptom is too vague for pattern analysis; consider adding specific error context');
    return { workingExamples, differences, recommendations };
  }

  // Collect files already flagged in findings (failing code)
  const flaggedFiles = new Set<string>();
  for (const f of findings) {
    if (f.location?.file) flaggedFiles.add(path.resolve(workspaceDir, f.location.file));
  }

  // Step 2 — Search workspace for similar patterns using grep
  for (const term of terms.slice(0, 5)) {
    try {
      const grepCmd = `grep -rl --include="*.ts" --include="*.tsx" "${term}" "${workspaceDir}/src" 2>nul || true`;
      const output = execSync(grepCmd, {
        cwd: workspaceDir,
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 10000,
      });

      const files = output.trim().split('\n').filter(Boolean);
      if (files.length === 0) continue;

      // Separate working files from flagged files
      const matchedWorking = files.filter((f) => !flaggedFiles.has(f));
      const matchedFailing = files.filter((f) => flaggedFiles.has(f));

      if (matchedWorking.length > 0) {
        workingExamples.push({
          file: matchedWorking[0],
          pattern: term,
          description: `Found ${matchedWorking.length} working file(s) matching "${term}"`,
        });
      }

      if (matchedWorking.length > 0 && matchedFailing.length > 0) {
        differences.push(`Working files use "${term}" in ${matchedWorking.length} location(s); ${matchedFailing.length} failing location(s) also reference it`);

        // Step 3 — Compare imports between the first failing and first working file
        const failFile = matchedFailing[0];
        const workFile = matchedWorking[0];
        try {
          const failImports = grepImports(failFile, workspaceDir);
          const workImports = grepImports(workFile, workspaceDir);

          const failSet = new Set(failImports.map(normalizeImport));
          const workSet = new Set(workImports.map(normalizeImport));

          const missingInWorking = failImports
            .map(normalizeImport)
            .filter((imp) => !workSet.has(imp));
          const missingInFailing = workImports
            .map(normalizeImport)
            .filter((imp) => !failSet.has(imp));

          if (missingInFailing.length > 0) {
            differences.push(`Failing file missing imports present in working example: ${missingInFailing.join(', ')}`);
          }
          if (missingInWorking.length > 0) {
            differences.push(`Failing file has extra imports not present in working example: ${missingInWorking.join(', ')}`);
          }
        } catch {
          // File read / grep errors are non-fatal
        }
      }
    } catch {
      // grep failure (no matches, timeout, etc.) is non-fatal
      continue;
    }
  }

  // Step 4 — Generate recommendations
  if (workingExamples.length > 0) {
    recommendations.push('Compare working and failing implementations for API usage differences');
    if (differences.length > 0) {
      recommendations.push('Focus on import and structural differences identified above');
    }
    recommendations.push('Use ast-grep for structural AST comparison between working and failing files');
  }
  if (flaggedFiles.size > 0 && workingExamples.length === 0) {
    recommendations.push('No working examples found; consider checking documentation or creating a minimal reproduction');
  }

  return { workingExamples, differences, recommendations };
}

/**
 * Grep import statements from a source file.
 */
function grepImports(filePath: string, workspaceDir: string): string[] {
  const output = execSync(`grep -E "^import " "${filePath}"`, {
    cwd: workspaceDir,
    stdio: 'pipe',
    encoding: 'utf-8',
    timeout: 5000,
  });
  return output.trim().split('\n').filter(Boolean);
}

/**
 * Normalize an import line to a comparable key (source path only).
 */
function normalizeImport(importLine: string): string {
  const match = importLine.match(/from\s+['"]([^'"]+)['"]/);
  return match ? match[1] : importLine;
}

/**
 * Generate up to `cap` hypotheses from findings, persist each to evidence,
 * and mark rejected those without confirmation.
 */
function generateHypotheses(
  symptom: string,
  findings: Finding[],
  cap: number,
  investigationId: string,
  evidenceDir: string,
  patterns?: PatternAnalysisResult,
): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];

  for (const finding of findings) {
    if (hypotheses.length >= cap) break;

    // Skip findings that cannot form a meaningful hypothesis
    if (!finding.description || finding.severity === 'info') continue;

    // Enrich description with pattern analysis differences when available
    const patternSuffix =
      patterns && patterns.differences.length > 0
        ? ` | pattern diff: ${patterns.differences.join('; ')}`
        : '';
    const hypothesis: Hypothesis = {
      id: generateId('HYP'),
      description: finding.description + patternSuffix,
      status: 'active',
      confidence: finding.confidence,
      evidenceFor: buildEvidenceFor(finding, patterns),
      evidenceAgainst:
        finding.root_cause?.is_symptom === true
          ? ['Symptom flag set — this is a downstream effect, not a root cause']
          : [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      findingRef: finding.id,
    };

    hypotheses.push(hypothesis);

    appendEvidence(evidenceDir, {
      ts: hypothesis.created_at,
      type: 'hypothesis_generated',
      investigation_id: investigationId,
      data: {
        hypothesisId: hypothesis.id,
        description: hypothesis.description,
        confidence: hypothesis.confidence,
        findingRef: finding.id,
      },
    });
  }

  // Phase 1: check each hypothesis against evidence
  for (const h of hypotheses) {
    const finding = h.findingRef ? findings.find((f) => f.id === h.findingRef) : null;
    if (!finding) {
      h.status = 'rejected';
    } else if (finding.root_cause?.is_symptom === false) {
      // Confirmed: has root cause evidence
      h.status = 'confirmed';
      h.evidenceFor.push('Root cause flag confirmed in finding metadata');
    } else if (!finding.root_cause) {
      // No root cause info — insufficient evidence, mark rejected
      h.status = 'rejected';
      h.evidenceAgainst.push('No root cause metadata available in finding');
    }

    h.confidence = computeConfidence(h.evidenceFor, h.evidenceAgainst);
    h.updated_at = new Date().toISOString();

    appendEvidence(evidenceDir, {
      ts: h.updated_at,
      type: 'hypothesis_updated',
      investigation_id: investigationId,
      data: {
        hypothesisId: h.id,
        status: h.status,
        confidence: h.confidence,
      },
    });
  }

  return hypotheses;
}

/**
 * Build IssueAnalysis[] from a root cause trace + findings.
 */
function buildIssueAnalyses(
  rootCauseTrace: RootCauseTrace | null,
  findings: Finding[],
): IssueAnalysis[] {
  if (rootCauseTrace === null || rootCauseTrace.chain.length === 0) {
    return [];
  }

  const rootFinding = rootCauseTrace.rootCauseFindingId
    ? findings.find((f) => f.id === rootCauseTrace.rootCauseFindingId)
    : null;

  const affectedFiles: string[] = [];
  for (const f of findings) {
    if (f.location?.file && !affectedFiles.includes(f.location.file)) {
      affectedFiles.push(f.location.file);
    }
  }

  // Find confidence from the root finding, default to medium
  const confidence: FindingConfidence = rootFinding?.confidence ?? 'medium';

  const analysis: IssueAnalysis = {
    iss_id: generateId('ISS'),
    root_cause: rootCauseTrace.root_cause,
    affected_files: affectedFiles,
    impact_scope: `Symptom: "${rootCauseTrace.symptom}" — trace depth ${rootCauseTrace.chain.length}`,
    fix_direction: rootFinding?.suggested_fix ?? 'Investigate root cause and apply corrective changes.',
    confidence,
    cross_refs: rootCauseTrace.chain.map((e) => e.because),
    analyzed_at: rootCauseTrace.completed_at,
    depth: rootCauseTrace.chain.length >= 4 ? 'deep' : rootCauseTrace.chain.length >= 2 ? 'standard' : 'quick',
  };

  return [analysis];
}
