/**
 * Knowledge Audit Engine — 8-Detector Suite
 *
 * Scans .omp-flow workspace for stale specs, orphaned knowhow, conflicting rules,
 * un-harvested learnings, missing cross-references, outdated timestamps,
 * unlinked wiki references, and duplicate spec entries.
 *
 * Designed as a standalone module with zero runtime dependencies (Node built-ins only).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FindingSeverity } from './finding.js';

// ---------------------------------------------------------------------------
// Audit Types
// ---------------------------------------------------------------------------

export interface AuditFinding {
  /** Detector that produced this finding (e.g. "stale-specs") */
  detectorId: string;
  /** Human-readable title */
  title: string;
  /** Detailed description of the issue */
  description: string;
  /** Severity level matching the FindingSeverity convention */
  severity: FindingSeverity;
  /** File path relative to workspace root, when applicable */
  file?: string;
  /** Line range [start, end] within the file, when applicable */
  lines?: [number, number];
  /** Suggested remediation */
  suggestion: string;
}

export interface DetectorReport {
  /** Unique detector identifier */
  detectorId: string;
  /** Human-readable detector name */
  detectorName: string;
  /** Short description of what this detector checks */
  description: string;
  /** Per-detector findings */
  findings: AuditFinding[];
  /** Number of findings (convenience field) */
  count: number;
}

export interface AuditReport {
  /** ISO timestamp of the audit run */
  timestamp: string;
  /** Workspace directory that was audited */
  workspaceDir: string;
  /** All detector reports */
  detectors: DetectorReport[];
  /** Total findings across all detectors */
  totalFindings: number;
  /** Quick-lookup summary: detectorId → count */
  summary: Record<string, number>;
}

export interface AuditOptions {
  /** Workspace root (default: process.cwd()) */
  workspaceDir?: string;
  /** How many days until a spec is considered stale (default: 7) */
  staleDays?: number;
  /** Whether to skip expensive cross-file text searches (default: false) */
  lightweight?: boolean;
}

// ---------------------------------------------------------------------------
// Detector IDs — Shared Constants
// ---------------------------------------------------------------------------

const DETECTORS = {
  staleSpecs: {
    id: 'stale-specs',
    name: 'Stale Spec Detection',
    description: 'Flags spec files that have not been modified recently or are missing from the index.',
  },
  orphanedKnowhow: {
    id: 'orphaned-knowhow',
    name: 'Orphaned Knowhow Detection',
    description: 'Finds knowhow entries that are not referenced anywhere in specs or task definitions.',
  },
  conflictingRules: {
    id: 'conflicting-rules',
    name: 'Conflicting Rules Detection',
    description: 'Detects contradictory statements across spec files (same topic, opposite guidance).',
  },
  unharvestedLearnings: {
    id: 'unharvested-learnings',
    name: 'Un-harvested Learnings Detection',
    description: 'Scans scratch and task directories for learnings not yet captured in harvested knowhow.',
  },
  missingSpecReferences: {
    id: 'missing-spec-references',
    name: 'Missing Spec-Entry References',
    description: 'Checks that spec sections contain cross-reference wiki-links to related material.',
  },
  outdatedTimestamps: {
    id: 'outdated-timestamps',
    name: 'Outdated Spec Timestamps',
    description: 'Flags spec files whose modification time is older than related source or task files.',
  },
  unlinkedWikiReferences: {
    id: 'unlinked-wiki-references',
    name: 'Unlinked Wiki References',
    description: 'Finds references to spec concepts in Markdown that should link to spec files but do not.',
  },
  duplicateEntries: {
    id: 'duplicate-entries',
    name: 'Duplicate Spec Entries',
    description: 'Detects duplicate or near-duplicate entries across spec files and within a single spec.',
  },
} as const;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/** List all `.md` files in a directory tree (non-recursive for a single dir). */
function listMdFiles(dir: string): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/** List all `.md` files recursively under a directory. */
function listMdFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...listMdFilesRecursive(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or is not readable — return empty
  }
  return results;
}

