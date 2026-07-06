/**
 * Channel Event-Sourced Engine — lightweight peer-to-peer message bus
 * inspired by Trellis channel semantics.
 *
 * Appends typed events to a structured JSONL file for durability and replay.
 * Supports: send (deliver message to a peer), wait (block until matching
 * event), emit (write any channel event), and supervisor lifecycle tracking.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Channel event kinds covering lifecycle and messaging.
 */
export type ChannelEventKind =
  | 'spawned'
  | 'progress'
  | 'done'
  | 'error'
  | 'killed';

/**
 * A single channel event — the unit of the event-sourced log.
 */
export interface ChannelEvent {
  /** Monotonic sequence number (1-based). */
  seq: number;
  /** Event kind. */
  kind: ChannelEventKind;
  /** ISO-8601 timestamp of when the event was emitted. */
  timestamp: string;
  /** Target peer id the event is addressed to. */
  target?: string;
  /** Source peer id that produced the event. */
  from?: string;
  /** Free-form message payload. */
  message?: string;
  /** Structured payload for additional metadata. */
  payload: Record<string, unknown>;
}

/**
 * Filter criteria for waiting on and querying events.
 */
export interface ChannelFilter {
  /** Only events from this source peer. */
  from?: string;
  /** Only events of this kind. */
  kind?: ChannelEventKind;
  /** Only events addressed to this target. */
  target?: string;
}

/**
 * Supervisor view of managed peers (lifecycle tracking).
 */
export interface SupervisorState {
  /** Set of peer ids currently alive. */
  alive: Set<string>;
  /** Number of spawned peers for this session. */
  spawned: number;
  /** Number of errored peers for this session. */
  errored: number;
  /** Number of completed peers for this session. */
  done: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANNEL_DIR = '.omp-flow/channel';
const CHANNEL_PATH = 'channel.jsonl';
const SEQ_PATH = 'channel.seq';

const POLL_INTERVAL_MS = 50;

// ---------------------------------------------------------------------------
// ChannelEngine
// ---------------------------------------------------------------------------

/**
 * Minimal channel / event engine with an append-only JSONL log.
 *
 * - `emit(kind, options?)` — write a typed event to the log.
 * - `send(target, message, options?)` — deliver a message to a peer.
 * - `wait(filter, timeoutMs?)` — async-poll for a matching event.
 * - Supervisor helpers: tracks alive / spawned / errored / done peers.
 */
export class ChannelEngine {
  private readonly channelDir: string;
  private readonly eventsPath: string;
  private readonly seqPath: string;
  private readonly supervisor: SupervisorState;

  /**
   * @param workspaceDir Root directory for the `.omp-flow` workspace.
   *                     Defaults to the current working directory.
   */
  constructor(workspaceDir: string = process.cwd()) {
    this.channelDir = path.join(workspaceDir, CHANNEL_DIR);
    this.eventsPath = path.join(this.channelDir, CHANNEL_PATH);
    this.seqPath = path.join(this.channelDir, SEQ_PATH);
    fs.mkdirSync(this.channelDir, { recursive: true });
    this.supervisor = {
      alive: new Set<string>(),
      spawned: 0,
      errored: 0,
      done: 0,
    };
    this.initializeSupervisor();
  }

  // -------------------------------------------------------------------------
  // Sequence management
  // -------------------------------------------------------------------------

  /**
   * Read current sequence number from sidecar.
   * Returns 0 if missing or corrupt.
   */
  private readSeq(): number {
    if (!fs.existsSync(this.seqPath)) return 0;
    try {
      const raw = fs.readFileSync(this.seqPath, 'utf-8').trim();
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    } catch {
      // Fall through
    }
    return 0;
  }

  /**
   * Persist a sequence number to the sidecar file.
   */
  private writeSeq(seq: number): void {
    fs.writeFileSync(this.seqPath, String(seq), 'utf-8');
  }

  // -------------------------------------------------------------------------
  // Event I/O
  // -------------------------------------------------------------------------

  /**
   * Read all channel events from the JSONL log.
   *
   * An empty or missing file returns an empty array.
   * Malformed lines are silently skipped.
   */
  public readAll(): ChannelEvent[] {
    if (!fs.existsSync(this.eventsPath)) return [];
    const content = fs.readFileSync(this.eventsPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const events: ChannelEvent[] = [];
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as ChannelEvent;
        events.push(evt);
      } catch {
        // Skip malformed lines
      }
    }
    return events;
  }

  /**
   * Read events newer than a given sequence number.
   */
  public readSince(sinceSeq: number): ChannelEvent[] {
    return this.readAll().filter((e) => e.seq > sinceSeq);
  }

