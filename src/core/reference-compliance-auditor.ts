import * as fs from 'fs';
import * as path from 'path';
import { readCSVRow } from './csv-adapter.js';
import { SharedContextStore } from './shared-context-store.js';
import { ReferenceDigester } from './reference-digestion.js';

export type ComplianceLevel = 'strict' | 'compatible' | 'weak' | 'failed';

export interface ComplianceCheckResult {
  ref: string;
  intent?: string;
  result: 'adopted' | 'adopted-with-adaptation' | 'diverged' | 'ignored';
  evidence: string[];
  justification?: string;
}

export interface ContextCheckResult {
  ref: string;
  result: 'signature-match' | 'rule-match' | 'rule-violation' | 'not-found';
}

export interface ReferenceComplianceAudit {
  status: ComplianceLevel;
  checkedRefs: ComplianceCheckResult[];
  checkedContext: ContextCheckResult[];
}

export class ReferenceComplianceAuditor {
  constructor(private workspaceDir: string = process.cwd()) {}

  audit(taskId: string, rowId: string): ReferenceComplianceAudit {
    const row = readCSVRow(taskId, rowId, this.workspaceDir);
    const checkedRefs: ComplianceCheckResult[] = [];
    const checkedContext: ContextCheckResult[] = [];

    if (!row) {
      return { status: 'failed', checkedRefs, checkedContext };
    }

    if (row.reference) {
      const digester = new ReferenceDigester(this.workspaceDir);
      const refs = row.reference.split(';').map(s => s.trim()).filter(Boolean);
      for (const ref of refs) {
        const match = ref.match(/^ref:(.+?)(?:#(L\d+(?:-L?\d+)?))?$/);
        if (!match) continue;
        const slug = match[1];
        const digested = digester.listDigested(taskId).find(d => d.slug === slug);
        if (digested) {
          checkedRefs.push({
            ref,
            intent: digested.intent,
            result: 'adopted',
            evidence: [`${digested.sourceRepo}/${digested.sourcePath}:${digested.sourceLines}`],
          });
        } else {
          checkedRefs.push({ ref, result: 'ignored', evidence: [] });
        }
      }
    }

    if (row.context) {
      const store = new SharedContextStore(this.workspaceDir, taskId);
      const refs = row.context.split(';').map(s => s.trim()).filter(Boolean);
      for (const ref of refs) {
        const entry = store.get(ref);
        if (entry) {
          checkedContext.push({
            ref,
            result: entry.type === 'interface' ? 'signature-match' : 'rule-match',
          });
        } else {
          checkedContext.push({ ref, result: 'not-found' });
        }
      }
    }

    const hasIgnored = checkedRefs.some(r => r.result === 'ignored');
    const hasNotFound = checkedContext.some(c => c.result === 'not-found');
    const hasViolation = checkedContext.some(c => c.result === 'rule-violation');

    let status: ComplianceLevel = 'strict';
    if (hasViolation) status = 'failed';
    else if (hasNotFound || hasIgnored) status = 'weak';
    else if (checkedRefs.some(r => r.result === 'adopted-with-adaptation')) status = 'compatible';

    return { status, checkedRefs, checkedContext };
  }

  writeToEvidence(taskId: string, rowId: string, audit: ReferenceComplianceAudit): void {
    const evidencePath = path.join(this.workspaceDir, '.omp-flow', 'tasks', taskId, '.task', `${rowId}.json`);
    const verdict = audit.status === 'failed' ? 'FAIL' : 'PASS';
    let payload: Record<string, unknown> = {
      verdict,
      tests_run: 0,
      tests_failed: audit.status === 'failed' ? 1 : 0,
      evidence: '',
      referenceCompliance: audit,
    };
    if (fs.existsSync(evidencePath)) {
      try {
        payload = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));
      } catch {
        // Keep default payload
      }
    }
    payload.referenceCompliance = audit;
    fs.writeFileSync(evidencePath, JSON.stringify(payload, null, 2), 'utf-8');
  }
}
