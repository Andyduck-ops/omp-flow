import * as fs from 'fs';
import * as path from 'path';
import { assertCheckPassed, readCSVRow, updateCSVRow } from '../core/csv-adapter.js';
import { appendEvidenceRow } from '../core/evidence-store.js';
import { readActiveTaskId } from './active-task.js';

type Verdict = 'pass' | 'fail';

type SubmitVerdictParams = {
  rowId: string;
  verdict: Verdict;
  tests_run: number;
  tests_failed: number;
  evidence: string;
};

type ToolContent = { type: 'text'; text: string };

type ToolResponse = { content: ToolContent[] };

type VerdictToolExecuteContext = {
  sessionManager?: { getSessionId?: () => string | null };
};

function textResponse(text: string): ToolResponse {
  return { content: [{ type: 'text', text }] };
}

function isValidVerdict(value: string): value is Verdict {
  return value === 'pass' || value === 'fail';
}

export function createVerdictTool(workspaceDir: string) {
  return {
    name: 'omp_flow_submit_verdict',
    label: 'OMP-Flow Submit Verdict',
    defaultInactive: true,
    description: 'Submit review verdict. Host writes verdict.json + evidence.csv. Do NOT write these files yourself.',
    promptSnippet: 'Submit review verdict for row {rowId}. Host writes verdict.json and evidence.csv.',
    promptGuidelines: [
      'After completing review, call omp_flow_submit_verdict with verdict, test counts, and evidence.',
      'verdict=pass requires tests_failed=0. Host validates and updates CSV status automatically.',
    ],
    parameters: {
      type: 'object' as const,
      properties: {
        rowId: { type: 'string', description: 'CSV row ID being reviewed' },
        verdict: { type: 'string', enum: ['pass', 'fail'] },
        tests_run: { type: 'number', minimum: 0 },
        tests_failed: { type: 'number', minimum: 0 },
        evidence: { type: 'string', description: 'Summary of verification: commands run, results, artifacts' },
      },
      required: ['rowId', 'verdict', 'tests_run', 'tests_failed', 'evidence'],
    },
    async execute(
      _toolCallId: string,
      input: SubmitVerdictParams,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx?: VerdictToolExecuteContext,
    ): Promise<ToolResponse> {
      if (!isValidVerdict(input.verdict)) {
        return textResponse(`Error: invalid verdict: ${input.verdict}`);
      }

      if (!Number.isInteger(input.tests_run) || input.tests_run < 0) {
        return textResponse('Error: tests_run must be a non-negative integer');
      }

      if (!Number.isInteger(input.tests_failed) || input.tests_failed < 0) {
        return textResponse('Error: tests_failed must be a non-negative integer');
      }

      if (input.tests_failed > input.tests_run) {
        return textResponse('Error: tests_failed cannot be greater than tests_run');
      }

      if (input.verdict === 'pass' && input.tests_failed !== 0) {
        return textResponse('Error: verdict=pass requires tests_failed=0');
      }

      let taskId: string;
      try {
        taskId = readActiveTaskId(workspaceDir);
      } catch (error) {
        return textResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }

      const row = readCSVRow(taskId, input.rowId, workspaceDir);
      if (!row) {
        return textResponse(`Error: Row not found: ${input.rowId}`);
      }

      const taskDir = path.join(workspaceDir, '.omp-flow', 'tasks', taskId);
      const entry = {
        rowId: input.rowId,
        verdict: input.verdict,
        tests_run: String(input.tests_run),
        tests_failed: String(input.tests_failed),
        evidence: input.evidence,
        timestamp: new Date().toISOString(),
        reviewer_agent_id: ctx?.sessionManager?.getSessionId?.() ?? 'session-unknown',
      };

      const verdictPath = path.join(taskDir, '.task', `${input.rowId}.verdict.json`);
      fs.mkdirSync(path.dirname(verdictPath), { recursive: true });
      fs.writeFileSync(verdictPath, `${JSON.stringify(entry, null, 2)}\n`, 'utf-8');

      const evidencePath = path.join(taskDir, 'evidence.csv');
      appendEvidenceRow(evidencePath, entry);

      const check = assertCheckPassed(taskId, input.rowId, workspaceDir);
      if (check.passed) {
        updateCSVRow(taskId, input.rowId, { status: 'completed', error: '' }, workspaceDir);
      }

      const statusText = check.passed ? 'PASSED' : 'FAILED';
      return textResponse(`Verdict submitted: ${input.verdict}. Check: ${statusText}. ${check.reason}`);
    },
  };
}
