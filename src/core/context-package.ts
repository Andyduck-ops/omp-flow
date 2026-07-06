import * as fs from 'fs';
import * as path from 'path';

export interface BoundaryContract {
  in_scope: string[];
  out_of_scope: string[];
  constraints: string[];
  done_when: string[];
}
export type SpecLayer = 'project' | 'global' | 'team' | 'personal';
export type SpecCategory =
  | 'coding-conventions'
  | 'architecture'
  | 'error-handling'
  | 'testing'
  | 'performance'
  | 'security'
  | 'ui-ux'
  | 'documentation';

export interface SpecEntry {
  category: SpecCategory;
  scope: SpecLayer;
  content: string;
}


export interface ContextManifestEntry {
  file: string;
  reason: string;
  type?: 'file' | 'directory';
}

/**
 * Which manifest a role reads. Adversarial isolation (F-001):
 *   - 'implement' → implement.jsonl (executor / architect / researcher / harvester)
 *   - 'check'     → check.jsonl     (reviewer / grill / debugger / checker)
 * Defaults to 'implement' for backward compatibility with callers that
 * do not pass an action.
 */
export type ManifestAction = 'implement' | 'check';

export interface ContextManifest {
  taskId: string;
  entries: ContextManifestEntry[];
}

export interface DomainContext {
  problem_statement?: string;
  terminology?: string[];
}

export interface ContextPackage {
  taskId: string;
  role?: string;
  requirements: string[];
  boundary: BoundaryContract;
  specRules: string[];
  domain: string | DomainContext;
  insights: string[];
  specLayers: Record<SpecLayer, string[]>;
  specCategories: Record<SpecCategory, string[]>;
  non_goals?: string[];
  open_questions?: string[];
  constraints?: string[];
  manifest?: ContextManifestEntry[];
  createdAt: string;
}

/**
 * Runtime type guard for a parsed manifest entry.
 * Narrow with `in` / `typeof` so accesses are compiler-checked, not
 * unchecked inline casts (project rule: ts-no-inline-cast-access).
 */
function isContextManifestEntry(value: unknown): value is ContextManifestEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (!('file' in value) || typeof value.file !== 'string') {
    return false;
  }
  if (!('reason' in value) || typeof value.reason !== 'string') {
    return false;
  }
  if ('type' in value && value.type !== undefined && value.type !== 'file' && value.type !== 'directory') {
    return false;
  }
  return true;
}

export class ContextPackageBuilder {
  private workspaceDir: string;

  constructor(workspaceDir: string = process.cwd()) {
    this.workspaceDir = workspaceDir;
  }

  /**
   * Manifest file path for a given task.
   */
  private manifestPath(taskId: string, action: ManifestAction = 'implement'): string {
    const filename = action === 'check' ? 'check.jsonl' : 'implement.jsonl';
    return path.join(this.workspaceDir, '.omp-flow', 'tasks', taskId, filename);
  }

  /**
   * Append a curated context entry to a task's context-manifest.jsonl.
   * Deduplicates by file path; creates the file (and task dir) if absent.
   */
  public addContextEntry(
    taskId: string,
    action: ManifestAction,
    file: string,
    reason: string,
    type: 'file' | 'directory' = 'file'
  ): void {
    const manifestFile = this.manifestPath(taskId, action);
    const taskDir = path.dirname(manifestFile);
    fs.mkdirSync(taskDir, { recursive: true });

    // Deduplication is per-manifest: the same file may legitimately appear
    // in BOTH implement.jsonl and check.jsonl (e.g., a convention spec both
    // agents need). That is correct and must not be treated as a duplicate.
    const existing = this.readContextManifest(taskId, action);
    if (existing.some((entry) => entry.file === file)) {
      return;
    }

    const entry: ContextManifestEntry = { file, reason, type };
    const line = JSON.stringify(entry);

    if (fs.existsSync(manifestFile)) {
      const raw = fs.readFileSync(manifestFile, 'utf-8');
      const prefix = raw.endsWith('\n') || raw.length === 0 ? '' : '\n';
      fs.appendFileSync(manifestFile, `${prefix}${line}\n`, 'utf-8');
    } else {
      fs.writeFileSync(manifestFile, `${line}\n`, 'utf-8');
    }
  }