/** Read file content, returning empty string on error. */
function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** Get file mtime as a Date, or null on error. */
function getMtime(filePath: string): Date | null {
  try {
    const stat = fs.statSync(filePath);
    return stat.mtime;
  } catch {
    return null;
  }
}

/** Check if a file is older than `days` days. */
function isStale(filePath: string, days: number): boolean {
  const mtime = getMtime(filePath);
  if (mtime === null) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return mtime.getTime() < cutoff;
}

/** Extract list items (lines starting with `- ` or `* `) from Markdown. */
function extractListItems(content: string): string[] {
  const items: string[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.match(/^[-*]\s+(.+)/);
    if (match) {
      items.push(match[1]!.trim());
    }
  }
  return items;
}

/** Extract Markdown section headings and their content, returns [heading, contentText][]. */
function extractSections(content: string): Array<[string, string]> {
  const sections: Array<[string, string]> = [];
  const lines = content.split('\n');
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)/);
    if (headingMatch) {
      if (currentHeading !== null) {
        sections.push([currentHeading, currentLines.join('\n').trim()]);
      }
      currentHeading = headingMatch[1]!.trim();
      currentLines = [];
    } else if (currentHeading !== null) {
      currentLines.push(line);
    }
  }

  if (currentHeading !== null) {
    sections.push([currentHeading, currentLines.join('\n').trim()]);
  }

  return sections;
}

/** Find wiki-links of the form [text](./path) in content. */
function findWikiLinks(content: string): string[] {
  const links: string[] = [];
  const pattern = /\[([^\]]+)\]\(\.\/([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    links.push(match[0]!);
  }
  return links;
}

/** Extract words that look like spec/reference concepts from content. */
function findReferenceCandidates(content: string): string[] {
  const candidates: string[] = [];
  // Match PascalCase compound terms (e.g. "FindingSchema", "WavePlan", "ContextHandoff")
  const pascalPattern = /\b[A-Z][a-z]+[A-Z][A-Za-z]*(?:\s+[A-Z][a-z]+[A-Z][A-Za-z]*)*\b/g;
  let match: RegExpExecArray | null;
  while ((match = pascalPattern.exec(content)) !== null) {
    candidates.push(match[0]!);
  }
  // Match kebab-case reference terms
  const kebabPattern = /\b(?:spec|rule|constraint|finding|knowhow|harvest|wave|fsm|context)\b/gi;
  while ((match = kebabPattern.exec(content)) !== null) {
    candidates.push(match[0]!);
  }
  return [...new Set(candidates)];
}

/** Simple text similarity: proportion of shared words between two strings. */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  return intersection.size / Math.max(wordsA.size, wordsB.size);
}

// ---------------------------------------------------------------------------
// Detector 1: Stale Spec Detection
// ---------------------------------------------------------------------------

