import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { TaskDefinition, TaskRecord } from './state.js';

/**
 * ConvergenceResultItem - Result of verifying a single convergence criterion.
 */
export interface ConvergenceResultItem {
  criterion: string;
  passed: boolean;
  evidence: string;
}

/**
 * ConvergenceResult - Result of verifying all criteria for one sub-task.
 */
export interface ConvergenceResult {
  taskId: string;
  subTaskId: string;
  passed: boolean;
  results: ConvergenceResultItem[];
}

/**
 * Parsed criterion shape: { type, file?, needle?, command? }
 */
type ParsedCriterion =
  | { type: 'contains'; file: string; needle: string }
  | { type: 'command'; command: string }
  | { type: 'exists'; file: string }
  | { type: 'unrecognized' };

/**
 * Parse a criterion string into a typed check.
 *
 * Recognized formats:
 *   a. `{file} contains "{string}"`
 *   b. `test exits 0` or `{command} exits 0`
 *   c. `{file} exists`
 */
function parseCriterion(criterion: string): ParsedCriterion {
  const trimmed = criterion.trim();

  // (b) command / test exits 0
  // Matches "test exits 0" or "{command} exits 0"
  const exitsMatch = trimmed.match(/^(.+?)\s+exits\s+0$/);
  if (exitsMatch) {
    const command = exitsMatch[1].trim();
    // `test exits 0` → run `npm test`; otherwise run the captured command
    const resolved = command === 'test' ? 'npm test' : command;
    return { type: 'command', command: resolved };
  }

  // (a) {file} contains "{string}"
  const containsMatch = trimmed.match(/^(.+?)\s+contains\s+"(.+)"$/);
  if (containsMatch) {
    return { type: 'contains', file: containsMatch[1].trim(), needle: containsMatch[2] };
  }

  // (c) {file} exists
  const existsMatch = trimmed.match(/^(.+?)\s+exists$/);
  if (existsMatch) {
    return { type: 'exists', file: existsMatch[1].trim() };
  }

  return { type: 'unrecognized' };
}

/**
 * Resolve a possibly-relative file path against the workspace directory.
 */
function resolveFilePath(filePath: string, workspaceDir: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(workspaceDir, filePath);
}

/**
 * Read a JSON file as a TaskDefinition. Returns undefined if missing or unparseable.
 */
