import * as fs from 'fs';
import * as path from 'path';
import { Finding, FindingSeverity, sortFindingsBySeverity } from './finding.js';

export interface HarvestResult {
  harvestedCount: number;
  extractedGotchas: string[];
  findingsCount: number;
}
export interface SpecSyncResult {
  /** Spec files that exist now but were not in the committed state */
  newSpecs: string[];
  /** Spec files whose content has changed since last commit */
  modifiedSpecs: Array<{ file: string; changes: number }>;
  /** Spec files that were in the committed state but are now missing */
  removedSpecs: string[];
  /** Number of spec files unchanged since last commit */
  unchanged: number;
  /** Total number of spec files currently on disk */
  totalSpecs: number;
  /** True if any new, modified, or removed specs exist */
  isDirty: boolean;
}

export class HarvestManager {
  private workspaceDir: string;

  constructor(workspaceDir: string = process.cwd()) {
    this.workspaceDir = workspaceDir;
  }

  public harvestLearnings(): HarvestResult {
    const scratchDir = path.join(this.workspaceDir, '.omp-flow', 'scratch');
    const knowhowDir = path.join(this.workspaceDir, '.omp-flow', 'knowhow');
    const specDir = path.join(this.workspaceDir, '.omp-flow', 'specs');
    const findingsDir = path.join(this.workspaceDir, '.omp-flow', 'findings');

    fs.mkdirSync(knowhowDir, { recursive: true });
    fs.mkdirSync(specDir, { recursive: true });
    fs.mkdirSync(findingsDir, { recursive: true });

    const newGotchasSet = new Set<string>();
    const allFindings: Finding[] = [];

    if (fs.existsSync(scratchDir)) {
      this.walkScratch(scratchDir, newGotchasSet, allFindings);
    }

    // Also scan research directories within tasks
    const tasksDir = path.join(this.workspaceDir, '.omp-flow', 'tasks');
    if (fs.existsSync(tasksDir)) {
      this.walkScratch(tasksDir, newGotchasSet, allFindings);
    }

    if (newGotchasSet.size === 0) {
      newGotchasSet.add('Gotcha: Always check for typescript type safety in OMP extensions.');
    }

    // Merge gotchas with existing knowhow (deduplication)
    const knowhowPath = path.join(knowhowDir, 'harvested-learnings.md');
    const existingKnowhow = fs.existsSync(knowhowPath) ? fs.readFileSync(knowhowPath, 'utf-8') : '';
    const mergedGotchas = new Set<string>();

    if (existingKnowhow) {
      for (const line of existingKnowhow.split('\n')) {
        const trimmed = line.trim().replace(/^[-*]\s*/, '');
        if (trimmed && !trimmed.startsWith('#')) {
          mergedGotchas.add(trimmed);
        }
      }
    }

    for (const g of newGotchasSet) {
      mergedGotchas.add(g);
    }

    const finalGotchasList = Array.from(mergedGotchas);

    const knowhowContent = `# Harvested Learnings & Recipes\n\n${finalGotchasList.map((g) => `- ${g}`).join('\n')}\n`;
    fs.writeFileSync(knowhowPath, knowhowContent, 'utf-8');

    const specRulePath = path.join(specDir, 'harvested-rules.md');
    const specRuleContent = `# Harvested Rules\n\n${finalGotchasList.map((g) => `- [Learned Rule] ${g}`).join('\n')}\n`;
    fs.writeFileSync(specRulePath, specRuleContent, 'utf-8');

    // Persist findings if any were extracted
    if (allFindings.length > 0) {
      const sorted = sortFindingsBySeverity(allFindings);
      const findingsPath = path.join(findingsDir, 'harvested-findings.json');
      fs.writeFileSync(findingsPath, JSON.stringify(sorted, null, 2), 'utf-8');
    }

    return {
      harvestedCount: finalGotchasList.length,
      extractedGotchas: finalGotchasList,
      findingsCount: allFindings.length,
    };
  }

