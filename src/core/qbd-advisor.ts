/**
 * QbD Advisor — Pre-Execution Adversarial Audit Engine
 *
 * Validates a task plan's structural integrity before execution:
 * 1. PRD out-of-scope vs CSV actions consistency
 * 2. contextFiles existence on disk
 * 3. dependsOn DAG acyclic integrity
 * 4. technical risk assessment
 * 5. context reference validation
 *
 * Each audit produces a QbDVerdict with per-finding granularity.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseCSV } from './csv-adapter.js';
import type { CSVRow } from './csv-adapter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QbDSeverity = 'critical' | 'warning' | 'info';

export interface QbDFinding {
  id: string;
  severity: QbDSeverity;
  criterion: string;
  target: string;
  detail: string;
}

export interface QbDVerdict {
  passed: boolean;
  findings: QbDFinding[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve the task directory under .omp-flow/tasks/{parentTaskId}. */
function taskDir(parentTaskId: string, workspaceDir: string): string {
  return path.join(workspaceDir, '.omp-flow', 'tasks', parentTaskId);
}

/** Read a file safely, returning its content or empty string on error. */
function readFileSafe(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** Parse a semicolon-separated list into trimmed tokens; empty strings omitted. */
function parseSemicolonList(value: string): string[] {
  return value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

const VALID_CONTEXT_PREFIXES: Record<string, true> = {
  brief: true,
  interface: true,
  decision: true,
  finding: true,
};
const PRIORITY_WARNING_LEVELS: Record<string, true> = {
  P0: true,
  p0: true,
  high: true,
  HIGH: true,
};

function rowLabel(row: CSVRow, rowIndex: number): string {
  return row.id || `row-${rowIndex}`;
}

function parseWaveNumber(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePrefixedRef(token: string): { prefix: string; value: string } | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex <= 0) {
    return { prefix: '', value: trimmed };
  }
  return {
    prefix: trimmed.slice(0, colonIndex).trim().toLowerCase(),
    value: trimmed.slice(colonIndex + 1).trim(),
  };
}

function isPriorityRow(row: CSVRow): boolean {
  return PRIORITY_WARNING_LEVELS[(row.priority || '').trim()] === true;
}

function isVagueAction(action: string): boolean {
  const trimmed = action.trim();
  if (!trimmed) return true;
  const normalized = trimmed.toLowerCase();
  const vagueVerbs: Record<string, true> = {
    update: true,
    handle: true,
    fix: true,
    improve: true,
    support: true,
    refine: true,
    adjust: true,
    'work on': true,
    'clean up': true,
  };
  if (vagueVerbs[normalized] === true) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2) return true;
  return vagueVerbs[words[0] || ''] === true;
}

function hasConcreteScope(scope: string): boolean {
  const normalized = scope.trim();
  if (!normalized) return false;
  if (/^(misc|various|general|overall|tbd|todo)$/i.test(normalized)) return false;
  // File paths (containing / or \ or ending in .ts/.js/.md etc) are always concrete
  if (/[/\\]/.test(normalized) || /\.\w{1,5}$/.test(normalized)) return true;
  return normalized.split(/\s+/).filter(Boolean).length >= 2;
}

// ---------------------------------------------------------------------------
// Section 1: Out-of-scope vs CSV actions validation
// ---------------------------------------------------------------------------

/**
 * Extract the "Out of Scope" section from a PRD markdown file.
 * Handles:
 *   - `**Out of Scope:**` followed by a bullet list
 *   - `## Out of Scope` or `### Out of Scope` followed by a bullet list
 */
