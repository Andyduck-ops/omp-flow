import * as fs from 'fs';
import * as path from 'path';

/**
 * Event kinds modeled after Trellis Channel Event Bus taxonomy.
 * Covers lifecycle, messaging, coordination, and diagnostics.
 */
export type EventKind =
  | 'task_created'
  | 'task_started'
  | 'task_completed'
  | 'step_advanced'
  | 'step_completed'
  | 'step_failed'
  | 'agent_spawned'
  | 'agent_completed'
  | 'agent_failed'
  | 'message'
  | 'broadcast'
  | 'drift_detected'
  | 'boundary_violation'
  | 'readiness_checked'
  | 'harvest_completed'
  | 'session_started'
  | 'session_stopped'
  | 'finding_recorded'
  | 'context_injected'
  | 'fsm_transition';

export interface OMPFlowEvent {
  seq: number;
  kind: EventKind;
  timestamp: string;
  taskId?: string;
  agentId?: string;
  sessionId?: string;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
}

/**
 * Result of rotating an event or discovery log.
 */
export interface RotationResult {
  rotated: boolean;
  archivedTo?: string;
  remainingCount: number;
}

/**
 * Snapshot of event bus storage statistics.
 */
export interface EventStats {
  totalEvents: number;
  totalDiscoveries: number;
  oldestEventTs?: string;
  newestEventTs?: string;
  activeSizeKB: number;
}

/**
 * Result of a full prune pass over the event bus.
 */
export interface PruneResult {
  eventsRotated: boolean;
  discoveriesRotated: boolean;
  eventStats: EventStats;
}

/**
 * Append-only JSONL Event Bus with sequence sidecar and idempotency.
 *
 * Storage layout:
 *   .omp-flow/events/
 *   ├── events.jsonl       # Append-only event stream
 *   └── events.jsonl.seq   # Sidecar sequence counter
 */
export class EventBus {
  private eventsDir: string;
  private eventsPath: string;
  private seqPath: string;

  constructor(workspaceDir: string = process.cwd()) {
    this.eventsDir = path.join(workspaceDir, '.omp-flow', 'events');
    this.eventsPath = path.join(this.eventsDir, 'events.jsonl');
    this.seqPath = path.join(this.eventsDir, 'events.jsonl.seq');
    fs.mkdirSync(this.eventsDir, { recursive: true });
  }

  /**
   * Read current sequence number from sidecar file.
   * If sidecar is missing or corrupted, reconcile from JSONL tail.
   */
  private readSeq(): number {
    if (fs.existsSync(this.seqPath)) {
      try {
        const raw = fs.readFileSync(this.seqPath, 'utf-8').trim();
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      } catch {
        // Fall through to reconciliation
      }
    }
    return this.reconcileSeqFromTail();
  }

  /**
   * Reconcile sequence by reading tail of JSONL file.
   * Reads last 4KB to find highest seq, avoiding full file scan.
   */
  private reconcileSeqFromTail(): number {
    if (!fs.existsSync(this.eventsPath)) return 0;

    try {
      const stat = fs.statSync(this.eventsPath);
      const readSize = Math.min(stat.size, 4096);
      const buffer = Buffer.alloc(readSize);
      const fd = fs.openSync(this.eventsPath, 'r');
      fs.readSync(fd, buffer, 0, readSize, Math.max(0, stat.size - readSize));
      fs.closeSync(fd);

      const tail = buffer.toString('utf-8');
      const lines = tail.split('\n').filter(Boolean);
      let maxSeq = 0;

      for (const line of lines) {
        try {
          const evt = JSON.parse(line) as OMPFlowEvent;
          if (evt.seq > maxSeq) maxSeq = evt.seq;
        } catch {
          // Skip malformed lines
        }
      }

      this.writeSeq(maxSeq);
      return maxSeq;
    } catch {
      return 0;
    }
  }

  private writeSeq(seq: number): void {
    fs.writeFileSync(this.seqPath, String(seq), 'utf-8');
  }

