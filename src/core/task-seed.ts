import * as fs from 'fs';
import * as path from 'path';

const REFERENCE_README_CONTENT = `# Reference Directory

This directory stores digested code slices from Tier 1 reference repos.
Files are populated by omp_flow_reference / ReferenceDigester after research identifies useful source anchors.

Do not use this directory for general research notes. Put investigation reports in ../research/.`;

const RESEARCH_README_CONTENT = `# Research Directory

This directory stores investigation reports, comparisons, open questions, and candidate approaches.

Use reference/ only for digested Tier 2 slices with sourceRepo/sourcePath/sourceLines provenance.`;

/**
 * Result of creating a task seed directory.
 */
export interface TaskSeedResult {
  /** Absolute path to the created task directory. */
  taskDir: string;
  /** Relative filenames created inside the task directory. */
  filesCreated: string[];
}

export interface TaskSeedOptions {
  /** Generate a more complex skeleton with extended stubs (default: false). */
  complex?: boolean;
  /** Override the base workspace directory (default: process.cwd()). */
  workspaceDir?: string;
}

function writeFileSync(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function writeFileIfMissing(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath)) {
    return false;
  }
  writeFileSync(filePath, content);
  return true;
}

function generateTaskJson(slug: string): string {
  const task = {
    id: slug,
    title: slug,
    status: 'planning',
    createdAt: new Date().toISOString(),
    meta: {},
  };
  return JSON.stringify(task, null, 2) + '\n';
}

function generatePrdMd(slug: string): string {
  return `# PRD: ${slug}

## Goal

<!-- What problem does this task solve? -->

## Requirements

<!-- Functional and non-functional requirements go here. -->

- [ ] Requirement 1
- [ ] Requirement 2

## Boundary Contract

### In Scope

- <!-- Items this task owns. -->

### Out of Scope

- <!-- Items explicitly deferred. -->

### Done When

- <!-- Measurable completion criteria. -->

## Acceptance Criteria

<!-- _Given_ / _When_ / _Then_ scenarios. -->

`;
}

function generateBrainstormMd(slug: string): string {
  return `# Brainstorm: ${slug}

## Raw Direction

<!-- Capture messy user intent, alternatives, constraints, and unresolved questions. -->

## Candidate Angles

- <!-- Possible direction 1 -->
- <!-- Possible direction 2 -->

## Convergence Notes

<!-- Record the narrowed direction before Research Gate or architecture. -->

`;
}

function generateGuidanceSpecificationMd(slug: string): string {
  return `# Guidance Specification: ${slug}

## Operating Philosophy

- 没有调查就没有发言权。
- 调查优于设计，设计优于实现。

## Research Gate

<!-- State whether internal/external research is required, completed, or explicitly skipped with justification. -->

## Reference Candidates

<!-- User-specified or discovered Tier 1 repositories/projects to inspect. -->

## Design Constraints

<!-- Constraints that Architect must preserve when drafting PRD/design/tasks.csv. -->

`;
}

function generateDesignMd(slug: string): string {
  return `# Design: ${slug}

## Architecture & Core Modules

<!-- Describe the high-level architecture and modules involved. -->

## Relevant Context Files

<!-- List files this task touches or reads. -->

## Key Decisions

<!-- Record trade-offs and rationale. -->

`;
}


/**
 * Create a task seed directory with skeleton files.
 *
 * Generates a task folder containing:
 * - `task.json`       — minimal task metadata
 * - `prd.md`          — skeleton product requirements document
 * - `design.md`       — skeleton design document
 * - `tasks.csv`       — header-only task breakdown CSV
 *
 * @param slug   Unique task identifier (used as the directory name and default title).
 * @param options - Optional settings.
 * @returns The result describing the created directory and files.
 */
