import * as fs from 'fs';
import * as path from 'path';

export type ContextEntryType = 'brief' | 'interface' | 'decision' | 'finding' | 'artifact_ref';

export interface ContextEntry {
  entryId: string;
  type: ContextEntryType;
  title: string;
  summary: string;
  parentTaskId: string;
  producer?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  scope?: { tasks?: string[]; areas?: string[] };
  path: string;
  evidence?: string[];
  status?: 'proposed' | 'accepted' | 'rejected' | 'superseded';
  revision?: number;
  supersedes?: string[];
  supersededBy?: string;
  promotedFrom?: string[];
  wave?: number;
}

export interface ContextIndex {
  version: string;
  entries: ContextEntry[];
}

type ContextRefFilter = { type?: ContextEntryType; taskId?: string; tags?: string[] };

interface EntryEnvelope {
  entry: ContextEntry;
  body: string;
}

export class SharedContextStore {
  private workspaceDir: string;
  private parentTaskId: string;
  private contextDir: string;
  private indexPath: string;
  private cache: ContextIndex | null = null;

  constructor(workspaceDir: string = process.cwd(), parentTaskId: string) {
    this.workspaceDir = workspaceDir;
    this.parentTaskId = parentTaskId;
    this.contextDir = path.join(workspaceDir, '.omp-flow', 'tasks', parentTaskId, 'context');
    this.indexPath = path.join(this.contextDir, 'index.json');
  }

  public init(): void {
    fs.mkdirSync(this.contextDir, { recursive: true });

    for (const type of ['brief', 'interface', 'decision', 'finding', 'artifact_ref'] as const) {
      fs.mkdirSync(path.join(this.contextDir, type), { recursive: true });
    }

    if (!fs.existsSync(this.indexPath)) {
      this.saveIndex({ version: '1', entries: [] });
      return;
    }

    this.loadIndex();
  }

  private loadIndex(): ContextIndex {
    if (this.cache) {
      return this.cache;
    }

    if (!fs.existsSync(this.indexPath)) {
      this.cache = { version: '1', entries: [] };
      return this.cache;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8')) as Partial<ContextIndex>;
      const entries = Array.isArray(parsed.entries)
        ? parsed.entries.filter((entry): entry is ContextEntry => this.isContextEntry(entry))
        : [];
      this.cache = {
        version: typeof parsed.version === 'string' ? parsed.version : '1',
        entries,
      };
    } catch {
      this.cache = { version: '1', entries: [] };
    }

    return this.cache;
  }