  /**
   * Read a task's context-manifest.jsonl as a list of entries.
   * Skips blank lines and seed rows (objects lacking a `file` field).
   */
  public readContextManifest(
    taskId: string,
    action: ManifestAction = 'implement'
  ): ContextManifestEntry[] {
    const manifestFile = this.manifestPath(taskId, action);
    if (!fs.existsSync(manifestFile)) {
      // Backward-compat shim (F-001 §4.2): legacy tasks created before the
      // dual-manifest split still have a single `context-manifest.jsonl`.
      // If the requested {action}.jsonl is absent but the legacy file exists,
      // read it as the implement manifest and log a deprecation warning.
      // The shim is read-side only; once the task is re-planned, the
      // architect populates the new files.
      const legacyPath = path.join(
        this.workspaceDir,
        '.omp-flow',
        'tasks',
        taskId,
        'context-manifest.jsonl'
      );
      if (action === 'implement' && fs.existsSync(legacyPath)) {
        console.warn(
          `[omp-flow] Deprecation: task ${taskId} has no implement.jsonl; ` +
            `falling back to legacy context-manifest.jsonl. ` +
            `Re-plan the task to migrate to the dual-manifest model.`
        );
        return this.readManifestFile(legacyPath);
      }
      return [];
    }

    return this.readManifestFile(manifestFile);
  }

  /**
   * Thin alias: read the check manifest.
   */
  public readCheckManifest(taskId: string): ContextManifestEntry[] {
    return this.readContextManifest(taskId, 'check');
  }

  /**
   * Parse a manifest JSONL file into entries, skipping blank lines and seed
   * rows (objects lacking a `file` field).
   */
  private readManifestFile(manifestFile: string): ContextManifestEntry[] {
    const raw = fs.readFileSync(manifestFile, 'utf-8');
    const entries: ContextManifestEntry[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (isContextManifestEntry(parsed)) {
        entries.push(parsed);
      }
    }
    return entries;
  }

  /**
   * Validate that BOTH manifests exist and have real entries (Trellis parity):
   *   - rejects seed-only state (manifest present but zero real entries)
   *   - rejects manifests referencing files that do not exist on disk
   *   - enforces adversarial isolation: check.jsonl MUST NOT contain files
   *     in the task's `boundary.in_scope` (the implementer's source set)
   * Returns per-action validity plus a flat list of missing/leaking paths.
   */
  public validateContextManifest(taskId: string): {
    implement: boolean;
    check: boolean;
  } {
    const actions: ManifestAction[] = ['implement', 'check'];
    const result: { implement: boolean; check: boolean } = {
      implement: true,
      check: true,
    };
    // Load the task's boundary contract (if any) to enforce adversarial
    // isolation on the check manifest.
    const inScopeGlobs = this.loadInScopeGlobs(taskId);

    for (const action of actions) {
      const entries = this.readContextManifest(taskId, action);
      if (entries.length === 0) {
        result[action] = false;
        continue;
      }
      let ok = true;
      for (const entry of entries) {
        const resolved = path.isAbsolute(entry.file)
          ? entry.file
          : path.join(this.workspaceDir, entry.file);
        if (!fs.existsSync(resolved)) {
          ok = false;
          continue;
        }
        // Adversarial isolation: check.jsonl MUST NOT contain files in the
        // implementer's in_scope set (the reviewer would then read its own
        // modifications as context, breaking the boundary).
        if (action === 'check' && this.matchesAnyGlob(entry.file, inScopeGlobs)) {
          ok = false;
        }
      }
      result[action] = ok;
    }
    return result;
  }

  /**
   * Surface the divergence between implement and check manifests as
   * directed-skepticism meta-awareness for the reviewer (F-001 §4.1).
   * Returns paths + reason only — NO file contents. The reviewer learns
   * WHERE it is flying blind, with an IRC escape hatch to request specific
   * file contents if a Finding requires them.
   */
  public diffManifests(taskId: string): {
    implementOnly: ContextManifestEntry[];
    checkOnly: ContextManifestEntry[];
    shared: ContextManifestEntry[];
  } {
    const implementEntries = this.readContextManifest(taskId, 'implement');
    const checkEntries = this.readContextManifest(taskId, 'check');

    const checkFiles = new Set(checkEntries.map((e) => e.file));
    const implementFiles = new Set(implementEntries.map((e) => e.file));

    const implementOnly = implementEntries.filter((e) => !checkFiles.has(e.file));
    const checkOnly = checkEntries.filter((e) => !implementFiles.has(e.file));
    const shared = implementEntries.filter((e) => checkFiles.has(e.file));

    return { implementOnly, checkOnly, shared };
  }