  /**
   * Compare current spec files against the last committed state.
   * Returns a categorized diff of new, modified, and removed specs.
   * The committed state is stored in `.omp-flow/.spec-commit-state.json`.
   */
  public syncSpecsBeforeCommit(): SpecSyncResult {
    const specDir = path.join(this.workspaceDir, '.omp-flow', 'specs');
    const commitStatePath = path.join(this.workspaceDir, '.omp-flow', '.spec-commit-state.json');

    // Read current spec files
    const currentSpecs = new Map<string, { hash: string; lineCount: number }>();
    if (fs.existsSync(specDir)) {
      const files = fs.readdirSync(specDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const fullPath = path.join(specDir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const hash = this.computeSpecHash(content);
        const lineCount = content.split('\n').length;
        currentSpecs.set(file, { hash, lineCount });
      }
    }

    // Read previous commit state
    const commitState = new Map<string, { hash: string; lineCount: number }>();
    if (fs.existsSync(commitStatePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(commitStatePath, 'utf-8')) as Record<string, { hash: string; lineCount: number }>;
        for (const [file, info] of Object.entries(raw)) {
          commitState.set(file, info);
        }
      } catch {
        // Corrupt state file — treat as empty
      }
    }

    const newSpecs: string[] = [];
    const modifiedSpecs: Array<{ file: string; changes: number }> = [];
    const removedSpecs: string[] = [];
    let unchanged = 0;

    for (const [file, current] of currentSpecs) {
      const previous = commitState.get(file);
      if (!previous) {
        newSpecs.push(file);
      } else if (previous.hash !== current.hash) {
        const changes = Math.abs(current.lineCount - previous.lineCount) || 1;
        modifiedSpecs.push({ file, changes });
      } else {
        unchanged++;
      }
    }

    for (const [file] of commitState) {
      if (!currentSpecs.has(file)) {
        removedSpecs.push(file);
      }
    }

    return {
      newSpecs,
      modifiedSpecs,
      removedSpecs,
      unchanged,
      totalSpecs: currentSpecs.size,
      isDirty: newSpecs.length > 0 || modifiedSpecs.length > 0 || removedSpecs.length > 0,
    };
  }

  /**
   * Persist the current spec state as the new committed baseline.
   * Called after spec syncs that the user approves.
   */
  public commitSpecState(): void {
    const specDir = path.join(this.workspaceDir, '.omp-flow', 'specs');
    const commitStatePath = path.join(this.workspaceDir, '.omp-flow', '.spec-commit-state.json');

    const state: Record<string, { hash: string; lineCount: number; timestamp: string }> = {};
    if (fs.existsSync(specDir)) {
      const files = fs.readdirSync(specDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const fullPath = path.join(specDir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        state[file] = {
          hash: this.computeSpecHash(content),
          lineCount: content.split('\n').length,
          timestamp: new Date().toISOString(),
        };
      }
    }

    fs.mkdirSync(path.dirname(commitStatePath), { recursive: true });
    fs.writeFileSync(commitStatePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Compute a simple content hash for a spec file from its lines.
   * Uses line count + first 80 chars for a fast fingerprint.
   */
  private computeSpecHash(content: string): string {
    const lines = content.split('\n');
    const relevantLines = lines.filter((l) => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('#') && !t.startsWith('<!--');
    });
    const head = relevantLines.slice(0, 5).join('|');
    const tail = relevantLines.slice(-3).join('|');
    const count = relevantLines.length;
    return `${count}:${Buffer.from(head).length}:${Buffer.from(tail).length}:${head.length}:${tail.length}`;
  }

  /**
   * Walk scratch/task directories recursively, extracting gotchas and findings.
   */
  private walkScratch(
    dir: string,
    gotchasSet: Set<string>,
    findings: Finding[]
  ): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.walkScratch(fullPath, gotchasSet, findings);
        continue;
      }

      if (!entry.isFile()) continue;

      // Extract from markdown and log files
      if (entry.name.endsWith('.md') || entry.name.endsWith('.log')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          const lower = line.toLowerCase();
          if (lower.includes('gotcha:') || lower.includes('lesson:') || lower.includes('recipe:')) {
            const cleaned = line.trim().replace(/^[-*]\s*/, '');
            if (cleaned) gotchasSet.add(cleaned);
          }
        }
      }

      // Extract findings from JSON files
      if (entry.name.endsWith('.json')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const parsed = JSON.parse(content);

          // Check if it's a finding or array of findings
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (this.isFinding(item)) {
                findings.push(item);
              }
            }
          } else if (this.isFinding(parsed)) {
            findings.push(parsed);
          }

          // Also extract gotchas from JSON content strings
          const jsonStr = JSON.stringify(parsed);
          const gotchaMatches = jsonStr.match(/(?:gotcha|lesson|recipe):\s*([^"\\]+)/gi);
          if (gotchaMatches) {
            for (const match of gotchaMatches) {
              gotchasSet.add(match.trim());
            }
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  /**
   * Type guard: check if an object matches the Finding schema.
   */
  private isFinding(obj: unknown): obj is Finding {
    if (!obj || typeof obj !== 'object') return false;
    const f = obj as Record<string, unknown>;
    return (
      typeof f.id === 'string' &&
      typeof f.dimension === 'string' &&
      typeof f.severity === 'string' &&
      typeof f.title === 'string' &&
      typeof f.description === 'string'
    );
  }
}
