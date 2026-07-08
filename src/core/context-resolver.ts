import * as fs from 'fs';
import * as path from 'path';
import { SharedContextStore } from './shared-context-store.js';
import { ReferenceDigester } from './reference-digestion.js';
import { readCSVRow } from './csv-adapter.js';

export class ContextResolver {
  constructor(private workspaceDir: string = process.cwd()) {}

  resolveExecutionContext(opts: { taskId?: string; rowId?: string }): { taskId: string; rowId?: string } {
    const taskId = opts.taskId || process.env.OMP_FLOW_TASK_ID || '';
    const rowId = opts.rowId || process.env.OMP_FLOW_ROW_ID;
    if (!taskId) throw new Error('OMP_FLOW_TASK_ID missing. Pass --task or export OMP_FLOW_TASK_ID.');
    return { taskId, rowId: rowId || undefined };
  }

  resolveRowBundle(taskId: string, rowId?: string): { entries: unknown[]; references: string[] } {
    const entries: unknown[] = [];
    const references: string[] = [];
    const row = rowId ? readCSVRow(taskId, rowId, this.workspaceDir) : null;
    if (row) {
      if (row.context) {
        const store = new SharedContextStore(this.workspaceDir, taskId);
        const resolved = store.resolveRefs(row.context);
        entries.push(...resolved);
      }
      if (row.reference) {
        const digester = new ReferenceDigester(this.workspaceDir);
        const refBlock = digester.renderReferencesBlock(row.reference, taskId);
        if (refBlock) references.push(refBlock);
      }
    }
    return { entries, references };
  }

  resolveApplicableRules(opts: { file?: string; taskId?: string; rowId?: string }): unknown[] {
    const { taskId } = this.resolveExecutionContext(opts);
    const store = new SharedContextStore(this.workspaceDir, taskId);
    const decisions = store.list({ type: 'decision' });
    return decisions.filter((d) => d.status === 'accepted' || d.status === undefined);
  }

  renderBundle(bundle: { entries?: unknown[]; references?: string[] }, format: 'json' | 'text'): string {
    if (format === 'json') return JSON.stringify(bundle, null, 2);
    const lines: string[] = [];
    if (bundle.entries?.length) {
      lines.push('Context Entries:');
      for (const e of bundle.entries as Array<Record<string, unknown>>) {
        lines.push(`  [${e.type}] ${e.title}: ${e.summary}`);
      }
    }
    if (bundle.references?.length) {
      lines.push('References:');
      for (const r of bundle.references) lines.push(`  ${r}`);
    }
    return lines.join('\n');
  }
}
