import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ContextPackage } from '../core/context-package.js';
import {
  Finding,
  computeDimensionReadiness,
  DimensionReadinessEntry,
} from '../core/finding.js';

export interface ReadinessScoreBreakdown {
  /** Project-level completeness metric (10% weight). */
  completeness: number;
  /** Project-level consistency metric (10% weight). */
  consistency: number;
  /** Project-level traceability metric (10% weight). */
  traceability: number;
  /** Project-level depth metric (10% weight). */
  depth: number;
  /** Subtotal of project-level metrics (40 max). */
  projectScore: number;
  /** Per-dimension breakdown for the 6 core dimensions (each 10 max = 60 total). */
  dimensionBreakdown: DimensionReadinessEntry[];
  /** Subtotal of dimension-level metrics (60 max). */
  dimensionScore: number;
  /** Combined total score (100 max). */
  totalScore: number;
  /** Gate status: PASS >=80, REVIEW 60-79, FAIL <60. */
  gateStatus: 'PASS' | 'REVIEW' | 'FAIL';
}
export interface DriftCheckResult {
  hasDrift: boolean;
  violations: string[];
  passedCriteria: string[];
  readiness?: ReadinessScoreBreakdown;
}

export function cleanTargetFilePath(raw: string): string {
  if (!raw) return '';
  const headerMatch = raw.match(/^\[([^#\]]+)/);
  if (headerMatch && headerMatch[1]) {
    return headerMatch[1].trim();
  }
  return raw.trim();
}

function normalizeWorkspaceRelativePath(raw: string): string {
  if (!raw) return '';

  const cleaned = cleanTargetFilePath(raw).trim().replace(/\\/g, '/');
  if (!cleaned) return '';

  const withoutLeadingDotSlash = cleaned.replace(/^(\.\/)+/, '');
  const normalized = path.posix.normalize(withoutLeadingDotSlash);
  return normalized === '.' ? '' : normalized;
}

function normalizeComparisonKey(raw: string): string {
  return normalizeWorkspaceRelativePath(raw).toLowerCase();
}

function matchGlobPattern(filePath: string, pattern: string): boolean {
  const normFile = cleanTargetFilePath(filePath).replace(/\\/g, '/').toLowerCase();
  const normPattern = pattern.replace(/\\/g, '/').toLowerCase();

  if (!normFile || !normPattern) return false;
  if (normFile === normPattern || normFile.includes(normPattern)) return true;

  const escapedPattern = normPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*\//g, '___DOUBLE_STAR_SLASH___')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]+')
    .replace(/___DOUBLE_STAR_SLASH___/g, '(?:.*/)?')
    .replace(/___DOUBLE_STAR___/g, '.*');

  try {
    const regex = new RegExp(`^${escapedPattern}$|^${escapedPattern}/|/${escapedPattern}`);
    return regex.test(normFile);
  } catch {
    return normFile.includes(normPattern);
  }
}

function readPhysicalModifiedFiles(workspaceDir: string): string[] {
  try {
    const status = cp.spawnSync('git', ['status', '--porcelain=v1', '-z'], {
      cwd: workspaceDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (status.error || status.status !== 0 || !status.stdout) {
      return [];
    }

    const entries = status.stdout.split('\0').filter((entry) => entry.length > 0);
    const files: string[] = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (entry.length < 4) {
        continue;
      }

      const entryStatus = entry.slice(0, 2);
      const rawPath = entry.slice(3);

      if (entryStatus.includes('R') || entryStatus.includes('C')) {
        const renamedPath = entries[index + 1];
        if (renamedPath) {
          const normalizedRenamedPath = normalizeWorkspaceRelativePath(renamedPath);
          if (normalizedRenamedPath) {
            files.push(normalizedRenamedPath);
          }
          index += 1;
        }
        continue;
      }

      const normalizedPath = normalizeWorkspaceRelativePath(rawPath);
      if (normalizedPath) {
        files.push(normalizedPath);
      }
    }

    return files;
  } catch {
    return [];
  }
}

export function calculateReadinessScore(
  violations: string[],
  modifiedFiles: string[],
  contextPkg: ContextPackage,
  findings?: Finding[]
): ReadinessScoreBreakdown {
  const isZeroDrift = violations.length === 0;
  const hasRequirements = (contextPkg.requirements || []).length > 0;
  const hasSpecRules = (contextPkg.specRules || []).length > 0;
  const hasInScopeFiles = modifiedFiles.length > 0;

  // Project-level metrics: 10 each, total 40 max
  const completeness = isZeroDrift ? (hasRequirements ? 10 : 6) : 2;
  const consistency = isZeroDrift ? 10 : 4;
  const traceability = hasInScopeFiles ? 10 : 6;
  const depth = hasSpecRules ? 10 : 6;
  const projectScore = completeness + consistency + traceability + depth;

  // Dimension-level metrics: 6 core dims x 10 max = 60 max
  const dimensionBreakdown = computeDimensionReadiness(findings ?? []);
  const dimensionScore = dimensionBreakdown.reduce((sum, d) => sum + d.score, 0);

  const totalScore = Math.min(projectScore + dimensionScore, 100);
  const gateStatus: 'PASS' | 'REVIEW' | 'FAIL' = totalScore >= 80 ? 'PASS' : totalScore >= 60 ? 'REVIEW' : 'FAIL';

  return {
    completeness,
    consistency,
    traceability,
    depth,
    projectScore,
    dimensionBreakdown,
    dimensionScore,
    totalScore,
    gateStatus,
  };
}

export function executeMaestroBoundaryCheck(
  taskId: string,
  modifiedFiles: string[],
  workspaceDir: string = process.cwd()
): DriftCheckResult {
  const packagePath = path.join(workspaceDir, '.omp-flow', 'scratch', taskId, 'context-package.json');

  if (!fs.existsSync(packagePath)) {
    return {
      hasDrift: false,
      violations: [],
      passedCriteria: ['No context package found, assuming valid'],
      readiness: {
        completeness: 10,
        consistency: 10,
        traceability: 10,
        depth: 10,
        projectScore: 40,
        dimensionBreakdown: [
          { dimension: 'security', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
          { dimension: 'correctness', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
          { dimension: 'performance', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
          { dimension: 'maintainability', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
          { dimension: 'testing', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
          { dimension: 'architecture', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
        ],
        dimensionScore: 60,
        totalScore: 100,
        gateStatus: 'PASS',
      },
    };
  }

  let contextPkg: ContextPackage;
  try {
    contextPkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  } catch {
    return {
      hasDrift: false,
      violations: [],
      passedCriteria: ['Malformed context package, skipping drift check'],
      readiness: {
        completeness: 6,
        consistency: 4,
        traceability: 6,
        depth: 6,
        projectScore: 22,
        dimensionBreakdown: [
          { dimension: 'security', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
          { dimension: 'correctness', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
          { dimension: 'performance', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
          { dimension: 'maintainability', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
          { dimension: 'testing', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
          { dimension: 'architecture', level: 'advisory', score: 10, maxScore: 10, findingsCount: 0 },
        ],
        dimensionScore: 0,
        totalScore: 22,
        gateStatus: 'FAIL',
      },
    };
  }

  const violations: string[] = [];
  const passedCriteria: string[] = [];
  const reportedFiles = new Set(
    modifiedFiles.map((file) => normalizeComparisonKey(file)).filter((file) => file.length > 0)
  );
  const physicalFiles = readPhysicalModifiedFiles(workspaceDir);
  const unreportedPhysicalFiles = new Set<string>();

  for (const physicalFile of physicalFiles) {
    const physicalFileKey = normalizeComparisonKey(physicalFile);
    if (!physicalFileKey || reportedFiles.has(physicalFileKey)) {
      continue;
    }

    unreportedPhysicalFiles.add(physicalFile);
  }

  for (const file of unreportedPhysicalFiles) {
    violations.push(`Unreported physical modification detected in '${file}' (present in git status but missing from modifiedFiles)`);
  }

  for (const rawFile of modifiedFiles) {
    const file = cleanTargetFilePath(rawFile);
    for (const outOfScope of contextPkg.boundary.out_of_scope || []) {
      if (matchGlobPattern(file, outOfScope)) {
        violations.push(`File '${file}' modifies out-of-scope boundary constraint: ${outOfScope}`);
      }
    }
  }

  if (violations.length === 0) {
    passedCriteria.push('All modified files remain strictly within defined in_scope boundary');
  }

  const readiness = calculateReadinessScore(violations, modifiedFiles, contextPkg);

  return {
    hasDrift: violations.length > 0,
    violations,
    passedCriteria,
    readiness,
  };
}

// ===== Scanner types for scanDrift =====

export interface ScannerIssue {
  message: string;
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
}

export interface ScannerResult {
  name: string;
  passed: boolean;
  issues: ScannerIssue[];
  summary: string;
}

export interface ScanDriftOptions {
  /** Task ID for scope boundary scanner (optional). */
  taskId?: string;
  /** List of modified files reported by the task. */
  modifiedFiles?: string[];
  /** Workspace root directory. */
  workspaceDir?: string;
}

export interface ScanDriftResult {
  /** Per-scanner results, one entry per scanner in consistent order. */
  scanners: ScannerResult[];
  /** Aggregate summary across all scanners. */
  summary: {
    totalScanners: number;
    passedScanners: number;
    failedScanners: number;
    overallPass: boolean;
  };
}

// ===== Internal helpers =====

/** Recursively collect source files with given extensions, excluding node_modules and hidden dirs. */
function collectSourceFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
          files.push(...collectSourceFiles(fullPath, extensions));
        }
      } else if (entry.isFile()) {
        for (const ext of extensions) {
          if (entry.name.endsWith(ext)) {
            files.push(fullPath);
            break;
          }
        }
      }
    }
  } catch {
    // skip unreadable directories
  }
  return files;
}

/** Extract simple parameter names from a function-like declaration fragment. */
function extractFunctionParamNames(declLine: string): string[] {
  const params: string[] = [];
  const parenStart = declLine.indexOf('(');
  if (parenStart < 0) return params;

  let depth = 0;
  let inType = false;
  let current = '';

  for (let i = parenStart + 1; i < declLine.length; i++) {
    const ch = declLine[i];

    // Handle closing paren regardless of inType — end of parameter list
    if (ch === ')') {
      if (depth === 0) {
        if (current.trim().length > 0 && !inType) {
          params.push(current.trim());
        }
        break;
      }
      depth--;
      continue;
    }

    if (ch === '(' && !inType) {
      depth++;
    } else if (ch === ':' && depth === 0 && !inType) {
      inType = true;
      if (current.trim().length > 0) {
        params.push(current.trim());
        current = '';
      }
    } else if (ch === ',' && depth === 0) {
      if (current.trim().length > 0 && !inType) {
        params.push(current.trim());
      }
      current = '';
      inType = false;
    } else if (ch === '=' && depth === 0 && !inType) {
      // default value follows — flush param name then skip the value
      if (current.trim().length > 0) {
        params.push(current.trim());
        current = '';
      }
      inType = true;
    } else if (inType && (ch === '=' || ch === ',')) {
      if (ch === ',') {
        inType = false;
      }
    } else if (!inType) {
      current += ch;
    }
  }

  return params.filter((p) => p.length > 0 && !p.startsWith('...')).map((p) => {
    // Strip type annotation suffix from simple names: "foo: string" → "foo"
    const simpleMatch = p.match(/^(\w+)/);
    return simpleMatch ? simpleMatch[1] : p;
  });
}

/** Extract @param names from a JSDoc comment block. */
function extractJSDocParamNames(commentBlock: string): string[] {
  const params: string[] = [];
  const paramRegex = /@param\s+\{?[^}]*\}?\s*(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(commentBlock)) !== null) {
    if (match[1]) {
      params.push(match[1]);
    }
  }
  return params;
}

/** Check if a JSDoc block has a @returns tag. */
function hasJSDocReturns(commentBlock: string): boolean {
  return /@returns?\b/.test(commentBlock);
}

/** Check if a function body is likely void (no explicit return with value). */
function isFunctionBodyLikelyVoid(bodySlice: string): boolean {
  return !/\breturn\s+[^;}\]/]/.test(bodySlice);
}

/** Detect TODO / FIXME / HACK comments in a file (single-line comments only). */
function scanCodeMarkers(lines: string[], relativePath: string): ScannerIssue[] {
  const issues: ScannerIssue[] = [];
  const markerRegex = /\b(TODO|FIXME|HACK|XXX)\b/;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const commentStart = line.indexOf('//');
    if (commentStart < 0) continue;

    const afterSlash = line.slice(commentStart + 2);
    const match = afterSlash.match(markerRegex);
    if (match) {
      issues.push({
        message: `Code marker '${match[1]}' found in comment`,
        severity: 'info',
        file: relativePath,
        line: idx + 1,
      });
    }
  }

  return issues;
}

// ===== Scanner 1: Doc-Code Sync =====

function scanDocCodeSync(workspaceDir: string): ScannerResult {
  const issues: ScannerIssue[] = [];
  const sourceDir = path.join(workspaceDir, 'src');

  if (!fs.existsSync(sourceDir)) {
    return {
      name: 'doc-code-sync',
      passed: true,
      issues: [],
      summary: 'No src/ directory found — skipping doc-code scan',
    };
  }

  const sourceFiles = collectSourceFiles(sourceDir, ['.ts']);
  let filesScanned = 0;
  let jsdocIssues = 0;

  for (const filePath of sourceFiles) {
    const relativePath = path.relative(workspaceDir, filePath).replace(/\\/g, '/');
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    // Phase 1: detect TODO/FIXME/HACK markers
    const markerIssues = scanCodeMarkers(lines, relativePath);
    issues.push(...markerIssues);

    // Phase 2: check JSDoc/function consistency
    for (let idx = 0; idx < lines.length; idx++) {
      const trimmed = lines[idx].trim();
      if (!trimmed.startsWith('/**')) continue;

      // Collect the full JSDoc block
      const jsdocLines: string[] = [trimmed];
      for (let j = idx + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        jsdocLines.push(nextLine.trim());
        if (nextLine.trim().endsWith('*/')) {
          idx = j;
          break;
        }
      }

      const jsdocBlock = jsdocLines.join('\n');
      const jsdocParams = extractJSDocParamNames(jsdocBlock);
      const hasReturns = hasJSDocReturns(jsdocBlock);

      // Look for the next function/method declaration after this JSDoc
      const nextNonBlank = (() => {
        for (let k = idx + 1; k < Math.min(idx + 5, lines.length); k++) {
          const l = lines[k].trim();
          if (l.length > 0 && !l.startsWith('*') && !l.startsWith('//')) return l;
        }
        return '';
      })();

      if (!nextNonBlank) continue;

      const funcMatch = nextNonBlank.match(
        /\b(function\s+\w+\s*|\w+\s*=\s*(?:async\s+)?\(|\b\w+\s*\([^)]*\)\s*(?::{|\s*{))/
      );
      if (!funcMatch) continue;

      const actualParams = extractFunctionParamNames(nextNonBlank);

      // Compare @param count to actual params
      if (jsdocParams.length > 0) {
        for (const jsdocParam of jsdocParams) {
          if (!actualParams.some((p) => p === jsdocParam)) {
            issues.push({
              message: `JSDoc @param '${jsdocParam}' does not match any actual function parameter`,
              severity: 'warning',
              file: relativePath,
              line: idx + 1,
            });
            jsdocIssues++;
          }
        }

        // Check: function has params but JSDoc doesn't document all of them
        for (const actualParam of actualParams) {
          if (!jsdocParams.includes(actualParam)) {
            issues.push({
              message: `Function parameter '${actualParam}' lacks a JSDoc @param tag`,
              severity: 'warning',
              file: relativePath,
              line: idx + 1,
            });
            jsdocIssues++;
          }
        }
      }

      // Check @returns mismatch
      if (hasReturns) {
        // Look ahead for function body to check if it's likely void
        const bodyStartIdx = (() => {
          for (let k = idx + 1; k < Math.min(idx + 10, lines.length); k++) {
            const l = lines[k].trim();
            if (l.includes('{')) return k;
          }
          return -1;
        })();

        if (bodyStartIdx >= 0) {
          const bodySlice = lines.slice(bodyStartIdx, Math.min(bodyStartIdx + 20, lines.length)).join('\n');
          if (bodySlice.includes('=>') || bodySlice.includes('return')) {
            // has return-like content — fine
          } else {
            issues.push({
              message: 'JSDoc @returns declared but function body appears to return nothing',
              severity: 'warning',
              file: relativePath,
              line: idx + 1,
            });
            jsdocIssues++;
          }
        }
      }
    }

    filesScanned++;
  }

  const passed = jsdocIssues === 0;
  const summary = passed
    ? `All ${filesScanned} source files have consistent doc-code synchronization`
    : `Found ${jsdocIssues} doc-code sync issues across ${filesScanned} files`;

  return { name: 'doc-code-sync', passed, issues, summary };
}

// ===== Scanner 2: Git Log Timeline =====

interface GitCommitEntry {
  hash: string;
  date: string;
  message: string;
}

function scanGitLogTimeline(workspaceDir: string): ScannerResult {
  const issues: ScannerIssue[] = [];

  const result = cp.spawnSync('git', ['log', '--oneline', '--format=%H|%ai|%s', '-30'], {
    cwd: workspaceDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error || result.status !== 0 || !result.stdout) {
    return {
      name: 'git-log-timeline',
      passed: true,
      issues: [],
      summary: 'No git history available — skipping timeline scan',
    };
  }

  const commits: GitCommitEntry[] = result.stdout
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('|');
      return { hash: parts[0] || '', date: parts[1] || '', message: parts.slice(2).join('|') };
    });

  if (commits.length === 0) {
    return {
      name: 'git-log-timeline',
      passed: true,
      issues: [],
      summary: 'No commits found in git history',
    };
  }

  const lastCommit = commits[0];
  const lastCommitTime = new Date(lastCommit.date).getTime();
  const now = Date.now();
  const hoursSinceLastCommit = (now - lastCommitTime) / (1000 * 60 * 60);

  if (hoursSinceLastCommit > 168) {
    // more than 7 days
    issues.push({
      message: `Last commit was ${Math.floor(hoursSinceLastCommit / 24)} days ago (${lastCommit.date.slice(0, 10)})`,
      severity: 'warning',
      file: undefined,
      line: undefined,
    });
  } else if (hoursSinceLastCommit > 72) {
    // more than 3 days
    issues.push({
      message: `Last commit was ${Math.floor(hoursSinceLastCommit / 24)} days ago (${lastCommit.date.slice(0, 10)}) — recent activity may be stale`,
      severity: 'info',
      file: undefined,
      line: undefined,
    });
  }

  // Detect large gaps in commit timeline
  let gapDays = 0;
  for (let i = 1; i < commits.length; i++) {
    const prev = new Date(commits[i - 1].date).getTime();
    const curr = new Date(commits[i].date).getTime();
    const gap = (prev - curr) / (1000 * 60 * 60 * 24);
    if (gap > 3) {
      gapDays = Math.max(gapDays, Math.floor(gap));
    }
  }

  if (gapDays > 0) {
    issues.push({
      message: `Detected ${gapDays}-day gap in recent commit history — possible period of inactivity`,
      severity: 'info',
      file: undefined,
      line: undefined,
    });
  }

  // Commit frequency check
  const uniqueDays = new Set(commits.map((c) => c.date.slice(0, 10))).size;
  if (commits.length > 5 && uniqueDays < 2) {
    issues.push({
      message: `All ${commits.length} recent commits occurred on a single day — potentially a batch commit pattern`,
      severity: 'info',
      file: undefined,
      line: undefined,
    });
  }

  const passed = issues.length === 0;
  const summary = passed
    ? `Git timeline healthy — ${commits.length} recent commits, last commit ${lastCommit.date.slice(0, 10)}`
    : `Git timeline shows ${issues.length} issue(s) over ${commits.length} recent commits`;

  return { name: 'git-log-timeline', passed, issues, summary };
}

// ===== Scanner 3: Scope Boundary (reuses executeMaestroBoundaryCheck) =====

function scanScopeBoundary(
  taskId: string,
  modifiedFiles: string[],
  workspaceDir: string
): ScannerResult {
  const issues: ScannerIssue[] = [];

  if (!taskId || modifiedFiles.length === 0) {
    return {
      name: 'scope-boundary',
      passed: true,
      issues: [],
      summary: 'No task context provided — skipping scope boundary scan',
    };
  }

  const result = executeMaestroBoundaryCheck(taskId, modifiedFiles, workspaceDir);

  for (const violation of result.violations) {
    issues.push({
      message: violation,
      severity: 'error',
      file: undefined,
      line: undefined,
    });
  }

  const passed = issues.length === 0;
  const summary = passed
    ? 'All modified files remain strictly within defined boundary scope'
    : `Found ${issues.length} scope boundary violation(s)`;

  return { name: 'scope-boundary', passed, issues, summary };
}

// ===== Scanner 4: Reference Integrity =====

function scanReferenceIntegrity(workspaceDir: string): ScannerResult {
  const issues: ScannerIssue[] = [];
  const sourceDir = path.join(workspaceDir, 'src');

  if (!fs.existsSync(sourceDir)) {
    return {
      name: 'reference-integrity',
      passed: true,
      issues: [],
      summary: 'No src/ directory found — skipping reference integrity scan',
    };
  }

  const sourceFiles = collectSourceFiles(sourceDir, ['.ts']);
  let filesScanned = 0;
  let brokenRefs = 0;

  const importRegex = /import\s+(?:[\w*{},\s]+\s+from\s+)?['"](\..*?)['"]|import\(['"](\..*?)['"]\)|export\s+(?:\*\s+from\s+|type\s+\*\s+from\s+)['"](\..*?)['"]/g;

  for (const filePath of sourceFiles) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const relativePath = path.relative(workspaceDir, filePath).replace(/\\/g, '/');
    const lines = content.split('\n');

    // Reset regex state per file
    importRegex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1] || match[2] || match[3];
      if (!importPath) continue;

      // Resolve relative import path
      const resolvedBase = path.resolve(path.dirname(filePath), importPath);
      const candidates = [resolvedBase + '.ts', resolvedBase + '.js', resolvedBase + '.tsx'];
      let resolvedPath = '';

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          resolvedPath = candidate;
          break;
        }
      }

      // Check for index files
      if (!resolvedPath) {
        const indexCandidates = [
          path.join(resolvedBase, 'index.ts'),
          path.join(resolvedBase, 'index.js'),
          path.join(resolvedBase, 'index.tsx'),
        ];
        for (const idxCandidate of indexCandidates) {
          if (fs.existsSync(idxCandidate)) {
            resolvedPath = idxCandidate;
            break;
          }
        }
      }

      if (!resolvedPath) {
        // Compute line number for the broken import
        const lineNum = (() => {
          for (let l = 0; l < lines.length; l++) {
            if (lines[l].includes(importPath)) return l + 1;
          }
          return 0;
        })();

        issues.push({
          message: `Broken import: '${importPath}' could not be resolved from '${relativePath}'`,
          severity: 'error',
          file: relativePath,
          line: lineNum || undefined,
        });
        brokenRefs++;
      }
    }

    filesScanned++;
  }

  const passed = brokenRefs === 0;
  const summary = passed
    ? `All ${filesScanned} source files have valid import references`
    : `Found ${brokenRefs} broken reference(s) across ${filesScanned} files`;

  return { name: 'reference-integrity', passed, issues, summary };
}

// ===== Public scanDrift entry point =====

export function scanDrift(options: ScanDriftOptions = {}): ScanDriftResult {
  const workspaceDir = options.workspaceDir || process.cwd();

  const scanners: ScannerResult[] = [
    scanDocCodeSync(workspaceDir),
    scanGitLogTimeline(workspaceDir),
    scanScopeBoundary(options.taskId || '', options.modifiedFiles || [], workspaceDir),
    scanReferenceIntegrity(workspaceDir),
  ];

  const passedScanners = scanners.filter((s) => s.passed).length;
  const totalScanners = scanners.length;
  const failedScanners = totalScanners - passedScanners;

  return {
    scanners,
    summary: {
      totalScanners,
      passedScanners,
      failedScanners,
      overallPass: failedScanners === 0,
    },
  };
}
