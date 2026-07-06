import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { TaskDefinition, WavePlan } from './state.js';

interface CSVLockMetadata {
  planHash: string;
  exportedAt: string;
}
export interface CSVRow {
  id: string;
  wave: string;
  title: string;
  scope: string;
  action: string;
  dependsOn: string;
  status: string;
  executor: string;
  findings: string;
  error: string;
  contextFiles?: string;
  mode?: string;
  tier?: string;      /* 'smol' | 'default' | 'slow' — model selection hint */
  taskMd?: string;    /* path to .task/T*.md data plane file */
  /* 5-state status: pending | in_progress | done_with_concerns | blocked | completed */
  [key: string]: string | undefined;
}

const CSV_LOCK_PREFIX = '# omp-flow-csv-lock ';

function hashPlanContent(planContent: string): string {
  return createHash('md5').update(planContent, 'utf8').digest('hex');
}

function readPlanHash(planPath: string): string | null {
  if (!fs.existsSync(planPath)) {
    return null;
  }

  return hashPlanContent(fs.readFileSync(planPath, 'utf-8'));
}

function formatCSVLockComment(lock: CSVLockMetadata): string {
  return `${CSV_LOCK_PREFIX}planHash=${lock.planHash} exportedAt=${lock.exportedAt}`;
}

function parseCSVLockComment(line: string): CSVLockMetadata | null {
  if (!line.startsWith(CSV_LOCK_PREFIX)) {
    return null;
  }

  const payload = line.slice(CSV_LOCK_PREFIX.length).trim();
  if (payload.length === 0) {
    return null;
  }

  const fields: Record<string, string> = {};
  for (const token of payload.split(' ')) {
    const equalsIndex = token.indexOf('=');
    if (equalsIndex <= 0 || equalsIndex === token.length - 1) {
      return null;
    }

    const key = token.slice(0, equalsIndex);
    const value = token.slice(equalsIndex + 1);
    fields[key] = value;
  }

  const planHash = fields.planHash;
  const exportedAt = fields.exportedAt;

  if (!planHash || !exportedAt) {
    return null;
  }

  return {
    planHash,
    exportedAt,
  };
}

function splitCSVDocument(content: string): { lock: CSVLockMetadata | null; csvContent: string } {
  if (!content) {
    return { lock: null, csvContent: '' };
  }

  const firstLineEnd = content.indexOf('\n');
  const firstLine = (firstLineEnd === -1 ? content : content.slice(0, firstLineEnd)).replace(/\r$/, '');
  const lock = parseCSVLockComment(firstLine);

  if (!lock) {
    return { lock: null, csvContent: content };
  }

  return {
    lock,
    csvContent: firstLineEnd === -1 ? '' : content.slice(firstLineEnd + 1),
  };
}

/**
 * RFC 4180 CSV Parser
 * Handles quotes, commas, multiline cells, and escaped quotes ("").
 */
export function parseCSV(content: string): CSVRow[] {
  const { csvContent } = splitCSVDocument(content);

  if (!csvContent || !csvContent.trim()) {
    return [];
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  let isQuotedCell = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote "" inside quoted cell -> "
          currentCell += '"';
          i++; // skip next quote
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        isQuotedCell = true;
      } else if (char === ',') {
        // End of cell
        const finalVal = isQuotedCell ? currentCell : currentCell.trim();
        currentRow.push(finalVal);
        currentCell = '';
        isQuotedCell = false;
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++; // consume \n
        }
        // End of row
        const finalVal = isQuotedCell ? currentCell : currentCell.trim();
        currentRow.push(finalVal);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        isQuotedCell = false;
      } else if (char === '\n') {
        // End of row
        const finalVal = isQuotedCell ? currentCell : currentCell.trim();
        currentRow.push(finalVal);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        isQuotedCell = false;
      } else {
        currentCell += char;
      }
    }
  }

  // Handle last cell & row if remaining
  if (currentCell.length > 0 || isQuotedCell || currentRow.length > 0) {
    const finalVal = isQuotedCell ? currentCell : currentCell.trim();
    currentRow.push(finalVal);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [];
  }

  // First row = header keys
  const headers = rows[0].map((h) => h.trim());
  const result: CSVRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Ignore trailing empty line if it's completely empty
    if (row.length === 1 && row[0] === '' && r === rows.length - 1) {
      continue;
    }
    const record: Record<string, string> = {} as Record<string, string>;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (key) {
        record[key] = row[c] !== undefined ? row[c] : '';
      }
    }
    result.push(record as unknown as CSVRow);
  }

  return result;
}