function readTaskDefinition(taskDefPath: string): TaskDefinition | undefined {
  if (!fs.existsSync(taskDefPath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(taskDefPath, 'utf-8');
    return JSON.parse(raw) as TaskDefinition;
  } catch {
    return undefined;
  }
}

/**
 * Read a JSON file as a TaskRecord (parent task.json). Returns undefined if missing,
 * unparseable, or lacking a valid `relatedFiles` array.
 */
function readTaskRecord(taskRecordPath: string): TaskRecord | undefined {
  if (!fs.existsSync(taskRecordPath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(taskRecordPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'relatedFiles' in parsed) {
      const candidate = parsed as { relatedFiles: unknown };
      if (Array.isArray(candidate.relatedFiles) && candidate.relatedFiles.every((f) => typeof f === 'string')) {
        return parsed as TaskRecord;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Run a single criterion check and return its result item.
 * `relatedFiles` are used as the fallback grep target for unrecognized formats.
 */
function checkSingleCriterion(
  criterion: string,
  workspaceDir: string,
  relatedFiles: string[]
): ConvergenceResultItem {
  const parsed = parseCriterion(criterion);

  switch (parsed.type) {
    case 'contains': {
      const filePath = resolveFilePath(parsed.file, workspaceDir);
      if (!fs.existsSync(filePath)) {
        return { criterion, passed: false, evidence: 'File not found' };
      }
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes(parsed.needle)) {
          // Find the first matching line for evidence
          const lines = content.split(/\r?\n/);
          const matchedLine = lines.find((l) => l.includes(parsed.needle)) ?? parsed.needle;
          return { criterion, passed: true, evidence: matchedLine.trim() };
        }
        return { criterion, passed: false, evidence: `String "${parsed.needle}" not found in ${parsed.file}` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { criterion, passed: false, evidence: `Read error: ${msg}` };
      }
    }

    case 'command': {
      try {
        execSync(parsed.command, {
          cwd: workspaceDir,
          stdio: 'pipe',
          encoding: 'utf-8',
          timeout: 60_000,
        });
        return { criterion, passed: true, evidence: 'Exit code 0' };
      } catch (err) {
        let exitCode = -1;
        if (typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number') {
          exitCode = err.status;
        }
        return { criterion, passed: false, evidence: `Exit code ${exitCode}` };
      }
    }

    case 'exists': {
      const filePath = resolveFilePath(parsed.file, workspaceDir);
      if (fs.existsSync(filePath)) {
        return { criterion, passed: true, evidence: filePath };
      }
      return { criterion, passed: false, evidence: 'File not found' };
    }

    case 'unrecognized':
    default: {
      // Default: treat entire criterion as a grep pattern against all relatedFiles in parent task.json
      if (relatedFiles.length === 0) {
        return { criterion, passed: false, evidence: 'Unrecognized criterion format' };
      }
      for (const relFile of relatedFiles) {
        const filePath = resolveFilePath(relFile, workspaceDir);
        if (!fs.existsSync(filePath)) {
          continue;
        }
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (content.includes(criterion)) {
            const lines = content.split(/\r?\n/);
            const matchedLine = lines.find((l) => l.includes(criterion)) ?? criterion;
            return { criterion, passed: true, evidence: `${relFile}: ${matchedLine.trim()}` };
          }
        } catch {
          // try next file
        }
      }
      return { criterion, passed: false, evidence: 'Unrecognized criterion format' };
    }
  }
}

/**
 * Collect relatedFiles from a parent TaskRecord (task.json) for the default grep fallback.
 * The parent task.json is a TaskRecord (relatedFiles: string[]), not a TaskDefinition.
 */
function collectRelatedFiles(parentTaskId: string, workspaceDir: string): string[] {
  const parentTaskPath = path.join(workspaceDir, '.omp-flow', 'tasks', parentTaskId, 'task.json');
  const parentTask = readTaskRecord(parentTaskPath);
  if (!parentTask) {
    return [];
  }
  return parentTask.relatedFiles;
}

/**
 * checkConvergence - Verify all convergence criteria for a single sub-task.
 *
 * @param parentTaskId  Parent task id (directory under .omp-flow/tasks/)
 * @param subTaskId     Sub-task id (TASK-NNN); file under .task/
 * @param workspaceDir  Workspace root
 */
export function checkConvergence(
  parentTaskId: string,
  subTaskId: string,
  workspaceDir: string
): ConvergenceResult {
  const taskDefPath = path.join(
    workspaceDir,
    '.omp-flow',
    'tasks',
    parentTaskId,
    '.task',
    `${subTaskId}.json`
  );

  const result: ConvergenceResult = {
    taskId: parentTaskId,
    subTaskId,
    passed: false,
    results: [],
  };

  const taskDef = readTaskDefinition(taskDefPath);
  if (!taskDef) {
    result.results.push({
      criterion: '<task definition>',
      passed: false,
      evidence: 'File not found',
    });
    return result;
  }

  const relatedFiles = collectRelatedFiles(parentTaskId, workspaceDir);

  for (const criterion of taskDef.convergence.criteria) {
    result.results.push(checkSingleCriterion(criterion, workspaceDir, relatedFiles));
  }

  result.passed = result.results.length > 0 && result.results.every((r) => r.passed);
  return result;
}

/**
 * checkAllConvergence - Run convergence check for every .task/*.json under a parent task.
 *
 * @param parentTaskId  Parent task id
 * @param workspaceDir  Workspace root
 * @returns Array of ConvergenceResult. Empty array if no sub-task files exist.
 */
export function checkAllConvergence(
  parentTaskId: string,
  workspaceDir: string
): ConvergenceResult[] {
  const taskDir = path.join(workspaceDir, '.omp-flow', 'tasks', parentTaskId, '.task');

  if (!fs.existsSync(taskDir) || !fs.statSync(taskDir).isDirectory()) {
    return [];
  }

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(taskDir);
  } catch {
    return [];
  }

  const results: ConvergenceResult[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) {
      continue;
    }
    const subTaskId = path.basename(entry, '.json');
    results.push(checkConvergence(parentTaskId, subTaskId, workspaceDir));
  }

  return results;
}

/**
 * formatConvergenceReport - Render results as readable markdown.
 */
export function formatConvergenceReport(results: ConvergenceResult[]): string {
  const lines: string[] = ['# Convergence Report', ''];

  if (results.length === 0) {
    lines.push('_No sub-tasks to report._', '');
    return lines.join('\n');
  }

  let passedCount = 0;

  for (const res of results) {
    // Load title lazily: ConvergenceResult doesn't carry title, so use subTaskId.
    lines.push(`## ${res.subTaskId}`);

    for (const item of res.results) {
      const mark = item.passed ? '[✓]' : '[✗]';
      lines.push(`- ${mark} ${item.criterion} — ${item.evidence}`);
    }
    lines.push(`Status: ${res.passed ? 'PASS' : 'FAIL'}`, '');

    if (res.passed) {
      passedCount++;
    }
  }

  lines.push('## Summary');
  lines.push(`Passed: ${passedCount}/${results.length} tasks`);

  return lines.join('\n');
}
