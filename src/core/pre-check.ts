import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { readCSVRow } from './csv-adapter.js';

export interface PreCheckResult {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
}

export function runPreCheck(
  parentTaskId: string,
  rowId: string,
  workspaceDir: string = process.cwd()
): PreCheckResult {
  const checks: PreCheckResult['checks'] = [];

  const taskMdPath = path.join(
    workspaceDir,
    '.omp-flow',
    'tasks',
    parentTaskId,
    '.task',
    `${rowId}.md`
  );
  const mdExists = fs.existsSync(taskMdPath);
  const mdContent = mdExists ? fs.readFileSync(taskMdPath, 'utf-8').trim() : '';
  checks.push({
    name: 'taskMd-non-empty',
    passed: mdExists && mdContent.length > 0,
    detail: mdExists
      ? mdContent.length > 0
        ? 'Task MD has content'
        : 'Task MD is empty'
      : `Missing: ${taskMdPath}`
  });

  const row = readCSVRow(parentTaskId, rowId, workspaceDir);
  if (row && row.scope) {
    const scopeFiles = row.scope
      .split(/[;,]/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    let anyModified = false;

    for (const file of scopeFiles) {
      try {
        const diff = execSync(`git status --porcelain -- "${file}"`, {
          cwd: workspaceDir,
          encoding: 'utf-8',
          timeout: 5000
        }).trim();
        if (diff) {
          anyModified = true;
          break;
        }
      } catch {
        // git may not be available
      }
    }

    checks.push({
      name: 'scope-files-modified',
      passed: anyModified,
      detail: anyModified
        ? 'Scope files have been modified'
        : 'No scope files appear modified in git status'
    });
  } else {
    checks.push({
      name: 'scope-files-modified',
      passed: true,
      detail: 'No scope column to check'
    });
  }

  let tscPassed = false;
  try {
    execSync('npx tsc --noEmit', {
      cwd: workspaceDir,
      encoding: 'utf-8',
      timeout: 60000
    });
    tscPassed = true;
  } catch {
    tscPassed = false;
  }

  checks.push({
    name: 'tsc-passes',
    passed: tscPassed,
    detail: tscPassed ? 'TypeScript compilation passed' : 'TypeScript compilation failed'
  });

  const passed = checks.every((check) => check.passed);

  const preCheckPath = path.join(
    workspaceDir,
    '.omp-flow',
    'tasks',
    parentTaskId,
    '.task',
    `${rowId}.precheck.json`
  );
  fs.mkdirSync(path.dirname(preCheckPath), { recursive: true });
  fs.writeFileSync(preCheckPath, JSON.stringify({ passed, checks }, null, 2), 'utf-8');

  return { passed, checks };
}