  /**
   * Map a role string to a manifest action (F-001 §2.5). Single source of
   * truth for the role→action policy. Uses the same role substrings that
   * drive model-tier assignment in OMPFlowExtension.onBeforeAgentStart.
   */
  private roleToAction(role: string | undefined): ManifestAction {
    if (!role) return 'implement';
    const r = role.toLowerCase();
    if (
      r.includes('reviewer') ||
      r.includes('grill') ||
      r.includes('debugger') ||
      r.includes('checker')
    ) {
      return 'check';
    }
    return 'implement';
  }

  /**
   * Load the task's boundary in_scope globs from its compiled context
   * package, if one exists. Returns [] when no package is found.
   */
  private loadInScopeGlobs(taskId: string): string[] {
    const scratchDir = path.join(this.workspaceDir, '.omp-flow', 'scratch', taskId);
    if (!fs.existsSync(scratchDir)) return [];
    for (const name of fs.readdirSync(scratchDir)) {
      if (name.startsWith('context-package') && name.endsWith('.json')) {
        try {
          const pkg = JSON.parse(
            fs.readFileSync(path.join(scratchDir, name), 'utf-8')
          ) as { boundary?: { in_scope?: string[] } };
          if (pkg && pkg.boundary && Array.isArray(pkg.boundary.in_scope)) {
            return pkg.boundary.in_scope;
          }
        } catch {
          continue;
        }
      }
    }
    return [];
  }