export function createTaskSeed(slug: string, options?: TaskSeedOptions): TaskSeedResult {
  const workspaceDir = options?.workspaceDir ?? process.cwd();
  const taskSlug = slug;
  const taskDir = path.resolve(workspaceDir, '.omp-flow', 'tasks', taskSlug);

  const files: Record<string, string> = {
    'task.json': generateTaskJson(taskSlug),
    'brainstorm.md': generateBrainstormMd(taskSlug),
    'guidance-specification.md': generateGuidanceSpecificationMd(taskSlug),
    'prd.md': generatePrdMd(taskSlug),
    'design.md': generateDesignMd(taskSlug),
    'tasks.csv': 'id,wave,priority,title,scope,action,reference,context,status,tier,taskMd\n',
    'evidence.csv': 'rowId,verdict,tests_run,tests_failed,evidence,reviewer_agent_id,phase,timestamp,artifact\n',
  };

  const contextDir = path.join(taskDir, 'context');
  const contextSubdirectories = ['brief', 'interface', 'decision', 'finding'] as const;
  const referenceDir = path.join(taskDir, 'reference');
  const researchDir = path.join(taskDir, 'research');
  const taskBriefDir = path.join(taskDir, '.task');
  const summariesDir = path.join(taskDir, '.summaries');

  const filesCreated: string[] = [];

  for (const [fileName, content] of Object.entries(files)) {
    const filePath = path.join(taskDir, fileName);
    writeFileSync(filePath, content);
    filesCreated.push(fileName);
  }

  fs.mkdirSync(contextDir, { recursive: true });
  for (const subdir of contextSubdirectories) {
    fs.mkdirSync(path.join(contextDir, subdir), { recursive: true });
  }
  writeFileSync(path.join(contextDir, 'index.json'), '{"version":"1.0.0","entries":[]}');
  fs.mkdirSync(researchDir, { recursive: true });
  writeFileSync(path.join(researchDir, 'README.md'), RESEARCH_README_CONTENT);
  fs.mkdirSync(referenceDir, { recursive: true });
  writeFileSync(path.join(referenceDir, 'README.md'), REFERENCE_README_CONTENT);
  fs.mkdirSync(taskBriefDir, { recursive: true });
  fs.mkdirSync(summariesDir, { recursive: true });
  filesCreated.push(
    'context/',
    'context/brief/',
    'context/interface/',
    'context/decision/',
    'context/finding/',
    'context/index.json',
    'research/',
    'research/README.md',
    'reference/',
    'reference/README.md',
    '.task/',
    '.summaries/'
  );

  return { taskDir, filesCreated };
}

/**
 * Ensure a task seed exists without overwriting user-authored planning files.
 */
export function ensureTaskSeed(slug: string, options?: TaskSeedOptions): TaskSeedResult {
  const workspaceDir = options?.workspaceDir ?? process.cwd();
  const taskSlug = slug;
  const taskDir = path.resolve(workspaceDir, '.omp-flow', 'tasks', taskSlug);

  const files: Record<string, string> = {
    'task.json': generateTaskJson(taskSlug),
    'brainstorm.md': generateBrainstormMd(taskSlug),
    'guidance-specification.md': generateGuidanceSpecificationMd(taskSlug),
    'prd.md': generatePrdMd(taskSlug),
    'design.md': generateDesignMd(taskSlug),
    'tasks.csv': 'id,wave,priority,title,scope,action,reference,context,status,tier,taskMd\n',
    'evidence.csv': 'rowId,verdict,tests_run,tests_failed,evidence,reviewer_agent_id,phase,timestamp,artifact\n',
  };

  const filesCreated: string[] = [];
  for (const [fileName, content] of Object.entries(files)) {
    if (writeFileIfMissing(path.join(taskDir, fileName), content)) {
      filesCreated.push(fileName);
    }
  }

  const contextDir = path.join(taskDir, 'context');
  const contextSubdirectories = ['brief', 'interface', 'decision', 'finding'] as const;
  fs.mkdirSync(contextDir, { recursive: true });
  for (const subdir of contextSubdirectories) {
    const relativePath = `context/${subdir}/`;
    const target = path.join(contextDir, subdir);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
      filesCreated.push(relativePath);
    }
  }
  if (writeFileIfMissing(path.join(contextDir, 'index.json'), '{"version":"1.0.0","entries":[]}')) {
    filesCreated.push('context/index.json');
  }

  const researchDir = path.join(taskDir, 'research');
  if (!fs.existsSync(researchDir)) {
    fs.mkdirSync(researchDir, { recursive: true });
    filesCreated.push('research/');
  }
  if (writeFileIfMissing(path.join(researchDir, 'README.md'), RESEARCH_README_CONTENT)) {
    filesCreated.push('research/README.md');
  }

  const referenceDir = path.join(taskDir, 'reference');
  if (!fs.existsSync(referenceDir)) {
    fs.mkdirSync(referenceDir, { recursive: true });
    filesCreated.push('reference/');
  }
  if (writeFileIfMissing(path.join(referenceDir, 'README.md'), REFERENCE_README_CONTENT)) {
    filesCreated.push('reference/README.md');
  }

  for (const relativeDir of ['.task', '.summaries']) {
    const target = path.join(taskDir, relativeDir);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
      filesCreated.push(`${relativeDir}/`);
    }
  }

  return { taskDir, filesCreated };
}