  /**
   * Filter events by optional criteria (kind, from, target).
   */
  public readFiltered(filter: ChannelFilter): ChannelEvent[] {
    return this.readAll().filter((e) => {
      if (filter.kind !== undefined && e.kind !== filter.kind) return false;
      if (filter.from !== undefined && e.from !== filter.from) return false;
      if (filter.target !== undefined && e.target !== filter.target) return false;
      return true;
    });
  }

  // -------------------------------------------------------------------------
  // emit / send / wait
  // -------------------------------------------------------------------------

  /**
   * Emit a channel event.
   *
   * @param kind  The event kind.
   * @param options  Optional metadata (from, target, message, payload).
   * @returns The appended ChannelEvent (including the assigned seq).
   */
  public emit(
    kind: ChannelEventKind,
    options?: {
      from?: string;
      target?: string;
      message?: string;
      payload?: Record<string, unknown>;
    },
  ): ChannelEvent {
    const seq = this.readSeq() + 1;
    const event: ChannelEvent = {
      seq,
      kind,
      timestamp: new Date().toISOString(),
      from: options?.from,
      target: options?.target,
      message: options?.message,
      payload: options?.payload ?? {},
    };
    fs.appendFileSync(this.eventsPath, JSON.stringify(event) + '\n', 'utf-8');
    this.writeSeq(seq);
    this.updateSupervisor(event);
    return event;
  }

  /**
   * Send a message to a peer.
   *
   * Convenience wrapper around `emit` that sets `kind` to `'progress'`
   * and populates the `target` and `message` fields.
   *
   * @param target  Target peer id.
   * @param message  Message body.
   * @param options  Optional from / payload.
   * @returns The appended ChannelEvent.
   */
  public send(
    target: string,
    message: string,
    options?: { from?: string; payload?: Record<string, unknown> },
  ): ChannelEvent {
    return this.emit('progress', {
      from: options?.from,
      target,
      message,
      payload: options?.payload,
    });
  }

  /**
   * Wait (poll) for a matching event.
   *
   * Polls the event log at a fixed interval until a matching event is found
   * or the timeout expires.  An empty `filter` matches every event.
   *
   * @param filter     Criteria (kind / from / target) to match against.
   * @param timeoutMs  Maximum time in milliseconds to wait.  Defaults to
   *                   30_000 (30 s).  Pass 0 to poll exactly once.
   * @returns The first matching ChannelEvent, or `null` on timeout.
   */
  public async wait(
    filter: ChannelFilter = {},
    timeoutMs: number = 30_000,
  ): Promise<ChannelEvent | null> {
    const startedAt = Date.now();
    const startSeq = this.readSeq();

    const matches = (e: ChannelEvent): boolean => {
      if (filter.kind !== undefined && e.kind !== filter.kind) return false;
      if (filter.from !== undefined && e.from !== filter.from) return false;
      if (filter.target !== undefined && e.target !== filter.target) return false;
      return true;
    };

    // Quick scan over existing events first.
    for (const evt of this.readAll()) {
      if (matches(evt)) return evt;
    }

    // Poll loop.
    while (timeoutMs === 0 || Date.now() - startedAt < timeoutMs) {
      await this.sleep(POLL_INTERVAL_MS);
      for (const evt of this.readSince(startSeq)) {
        if (matches(evt)) return evt;
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Supervisor lifecycle
  // -------------------------------------------------------------------------

  /**
   * Idempotent sync from disk on construction.
   */
  private initializeSupervisor(): void {
    for (const evt of this.readAll()) {
      this.updateSupervisor(evt);
    }
  }

  /**
   * Update the in-memory supervisor state from one event.
   */
  private updateSupervisor(event: ChannelEvent): void {
    const from = event.from;
    switch (event.kind) {
      case 'spawned':
        if (from) {
          this.supervisor.alive.add(from);
        }
        this.supervisor.spawned++;
        break;
      case 'done':
        if (from) {
          this.supervisor.alive.delete(from);
        }
        this.supervisor.done++;
        break;
      case 'error':
        if (from) {
          this.supervisor.alive.delete(from);
        }
        this.supervisor.errored++;
        break;
      case 'killed':
        if (from) {
          this.supervisor.alive.delete(from);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Return a snapshot of the current supervisor state.
   */
  public supervisorState(): {
    alive: string[];
    spawned: number;
    errored: number;
    done: number;
  } {
    return {
      alive: [...this.supervisor.alive],
      spawned: this.supervisor.spawned,
      errored: this.supervisor.errored,
      done: this.supervisor.done,
    };
  }

  /**
   * Check whether a specific peer is currently alive (spawned + not yet
   * done/errored/killed).
   */
  public isAlive(peerId: string): boolean {
    return this.supervisor.alive.has(peerId);
  }

  /**
   * Current event count.
   */
  public currentSeq(): number {
    return this.readSeq();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Promise-based sleep for the poll loop.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
