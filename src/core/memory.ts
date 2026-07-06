import * as fs from 'fs';
import * as path from 'path';

/**
 * Memory Engine - Tag stripping, relevance scoring, and knowhow search.
 * Absorbs Trellis Session Memory architecture:
 *   - stripInjectionTags: Remove framework-injected prompt blocks
 *   - relevanceScore: User-intent-weighted scoring (3*user + asst) / total
 *   - searchKnowhow: Search harvested learnings with ranked results
 */

/**
 * Patterns for framework-injected tags to strip from dialogue.
 */
const INJECTION_TAG_PATTERNS: RegExp[] = [
  /<system-reminder>[\s\S]*?<\/system-reminder>/g,
  /<workflow-state>[\s\S]*?<\/workflow-state>/g,
  /<omp-flow-context>[\s\S]*?<\/omp-flow-context>/g,
  /<subagent-boundary-context>[\s\S]*?<\/subagent-boundary-context>/g,
  /<irc-coordination-context>[\s\S]*?<\/irc-coordination-context>/g,
  /<active-spec-rules>[\s\S]*?<\/active-spec-rules>/g,
  /<instructions>[\s\S]*?<\/instructions>/g,
  /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g,
  /<local-command-stderr>[\s\S]*?<\/local-command-stderr>/g,
  /<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/g,
];

/**
 * Bootstrap preamble patterns to detect and remove.
 */
const BOOTSTRAP_PATTERNS: RegExp[] = [
  /^# AGENTS\.md instructions[\s\S]*/m,
  /^<INSTRUCTIONS>[\s\S]*/m,
];

export interface DialogueTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface KnowhowSearchResult {
  filePath: string;
  score: number;
  matchedLines: string[];
  category: 'knowhow' | 'spec' | 'finding';
}

/**
 * Strip framework-injected tags from dialogue content.
 * Removes system-reminder, workflow-state, omp-flow-context, etc.
 */
export function stripInjectionTags(content: string): string {
  let cleaned = content;
  for (const pattern of INJECTION_TAG_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  for (const pattern of BOOTSTRAP_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Detect if a turn is a bootstrap preamble (should be excluded from scoring).
 */
export function isBootstrapTurn(content: string): boolean {
  const trimmed = content.trim();
  return BOOTSTRAP_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * User-intent-weighted relevance scoring.
 * User hits are weighted 3x over assistant hits.
 * Normalized by total turns to prevent long sessions from outranking targeted ones.
 *
 * Formula: (3 * userMatches + asstMatches) / totalTurns
 */
export function relevanceScore(
  turns: DialogueTurn[],
  queryTokens: string[]
): number {
  if (turns.length === 0 || queryTokens.length === 0) return 0;

  let userMatches = 0;
  let asstMatches = 0;
  let totalTurns = 0;

  for (const turn of turns) {
    if (isBootstrapTurn(turn.content)) continue;

    const cleaned = stripInjectionTags(turn.content).toLowerCase();
    totalTurns++;

    for (const token of queryTokens) {
      if (cleaned.includes(token)) {
        if (turn.role === 'user') {
          userMatches++;
        } else if (turn.role === 'assistant') {
          asstMatches++;
        }
        break; // Count each turn once per query
      }
    }
  }

  if (totalTurns === 0) return 0;
  return (3 * userMatches + asstMatches) / totalTurns;
}

/**
 * Memory Engine for searching harvested knowhow and spec rules.
 */
export class MemoryEngine {
  private workspaceDir: string;

  constructor(workspaceDir: string = process.cwd()) {
    this.workspaceDir = workspaceDir;
  }

  /**
   * Search knowhow directory with user-intent-weighted scoring.
   */
  public searchKnowhow(query: string): KnowhowSearchResult[] {
    const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (queryTokens.length === 0) return [];

    const results: KnowhowSearchResult[] = [];
    const searchDirs: Array<{ dir: string; category: KnowhowSearchResult['category'] }> = [
      { dir: path.join(this.workspaceDir, '.omp-flow', 'knowhow'), category: 'knowhow' },
      { dir: path.join(this.workspaceDir, '.omp-flow', 'specs'), category: 'spec' },
      { dir: path.join(this.workspaceDir, '.omp-flow', 'scratch'), category: 'finding' },
    ];

    for (const { dir, category } of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      this.walkAndScore(dir, queryTokens, category, results);
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private walkAndScore(
    dir: string,
    queryTokens: string[],
    category: KnowhowSearchResult['category'],
    results: KnowhowSearchResult[]
  ): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.walkAndScore(fullPath, queryTokens, category, results);
        continue;
      }

      if (!entry.name.endsWith('.md') && !entry.name.endsWith('.json')) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const fileNameLower = entry.name.toLowerCase();
      const matchedLines: string[] = [];
      let score = 0;

      // File name match: high weight
      for (const token of queryTokens) {
        if (fileNameLower.includes(token)) score += 10;
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineLower = line.toLowerCase();

        for (const token of queryTokens) {
          if (lineLower.includes(token)) {
            // Heading match: 5x weight
            if (line.trim().startsWith('#')) {
              score += 5;
            }
            // Intent keywords: 3x weight
            else if (
              lineLower.includes('gotcha') ||
              lineLower.includes('rule') ||
              lineLower.includes('lesson') ||
              lineLower.includes('recipe') ||
              lineLower.includes('requirement')
            ) {
              score += 3;
            }
            // Regular content: 1x
            else {
              score += 1;
            }
            matchedLines.push(`L${i + 1}: ${line.trim()}`);
            break; // Count each line once
          }
        }
      }

      if (score > 0 && matchedLines.length > 0) {
        results.push({
          filePath: fullPath,
          score,
          matchedLines: Array.from(new Set(matchedLines)),
          category,
        });
      }
    }
  }

  /**
   * Get recent knowhow entries (latest N gotchas).
   */
  public getRecentKnowhow(limit: number = 10): string[] {
    const knowhowPath = path.join(this.workspaceDir, '.omp-flow', 'knowhow', 'harvested-learnings.md');
    if (!fs.existsSync(knowhowPath)) return [];

    const content = fs.readFileSync(knowhowPath, 'utf-8');
    const entries = content
      .split('\n')
      .filter((line) => line.trim().startsWith('- '))
      .map((line) => line.trim().replace(/^- /, ''));

    return entries.slice(-limit);
  }
}
