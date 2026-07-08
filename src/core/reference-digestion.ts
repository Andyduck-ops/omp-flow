import * as fs from 'fs';
import * as path from 'path';

export interface DigestedReference {
  slug: string;
  sourceRepo: string;
  sourcePath: string;
  sourceLines: string;
  extractedAt: string;
  summary: string;
  intent?: string;
  complianceHints?: string[];
}

export class ReferenceDigester {
  private workspaceDir: string;

  constructor(workspaceDir: string = process.cwd()) {
    this.workspaceDir = workspaceDir;
  }

  public digestFile(
    parentTaskId: string,
    sourceRepo: string,
    sourcePath: string,
    lineRange?: { start: number; end: number },
    summary?: string,
    intent?: string,
    complianceHints?: string[]
  ): DigestedReference {
    const sourceRoot = path.resolve(this.workspaceDir, sourceRepo);
    const absoluteSourcePath = path.resolve(sourceRoot, sourcePath);
    if (!fs.existsSync(absoluteSourcePath) || !fs.statSync(absoluteSourcePath).isFile()) {
      throw new Error(`Reference source file not found: ${absoluteSourcePath}`);
    }

    const relativeSourcePath = path.relative(sourceRoot, absoluteSourcePath).split(path.sep).join('/');
    const referenceDir = path.join(this.workspaceDir, '.omp-flow', 'tasks', parentTaskId, 'reference');
    fs.mkdirSync(referenceDir, { recursive: true });

    const repoPart = sourceRepo
      .split(/[\\/]+/)
      .filter((segment) => segment.length > 0)
      .join('-');
    const filePart = relativeSourcePath.replace(/\.[^.]+$/, '').split('/').join('-');
    const slug = `${repoPart}-${filePart}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'reference';
    const extension = path.extname(absoluteSourcePath);
    const digestedPath = path.join(referenceDir, `${slug}${extension}`);
    const metaPath = path.join(referenceDir, `${slug}.meta.json`);

    const content = fs.readFileSync(absoluteSourcePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const start = lineRange ? Math.max(1, Math.floor(lineRange.start)) : 1;
    const end = lineRange ? Math.max(start, Math.floor(lineRange.end)) : lines.length;
    const sourceLines = lineRange ? `L${start}-${end}` : 'full';
    const selectedContent = lineRange ? lines.slice(start - 1, end).join('\n') : content;
    fs.writeFileSync(digestedPath, selectedContent, 'utf-8');

    const metadata: DigestedReference = {
      slug,
      sourceRepo,
      sourcePath: relativeSourcePath,
      sourceLines,
      extractedAt: new Date().toISOString(),
      summary: summary?.trim() || `Digested from ${sourceRepo}/${relativeSourcePath}${lineRange ? ` (${sourceLines})` : ''}`,
      intent,
      complianceHints,
    };
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
    return metadata;
  }

  public digestRepo(parentTaskId: string, sourceRepo: string, filePattern?: string): DigestedReference[] {
    const sourceRoot = path.resolve(this.workspaceDir, sourceRepo);
    if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
      throw new Error(`Reference repo not found: ${sourceRoot}`);
    }

    const pattern = filePattern?.trim();
    const matcher = !pattern
      ? null
      : new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$$`, 'i');
    const digested: DigestedReference[] = [];

    const walk = (dirPath: string): void => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }

        const relativePath = path.relative(sourceRoot, fullPath).split(path.sep).join('/');
        if (matcher && !matcher.test(relativePath)) {
          continue;
        }

        digested.push(
          this.digestFile(
            parentTaskId,
            sourceRepo,
            relativePath,
            undefined,
            `Digest of ${relativePath} from ${sourceRepo}`,
          ),
        );
      }
    };

    walk(sourceRoot);
    return digested;
  }

  public listDigested(parentTaskId: string): DigestedReference[] {
    const referenceDir = path.join(this.workspaceDir, '.omp-flow', 'tasks', parentTaskId, 'reference');
    if (!fs.existsSync(referenceDir) || !fs.statSync(referenceDir).isDirectory()) {
      return [];
    }

    const entries = fs.readdirSync(referenceDir)
      .filter((name) => name.endsWith('.meta.json'))
      .sort((left, right) => left.localeCompare(right));

    const results: DigestedReference[] = [];
    for (const entry of entries) {
      const fullPath = path.join(referenceDir, entry);
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Partial<DigestedReference>;
        if (this.isDigestedReference(parsed)) {
          results.push(parsed);
        }
      } catch {
        // Skip unreadable metadata
      }
    }

    return results;
  }

  public renderReferencesBlock(refs: string, parentTaskId: string): string {
    const referenceDir = path.join(this.workspaceDir, '.omp-flow', 'tasks', parentTaskId, 'reference');
    if (!refs.trim() || !fs.existsSync(referenceDir) || !fs.statSync(referenceDir).isDirectory()) {
      return '';
    }

    const rendered: string[] = [];
    for (const spec of refs.split(';').map((value) => value.trim()).filter((value) => value.length > 0)) {
      const match = /^ref:([^#]+?)(?:#L(\d+)(?:-(\d+))?)?$/i.exec(spec);
      const slug = match?.[1]?.trim();
      if (!slug) {
        continue;
      }

      const metaPath = path.join(referenceDir, `${slug}.meta.json`);
      if (!fs.existsSync(metaPath) || !fs.statSync(metaPath).isFile()) {
        continue;
      }

      let metadata: Partial<DigestedReference>;
      try {
        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Partial<DigestedReference>;
      } catch {
        continue;
      }
      if (!this.isDigestedReference(metadata)) {
        continue;
      }

      const fileName = fs.readdirSync(referenceDir).find((entry) => entry.startsWith(`${slug}.`) && entry !== `${slug}.meta.json`);
      if (!fileName) {
        continue;
      }

      const start = match?.[2] ? Number.parseInt(match[2], 10) : undefined;
      const end = match?.[3] ? Number.parseInt(match[3], 10) : start;
      try {
        const content = fs.readFileSync(path.join(referenceDir, fileName), 'utf-8');
        const lines = content.split(/\r?\n/);
        const selectedContent = start === undefined
          ? content
          : lines.slice(Math.max(1, start) - 1, Math.max(Math.max(1, start), end ?? start)).join('\n');
        const sourceLines = start === undefined
          ? metadata.sourceLines
          : `L${Math.max(1, start)}-${Math.max(Math.max(1, start), end ?? start)}`;
        rendered.push(
          `<reference slug="${this.escapeXml(metadata.slug)}" sourceRepo="${this.escapeXml(metadata.sourceRepo)}" sourcePath="${this.escapeXml(metadata.sourcePath)}" sourceLines="${this.escapeXml(sourceLines)}" extractedAt="${this.escapeXml(metadata.extractedAt)}" summary="${this.escapeXml(metadata.summary)}">\n${this.escapeXml(selectedContent)}\n</reference>`,
        );
      } catch {
        // Skip unreadable digested references
      }
    }

    if (rendered.length === 0) {
      return '';
    }
    return `<omp-flow-references>\n${rendered.join('\n')}\n</omp-flow-references>`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private isDigestedReference(value: Partial<DigestedReference> | null | undefined): value is DigestedReference {
    return !!value
      && typeof value.slug === 'string'
      && typeof value.sourceRepo === 'string'
      && typeof value.sourcePath === 'string'
      && typeof value.sourceLines === 'string'
      && typeof value.extractedAt === 'string'
      && typeof value.summary === 'string';
  }
}
