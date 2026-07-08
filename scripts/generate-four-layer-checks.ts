import { runPreCheck } from '../src/core/pre-check.ts';
import { runAuditCheck } from '../src/core/audit-check.ts';

const taskId = '07-06-four-layer-check';
const rowIds = ['F-001', 'F-002', 'F-003', 'F-004'] as const;

for (const rowId of rowIds) {
  runPreCheck(taskId, rowId);
  runAuditCheck(taskId, rowId);
  console.log(`generated ${rowId}`);
}
