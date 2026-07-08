import * as fs from 'fs';
import * as path from 'path';
import { readCSVRow, parseCSV, type CSVRow } from './csv-adapter.js';
import { SharedContextStore } from './shared-context-store.js';

export interface ResolvedContextRef {
  ref: string;
  origin: 'explicit' | 'direct-dependency' | 'transitive-dependency';
  producerRowId?: string;
  depth: number;
}

export interface DependencyResolutionOptions {
  includeTransitive?: boolean;
  maxDepth?: number;
  includeFindings?: 'none' | 'promoted' | 'all';
}

export class DependencyContextResolver {
  constructor(private workspaceDir: string = process.cwd()) {}

  resolveRowRefs(taskId: string, rowId: string, opts?: DependencyResolutionOptions): ResolvedContextRef[] {
    const maxDepth = opts?.maxDepth ?? (opts?.includeTransitive ? 10 : 1);
    const includeFindings = opts?.includeFindings ?? 'promoted';
    const result: ResolvedContextRef[] = [];
    const seen = new Set<string>();

    // Step 1: explicit context from the row itself
    const row = readCSVRow(taskId, rowId, this.workspaceDir);
    if (row?.context) {
      for (const ref of row.context.split(';').map(s => s.trim()).filter(Boolean)) {
        if (!seen.has(ref)) {
          result.push({ ref, origin: 'explicit', depth: 0 });
          seen.add(ref);
        }
      }
    }

    // Step 2: DFS through dependsOn
    const csvPath = path.join(this.workspaceDir, '.omp-flow', 'tasks', taskId, 'tasks.csv');
    if (!fs.existsSync(csvPath)) return result;
    const rows = parseCSV(fs.readFileSync(csvPath, 'utf-8'));
    const rowMap = new Map<string, CSVRow>();
    for (const r of rows) if (r.id) rowMap.set(r.id, r);
    const visited = new Set<string>([rowId]);

    this.dfsDeps(taskId, rowId, rowMap, 1, maxDepth, includeFindings, result, seen, visited);

    return result;
  }

  private dfsDeps(
    taskId: string,
    rowId: string,
    rowMap: Map<string, CSVRow>,
    depth: number,
    maxDepth: number,
    includeFindings: string,
    result: ResolvedContextRef[],
    seen: Set<string>,
    visited: Set<string>
  ): void {
    if (depth > maxDepth) return;
    const row = rowMap.get(rowId);
    if (!row?.dependsOn) return;

    const store = new SharedContextStore(this.workspaceDir, taskId);
    const allEntries = store.list();
    const deps = row.dependsOn.split(';').map(s => s.trim()).filter(Boolean);
    for (const depId of deps) {
      if (visited.has(depId)) continue;
      const depRow = rowMap.get(depId);
      if (!depRow) continue;
      visited.add(depId);

      for (const entry of allEntries) {
        const isProducer = entry.producer === depId || (entry.scope?.tasks?.includes(depId));
        if (!isProducer) continue;
        const isCollectible = entry.type === 'interface'
          || entry.type === 'decision'
          || (entry.type === 'finding' && includeFindings !== 'none');
        if (!isCollectible) continue;
        if (entry.type === 'finding' && includeFindings === 'promoted' && entry.status !== 'accepted') continue;
        if (entry.status === 'superseded' || entry.status === 'rejected') continue;

        const ref = `${entry.type}:${entry.entryId}`;
        if (!seen.has(ref)) {
          result.push({
            ref,
            origin: depth === 1 ? 'direct-dependency' : 'transitive-dependency',
            producerRowId: depId,
            depth,
          });
          seen.add(ref);
        }
      }

      this.dfsDeps(taskId, depId, rowMap, depth + 1, maxDepth, includeFindings, result, seen, visited);
    }
  }
}