function detectStaleSpecs(baseDir: string, staleDays: number): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const specDir = path.join(baseDir, '.omp-flow', 'specs');

  if (!fs.existsSync(specDir)) return findings;

  const specFiles = listMdFiles(specDir);

  for (const file of specFiles) {
    const relativePath = path.relative(baseDir, file);

    // Check if the file is stale
    if (isStale(file, staleDays)) {
      const mtime = getMtime(file);
      findings.push({
        detectorId: DETECTORS.staleSpecs.id,
        title: 'Stale spec file',
        description: `The spec file "${relativePath}" has not been modified since ${mtime?.toISOString() ?? 'unknown'}, which exceeds the ${staleDays}-day threshold.`,
        severity: 'medium',
        file: relativePath,
        suggestion: `Review and update ${relativePath} to reflect the current state of the project, or archive it if no longer relevant.`,
      });
    }
  }

  // Check that all spec files are referenced in index.md
  const indexPath = path.join(specDir, 'index.md');
  const indexContent = readFileSafe(indexPath);

  if (indexContent) {
    for (const file of specFiles) {
      const basename = path.basename(file);
      // Skip index.md itself
      if (basename === 'index.md') continue;

      const relativePath = path.relative(baseDir, file);

      // Check if this file is mentioned in the index (by name or link)
      const nameInIndex = indexContent.includes(basename) || indexContent.includes(`./${basename}`);
      if (!nameInIndex) {
        findings.push({
          detectorId: DETECTORS.staleSpecs.id,
          title: 'Spec file not indexed',
          description: `The spec file "${relativePath}" exists on disk but is not listed in the spec index (${path.relative(baseDir, indexPath)}).`,
          severity: 'high',
          file: relativePath,
          suggestion: `Add a reference to ${basename} in the index.md table, or remove the file if it is obsolete.`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Detector 2: Orphaned Knowhow Detection
// ---------------------------------------------------------------------------

function detectOrphanedKnowhow(baseDir: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const knowhowDir = path.join(baseDir, '.omp-flow', 'knowhow');
  const knowhowFile = path.join(knowhowDir, 'harvested-learnings.md');

  if (!fs.existsSync(knowhowFile)) return findings;

  const knowhowContent = readFileSafe(knowhowFile);
  const knowhowItems = extractListItems(knowhowContent);

  if (knowhowItems.length === 0) return findings;

  // Collect all referenceable content: spec files, task PRDs, and source files
  const specDir = path.join(baseDir, '.omp-flow', 'specs');
  const tasksDir = path.join(baseDir, '.omp-flow', 'tasks');
  const srcDir = path.join(baseDir, 'src');

  const searchableFiles = [
    ...listMdFiles(specDir),
    ...listMdFilesRecursive(tasksDir),
    ...globSrcFiles(srcDir),
  ];

  // For each knowhow item, check if it appears anywhere in searchable content
  for (const item of knowhowItems) {
    const itemLower = item.toLowerCase();
    const itemWords = itemLower.split(/\s+/).filter((w) => w.length > 3);

    if (itemWords.length === 0) continue;

    let referenced = false;

    for (const searchFile of searchableFiles) {
      const fileContent = readFileSafe(searchFile).toLowerCase();
      // Check if at least half of the significant words appear in this file
      const matchedWords = itemWords.filter((w) => fileContent.includes(w));
      if (matchedWords.length >= itemWords.length / 2) {
        referenced = true;
        break;
      }
    }

    if (!referenced) {
      findings.push({
        detectorId: DETECTORS.orphanedKnowhow.id,
        title: 'Orphaned knowhow entry',
        description: `The knowhow entry "${item}" is not referenced in any spec, task definition, or source file under src/.`,
        severity: 'low',
        file: path.relative(baseDir, knowhowFile),
        suggestion: `Either reference "${item}" in the relevant spec or task document, or archive it if it is no longer applicable.`,
      });
    }
  }

  return findings;
}

/** Recursively list all `.ts` source files under a directory. */
function globSrcFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...globSrcFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore unreadable directories
  }
  return results;
}

// ---------------------------------------------------------------------------
// Detector 3: Conflicting Rules Detection
// ---------------------------------------------------------------------------

function detectConflictingRules(baseDir: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const specDir = path.join(baseDir, '.omp-flow', 'specs');

  if (!fs.existsSync(specDir)) return findings;

  const specFiles = listMdFiles(specDir).filter((f) => path.basename(f) !== 'index.md');

  // Collect all sections by heading across all spec files
  const allSections: Array<{ file: string; heading: string; content: string }> = [];

  for (const file of specFiles) {
    const content = readFileSafe(file);
    const sections = extractSections(content);
    const relativePath = path.relative(baseDir, file);
    for (const [heading, sectionContent] of sections) {
      allSections.push({ file: relativePath, heading, content: sectionContent });
    }
  }

  // Compare every pair of sections with similar headings for contradictory content
  for (let i = 0; i < allSections.length; i++) {
    for (let j = i + 1; j < allSections.length; j++) {
      const a = allSections[i]!;
      const b = allSections[j]!;

      // Only compare if headings share significant word overlap (same topic)
      const headingAWords = new Set(a.heading.toLowerCase().split(/\s+/));
      const headingBWords = new Set(b.heading.toLowerCase().split(/\s+/));
      const commonHeadingWords = [...headingAWords].filter((w) => headingBWords.has(w)).length;
      const maxHeadingWords = Math.max(headingAWords.size, headingBWords.size);

      if (maxHeadingWords === 0 || commonHeadingWords < 2) continue;

      // Check for contradictory markers
      const aLower = a.content.toLowerCase();
      const bLower = b.content.toLowerCase();

      const forbidPatterns = [/must not/i, /forbidden/i, /never/i, /do not/i, /prohibited/i];
      const allowPatterns = [/must\b/i, /allowed/i, /always/i, /should\b/i, /required/i];

      const aForbids = forbidPatterns.some((p) => p.test(aLower));
      const aAllows = allowPatterns.some((p) => p.test(aLower));
      const bForbids = forbidPatterns.some((p) => p.test(bLower));
      const bAllows = allowPatterns.some((p) => p.test(bLower));

      // One section forbids while another allows the same topic
      if ((aForbids && bAllows) || (aAllows && bForbids)) {
        findings.push({
          detectorId: DETECTORS.conflictingRules.id,
          title: 'Potentially conflicting rules',
          description: `The section "${a.heading}" in ${a.file} and "${b.heading}" in ${b.file} cover the same topic but appear to contain contradictory guidance (one forbids while the other allows).`,
          severity: 'high',
          suggestion: `Review "${a.heading}" in ${a.file} and "${b.heading}" in ${b.file}, reconcile any contradictions, and add cross-references to the authoritative rule.`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Detector 4: Un-harvested Learnings Detection
// ---------------------------------------------------------------------------

function detectUnharvestedLearnings(baseDir: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Read existing knowhow
  const knowhowFile = path.join(baseDir, '.omp-flow', 'knowhow', 'harvested-learnings.md');
  const knowhowContent = readFileSafe(knowhowFile);
  const existingItems = new Set(extractListItems(knowhowContent).map((i) => i.toLowerCase()));

  // Scan scratch and task directories for un-harvested items
  const scratchDir = path.join(baseDir, '.omp-flow', 'scratch');
  const tasksDir = path.join(baseDir, '.omp-flow', 'tasks');

  const scanDirs: string[] = [];
  if (fs.existsSync(scratchDir)) scanDirs.push(scratchDir);
  if (fs.existsSync(tasksDir)) scanDirs.push(tasksDir);

  const foundNew: string[] = [];

  for (const dir of scanDirs) {
    const files = listMdFilesRecursive(dir);
    for (const file of files) {
      const content = readFileSafe(file);
      const lines = content.split('\n');

      for (const line of lines) {
        const lower = line.toLowerCase();
        const match = lower.match(/(gotcha|lesson|recipe|insight):\s*(.+)/);
        if (match) {
          const item = match[2]!.trim();
          if (item && !existingItems.has(item.toLowerCase())) {
            foundNew.push(item);
          }
        }
      }
    }
  }

  // Deduplicate found items
  const uniqueNew = [...new Set(foundNew)];

  for (const item of uniqueNew) {
    findings.push({
      detectorId: DETECTORS.unharvestedLearnings.id,
      title: 'Un-harvested learning',
      description: `A learning was found in scratch/task files that has not been harvested into the knowhow: "${item}".`,
      severity: 'info',
      suggestion: `Run the harvest process to capture this learning: "${item}". Add it to .omp-flow/knowhow/harvested-learnings.md.`,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Detector 5: Missing Spec-Entry References
// ---------------------------------------------------------------------------

function detectMissingSpecReferences(baseDir: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const specDir = path.join(baseDir, '.omp-flow', 'specs');

  if (!fs.existsSync(specDir)) return findings;

  const specFiles = listMdFiles(specDir).filter((f) => path.basename(f) !== 'index.md');

  for (const file of specFiles) {
    const content = readFileSafe(file);
    const relativePath = path.relative(baseDir, file);
    const sections = extractSections(content);
    const wikiLinks = findWikiLinks(content);

    for (const [heading, sectionContent] of sections) {
      // Skip very short sections (just a heading with no body is fine)
      if (sectionContent.length < 80) continue;

      // Check if this section has at least one wiki-link to another spec file
      const sectionHasLink = wikiLinks.some((link) => sectionContent.includes(link));

      // Heuristic: check for terms that should probably link to related specs
      const relatedTerms = [
        'constraint',
        'convention',
        'standard',
        'rule',
        'guideline',
        'finding',
        'severity',
        'dimension',
        'harvest',
        'knowhow',
        'spec',
      ];

      const matchingTerms = relatedTerms.filter((term) =>
        sectionContent.toLowerCase().includes(term)
      );

      if (!sectionHasLink && matchingTerms.length >= 2) {
        findings.push({
          detectorId: DETECTORS.missingSpecReferences.id,
          title: 'Section missing cross-references',
          description: `The section "${heading}" in ${relativePath} mentions ${matchingTerms.length} related spec concepts but contains no wiki-links to other spec files.`,
          severity: 'low',
          file: relativePath,
          suggestion: `Add wiki-links (e.g., [](./related-spec.md)) in "${heading}" to reference the related specs for ${matchingTerms.join(', ')}.`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Detector 6: Outdated Spec Timestamps
// ---------------------------------------------------------------------------

function detectOutdatedTimestamps(baseDir: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const specDir = path.join(baseDir, '.omp-flow', 'specs');

  if (!fs.existsSync(specDir)) return findings;

  const specFiles = listMdFiles(specDir).filter((f) => path.basename(f) !== 'index.md');
  const srcDir = path.join(baseDir, 'src');
  const tasksDir = path.join(baseDir, '.omp-flow', 'tasks');

  // Collect newest mtime from source files and task PRDs
  const referenceFiles = [...globSrcFiles(srcDir), ...listMdFilesRecursive(tasksDir)];

  if (referenceFiles.length === 0) return findings;

  const newestReferenceMtime = referenceFiles.reduce<number | null>((latest, rf) => {
    const mtime = getMtime(rf);
    if (mtime === null) return latest;
    const mtimeMs = mtime.getTime();
    return latest === null ? mtimeMs : Math.max(latest, mtimeMs);
  }, null);

  if (newestReferenceMtime === null) return findings;

  for (const file of specFiles) {
    const relativePath = path.relative(baseDir, file);
    const specMtime = getMtime(file);
    if (specMtime === null) continue;

    const specMtimeMs = specMtime.getTime();

    // If the spec is older than the newest source/task file in the project
    if (specMtimeMs < newestReferenceMtime) {
      const diffDays = Math.round(
        (newestReferenceMtime - specMtimeMs) / (24 * 60 * 60 * 1000)
      );

      if (diffDays >= 1) {
        findings.push({
          detectorId: DETECTORS.outdatedTimestamps.id,
          title: 'Spec file may be outdated',
          description: `The spec "${relativePath}" was last modified ${specMtime.toISOString()}, which is ${diffDays} day(s) before the newest source or task file in the project.`,
          severity: 'medium',
          file: relativePath,
          suggestion: `Review ${relativePath} to ensure it still reflects the current implementation. Update it to match any recent changes in the codebase.`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Detector 7: Unlinked Wiki References
// ---------------------------------------------------------------------------

function detectUnlinkedWikiReferences(baseDir: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const specDir = path.join(baseDir, '.omp-flow', 'specs');

  if (!fs.existsSync(specDir)) return findings;

  const specFiles = listMdFiles(specDir).filter((f) => path.basename(f) !== 'index.md');

  for (const file of specFiles) {
    const content = readFileSafe(file);
    const relativePath = path.relative(baseDir, file);
    const existingWikiLinks = findWikiLinks(content);

    // Extract linked filenames from existing wiki links
    const linkedFiles = new Set<string>();
    const linkPattern = /\]\(\.\/([^)]+)\)/g;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkPattern.exec(content)) !== null) {
      linkedFiles.add(linkMatch[1]!);
    }

    // Find spec file names that could be referenced but aren't linked
    const allSpecNames = specFiles
      .filter((sf) => sf !== file)
      .map((sf) => path.basename(sf));

    for (const specName of allSpecNames) {
      // Skip if already linked
      if (linkedFiles.has(specName)) continue;

      // Strip extension for matching
      const specNameNoExt = specName.replace(/\.md$/, '');
      const specNameWords = specNameNoExt.split('-');

      // Check if this spec's name appears in the content without being a link
      if (content.toLowerCase().includes(specNameNoExt.replace(/-/g, ' ').toLowerCase())) {
        findings.push({
          detectorId: DETECTORS.unlinkedWikiReferences.id,
          title: 'Unlinked wiki reference',
          description: `The file ${relativePath} mentions concepts from "${specName}" but does not contain a wiki-link to that spec file.`,
          severity: 'info',
          file: relativePath,
          suggestion: `Add a cross-reference link like [${specNameNoExt.replace(/-/g, ' ')}](./${specName}) in the relevant section.`,
        });
      } else {
        // Also check if any content word appears in another spec's name
        const contentWords = new Set(content.toLowerCase().split(/\s+/));
        const specNameParts = specNameNoExt.split('-').filter((w) => w.length > 3);
        const matchedParts = specNameParts.filter((w) => contentWords.has(w));

        if (matchedParts.length >= specNameParts.length * 0.6 && specNameParts.length > 0) {
          findings.push({
            detectorId: DETECTORS.unlinkedWikiReferences.id,
            title: 'Possible unlinked wiki reference',
            description: `The file ${relativePath} uses terminology ("${matchedParts.join(', ')}") that matches "${specName}" but has no explicit link to that spec.`,
            severity: 'info',
            file: relativePath,
            suggestion: `Consider adding a wiki-link [${specNameNoExt.replace(/-/g, ' ')}](./${specName}) in the relevant section.`,
          });
        }
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Detector 8: Duplicate Spec Entries
// ---------------------------------------------------------------------------

function detectDuplicateEntries(baseDir: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const specDir = path.join(baseDir, '.omp-flow', 'specs');

  if (!fs.existsSync(specDir)) return findings;

  const specFiles = listMdFiles(specDir).filter((f) => path.basename(f) !== 'index.md');

  // Collect all list items with their source file and line number
  interface ListItemEntry {
    file: string;
    line: number;
    text: string;
  }

  const allEntries: ListItemEntry[] = [];

  for (const file of specFiles) {
    const content = readFileSafe(file);
    const relativePath = path.relative(baseDir, file);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();
      const match = trimmed.match(/^[-*]\s+(.+)/);
      if (match) {
        const text = match[1]!.trim();
        if (text.length > 10) {
          allEntries.push({ file: relativePath, line: i + 1, text });
        }
      }
    }
  }

  // Compare every pair of entries for similarity
  const seen = new Set<string>();

  for (let i = 0; i < allEntries.length; i++) {
    const a = allEntries[i]!;
    const pairKey = `${a.file}:${a.line}`;
    if (seen.has(pairKey)) continue;

    for (let j = i + 1; j < allEntries.length; j++) {
      const b = allEntries[j]!;

      // Skip if they're on the same line (duplicate due to file listing)
      if (a.file === b.file && a.line === b.line) continue;

      const similarity = textSimilarity(a.text, b.text);

      if (similarity >= 0.8) {
        // Near-duplicate — high similarity
        findings.push({
          detectorId: DETECTORS.duplicateEntries.id,
          title: 'Duplicate or near-duplicate spec entry',
          description: `The entry "${a.text}" in ${a.file}:${a.line} is nearly identical to "${b.text}" in ${b.file}:${b.line} (${Math.round(similarity * 100)}% similar).`,
          severity: 'medium',
          file: a.file,
          lines: [a.line, b.line],
          suggestion: 'Consolidate the duplicate entries into a single canonical location and add cross-references where needed.',
        });
        seen.add(`${b.file}:${b.line}`);
      }
    }
  }

  // Also check for identical lines within a single file
  for (const file of specFiles) {
    const content = readFileSafe(file);
    const relativePath = path.relative(baseDir, file);
    const lines = content.split('\n');

    const lineTextMap = new Map<string, number[]>();

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const existing = lineTextMap.get(trimmed);
        if (existing) {
          existing.push(i + 1);
        } else {
          lineTextMap.set(trimmed, [i + 1]);
        }
      }
    }

    for (const [lineText, lineNums] of lineTextMap.entries()) {
      if (lineNums.length > 1) {
        findings.push({
          detectorId: DETECTORS.duplicateEntries.id,
          title: 'Repeated line in spec file',
          description: `The line "${lineText}" appears ${lineNums.length} times in ${relativePath} (lines ${lineNums.join(', ')}).`,
          severity: 'low',
          file: relativePath,
          lines: [lineNums[0]!, lineNums[lineNums.length - 1]!],
          suggestion: `Remove the duplicate occurrence(s) of this line, keeping only one copy.`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all 8 knowledge-audit detectors against the workspace.
 *
 * Scans `.omp-flow/specs/`, `.omp-flow/knowhow/`, `.omp-flow/scratch/`,
 * `.omp-flow/tasks/`, and `src/` directories to produce a comprehensive
 * audit report.
 *
 * @param options  Audit configuration (workspace dir, staleness threshold, etc.)
 * @returns        Aggregated audit report with per-detector findings
 */
export function runAudit(options?: AuditOptions): AuditReport {
  const workspaceDir = options?.workspaceDir ?? process.cwd();
  const staleDays = options?.staleDays ?? 7;
  const lightweight = options?.lightweight ?? false;

  const timestamp = new Date().toISOString();

  const allFindings: AuditFinding[] = [
    ...detectStaleSpecs(workspaceDir, staleDays),
    ...detectOrphanedKnowhow(workspaceDir),
    ...detectConflictingRules(workspaceDir),
    ...detectUnharvestedLearnings(workspaceDir),
    ...detectMissingSpecReferences(workspaceDir),
    ...detectOutdatedTimestamps(workspaceDir),
    ...detectUnlinkedWikiReferences(workspaceDir),
    ...detectDuplicateEntries(workspaceDir),
  ];

  // Group findings by detector
  const detectorMap = new Map<string, AuditFinding[]>();
  for (const finding of allFindings) {
    const existing = detectorMap.get(finding.detectorId);
    if (existing) {
      existing.push(finding);
    } else {
      detectorMap.set(finding.detectorId, [finding]);
    }
  }

  const detectors: DetectorReport[] = [];
  const summary: Record<string, number> = {};

  for (const [detectorId, detConfig] of Object.entries(DETECTORS)) {
    const config = detConfig as { id: string; name: string; description: string };
    const findingsForDetector = detectorMap.get(config.id) ?? [];
    detectors.push({
      detectorId: config.id,
      detectorName: config.name,
      description: config.description,
      findings: findingsForDetector,
      count: findingsForDetector.length,
    });
    summary[config.id] = findingsForDetector.length;
  }

  return {
    timestamp,
    workspaceDir,
    detectors,
    totalFindings: allFindings.length,
    summary,
  };
}