  private saveIndex(index: ContextIndex): void {
    fs.mkdirSync(this.contextDir, { recursive: true });
    fs.writeFileSync(this.indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf-8');
    this.cache = index;
  }

  public put(entry: ContextEntry, body: string): void {
    this.init();

    const normalizedPath = entry.path.replace(/\\/g, '/').replace(/^\/+/, '') || `${entry.type}/${this.slugify(entry.title || entry.entryId) || entry.entryId}.md`;
    const normalized: ContextEntry = {
      ...entry,
      parentTaskId: entry.parentTaskId || this.parentTaskId,
      path: normalizedPath,
    };

    const entryPath = path.join(this.contextDir, normalized.path);
    fs.mkdirSync(path.dirname(entryPath), { recursive: true });
    fs.writeFileSync(entryPath, body, 'utf-8');

    const envelope: EntryEnvelope = { entry: normalized, body };
    fs.writeFileSync(`${entryPath}.json`, `${JSON.stringify(envelope, null, 2)}\n`, 'utf-8');

    const index = this.loadIndex();
    const nextEntries = index.entries.filter((existing) => existing.entryId !== normalized.entryId);
    nextEntries.push(normalized);
    nextEntries.sort((a, b) => a.entryId.localeCompare(b.entryId));
    this.saveIndex({ ...index, entries: nextEntries });
  }

  public get(entryRef: string): ContextEntry | null {
    const index = this.loadIndex();
    const ref = entryRef.trim();
    if (!ref) {
      return null;
    }

    const direct = index.entries.find((entry) => entry.entryId === ref);
    if (direct) {
      return direct;
    }

    const parsed = this.parseTypedRef(ref);
    if (!parsed) {
      return null;
    }

    return index.entries.find((entry) => entry.type === parsed.type && this.matchesAlias(entry, parsed.name)) || null;
  }

  public list(filter?: ContextRefFilter): ContextEntry[] {
    const index = this.loadIndex();
    const requiredTags = filter?.tags?.map((tag) => tag.trim()).filter((tag) => tag.length > 0) || [];

    return index.entries.filter((entry) => {
      if (filter?.type && entry.type !== filter.type) {
        return false;
      }
      if (filter?.taskId && entry.parentTaskId !== filter.taskId) {
        return false;
      }
      if (requiredTags.length > 0) {
        const entryTags = entry.tags || [];
        if (!requiredTags.every((tag) => entryTags.includes(tag))) {
          return false;
        }
      }
      return true;
    });
  }

  public resolveRefs(refs: string): ContextEntry[] {
    if (!refs.trim()) {
      return [];
    }

    const resolved: ContextEntry[] = [];
    const seen = new Set<string>();
    for (const rawRef of refs.split(';')) {
      const ref = rawRef.trim();
      if (!ref) {
        continue;
      }
      const entry = this.get(ref);
      if (!entry || seen.has(entry.entryId)) {
        continue;
      }
      seen.add(entry.entryId);
      resolved.push(entry);
    }

    return resolved;
  }

  public renderPromptBlocks(refs: string, opts?: { maxPerType?: number }): string {
    const entries = this.resolveRefs(refs);
    if (entries.length === 0) {
      return '';
    }

    const maxPerType = opts?.maxPerType ?? 5;
    const counts: Partial<Record<ContextEntryType, number>> = {};
    const blocks: string[] = ['<omp-flow-context-pack>'];

    for (const entry of entries) {
      const used = counts[entry.type] || 0;
      if (used >= maxPerType) {
        continue;
      }
      counts[entry.type] = used + 1;

      const body = this.readBody(entry);
      const tagName = `context-${entry.type.replace(/_/g, '-')}`;
      blocks.push(
        `<${tagName} entryId="${this.escapeXml(entry.entryId)}" title="${this.escapeXml(entry.title)}">`,
        `<summary>${this.escapeXml(entry.summary)}</summary>`,
        '<body>',
        this.escapeXml(body),
        '</body>',
        `</${tagName}>`
      );
    }

    blocks.push('</omp-flow-context-pack>');
    return blocks.length > 2 ? blocks.join('\n') : '';
  }

  public delete(entryId: string): void {
    const index = this.loadIndex();
    const target = index.entries.find((entry) => entry.entryId === entryId);
    if (!target) {
      return;
    }

    const nextEntries = index.entries.filter((entry) => entry.entryId !== entryId);
    this.saveIndex({ ...index, entries: nextEntries });

    const entryPath = path.join(this.contextDir, target.path);
    if (fs.existsSync(entryPath)) {
      const deletedPath = path.join(this.contextDir, '.deleted', path.relative(this.contextDir, entryPath));
      fs.mkdirSync(path.dirname(deletedPath), { recursive: true });
      fs.renameSync(entryPath, deletedPath);
    }

    const envelopePath = `${entryPath}.json`;
    if (fs.existsSync(envelopePath)) {
      const deletedEnvelopePath = path.join(this.contextDir, '.deleted', path.relative(this.contextDir, envelopePath));
      fs.mkdirSync(path.dirname(deletedEnvelopePath), { recursive: true });
      fs.renameSync(envelopePath, deletedEnvelopePath);
    }
  }

  private readBody(entry: ContextEntry): string {
    const fullPath = path.join(this.contextDir, entry.path);
    if (!fs.existsSync(fullPath)) {
      return '';
    }

    try {
      return fs.readFileSync(fullPath, 'utf-8');
    } catch {
      return '';
    }
  }

  private parseTypedRef(ref: string): { type: ContextEntryType; name: string } | null {
    const separator = ref.indexOf(':');
    if (separator <= 0) {
      return null;
    }

    const typeCandidate = ref.slice(0, separator).trim();
    const name = ref.slice(separator + 1).trim();
    if (!this.isContextEntryType(typeCandidate) || !name) {
      return null;
    }

    return { type: typeCandidate, name };
  }

  private matchesAlias(entry: ContextEntry, name: string): boolean {
    const needle = this.slugify(name);
    const candidates = new Set<string>();
    for (const value of [entry.entryId, entry.title, path.basename(entry.path, path.extname(entry.path))]) {
      candidates.add(this.slugify(value));
    }
    return candidates.has(needle);
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }


  private isContextEntryType(value: string): value is ContextEntryType {
    return value === 'brief' || value === 'interface' || value === 'decision' || value === 'finding' || value === 'artifact_ref';
  }

  private isContextEntry(value: unknown): value is ContextEntry {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const entry = value as Partial<ContextEntry>;
    return (
      typeof entry.entryId === 'string' &&
      this.isContextEntryType(String(entry.type)) &&
      typeof entry.title === 'string' &&
      typeof entry.summary === 'string' &&
      typeof entry.parentTaskId === 'string' &&
      typeof entry.createdAt === 'string' &&
      typeof entry.updatedAt === 'string' &&
      typeof entry.path === 'string'
    );
  }
}