/**
 * RFC 4180 CSV Serializer
 * If cell contains comma, double-quote, or newline -> wrap in "..." and replace " with "".
 * Joins rows with \n.
 */
export function stringifyCSV(
  rows: CSVRow[],
  headers?: string[],
  prefixLines: string[] = []
): string {
  const keys =
    headers && headers.length > 0
      ? headers
      : rows.length > 0
        ? Object.keys(rows[0])
        : [];

  if (keys.length === 0) {
    return prefixLines.join('\n');
  }

  const formatCell = (val: string | undefined | null): string => {
    const str = val == null ? '' : String(val);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [...prefixLines];
  // First row = header line
  lines.push(keys.map(formatCell).join(','));

  for (const row of rows) {
    const line = keys.map((key) => formatCell(row[key])).join(',');
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Reads .omp-flow/tasks/{parentTaskId}/plan.json and all .task/TASK-*.json files.
 * Formats each task as a CSV row and writes to .omp-flow/tasks/{parentTaskId}/tasks.csv.
 */
export function exportPlanToCSV(
  parentTaskId: string,
  workspaceDir: string = process.cwd()
): { csvPath: string; rowCount: number } {
  const taskDir = path.join(workspaceDir, '.omp-flow', 'tasks', parentTaskId);
  const planPath = path.join(taskDir, 'plan.json');
  const taskDefDir = path.join(taskDir, '.task');
  const csvPath = path.join(taskDir, 'tasks.csv');

  const tasks: TaskDefinition[] = [];

  // Read .task/ directory if present
  if (fs.existsSync(taskDefDir) && fs.statSync(taskDefDir).isDirectory()) {
    const files = fs.readdirSync(taskDefDir);
    // Sort files to keep order (e.g. TASK-001.json, TASK-002.json...)
    const jsonFiles = files
      .filter((f) => f.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const file of jsonFiles) {
      const filePath = path.join(taskDefDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const taskDef = JSON.parse(content) as TaskDefinition;
        if (taskDef && taskDef.id) {
          tasks.push(taskDef);
        }
      } catch {
        // Skip unparseable task file
      }
    }
  }

  // If plan.json exists, order tasks according to plan.taskIds if available
  if (fs.existsSync(planPath)) {
    try {
      const planContent = fs.readFileSync(planPath, 'utf-8');
      const plan = JSON.parse(planContent) as WavePlan;
      if (plan && Array.isArray(plan.taskIds) && plan.taskIds.length > 0) {
        const taskMap = new Map(tasks.map((t) => [t.id, t]));
        const orderedTasks: TaskDefinition[] = [];
        for (const tid of plan.taskIds) {
          const t = taskMap.get(tid);
          if (t) {
            orderedTasks.push(t);
            taskMap.delete(tid);
          }
        }
        for (const t of taskMap.values()) {
          orderedTasks.push(t);
        }
        tasks.length = 0;
        tasks.push(...orderedTasks);
      }
    } catch {
      // Ignore plan parse error
    }
  }

  const planHash = readPlanHash(planPath);
  const exportedAt = new Date().toISOString();
  const csvLock = planHash
    ? {
        planHash,
        exportedAt,
      }
    : null;

  // Map tasks to CSV rows
  const CSV_HEADERS = [
    'id',
    'wave',
    'title',
    'scope',
    'action',
    'dependsOn',
    'status',
    'executor',
    'findings',
    'contextFiles',
    'mode',
    'error',
  ];
  const csvRows: CSVRow[] = tasks.map((task) => {
    const dependsOnStr = Array.isArray(task.dependsOn)
      ? task.dependsOn.join(';')
      : '';

    return {
      id: task.id || '',
      wave: task.wave !== undefined ? String(task.wave) : '1',
      title: task.title || '',
      scope: task.scope || '',
      action: task.action || '',
      dependsOn: dependsOnStr,
      status: task.status || 'pending',
      executor: task.executor || 'agent',
      findings: '',
      error: '',
      contextFiles: '',
      mode: '',
    };
  });
  const csvContent = stringifyCSV(
    csvRows,
    CSV_HEADERS,
    csvLock ? [formatCSVLockComment(csvLock)] : []
  );

  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, csvContent, 'utf-8');

  return {
    csvPath,
    rowCount: csvRows.length,
  };
}

/**
 * Reads .omp-flow/tasks/{parentTaskId}/tasks.csv via parseCSV.
 * Updates matching .task/{row.id}.json files with status, executor.
 * If row.findings: saves summary to .summaries/{row.id}-summary.md.
 * Updates plan.json task statuses.
 * Returns { updatedTasks: count }.
 */
export function importCSVToPlan(
  parentTaskId: string,
  workspaceDir: string = process.cwd()
): { updatedTasks: number } {
  const taskDir = path.join(workspaceDir, '.omp-flow', 'tasks', parentTaskId);
  const csvPath = path.join(taskDir, 'tasks.csv');
  const taskDefDir = path.join(taskDir, '.task');
  const summariesDir = path.join(taskDir, '.summaries');
  const planPath = path.join(taskDir, 'plan.json');

  if (!fs.existsSync(csvPath)) {
    return { updatedTasks: 0 };
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const { lock, csvContent: bodyContent } = splitCSVDocument(csvContent);
  const currentPlanHash = readPlanHash(planPath);

  if (currentPlanHash !== null) {
    if (!lock) {
      throw new Error('E_SPLIT_BRAIN: missing plan hash metadata in tasks.csv');
    }

    if (lock.planHash !== currentPlanHash) {
      throw new Error('E_SPLIT_BRAIN: plan.json hash mismatch for tasks.csv');
    }
  } else if (lock) {
    throw new Error('E_SPLIT_BRAIN: locked tasks.csv cannot be imported without plan.json');
  }

  const rows = parseCSV(bodyContent);

  let updatedTasks = 0;

  for (const row of rows) {
    if (!row.id) continue;

    const taskJsonPath = path.join(taskDefDir, `${row.id}.json`);
    let taskDef: TaskDefinition | null = null;

    if (fs.existsSync(taskJsonPath)) {
      try {
        const content = fs.readFileSync(taskJsonPath, 'utf-8');
        taskDef = JSON.parse(content) as TaskDefinition;
      } catch {
        // Skip unparseable
      }
    }

    if (taskDef) {
      let isChanged = false;

      if (row.status && row.status !== taskDef.status) {
        taskDef.status = row.status as TaskDefinition['status'];
        isChanged = true;
      }

      if (row.executor && row.executor !== taskDef.executor) {
        taskDef.executor = row.executor;
        isChanged = true;
      }

      // If row.findings: save summary to .summaries/{row.id}-summary.md
      if (row.findings && row.findings.trim() !== '') {
        fs.mkdirSync(summariesDir, { recursive: true });
        const summaryPath = path.join(summariesDir, `${row.id}-summary.md`);
        const summaryContent = [
          '---',
          `taskId: ${row.id}`,
          `parentTaskId: ${parentTaskId}`,
          `status: ${row.status || taskDef.status || 'completed'}`,
          `executor: ${row.executor || taskDef.executor || 'agent'}`,
          `completedAt: ${new Date().toISOString()}`,
          '---',
          '',
          `# Summary: ${row.id}`,
          '',
          row.findings.trim(),
          '',
        ].join('\n');

        fs.writeFileSync(summaryPath, summaryContent, 'utf-8');
        taskDef.summaryPath = `.summaries/${row.id}-summary.md`;
        isChanged = true;
      }

      if (isChanged) {
        fs.mkdirSync(taskDefDir, { recursive: true });
        fs.writeFileSync(taskJsonPath, JSON.stringify(taskDef, null, 2), 'utf-8');
        updatedTasks++;
      }
    }
  }

  // Update plan.json task statuses if plan.json exists
  if (fs.existsSync(planPath)) {
    try {
      const planContent = fs.readFileSync(planPath, 'utf-8');
      const plan = JSON.parse(planContent) as Record<string, unknown>;

      if (plan && typeof plan === 'object') {
        let planUpdated = false;
        if (plan.taskStatuses && typeof plan.taskStatuses === 'object') {
          const taskStatuses = plan.taskStatuses as Record<string, string>;
          for (const row of rows) {
            if (row.id && row.status) {
              taskStatuses[row.id] = row.status;
              planUpdated = true;
            }
          }
        }
        if (planUpdated || updatedTasks > 0) {
          plan.updatedAt = new Date().toISOString();
          fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
        }
      }
    } catch {
      // Ignore plan update errors
    }
  }

  return { updatedTasks };
}

/**
 * Reads tasks.csv, finds row by id === subTaskId, returns object or null.
 */
export function readCSVRow(
  parentTaskId: string,
  subTaskId: string,
  workspaceDir: string = process.cwd()
): CSVRow | null {
  const csvPath = path.join(
    workspaceDir,
    '.omp-flow',
    'tasks',
    parentTaskId,
    'tasks.csv'
  );

  if (!fs.existsSync(csvPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCSV(content);
    return rows.find((r) => r.id === subTaskId) || null;
  } catch {
    return null;
  }
}

/**
 * Reads tasks.csv, patches matching row (by id === subTaskId), rewrites tasks.csv.
 */
export function updateCSVRow(
  parentTaskId: string,
  subTaskId: string,
  patch: Record<string, string>,
  workspaceDir: string = process.cwd()
): void {
  const csvPath = path.join(
    workspaceDir,
    '.omp-flow',
    'tasks',
    parentTaskId,
    'tasks.csv'
  );

  if (!fs.existsSync(csvPath)) {
    return;
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const { lock, csvContent: bodyContent } = splitCSVDocument(content);
  const rows = parseCSV(bodyContent);
  const index = rows.findIndex((r) => r.id === subTaskId);

  if (index === -1) {
    return;
  }
  // Gate: if marking as completed, require check evidence
  if (patch.status === 'completed') {
    const check = assertCheckPassed(parentTaskId, subTaskId, workspaceDir);
    if (!check.passed) {
      throw new Error(`[omp-flow] Cannot mark ${subTaskId} as completed: ${check.reason}`);
    }
  }


  rows[index] = {
    ...rows[index],
    ...patch,
  };

  const headers = Object.keys(rows[0]);
  const updatedContent = stringifyCSV(
    rows,
    headers,
    lock ? [formatCSVLockComment(lock)] : []
  );
  fs.writeFileSync(csvPath, updatedContent, 'utf-8');
}

/**
 * Reads tasks.csv, filters where status === 'pending' (and wave === String(waveNum) if provided).
 */
export function getPendingCSVRows(
  parentTaskId: string,
  workspaceDir: string = process.cwd(),
  waveNum?: number
): CSVRow[] {
  const csvPath = path.join(
    workspaceDir,
    '.omp-flow',
    'tasks',
    parentTaskId,
    'tasks.csv'
  );

  if (!fs.existsSync(csvPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCSV(content);

    return rows.filter((r) => {
      if (r.status !== 'pending') {
        return false;
      }
      if (waveNum !== undefined && r.wave !== String(waveNum)) {
        return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}

/**
 * Summary status of all CSV rows for a workflow task.
 */
export interface CSVWorkflowStatus {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  unchecked: number;
  rows: Array<{ id: string; status: string; hasCheckEvidence: boolean }>;
}

/**
 * Reads tasks.csv and returns workflow status summary with per-row check evidence.
 * Returns null if CSV does not exist or is unparseable.
 */
export function getCSVWorkflowStatus(
  parentTaskId: string,
  workspaceDir: string = process.cwd()
): CSVWorkflowStatus | null {
  const csvPath = path.join(
    workspaceDir,
    '.omp-flow',
    'tasks',
    parentTaskId,
    'tasks.csv'
  );

  if (!fs.existsSync(csvPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCSV(content);

    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    const rowDetails: Array<{ id: string; status: string; hasCheckEvidence: boolean }> = [];

    for (const row of rows) {
      const id = row.id || '';
      const status = row.status || '';

      let hasCheckEvidence = false;

      if (status === 'pending') {
        pending++;
      } else if (status === 'in_progress' || status === 'in-progress') {
        inProgress++;
      } else if (status === 'completed') {
        completed++;
        const taskFilePath = path.join(
          workspaceDir,
          '.omp-flow',
          'tasks',
          parentTaskId,
          '.task',
          `${id}.json`
        );
        if (fs.existsSync(taskFilePath)) {
          try {
            const taskContent = JSON.parse(fs.readFileSync(taskFilePath, 'utf-8'));
            if (taskContent.verdict || taskContent.checkVerdict) {
              hasCheckEvidence = true;
            }
          } catch {
            // Parse error means no check evidence
          }
        }
      }

      rowDetails.push({ id, status, hasCheckEvidence });
    }

    return {
      total: rows.length,
      pending,
      inProgress,
      completed,
      unchecked: completed - rowDetails.filter((r) => r.status === 'completed' && r.hasCheckEvidence).length,
      rows: rowDetails,
    };
  } catch {
    return null;
  }
}

/**
 * Guards marking a CSV row completed: verifies independent check evidence exists.
 * Returns { passed, reason } describing whether the guard passed or why it failed.
 */
export function assertCheckPassed(
  parentTaskId: string,
  rowId: string,
  workspaceDir: string = process.cwd()
): { passed: boolean; reason: string } {
  const row = readCSVRow(parentTaskId, rowId, workspaceDir);

  if (!row) {
    return { passed: false, reason: `Row ${rowId} not found in CSV.` };
  }

  const status = row.status || '';

  // Guard only triggers on completed rows
  if (status !== 'completed') {
    return { passed: true, reason: 'Row not yet completed, no check needed yet.' };
  }

  // Row is completed — check for evidence file
  const taskFilePath = path.join(
    workspaceDir,
    '.omp-flow',
    'tasks',
    parentTaskId,
    '.task',
    `${rowId}.json`
  );

  if (!fs.existsSync(taskFilePath)) {
    return {
      passed: false,
      reason: `No check evidence found: .task/${rowId}.json missing. Run independent check agent before marking completed.`,
    };
  }

  try {
    const taskContent = JSON.parse(fs.readFileSync(taskFilePath, 'utf-8'));
    const verdict = taskContent.verdict ?? taskContent.checkVerdict;
    const testsRun = typeof taskContent.tests_run === 'number' ? taskContent.tests_run : undefined;
    const testsFailed = typeof taskContent.tests_failed === 'number' ? taskContent.tests_failed : undefined;
    const evidence = typeof taskContent.evidence === 'string' ? taskContent.evidence : undefined;

    if (verdict === undefined || verdict === null) {
      return {
        passed: false,
        reason: 'Check evidence file exists but no verdict field. Check agent must write verdict.',
      };
    }

    const verdictStr = String(verdict).toLowerCase();
    if (verdictStr === 'pass') {
      // Rich verdict requires tests_run and tests_failed
      if (testsRun === undefined || testsFailed === undefined) {
        return { passed: false, reason: 'Verdict is PASS but missing tests_run or tests_failed. Check agent must report test counts.' };
      }
      if (testsFailed > 0) {
        return { passed: false, reason: `Verdict is PASS but tests_failed=${testsFailed}. Verdict contradicts evidence.` };
      }
      return { passed: true, reason: `Check passed: ${testsRun} tests, 0 failures.` };
    }
    if (verdictStr === 'fail') {
      return { passed: false, reason: `Check failed: ${testsFailed || 'unknown'} failures.` };
    }
    return {
      passed: false,
      reason: `Unknown verdict value: ${verdict}. Expected 'pass' or 'fail'.`,
    };
  } catch {
    return {
      passed: false,
      reason: 'Check evidence file exists but could not be parsed.',
    };
  }
}

/**
 * Formats a CSVWorkflowStatus as a human-readable warning for injection into agent context.
 */
export function formatCSVStatusWarning(status: CSVWorkflowStatus): string {
  const uncheckedRows = status.rows
    .filter((r) => r.status === 'completed' && !r.hasCheckEvidence)
    .map((r) => r.id);

  let result = '<csv-workflow-status>\n';
  result += `Total: ${status.total} | Pending: ${status.pending} | In Progress: ${status.inProgress} | Completed: ${status.completed} | Unchecked: ${status.unchecked}\n`;

  if (uncheckedRows.length > 0) {
    result += `⚠️ Unchecked completed rows: ${uncheckedRows.join(', ')} — these rows were marked completed without check evidence!\n`;
  }

  result += '</csv-workflow-status>';
  return result;
}