  /**
   * Test whether a file path matches any of the given glob patterns.
   * Lightweight minimatch-style matcher for `*`, `**`, and `?`.
   */
  private matchesAnyGlob(filePath: string, globs: string[]): boolean {
    if (globs.length === 0) return false;
    const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
    return globs.some((glob) => {
      const g = glob.replace(/\\/g, '/').replace(/^\.\//, '');
      const re = this.globToRegex(g);
      return re.test(normalized);
    });
  }

  private globToRegex(glob: string): RegExp {
    let pattern = '';
    let i = 0;
    while (i < glob.length) {
      const c = glob[i];
      if (c === '*') {
        if (glob[i + 1] === '*') {
          // ** — match across directory separators
          pattern += '.*';
          i += 2;
          if (glob[i] === '/') i += 1;
        } else {
          // * — match within a path segment
          pattern += '[^/]*';
          i += 1;
        }
      } else if (c === '?') {
        pattern += '[^/]';
        i += 1;
      } else if (c === '.') {
        pattern += '\\.';
        i += 1;
      } else if (c === '/') {
        pattern += '/';
        i += 1;
      } else {
        pattern += c.replace(/[{}()[\]^$+|]/g, '\\$&');
        i += 1;
      }
    }
    return new RegExp(`^${pattern}$`);
  }

  /**
   * Extract a partial ContextPackage from brainstorm artifacts.
   *
   * Reads `.omp-flow/tasks/{taskId}/guidance-specification.md`, falling back
   * to `brainstorm.md` when the guidance spec is absent. Parses markdown by
   * heading and returns structured fields suitable for merging into a
   * ContextPackage. Returns null when no brainstorm artifacts exist.
   */
  public extractFromBrainstorm(taskId: string): Partial<ContextPackage> | null {
    const taskDir = path.join(this.workspaceDir, '.omp-flow', 'tasks', taskId);
    const guidancePath = path.join(taskDir, 'guidance-specification.md');
    const brainstormPath = path.join(taskDir, 'brainstorm.md');

    let content: string | null = null;
    if (fs.existsSync(guidancePath)) {
      content = fs.readFileSync(guidancePath, 'utf-8');
    } else if (fs.existsSync(brainstormPath)) {
      content = fs.readFileSync(brainstormPath, 'utf-8');
    }
    if (content === null) {
      return null;
    }

    const sections = this.splitMarkdownSections(content);

    const problemStatement = this.extractProblemStatement(sections);
    const terminology = this.extractTerminology(sections);
    const nonGoals = this.extractListSection(sections, /non[- ]?goals?/i);
    const { constraints, openQuestions } = this.extractRoleDecisions(sections);
    const requirements = this.extractFeatureDecomposition(sections);
    const insights = this.extractRoleInsights(taskDir);

    const extracted: Partial<ContextPackage> = {};
    if (problemStatement || terminology.length > 0) {
      const domain: DomainContext = {};
      if (problemStatement) {
        domain.problem_statement = problemStatement;
      }
      if (terminology.length > 0) {
        domain.terminology = terminology;
      }
      extracted.domain = domain;
    }
    if (nonGoals.length > 0) {
      extracted.non_goals = nonGoals;
    }
    if (constraints.length > 0) {
      extracted.constraints = constraints;
    }
    if (openQuestions.length > 0) {
      extracted.open_questions = openQuestions;
    }
    if (requirements.length > 0) {
      extracted.requirements = requirements;
    }
    if (insights.length > 0) {
      extracted.insights = insights;
    }

    return extracted;
  }

  /**
   * Split markdown into a map of heading-text → body lines.
   * Headings are matched by leading `#` tokens; the body is every line
   * until the next heading of the same or higher level.
   */
  private splitMarkdownSections(content: string): Map<string, string[]> {
    const sections = new Map<string, string[]>();
    let currentHeading: string | null = null;
    let currentBody: string[] = [];

    for (const rawLine of content.split('\n')) {
      const line = rawLine;
      const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (headingMatch) {
        if (currentHeading !== null) {
          sections.set(currentHeading, currentBody);
        }
        currentHeading = headingMatch[2].trim();
        currentBody = [];
      } else if (currentHeading !== null) {
        currentBody.push(line);
      }
    }
    if (currentHeading !== null) {
      sections.set(currentHeading, currentBody);
    }
    return sections;
  }

  /**
   * Parse a markdown table row into trimmed cell values.
   * Returns null for separator rows (e.g. `|---|---|`) and non-table lines.
   */
  private parseTableRow(line: string): string[] | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) return null;
    // Separator row: only dashes, colons, pipes, whitespace.
    if (/^\|?[\s:-]+\|?$/.test(trimmed) && !/\|[^|]+\|/.test(trimmed)) {
      return null;
    }
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
    // Drop separator rows that survived the split (cells full of dashes).
    if (cells.every((c) => /^[-:\s]*$/.test(c))) {
      return null;
    }
    return cells;
  }

  private extractProblemStatement(sections: Map<string, string[]>): string | undefined {
    for (const [heading, body] of sections) {
      if (/problem\s+statement/i.test(heading) || /^1\b|^1\./.test(heading)) {
        const text = body.join('\n').trim();
        if (text) return text;
      }
    }
    return undefined;
  }

  private extractTerminology(sections: Map<string, string[]>): string[] {
    const terminology: string[] = [];
    let isHeaderRow = true;
    for (const [heading, body] of sections) {
      if (!/terminology|glossary/i.test(heading)) continue;
      isHeaderRow = true;
      for (const line of body) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const cells = this.parseTableRow(trimmed);
        if (cells) {
          if (isHeaderRow) {
            isHeaderRow = false;
            continue; // skip the header row
          }
          const term = cells[0] ?? '';
          const definition = cells.slice(1).join(' ').trim();
          if (term && definition) {
            terminology.push(`${term}: ${definition}`);
          }
          continue;
        }
        const bulletMatch = trimmed.match(/^[-*]\s*(.+?):\s*(.+)$/);
        if (bulletMatch) {
          terminology.push(`${bulletMatch[1].trim()}: ${bulletMatch[2].trim()}`);
        }
      }
    }
    return terminology;
  }

  private extractListSection(sections: Map<string, string[]>, pattern: RegExp): string[] {
    const items: string[] = [];
    for (const [heading, body] of sections) {
      if (pattern.test(heading)) {
        for (const line of body) {
          const trimmed = line.trim();
          const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
          if (bulletMatch) {
            items.push(bulletMatch[1].trim());
          }
        }
      }
    }
    return items;
  }

  private extractRoleDecisions(sections: Map<string, string[]>): {
    constraints: string[];
    openQuestions: string[];
  } {
    const constraints: string[] = [];
    const openQuestions: string[] = [];

    for (const [heading, body] of sections) {
      if (/role|decision|perspective|analysis/i.test(heading)) {
        for (const line of body) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (/\bMUST(\s+NOT)?\b/i.test(trimmed)) {
            constraints.push(trimmed.replace(/^[-*]\s*/, '').trim());
          } else if (/\bSHOULD\b|\bMAY\b/i.test(trimmed)) {
            openQuestions.push(trimmed.replace(/^[-*]\s*/, '').trim());
          }
        }
      }
    }
    return { constraints, openQuestions };
  }

  private extractFeatureDecomposition(sections: Map<string, string[]>): string[] {
    const requirements: string[] = [];
    for (const [heading, body] of sections) {
      if (!/feature\s+decomposition|features?/i.test(heading)) continue;
      let isHeaderRow = true;
      for (const line of body) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const cells = this.parseTableRow(trimmed);
        if (cells) {
          if (isHeaderRow) {
            isHeaderRow = false;
            continue; // skip the header row
          }
          if (cells.length > 0) {
            requirements.push(cells.join(' — '));
          }
          continue;
        }
        const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
        if (bulletMatch) {
          requirements.push(bulletMatch[1].trim());
        }
      }
    }
    return requirements;
  }

  private extractRoleInsights(taskDir: string): string[] {
    const insights: string[] = [];
    if (!fs.existsSync(taskDir)) return insights;

    const entries = fs.readdirSync(taskDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const analysisPath = path.join(taskDir, entry.name, 'analysis.md');
      if (!fs.existsSync(analysisPath)) continue;

      const content = fs.readFileSync(analysisPath, 'utf-8');
      const sections = this.splitMarkdownSections(content);
      for (const [heading, body] of sections) {
        if (/cross[- ]?cutting/i.test(heading)) {
          const text = body.join('\n').trim();
          if (text) {
            insights.push(`[${entry.name}] ${text}`);
          }
        }
      }
    }
    return insights;
  }

  /**
   * Parse `<spec-entry>` XML blocks from spec content.
   * Each block has the form:
   *   <spec-entry category="testing" scope="project">content</spec-entry>
   * Returns an array of extracted spec entries.
   */
  public parseSpecEntries(content: string): SpecEntry[] {
    const entries: SpecEntry[] = [];
    const specEntryRe = /<spec-entry\s+category="([^"]+)"\s+scope="([^"]+)"\s*>([\s\S]*?)<\/spec-entry>/g;

    function isSpecCategory(value: string): value is SpecCategory {
      return value === 'coding-conventions' || value === 'architecture' ||
        value === 'error-handling' || value === 'testing' ||
        value === 'performance' || value === 'security' ||
        value === 'ui-ux' || value === 'documentation';
    }

    function isSpecLayer(value: string): value is SpecLayer {
      return value === 'project' || value === 'global' ||
        value === 'team' || value === 'personal';
    }

    let match: RegExpExecArray | null;
    while ((match = specEntryRe.exec(content)) !== null) {
      const cat = match[1];
      const scope = match[2];

      if (!isSpecCategory(cat) || !isSpecLayer(scope)) {
        continue;
      }

      const innerContent = match[3].trim();
      entries.push({ category: cat, scope, content: innerContent });
    }
    return entries;
  }
  public buildPackage(
    taskId: string,
    roleOrOverride?: string | Partial<BoundaryContract>,
    boundaryOverrideParam?: Partial<BoundaryContract>
  ): ContextPackage {
    let role: string | undefined;
    let boundaryOverride: Partial<BoundaryContract> | undefined;

    if (typeof roleOrOverride === 'string') {
      role = roleOrOverride;
      boundaryOverride = boundaryOverrideParam;
    } else if (roleOrOverride && typeof roleOrOverride === 'object') {
      boundaryOverride = roleOrOverride;
    }

    const taskDir = path.join(this.workspaceDir, '.omp-flow', 'tasks', taskId);
    const scratchDir = path.join(this.workspaceDir, '.omp-flow', 'scratch', taskId);
    fs.mkdirSync(scratchDir, { recursive: true });
    fs.mkdirSync(taskDir, { recursive: true });

    const requirements: string[] = [];
    const prdPath = path.join(taskDir, 'prd.md');
    if (fs.existsSync(prdPath)) {
      const prdContent = fs.readFileSync(prdPath, 'utf-8');
      const lines = prdContent.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
          requirements.push(line.replace(/^[-*]\s*/, '').trim());
        }
      }
    } else {
      const defaultPrd = `# PRD ${taskId}\n\n## Requirements\n- Core implementation\n- Automated test coverage\n`;
      fs.writeFileSync(prdPath, defaultPrd, 'utf-8');
      requirements.push('Core implementation', 'Automated test coverage');
    }

    const boundary: BoundaryContract = {
      in_scope: boundaryOverride?.in_scope || ['src/**/*.ts', 'tests/**/*.ts'],
      out_of_scope: boundaryOverride?.out_of_scope || ['src/legacy/**/*.ts', 'node_modules/**'],
      constraints: boundaryOverride?.constraints || ['Follow project TypeScript conventions'],
      done_when: boundaryOverride?.done_when || ['All tests pass cleanly'],
    };

    const specRules: string[] = [];
    const specDir = path.join(this.workspaceDir, '.omp-flow', 'specs');
    if (fs.existsSync(specDir)) {
      const files = fs.readdirSync(specDir);
      const inScopeLower = boundary.in_scope.map((s) => s.toLowerCase());
      const roleLower = (role || '').toLowerCase();

      for (const file of files) {
        if (file.endsWith('.md')) {
          const specName = path.basename(file, '.md').toLowerCase();
          const isUniversalSpec = specName === 'harvested-rules' || specName === 'general' || specName === 'workflow';
          const isLayerMatched = inScopeLower.some((scopeTarget) => scopeTarget.includes(specName) || specName.includes(scopeTarget));

          // Role-based filtering logic
          const isRoleRelevant =
            !roleLower ||
            roleLower.includes('executor') ||
            roleLower.includes('architect') ||
            (roleLower.includes('researcher') && specName.includes('research')) ||
            (roleLower.includes('reviewer') && (specName.includes('review') || specName.includes('quality'))) ||
            (roleLower.includes('harvester') && specName.includes('harvest'));

          if ((isUniversalSpec || isLayerMatched || files.length <= 3) && isRoleRelevant) {
            const content = fs.readFileSync(path.join(specDir, file), 'utf-8').trim();
            if (content) {
              specRules.push(content);
            }
          }
        }
      }
    }
    // Parse <spec-entry> blocks from all loaded spec content.
    const allSpecEntries = specRules.flatMap((content) => this.parseSpecEntries(content));
    const specLayers: Record<SpecLayer, string[]> = {
      project: [],
      global: [],
      team: [],
      personal: [],
    };
    const specCategories: Record<SpecCategory, string[]> = {
      'coding-conventions': [],
      architecture: [],
      'error-handling': [],
      testing: [],
      performance: [],
      security: [],
      'ui-ux': [],
      documentation: [],
    };
    for (const entry of allSpecEntries) {
      specLayers[entry.scope].push(entry.content);
      specCategories[entry.category].push(entry.content);
    }
    const action: ManifestAction = this.roleToAction(role);
    const manifestEntries = this.readContextManifest(taskId, action);
    const brainstormExtract = this.extractFromBrainstorm(taskId);

    const extractedRequirements = brainstormExtract?.requirements ?? [];
    const mergedRequirements =
      requirements.length > 0 ? requirements : extractedRequirements;

    const baseInsights = [`Generated for role: ${role || 'generic'}`];
    const extractedInsights = brainstormExtract?.insights ?? [];
    const mergedInsights = [...baseInsights, ...extractedInsights];

    const mergedDomain: string | DomainContext =
      brainstormExtract?.domain ?? 'omp-flow';

    const contextPackage: ContextPackage = {
      taskId,
      role,
      requirements: mergedRequirements,
      boundary,
      specRules,
      domain: mergedDomain,
      insights: mergedInsights,
      specLayers,
      specCategories,
      non_goals: brainstormExtract?.non_goals,
      open_questions: brainstormExtract?.open_questions,
      constraints: brainstormExtract?.constraints,
      manifest: manifestEntries.length > 0 ? manifestEntries : undefined,
      createdAt: new Date().toISOString(),
    };

    const outputPath = path.join(scratchDir, role ? `context-package-${role}.json` : 'context-package.json');
    fs.writeFileSync(outputPath, JSON.stringify(contextPackage, null, 2), 'utf-8');

    return contextPackage;
  }
}
