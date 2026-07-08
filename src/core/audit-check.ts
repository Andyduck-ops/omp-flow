import * as fs from 'fs';
import * as path from 'path';
import { WEASEL_PATTERNS } from './fsm.js';

export interface AuditCheckResult {
  passed: boolean;
  downgraded: boolean;
  reason: string;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
}

export function runAuditCheck(
  parentTaskId: string,
  rowId: string,
  workspaceDir: string = process.cwd()
): AuditCheckResult {
  const checks: AuditCheckResult['checks'] = [];
  let downgraded = false;
  let reason = '';

  const checkFilePath = path.join(workspaceDir, '.omp-flow', 'tasks', parentTaskId, '.task', `${rowId}.json`);
  if (!fs.existsSync(checkFilePath)) {
    const result = {
      passed: false,
      downgraded: false,
      reason: `Check evidence file missing: ${checkFilePath}`,
      checks,
    };
    writeResult(parentTaskId, rowId, workspaceDir, result);
    return result;
  }

  const checkContent = JSON.parse(fs.readFileSync(checkFilePath, 'utf-8')) as Record<string, unknown>;
  const verdict = String(checkContent.verdict ?? checkContent.checkVerdict ?? '').toLowerCase();
  const testsRun = typeof checkContent.tests_run === 'number' ? checkContent.tests_run : undefined;
  const testsFailed = typeof checkContent.tests_failed === 'number' ? checkContent.tests_failed : undefined;
  const evidence = typeof checkContent.evidence === 'string' ? checkContent.evidence : '';

  checks.push({
    name: 'tests-run-positive',
    passed: testsRun !== undefined && testsRun > 0,
    detail: testsRun !== undefined ? `tests_run=${testsRun}` : 'tests_run field missing',
  });

  checks.push({
    name: 'evidence-substantive',
    passed: evidence.length > 50,
    detail: evidence.length > 50 ? `Evidence has ${evidence.length} chars` : `Evidence too short (${evidence.length} chars)`,
  });

  const hasFileRefs = /\b\w+\.\w{1,5}\b|\b\w+:\d+\b|\bline\s+\d+\b|\bL\d+\b/i.test(evidence);
  checks.push({
    name: 'evidence-has-file-refs',
    passed: hasFileRefs,
    detail: hasFileRefs ? 'Evidence contains file/line references' : 'Evidence lacks specific file/line references',
  });

  const weaselMatch = WEASEL_PATTERNS.find((pattern) => pattern.test(evidence));
  checks.push({
    name: 'no-weasel-words',
    passed: !weaselMatch,
    detail: weaselMatch ? `Weasel word detected: ${weaselMatch.source}` : 'No weasel words detected',
  });

  if (verdict === 'pass') {
    const noFailures = testsFailed === 0;
    checks.push({
      name: 'pass-verdict-consistent',
      passed: noFailures,
      detail: noFailures ? 'PASS verdict consistent with 0 failures' : `PASS verdict but tests_failed=${testsFailed}`,
    });
    if (!noFailures) {
      downgraded = true;
      reason = 'PASS verdict contradicted by tests_failed > 0';
    }
  }

  const failedChecks = checks.filter((check) => !check.passed);
  const passed = failedChecks.length === 0;
  if (!passed && !downgraded) {
    downgraded = verdict === 'pass';
    reason = `Audit check failed: ${failedChecks.map((check) => check.name).join(', ')}`;
  }

  const result: AuditCheckResult = {
    passed,
    downgraded,
    reason: reason || (passed ? 'All checks passed' : 'Some checks failed'),
    checks,
  };
  writeResult(parentTaskId, rowId, workspaceDir, result);
  return result;
}

function writeResult(parentTaskId: string, rowId: string, workspaceDir: string, result: AuditCheckResult): void {
  const auditPath = path.join(workspaceDir, '.omp-flow', 'tasks', parentTaskId, '.task', `${rowId}.auditcheck.json`);
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(result, null, 2), 'utf-8');
}