  /**
   * Check if an event with the given idempotency key already exists.
   * Returns the existing event if found, null otherwise.
   */
  public findByIdempotencyKey(key: string): OMPFlowEvent | null {
    if (!fs.existsSync(this.eventsPath)) return null;

    const content = fs.readFileSync(this.eventsPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as OMPFlowEvent;
        if (evt.idempotencyKey === key) return evt;
      } catch {
        // Skip malformed
      }
    }
    return null;
  }

  /**
   * Append an event to the JSONL stream.
   * If idempotencyKey is provided and already exists with same kind, returns existing event.
   * If exists with different kind, throws error.
   */
  public append(
    kind: EventKind,
    payload: Record<string, unknown> = {},
    options: {
      taskId?: string;
      agentId?: string;
      sessionId?: string;
      idempotencyKey?: string;
    } = {}
  ): OMPFlowEvent {
    // Idempotency check
    if (options.idempotencyKey) {
      const existing = this.findByIdempotencyKey(options.idempotencyKey);
      if (existing) {
        if (existing.kind === kind) return existing;
        throw new Error(
          `Idempotency conflict: key '${options.idempotencyKey}' exists with kind '${existing.kind}', attempted '${kind}'`
        );
      }
    }

    const seq = this.readSeq() + 1;

    const event: OMPFlowEvent = {
      seq,
      kind,
      timestamp: new Date().toISOString(),
      taskId: options.taskId,
      agentId: options.agentId,
      sessionId: options.sessionId,
      idempotencyKey: options.idempotencyKey,
      payload,
    };

    fs.appendFileSync(this.eventsPath, JSON.stringify(event) + '\n', 'utf-8');
    this.writeSeq(seq);

    return event;
  }

  /**
   * Read all events, optionally filtered by kind or taskId.
   */
  public readAll(filter?: { kind?: EventKind; taskId?: string }): OMPFlowEvent[] {
    if (!fs.existsSync(this.eventsPath)) return [];

    const content = fs.readFileSync(this.eventsPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const events: OMPFlowEvent[] = [];

    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as OMPFlowEvent;
        if (filter?.kind && evt.kind !== filter.kind) continue;
        if (filter?.taskId && evt.taskId !== filter.taskId) continue;
        events.push(evt);
      } catch {
        // Skip malformed
      }
    }

    return events;
  }

  /**
   * Read events since a given sequence number.
   */
  public readSince(sinceSeq: number): OMPFlowEvent[] {
    return this.readAll().filter((e) => e.seq > sinceSeq);
  }

  /**
   * Get the latest N events.
   */
  public tail(count: number = 10): OMPFlowEvent[] {
    const all = this.readAll();
    return all.slice(Math.max(0, all.length - count));
  }

  /**
   * Current sequence number (event count).
   */
  public currentSeq(): number {
    return this.readSeq();
  }

  // --- Discoveries shared board (Maestro discoveries.ndjson pattern) ---

  private discoveriesPath: string = '';

  /**
   * Append a discovery to the shared board.
   * Dedup by type+key before writing. Never modify/delete.
   */
  public appendDiscovery(
    worker: string,
    type: 'implementation_note' | 'pattern' | 'code_pattern' | 'degradation_event' | 'finding',
    data: Record<string, unknown>,
    dedupKey?: string
  ): void {
    if (!this.discoveriesPath) {
      this.discoveriesPath = path.join(this.eventsDir, 'discoveries.ndjson');
    }

    // Dedup check
    if (dedupKey) {
      const existing = this.readDiscoveries();
      const exists = existing.some(
        (d) => d.type === type && d.data?.['_dedupKey'] === dedupKey
      );
      if (exists) return;
    }

    const entry = {
      ts: new Date().toISOString(),
      worker,
      type,
      data: dedupKey ? { ...data, _dedupKey: dedupKey } : data,
    };

    fs.appendFileSync(this.discoveriesPath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  /**
   * Read all discoveries from the shared board.
   */
  public readDiscoveries(filter?: {
    type?: string;
    worker?: string;
    sinceTs?: string;
    taskId?: string;
  }): Array<{ ts: string; worker: string; type: string; data: Record<string, unknown> }> {
    if (!this.discoveriesPath) {
      this.discoveriesPath = path.join(this.eventsDir, 'discoveries.ndjson');
    }
    if (!fs.existsSync(this.discoveriesPath)) return [];

    const content = fs.readFileSync(this.discoveriesPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const discoveries: Array<{ ts: string; worker: string; type: string; data: Record<string, unknown> }> = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (filter?.type && entry.type !== filter.type) continue;
        if (filter?.worker && entry.worker !== filter.worker) continue;
        if (filter?.sinceTs && entry.ts < filter.sinceTs) continue;
        if (filter?.taskId && entry.data?.taskId !== filter.taskId) continue;
        discoveries.push(entry);
      } catch {
        // Skip malformed
      }
    }

    return discoveries;
  }

  /**
   * Get recent discoveries for context injection (last N entries).
   */
  public recentDiscoveries(count: number = 10): string {
    const discoveries = this.readDiscoveries();
    const recent = discoveries.slice(-count);
    if (recent.length === 0) return '';

    const lines = ['<recent-discoveries>'];
    for (const d of recent) {
      const dataStr = typeof d.data === 'object'
        ? JSON.stringify(d.data).slice(0, 200)
        : String(d.data).slice(0, 200);
      lines.push(`- [${d.ts.slice(0, 19)}] ${d.worker} (${d.type}): ${dataStr}`);
    }
    lines.push('</recent-discoveries>');
    return lines.join('\n');
  }

  // --- Rotation, stats, and pruning ---

  /**
   * Rotate events.jsonl when it exceeds maxEntries.
   * Keeps the last floor(maxEntries/2) entries active; archives the rest.
   */
  public rotateEvents(maxEntries: number = 10000): RotationResult {
    const events = this.readAll();
    if (events.length <= maxEntries) {
      return { rotated: false, remainingCount: events.length };
    }

    const keepCount = Math.floor(maxEntries / 2);
    const archiveEvents = events.slice(0, events.length - keepCount);
    const remaining = events.slice(events.length - keepCount);

    const dateStamp = new Date().toISOString().slice(0, 10);
    const seqPart = archiveEvents.length > 0 ? String(archiveEvents[0].seq) : '0';
    const archivePath = path.join(
      this.eventsDir,
      'archive',
      `events-${dateStamp}-${seqPart}.jsonl`
    );

    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    const archiveLines = archiveEvents.map((e) => JSON.stringify(e));
    fs.writeFileSync(archivePath, archiveLines.join('\n') + '\n', 'utf-8');

    const remainingLines = remaining.map((e) => JSON.stringify(e));
    fs.writeFileSync(this.eventsPath, remainingLines.join('\n') + '\n', 'utf-8');

    const lastSeq = remaining.length > 0 ? remaining[remaining.length - 1].seq : 0;
    this.writeSeq(lastSeq);

    return { rotated: true, archivedTo: archivePath, remainingCount: remaining.length };
  }

  /**
   * Rotate discoveries.ndjson when it exceeds maxEntries.
   * Keeps the last floor(maxEntries/2) entries active; archives the rest.
   */
  public rotateDiscoveries(maxEntries: number = 5000): RotationResult {
    const discoveries = this.readDiscoveries();
    if (discoveries.length <= maxEntries) {
      return { rotated: false, remainingCount: discoveries.length };
    }

    const keepCount = Math.floor(maxEntries / 2);
    const archiveDiscoveries = discoveries.slice(0, discoveries.length - keepCount);
    const remaining = discoveries.slice(discoveries.length - keepCount);

    const dateStamp = new Date().toISOString().slice(0, 10);
    const archivePath = path.join(
      this.eventsDir,
      'archive',
      `discoveries-${dateStamp}.ndjson`
    );

    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    const archiveLines = archiveDiscoveries.map((d) => JSON.stringify(d));
    fs.writeFileSync(archivePath, archiveLines.join('\n') + '\n', 'utf-8');

    const remainingLines = remaining.map((d) => JSON.stringify(d));
    fs.writeFileSync(this.discoveriesPath, remainingLines.join('\n') + '\n', 'utf-8');

    return { rotated: true, archivedTo: archivePath, remainingCount: remaining.length };
  }

  /**
   * Compute storage statistics for the active event and discovery logs.
   */
  public getEventStats(): EventStats {
    const events = this.readAll();
    const discoveries = this.readDiscoveries();

    let activeSizeBytes = 0;
    if (fs.existsSync(this.eventsPath)) {
      activeSizeBytes += fs.statSync(this.eventsPath).size;
    }
    if (this.discoveriesPath && fs.existsSync(this.discoveriesPath)) {
      activeSizeBytes += fs.statSync(this.discoveriesPath).size;
    }

    return {
      totalEvents: events.length,
      totalDiscoveries: discoveries.length,
      oldestEventTs: events.length > 0 ? events[0].timestamp : undefined,
      newestEventTs: events.length > 0 ? events[events.length - 1].timestamp : undefined,
      activeSizeKB: Math.round(activeSizeBytes / 1024),
    };
  }

  /**
   * Prune both event and discovery logs, returning combined stats.
   */
  public prune(): PruneResult {
    const eventsResult = this.rotateEvents();
    const discoveriesResult = this.rotateDiscoveries();
    const eventStats = this.getEventStats();
    return {
      eventsRotated: eventsResult.rotated,
      discoveriesRotated: discoveriesResult.rotated,
      eventStats,
    };
  }
}
