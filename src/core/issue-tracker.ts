/**
 * Issue Tracker — JSONL-based issue persistence with CRUD operations
 * and 8-perspective auto-discovery scanning.
 *
 * Issues are stored at `.omp-flow/issues/issues.jsonl` with a sidecar
 * sequence counter (`issues.jsonl.seq`) for ID generation.
 *
 * ID format: `ISS-YYYYMMDD-NNN` where NNN is a zero-padded daily counter.
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────────

export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type IssuePriority = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * The 8 discovery perspectives for auto-scanning.
 * Each represents a distinct angle from which issues can be detected
 * during the `discoverIssues()` scan pass.
 */
export type DiscoveryPerspective =
  | 'architecture'
  | 'correctness'
  | 'performance'
  | 'security'
  | 'convergence'
  | 'drift'
  | 'dependency'
  | 'quality';

/** All 8 perspective values, available for iteration. */
export const DISCOVERY_PERSPECTIVES: readonly DiscoveryPerspective[] = [
  'architecture',
  'correctness',
  'performance',
  'security',
  'convergence',
  'drift',
  'dependency',
  'quality',
] as const;

export interface Issue {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  /** The discovery perspective that identified this issue, or null for manually created issues. */
  perspective: DiscoveryPerspective | null;
  /** IDs of issues linked to this one (bidirectional). */
  linked_issues: string[];
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface IssueCreateInput {
  title: string;
  description: string;
  priority?: IssuePriority;
  perspective?: DiscoveryPerspective;
  metadata?: Record<string, unknown>;
}

export interface IssueUpdateInput {
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  perspective?: DiscoveryPerspective;
  metadata?: Record<string, unknown>;
}

export interface ListIssuesFilter {
  status?: IssueStatus;
  perspective?: DiscoveryPerspective;
}

/**
 * A single discovered issue produced by a perspective scanner.
 * The scanner determines the title, description, priority, and metadata;
 * the `discoverIssues()` function persists it and generates the ID.
 */
export interface DiscoveredIssue {
  perspective: DiscoveryPerspective;
  title: string;
  description: string;
  priority: IssuePriority;
  metadata: Record<string, unknown>;
}

/** Per-perspective scan statistics. */
export interface PerspectiveScanResult {
  perspective: DiscoveryPerspective;
  matchCount: number;
}

export interface DiscoverIssuesResult {
  /** Issues that were created during this scan. */
  created: Issue[];
  /** Per-perspective scan statistics. */
  scanned: PerspectiveScanResult[];
  /** Total number of discovered issues across all perspectives. */
  totalScanned: number;
}

/**
 * Scanner function type for a single perspective.
 * Implementations scan the workspace and return discovered issues.
 */
export type PerspectiveScanner = (workspaceDir: string) => DiscoveredIssue[];

// ── Default empty scanners ─────────────────────────────────────────────────────

/**
 * Default scanners for each of the 8 perspectives.
 *
 * These return empty results by default — they serve as pluggable slots.
 * Callers provide custom scanners to `discoverIssues()` for real detection:
 *
 * - `architecture`   — architectural boundary violations
 * - `correctness`    — logic errors, type mismatches, missing null checks
 * - `performance`    — performance anti-patterns and bottlenecks
 * - `security`       — security vulnerabilities
 * - `convergence`    — convergence check gaps
 * - `drift`          — spec/code drift
 * - `dependency`     — dependency chain issues
 * - `quality`        — code quality / maintainability issues
 */
const DEFAULT_SCANNERS: Record<DiscoveryPerspective, PerspectiveScanner> = {
  architecture: (): DiscoveredIssue[] => [],
  correctness: (): DiscoveredIssue[] => [],
  performance: (): DiscoveredIssue[] => [],
  security: (): DiscoveredIssue[] => [],
  convergence: (): DiscoveredIssue[] => [],
  drift: (): DiscoveredIssue[] => [],
  dependency: (): DiscoveredIssue[] => [],
  quality: (): DiscoveredIssue[] => [],
};

// ── Internal paths ─────────────────────────────────────────────────────────────

function issuesDir(workspaceDir: string): string {
  return path.join(workspaceDir, '.omp-flow', 'issues');
}

function issuesPath(workspaceDir: string): string {
  return path.join(issuesDir(workspaceDir), 'issues.jsonl');
}

function seqPath(workspaceDir: string): string {
  return path.join(issuesDir(workspaceDir), 'issues.jsonl.seq');
}

// ── Sequence helpers (modeled after EventBus pattern in events.ts) ─────────────

/**
 * Read the current sequence counter from the sidecar file.
 * Returns 0 if the sidecar is missing or corrupt.
 */
function readSeq(workspaceDir: string): number {
  const sp = seqPath(workspaceDir);
  if (fs.existsSync(sp)) {
    try {
      const raw = fs.readFileSync(sp, 'utf-8').trim();
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    } catch {
      // Fall through to default
    }
  }
  return 0;
}

function writeSeq(workspaceDir: string, seq: number): void {
  fs.mkdirSync(issuesDir(workspaceDir), { recursive: true });
  fs.writeFileSync(seqPath(workspaceDir), String(seq), 'utf-8');
}

/**
 * Atomically advance the sequence counter and return the new value.
 * No locking is needed for single-process access.
 */
function nextSeq(workspaceDir: string): number {
  const next = readSeq(workspaceDir) + 1;
  writeSeq(workspaceDir, next);
  return next;
}

// ── ID generation ──────────────────────────────────────────────────────────────

/**
 * Generate an issue ID in format `ISS-YYYYMMDD-NNN`.
 * The counter resets daily (NNN wraps from 999 back to 000).
 */
function generateIssueId(workspaceDir: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const dateStr = `${y}${m}${d}`;
  const seq = nextSeq(workspaceDir);
  const padded = String(seq % 1000).padStart(3, '0');
  return `ISS-${dateStr}-${padded}`;
}

// ── Internal persistence helpers ───────────────────────────────────────────────

/**
 * Read all issues from the JSONL store.
 * Malformed lines are silently skipped.
 */
function readAllIssues(workspaceDir: string): Issue[] {
  const ip = issuesPath(workspaceDir);
  if (!fs.existsSync(ip)) return [];
  const content = fs.readFileSync(ip, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  const issues: Issue[] = [];
  for (const line of lines) {
    try {
      const issue = JSON.parse(line) as Issue;
      issues.push(issue);
    } catch {
      // Skip malformed lines
    }
  }
  return issues;
}

/**
 * Persist a single issue to the JSONL store with dedup.
 *
 * If an issue with the same ID already exists, the old entry is replaced.
 * This ensures idempotent updates without scanning the full file twice on write.
 */
function persistIssue(workspaceDir: string, issue: Issue): void {
  const ip = issuesPath(workspaceDir);
  fs.mkdirSync(issuesDir(workspaceDir), { recursive: true });

  const newLine = JSON.stringify(issue);

  if (!fs.existsSync(ip)) {
    // Fresh store
    fs.writeFileSync(ip, newLine + '\n', 'utf-8');
    return;
  }

  const content = fs.readFileSync(ip, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  const kept: string[] = [];
  let replaced = false;

  for (const line of lines) {
    try {
      const existing = JSON.parse(line) as Issue;
      if (existing.id === issue.id) {
        kept.push(newLine);
        replaced = true;
      } else {
        kept.push(line);
      }
    } catch {
      // Preserve unparseable lines
      kept.push(line);
    }
  }

  if (!replaced) {
    kept.push(newLine);
  }

  fs.writeFileSync(ip, kept.join('\n') + '\n', 'utf-8');
}

// ── CRUD Exports ───────────────────────────────────────────────────────────────

/**
 * Create a new issue and persist it to the JSONL store.
 *
 * @param input - Issue data (title and description are required)
 * @param workspaceDir - Workspace root (defaults to `process.cwd()`)
 * @returns The created Issue with generated ID and timestamps
 */
export function createIssue(
  input: IssueCreateInput,
  workspaceDir: string = process.cwd()
): Issue {
  const now = new Date().toISOString();
  const id = generateIssueId(workspaceDir);
  const issue: Issue = {
    id,
    title: input.title,
    description: input.description,
    status: 'open',
    priority: input.priority ?? 'P2',
    perspective: input.perspective ?? null,
    linked_issues: [],
    created_at: now,
    updated_at: now,
    metadata: input.metadata ?? {},
  };
  persistIssue(workspaceDir, issue);
  return issue;
}

/**
 * List all issues, optionally filtered by status and/or perspective.
 *
 * @param filter - Optional filter criteria
 * @param workspaceDir - Workspace root (defaults to `process.cwd()`)
 * @returns Matching issues sorted by creation time (newest first)
 */
export function listIssues(
  filter?: ListIssuesFilter,
  workspaceDir: string = process.cwd()
): Issue[] {
  const all = readAllIssues(workspaceDir);
  const filtered = filter
    ? all.filter((issue) => {
        if (filter.status !== undefined && issue.status !== filter.status) return false;
        if (filter.perspective !== undefined && issue.perspective !== filter.perspective) return false;
        return true;
      })
    : all;
  return filtered.reverse();
}

/**
 * Get a single issue by ID.
 *
 * @param id - Issue ID (e.g. `ISS-20260705-001`)
 * @param workspaceDir - Workspace root (defaults to `process.cwd()`)
 * @returns The issue, or `null` if not found
 */
export function getIssue(
  id: string,
  workspaceDir: string = process.cwd()
): Issue | null {
  const all = readAllIssues(workspaceDir);
  return all.find((issue) => issue.id === id) ?? null;
}

/**
 * Get the status of an issue by ID.
 *
 * @param id - Issue ID
 * @param workspaceDir - Workspace root (defaults to `process.cwd()`)
 * @returns The issue status, or `null` if the issue does not exist
 */
export function getIssueStatus(
  id: string,
  workspaceDir: string = process.cwd()
): IssueStatus | null {
  const issue = getIssue(id, workspaceDir);
  return issue?.status ?? null;
}

/**
 * Update fields of an existing issue.
 *
 * @param id - Issue ID
 * @param input - Fields to update (all optional)
 * @param workspaceDir - Workspace root (defaults to `process.cwd()`)
 * @returns The updated issue, or `null` if not found
 */
export function updateIssue(
  id: string,
  input: IssueUpdateInput,
  workspaceDir: string = process.cwd()
): Issue | null {
  const issue = getIssue(id, workspaceDir);
  if (!issue) return null;

  const updated: Issue = {
    ...issue,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.perspective !== undefined ? { perspective: input.perspective } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    updated_at: new Date().toISOString(),
  };

  persistIssue(workspaceDir, updated);
  return updated;
}

/**
 * Close an issue (set status to `'closed'`).
 *
 * @param id - Issue ID
 * @param workspaceDir - Workspace root (defaults to `process.cwd()`)
 * @returns The updated issue, or `null` if not found
 */
export function closeIssue(
  id: string,
  workspaceDir: string = process.cwd()
): Issue | null {
  return updateIssue(id, { status: 'closed' }, workspaceDir);
}

/**
 * Link two issues bidirectionally.
 *
 * Each issue is added to the other's `linked_issues` array.
 * Duplicate links are silently ignored (Set dedup).
 *
 * @param idA - First issue ID
 * @param idB - Second issue ID
 * @param workspaceDir - Workspace root (defaults to `process.cwd()`)
 * @returns `true` if both issues were found and linked
 */
export function linkIssues(
  idA: string,
  idB: string,
  workspaceDir: string = process.cwd()
): boolean {
  const issueA = getIssue(idA, workspaceDir);
  const issueB = getIssue(idB, workspaceDir);
  if (!issueA || !issueB) return false;

  const now = new Date().toISOString();

  const updatedA: Issue = {
    ...issueA,
    linked_issues: [...new Set([...issueA.linked_issues, idB])],
    updated_at: now,
  };
  const updatedB: Issue = {
    ...issueB,
    linked_issues: [...new Set([...issueB.linked_issues, idA])],
    updated_at: now,
  };

  persistIssue(workspaceDir, updatedA);
  persistIssue(workspaceDir, updatedB);
  return true;
}

/**
 * Unlink two issues bidirectionally.
 *
 * Each issue is removed from the other's `linked_issues` array.
 *
 * @param idA - First issue ID
 * @param idB - Second issue ID
 * @param workspaceDir - Workspace root (defaults to `process.cwd()`)
 * @returns `true` if both issues were found and unlinked
 */
export function unlinkIssues(
  idA: string,
  idB: string,
  workspaceDir: string = process.cwd()
): boolean {
  const issueA = getIssue(idA, workspaceDir);
  const issueB = getIssue(idB, workspaceDir);
  if (!issueA || !issueB) return false;

  const now = new Date().toISOString();

  const updatedA: Issue = {
    ...issueA,
    linked_issues: issueA.linked_issues.filter((lid) => lid !== idB),
    updated_at: now,
  };
  const updatedB: Issue = {
    ...issueB,
    linked_issues: issueB.linked_issues.filter((lid) => lid !== idA),
    updated_at: now,
  };

  persistIssue(workspaceDir, updatedA);
  persistIssue(workspaceDir, updatedB);
  return true;
}

// ── 8-Perspective Discovery ────────────────────────────────────────────────────

/**
 * Run discovery scans from all 8 perspectives.
 *
 * Each perspective scanner inspects the workspace from a unique angle and
 * returns discovered issues, which are then persisted to the JSONL store.
 *
 * Callers supply custom scanners for the perspectives they want to use;
 * perspectives without a custom scanner return empty results.
 *
 * @example
 * ```ts
 * const result = discoverIssues({
 *   architecture: (dir) => [{
 *     perspective: 'architecture',
 *     title: 'Boundary violation in module X',
 *     description: 'Module X imports from Y, violating layering rules.',
 *     priority: 'P1',
 *     metadata: { file: 'src/x.ts' },
 *   }],
 * });
 * ```
 *
 * @param scanners - Optional custom scanner overrides per perspective
 * @param workspaceDir - Workspace root (defaults to `process.cwd()`)
 * @returns Result with created issues and per-perspective scan statistics
 */
export function discoverIssues(
  scanners?: Partial<Record<DiscoveryPerspective, PerspectiveScanner>>,
  workspaceDir: string = process.cwd()
): DiscoverIssuesResult {
  const mergedScanners: Record<DiscoveryPerspective, PerspectiveScanner> = {
    ...DEFAULT_SCANNERS,
    ...(scanners ?? {}),
  };

  const created: Issue[] = [];
  const scanned: PerspectiveScanResult[] = [];

  for (const perspective of DISCOVERY_PERSPECTIVES) {
    const scanner = mergedScanners[perspective];
    const discovered = scanner(workspaceDir);
    const matchCount = discovered.length;

    for (const d of discovered) {
      const issue = createIssue(
        {
          title: d.title,
          description: d.description,
          priority: d.priority,
          perspective,
          metadata: d.metadata,
        },
        workspaceDir
      );
      created.push(issue);
    }

    scanned.push({ perspective, matchCount });
  }

  const totalScanned = scanned.reduce((acc, s) => acc + s.matchCount, 0);
  return { created, scanned, totalScanned };
}
