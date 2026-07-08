import * as fs from 'fs';
import * as path from 'path';

/**
 * A single wiki-linked entry or spec-entry in the knowledge graph.
 */
export interface WikiNode {
  /** Unique identifier for this node (derived from the link name or spec-entry label). */
  id: string;
  /** Human-readable label (same as id in most cases). */
  label: string;
  /** Source file paths that define this entry. */
  sources: string[];
  /** Category assigned from <spec-entry category="...">, if any. */
  specCategory?: string;
  /** Scope assigned from <spec-entry scope="...">, if any. */
  specScope?: string;
  /** Raw body content extracted from a <spec-entry> block. */
  specContent?: string;
}

/**
 * A directed edge in the knowledge graph, representing an outgoing reference
 * from one node (source) to another (target).
 */
export interface WikiEdge {
  /** Source node ID (the page that contains the reference). */
  source: string;
  /** Target node ID (the page being referenced). */
  target: string;
  /** The file where this reference was found. */
  file: string;
}

/**
 * The complete in-memory knowledge graph.
 */
export interface WikiGraph {
  nodes: Map<string, WikiNode>;
  edges: WikiEdge[];
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
}

/**
 * Result of a wiki search query.
 */
export interface WikiSearchResult {
  node: WikiNode;
  /** Number of incoming references (a basic relevance signal). */
  inDegree: number;
  /** Number of outgoing references. */
  outDegree: number;
  /** Matching score (higher = more relevant). */
  score: number;
}

// ---- Internal state ----

let currentGraph: WikiGraph = { nodes: new Map(), edges: [], inDegree: new Map(), outDegree: new Map() };

// ---- Regex patterns ----

/**
 * Matches Obsidian-style wiki links: [[Page Name]] or [[Page Name|display text]].
 * Capture group 1 is the raw target (before any pipe).
 */
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

/**
 * Matches <spec-entry> blocks with category and scope attributes.
 * Capture groups: 1=category, 2=scope, 3=body content.
 */
const SPEC_ENTRY_RE = /<spec-entry\s+category="([^"]+)"\s+scope="([^"]+)"\s*>([\s\S]*?)<\/spec-entry>/g;



// ---- Graph construction ----

/**
 * Scan a single spec file for [[wiki-links]] and <spec-entry> blocks,
 * then update the provided graph in place.
 */
function scanFile(filePath: string, graph: WikiGraph): void {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    // Silently skip unreadable files.
    return;
  }

  const fileName = path.basename(filePath);

  // --- Scan wiki-links ---
  WIKI_LINK_RE.lastIndex = 0;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = WIKI_LINK_RE.exec(content)) !== null) {
    const rawTarget = linkMatch[1];
    const nodeId = rawTarget.trim().toLowerCase().replace(/\s+/g, '-');
    const label = rawTarget.trim();

    // Ensure the target node exists.
    if (!graph.nodes.has(nodeId)) {
      graph.nodes.set(nodeId, {
        id: nodeId,
        label,
        sources: [filePath],
      });
    }

    // Also create/ensure the "source" node for the current file.
    const sourceId = fileName.replace(/\.md$/i, '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!graph.nodes.has(sourceId)) {
      graph.nodes.set(sourceId, {
        id: sourceId,
        label: fileName.replace(/\.md$/i, ''),
        sources: [filePath],
      });
    }

    // Record the directed edge.
    graph.edges.push({ source: sourceId, target: nodeId, file: filePath });
  }

  // --- Scan spec-entries ---
  SPEC_ENTRY_RE.lastIndex = 0;
  let specMatch: RegExpExecArray | null;
  while ((specMatch = SPEC_ENTRY_RE.exec(content)) !== null) {
    const category = specMatch[1];
    const scope = specMatch[2];
    const body = specMatch[3].trim();

    const nodeId = `spec-entry:${category}:${scope}`;
    const label = `Spec Entry (${category}/${scope})`;

    if (graph.nodes.has(nodeId)) {
      const existing = graph.nodes.get(nodeId)!;
      if (!existing.sources.includes(filePath)) {
        existing.sources.push(filePath);
      }
    } else {
      graph.nodes.set(nodeId, {
        id: nodeId,
        label,
        sources: [filePath],
        specCategory: category,
        specScope: scope,
        specContent: body,
      });
    }
  }
}

// ---- Public API ----

/**
 * Rebuild the wiki index from all `.md` spec files under the given directory.
 *
 * @param specsDir - Path to the specs directory (defaults to `.omp-flow/specs` relative to cwd).
 * @returns The newly built `WikiGraph`.
 */
export function refreshIndex(specsDir?: string): WikiGraph {
  const dir = specsDir ?? path.join(process.cwd(), '.omp-flow', 'specs');

  const graph: WikiGraph = { nodes: new Map(), edges: [], inDegree: new Map(), outDegree: new Map() };

  if (!fs.existsSync(dir)) {
    currentGraph = graph;
    return graph;
  }

  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    scanFile(path.join(dir, entry), graph);
  }
  for (const edge of graph.edges) {
    graph.outDegree.set(edge.source, (graph.outDegree.get(edge.source) ?? 0) + 1);
    graph.inDegree.set(edge.target, (graph.inDegree.get(edge.target) ?? 0) + 1);
  }

  currentGraph = graph;
  return graph;
}

/**
 * Return the current in-memory knowledge graph.
 * If no index has been built yet, runs `refreshIndex` first (lazy init).
 */
export function getGraph(): WikiGraph {
  if (
    currentGraph.nodes.size === 0 &&
    currentGraph.edges.length === 0 &&
    currentGraph.inDegree.size === 0 &&
    currentGraph.outDegree.size === 0
  ) {
    return refreshIndex();
  }
  return currentGraph;
}

/**
 * Search the wiki graph by query string.
 *
 * Matches node labels and spec content using simple substring / case-insensitive
 * comparison. Results are sorted by a relevance score that rewards
 * in-degree (how many other pages reference a node) and direct label matches.
 *
 * @param query - The search string.
 * @param limit - Maximum number of results (default 20).
 * @returns An array of search results sorted by descending score.
 */
export function searchWiki(query: string, limit: number = 20): WikiSearchResult[] {
  const graph = getGraph();
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: WikiSearchResult[] = [];

  for (const node of graph.nodes.values()) {
    const labelMatch = node.label.toLowerCase().includes(q);
    const contentMatch = node.specContent?.toLowerCase().includes(q) ?? false;
    const categoryMatch = node.specCategory?.toLowerCase().includes(q) ?? false;
    const scopeMatch = node.specScope?.toLowerCase().includes(q) ?? false;

    if (!labelMatch && !contentMatch && !categoryMatch && !scopeMatch) continue;

    const inDegree = graph.inDegree.get(node.id) ?? 0;
    const outDegree = graph.outDegree.get(node.id) ?? 0;

    // Score: label matches are strongest, then content, then metadata.
    let score = 0;
    if (labelMatch) score += 10;
    if (contentMatch) score += 5;
    if (categoryMatch) score += 3;
    if (scopeMatch) score += 2;
    // Boost by incoming references (popularity signal).
    score += Math.min(inDegree, 10);

    results.push({ node, inDegree, outDegree, score });
  }

  // Sort descending by score.
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}