function extractOutOfScopeItems(prdContent: string): string[] {
  if (!prdContent) return [];

  const lines = prdContent.split('\n');
  const items: string[] = [];
  let inScope = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect Out of Scope heading / label
    if (
      /^#{1,4}\s*Out\s+of\s+Scope/i.test(line) ||
      /^\*\*Out\s+of\s+Scope\*\*/i.test(line) ||
      line.toLowerCase() === 'out of scope:'
    ) {
      inScope = true;
      continue;
    }

    // Stop at the next heading or bold section label
    if (
      inScope &&
      (/^#{1,4}\s/.test(line) || /^\*\*.+\*\*:/.test(line) || /^---/.test(line))
    ) {
      // If it's another section heading, stop
      if (
        !/^#{1,4}\s*Out\s+of\s+Scope/i.test(line) &&
        !/^\*\*Out\s+of\s+Scope\*\*/i.test(line)
      ) {
        break;
      }
    }

    if (inScope && (line.startsWith('- ') || line.startsWith('* '))) {
      const item = line.slice(2).trim();
      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

/**
 * Check if an out-of-scope item text matches a CSV row's action or scope.
 * Uses simple substring / keyword overlap — semantic enough for a pre-flight check.
 */
function oosMatchesRow(oosItem: string, action: string, scope: string): boolean {
  const oosLower = oosItem.toLowerCase();
  const actionLower = action.toLowerCase();
  const scopeLower = scope.toLowerCase();

  // Direct substring match
  if (actionLower.includes(oosLower) || scopeLower.includes(oosLower)) {
    return true;
  }

  // Token-level overlap (significant words)
  const tokens = oosLower.split(/[\s,;.]+/).filter((t) => t.length > 3);
  const actionTokens = new Set(actionLower.split(/[\s,;.]+/));
  const scopeTokens = new Set(scopeLower.split(/[\s,;.]+/));

  const matchCount = tokens.filter(
    (t) => actionTokens.has(t) || scopeTokens.has(t)
  ).length;

  // If more than half of significant tokens match, flag it
  return tokens.length > 0 && matchCount >= Math.ceil(tokens.length / 2);
}

// ---------------------------------------------------------------------------
// Section 2: contextFiles existence validation
// ---------------------------------------------------------------------------

/** Validate that all listed contextFiles for a CSV row exist on disk. */
function validateContextFiles(
  row: CSVRow,
  baseDir: string,
  rowIndex: number
): QbDFinding[] {
  const findings: QbDFinding[] = [];
  const contextFilesVal = row.contextFiles || '';

  if (!contextFilesVal.trim()) return findings;

  const files = parseSemicolonList(contextFilesVal);
  const taskId = row.id || `row-${rowIndex}`;
  const findingId = (n: number) => `QBD-CF-${String(rowIndex).padStart(3, '0')}-${n}`;
  let counter = 1;

  for (const filePath of files) {
    // Resolve relative to workspace (baseDir); normalize separators
    const resolved = path.resolve(baseDir, filePath);

    if (!fs.existsSync(resolved)) {
      findings.push({
        id: findingId(counter),
        severity: 'critical',
        criterion: 'contextFiles existence',
        target: taskId,
        detail: `contextFiles entry "${filePath}" resolves to "${resolved}" but does not exist on disk`,
      });
      counter++;
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Section 3: dependsOn DAG acyclic integrity validation
// ---------------------------------------------------------------------------

/**
 * Perform DFS-based cycle detection on the dependsOn graph.
 * Returns findings for each cycle found.
 */
function validateDependsOnDAG(
  rows: CSVRow[]
): QbDFinding[] {
  const findings: QbDFinding[] = [];

  // Build adjacency: taskId -> list of dependency task IDs
  const adj = new Map<string, string[]>();
  const allIds = new Set<string>();

  for (const row of rows) {
    const id = row.id || '';
    if (!id) continue;
    allIds.add(id);

    const deps = parseSemicolonList(row.dependsOn || '');
    const existing: string[] = [];
    for (const dep of deps) {
      if (dep) {
        existing.push(dep);
        allIds.add(dep);
      }
    }
    adj.set(id, existing);
  }

  // Ensure every known ID has an entry (even if no deps)
  for (const id of allIds) {
    if (!adj.has(id)) {
      adj.set(id, []);
    }
  }

  // --- Check 1: References to non-existent tasks ---
  let findingCounter = 1;
  for (const [id, deps] of adj) {
    for (const dep of deps) {
      if (!allIds.has(dep)) {
        findings.push({
          id: `QBD-DAG-${String(findingCounter).padStart(3, '0')}`,
          severity: 'critical',
          criterion: 'dependsOn DAG integrity',
          target: id,
          detail: `Depends on "${dep}" which is not a known task ID in this plan`,
        });
        findingCounter++;
      }
    }
  }

  // --- Check 2: Cycle detection (DFS with coloring) ---
  const WHITE = 0; // unvisited
  const GRAY = 1;  // in current path
  const BLACK = 2; // fully explored

  const color = new Map<string, number>();
  for (const id of allIds) {
    color.set(id, WHITE);
  }

  const pathStack: string[] = [];
  const cycles: string[][] = [];

  function dfs(node: string): void {
    color.set(node, GRAY);
    pathStack.push(node);

    for (const dep of adj.get(node) || []) {
      if (!allIds.has(dep)) continue; // already reported above

      const depColor = color.get(dep);
      if (depColor === GRAY) {
        // Found a cycle — capture it
        const cycleStart = pathStack.indexOf(dep);
        const cycle = pathStack.slice(cycleStart);
        cycle.push(dep); // close the cycle
        cycles.push(cycle);
      } else if (depColor === WHITE) {
        dfs(dep);
      }
    }

    pathStack.pop();
    color.set(node, BLACK);
  }

  for (const id of allIds) {
    if (color.get(id) === WHITE) {
      dfs(id);
    }
  }

  for (const cycle of cycles) {
    findings.push({
      id: `QBD-DAG-${String(findingCounter).padStart(3, '0')}`,
      severity: 'critical',
      criterion: 'dependsOn DAG integrity',
      target: cycle[0],
      detail: `Circular dependency detected: ${cycle.join(' → ')}`,
    });
    findingCounter++;
  }

  return findings;
}

function validatePlanQuality(
  rows: CSVRow[],
  prdContent: string,
  designContent: string
): QbDFinding[] {
  const findings: QbDFinding[] = [];
  const taskIdToWave: Record<string, number | null> = {};
  let findingCounter = 1;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (row.id) {
      taskIdToWave[row.id] = parseWaveNumber(row.wave);
    }
  }

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const taskId = rowLabel(row, ri);
    const action = row.action || '';
    const scope = row.scope || '';

    if (isVagueAction(action) || !hasConcreteScope(scope)) {
      findings.push({
        id: `QBD-PLAN-${String(findingCounter).padStart(3, '0')}`,
        severity: 'critical',
        criterion: 'technical risk assessment',
        target: taskId,
        detail: `Row must define concrete scope/action. scope="${scope}" action="${action}" is too vague to implement safely.`,
      });
      findingCounter++;
    }

    const rowWave = parseWaveNumber(row.wave);
    for (const dep of parseSemicolonList(row.dependsOn || '')) {
      const depWave = taskIdToWave[dep];
      if (rowWave !== null && depWave !== undefined && depWave !== null && depWave > rowWave) {
        findings.push({
          id: `QBD-PLAN-${String(findingCounter).padStart(3, '0')}`,
          severity: 'critical',
          criterion: 'technical risk assessment',
          target: taskId,
          detail: `dependsOn "${dep}" is scheduled in later wave ${depWave}, but ${taskId} is in wave ${rowWave}.`,
        });
        findingCounter++;
      }
    }

    for (const refValue of parseSemicolonList(row.reference || '')) {
      const parsedRef = parsePrefixedRef(refValue);
      if (!parsedRef || parsedRef.prefix !== 'ref' || !parsedRef.value) {
        findings.push({
          id: `QBD-PLAN-${String(findingCounter).padStart(3, '0')}`,
          severity: 'critical',
          criterion: 'technical risk assessment',
          target: taskId,
          detail: `reference entry "${refValue}" must use the ref: prefix.`,
        });
        findingCounter++;
      }
    }

    for (const contextValue of parseSemicolonList(row.context || '')) {
      const parsedRef = parsePrefixedRef(contextValue);
      if (!parsedRef || VALID_CONTEXT_PREFIXES[parsedRef.prefix] !== true || !parsedRef.value) {
        findings.push({
          id: `QBD-PLAN-${String(findingCounter).padStart(3, '0')}`,
          severity: 'critical',
          criterion: 'technical risk assessment',
          target: taskId,
          detail: `context entry "${contextValue}" must use one of: brief:, interface:, decision:, finding:.`,
        });
        findingCounter++;
      }
    }
  }

  if (!prdContent.trim()) {
    findings.push({
      id: `QBD-PLAN-${String(findingCounter).padStart(3, '0')}`,
      severity: 'critical',
      criterion: 'technical risk assessment',
      target: 'prd.md',
      detail: 'PRD content is missing, so plan feasibility cannot be assessed.',
    });
    findingCounter++;
  }

  if (!designContent.trim()) {
    findings.push({
      id: `QBD-PLAN-${String(findingCounter).padStart(3, '0')}`,
      severity: 'critical',
      criterion: 'technical risk assessment',
      target: 'design.md',
      detail: 'design.md content is missing, so implementation architecture risk cannot be assessed.',
    });
  }

  return findings;
}

function validateContextRefs(rows: CSVRow[], _tDir: string): QbDFinding[] {
  const findings: QbDFinding[] = [];
  let findingCounter = 1;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const taskId = rowLabel(row, ri);
    const contextRefs = parseSemicolonList(row.context || '');
    const referenceRefs = parseSemicolonList(row.reference || '');

    for (const contextRef of contextRefs) {
      const parsedRef = parsePrefixedRef(contextRef);
      if (!parsedRef || VALID_CONTEXT_PREFIXES[parsedRef.prefix] !== true || !parsedRef.value) {
        findings.push({
          id: `QBD-CTX-${String(findingCounter).padStart(3, '0')}`,
          severity: 'critical',
          criterion: 'context reference validation',
          target: taskId,
          detail: `context entry "${contextRef}" must use one of: brief:, interface:, decision:, finding:.`,
        });
        findingCounter++;
      }
    }

    for (const referenceRef of referenceRefs) {
      const parsedRef = parsePrefixedRef(referenceRef);
      if (!parsedRef || parsedRef.prefix !== 'ref' || !parsedRef.value) {
        findings.push({
          id: `QBD-CTX-${String(findingCounter).padStart(3, '0')}`,
          severity: 'critical',
          criterion: 'context reference validation',
          target: taskId,
          detail: `reference entry "${referenceRef}" must use the ref: prefix.`,
        });
        findingCounter++;
      }
    }

    if (isPriorityRow(row) && contextRefs.length === 0) {
      findings.push({
        id: `QBD-CTX-${String(findingCounter).padStart(3, '0')}`,
        severity: 'warning',
        criterion: 'context reference validation',
        target: taskId,
        detail: 'P0 row has an empty context column; execution will lack shared context.',
      });
      findingCounter++;
    }

    if (isPriorityRow(row) && referenceRefs.length === 0) {
      findings.push({
        id: `QBD-CTX-${String(findingCounter).padStart(3, '0')}`,
        severity: 'warning',
        criterion: 'context reference validation',
        target: taskId,
        detail: 'P0 row has an empty reference column; execution will lack source grounding.',
      });
      findingCounter++;
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Section 4: out_of_scope vs CSV actions
// ---------------------------------------------------------------------------

function validateOutOfScope(
  prdContent: string,
  rows: CSVRow[]
): QbDFinding[] {
  const findings: QbDFinding[] = [];
  const oosItems = extractOutOfScopeItems(prdContent);

  if (oosItems.length === 0) return findings;

  let findingCounter = 1;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const taskId = row.id || `row-${ri}`;
    const action = row.action || '';
    const scope = row.scope || '';

    for (const oosItem of oosItems) {
      if (oosMatchesRow(oosItem, action, scope)) {
        findings.push({
          id: `QBD-OOS-${String(findingCounter).padStart(3, '0')}`,
          severity: 'warning',
          criterion: 'out_of_scope vs CSV actions',
          target: taskId,
          detail: `Action "${action}" (scope: "${scope}") may conflict with out-of-scope item: "${oosItem}"`,
        });
        findingCounter++;
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a 5-criterion adversarial audit on a task plan before execution.
 *
 * Checks:
 * 1. **out_of_scope vs CSV actions** — PRD-marked out-of-scope items matched
 *    against each CSV row's action/scope columns.
 * 2. **contextFiles existence** — Every file listed in the `contextFiles`
 *    column must exist on disk.
 * 3. **dependsOn DAG integrity** — All dependency references resolve to known
 *    task IDs and the graph is acyclic.
 * 4. **technical risk assessment** — Row quality, dependency ordering, and
 *    plan reference prefixes are concrete enough to execute.
 * 5. **context reference validation** — Context/reference prefixes are valid
 *    and P0 rows are warned when grounding is empty.
 *
 * @param parentTaskId - The directory name under `.omp-flow/tasks/`.
 * @param workspaceDir - Project root (defaults to `process.cwd()`).
 * @returns A verdict with per-finding detail and overall pass/fail.
 */
export async function auditTaskPlan(
  parentTaskId: string,
  workspaceDir: string = process.cwd()
): Promise<QbDVerdict> {
  const tDir = taskDir(parentTaskId, workspaceDir);
  const findings: QbDFinding[] = [];

  // --- Load inputs ---
  const prdContent = readFileSafe(path.join(tDir, 'prd.md'));
  const designContent = readFileSafe(path.join(tDir, 'design.md'));
  const csvContent = readFileSafe(path.join(tDir, 'tasks.csv'));

  if (!prdContent && !csvContent) {
    return {
      passed: false,
      findings: [
        {
          id: 'QBD-000',
          severity: 'critical',
          criterion: 'plan availability',
          target: parentTaskId,
          detail: `Neither prd.md nor tasks.csv found under ${tDir}`,
        },
      ],
      summary: `Task plan "${parentTaskId}" is missing both prd.md and tasks.csv. Cannot audit.`,
    };
  }

  if (!prdContent) {
    findings.push({
      id: 'QBD-000',
      severity: 'warning',
      criterion: 'plan availability',
      target: parentTaskId,
      detail: `prd.md not found under ${tDir} — skipping out_of_scope validation`,
    });
  }

  let rows: CSVRow[] = [];
  if (csvContent) {
    try {
      rows = parseCSV(csvContent);
    } catch {
      findings.push({
        id: 'QBD-001',
        severity: 'critical',
        criterion: 'plan availability',
        target: parentTaskId,
        detail: `tasks.csv under ${tDir} is unparseable — cannot validate row-level criteria`,
      });
    }
  } else {
    findings.push({
      id: 'QBD-001',
      severity: 'warning',
      criterion: 'plan availability',
      target: parentTaskId,
      detail: `tasks.csv not found under ${tDir} — dependsOn and contextFiles checks skipped`,
    });
  }

  // --- Criterion 1: out_of_scope vs CSV actions ---
  if (prdContent && rows.length > 0) {
    findings.push(...validateOutOfScope(prdContent, rows));
  }

  // --- Criterion 2: contextFiles existence ---
  if (rows.length > 0) {
    for (let ri = 0; ri < rows.length; ri++) {
      findings.push(...validateContextFiles(rows[ri], workspaceDir, ri));
    }
  }

  // --- Criterion 3: dependsOn DAG integrity ---
  if (rows.length > 0) {
    findings.push(...validateDependsOnDAG(rows));
  }

  const staticCriticalFindings = findings.filter((f) => f.severity === 'critical');

  // --- Criterion 4: technical risk assessment ---
  if (rows.length > 0 && staticCriticalFindings.length === 0) {
    findings.push(...validatePlanQuality(rows, prdContent, designContent));
  }

  // --- Criterion 5: context reference validation ---
  if (rows.length > 0) {
    findings.push(...validateContextRefs(rows, tDir));
  }

  // --- Assemble verdict ---
  const criticalFindings = findings.filter((f) => f.severity === 'critical');
  const warningFindings = findings.filter((f) => f.severity === 'warning');
  const infoFindings = findings.filter((f) => f.severity === 'info');

  const passed = criticalFindings.length === 0;

  const summaryParts: string[] = [];
  const total = findings.length;
  if (total === 0) {
    summaryParts.push('All criteria passed — no issues found.');
  } else {
    if (criticalFindings.length > 0) {
      summaryParts.push(`${criticalFindings.length} critical`);
    }
    if (warningFindings.length > 0) {
      summaryParts.push(`${warningFindings.length} warning`);
    }
    if (infoFindings.length > 0) {
      summaryParts.push(`${infoFindings.length} info`);
    }
    if (passed) {
      summaryParts.push('— non-critical items should be reviewed.');
    } else {
      summaryParts.push('— plan has blocking issues.');
    }
  }

  const summary = `Audit of "${parentTaskId}": ${total} finding(s) — ${summaryParts.join(' ')}`;

  return {
    passed,
    findings,
    summary,
  };
}
