import * as fs from 'fs';
import * as path from 'path';

const EVIDENCE_HEADERS = [
  'rowId',
  'verdict',
  'tests_run',
  'tests_failed',
  'evidence',
  'timestamp',
  'reviewer_agent_id',
] as const;

type EvidenceEntry = {
  rowId: string;
  verdict: string;
  tests_run: string;
  tests_failed: string;
  evidence: string;
  timestamp: string;
  reviewer_agent_id: string;
};

function escapeCSVCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function stringifyEvidenceRecord(entry: EvidenceEntry): string {
  return [
    escapeCSVCell(entry.rowId),
    escapeCSVCell(entry.verdict),
    escapeCSVCell(entry.tests_run),
    escapeCSVCell(entry.tests_failed),
    escapeCSVCell(entry.evidence),
    escapeCSVCell(entry.timestamp),
    escapeCSVCell(entry.reviewer_agent_id),
  ].join(',');
}

export function appendEvidenceRow(evidencePath: string, entry: EvidenceEntry): void {
  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });

  // Create file with header if absent or empty (atomic create, not append)
  if (!fs.existsSync(evidencePath) || fs.statSync(evidencePath).size === 0) {
    fs.writeFileSync(evidencePath, EVIDENCE_HEADERS.join(',') + '\n', 'utf-8');
  }

  // Trailing newline guard: read last byte, append \n if missing
  const stat = fs.statSync(evidencePath);
  if (stat.size > 0) {
    const fd = fs.openSync(evidencePath, 'r');
    const buf = Buffer.alloc(1);
    fs.readSync(fd, buf, 0, 1, stat.size - 1);
    fs.closeSync(fd);
    if (buf[0] !== 0x0A) {
      fs.appendFileSync(evidencePath, '\n', 'utf-8');
    }
  }

  // Append one encoded row (true append-only, no read-modify-write)
  fs.appendFileSync(evidencePath, stringifyEvidenceRecord(entry) + '\n', 'utf-8');
}
