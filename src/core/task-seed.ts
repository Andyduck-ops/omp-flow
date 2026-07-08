import * as fs from 'fs';
import * as path from 'path';

const REFERENCE_README_CONTENT = `# Reference Directory

This directory stores digested code slices from Tier 1 reference repos.
Files are populated by omp-flow-researcher via ReferenceDigester.digestFile().`;

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
    'prd.md': generatePrdMd(taskSlug),
    'design.md': generateDesignMd(taskSlug),
    'tasks.csv': 'id,wave,priority,title,scope,action,reference,context,status,tier,taskMd\n',
  };

  const contextDir = path.join(taskDir, 'context');
  const contextSubdirectories = ['brief', 'interface', 'decision', 'finding'] as const;
  const referenceDir = path.join(taskDir, 'reference');

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
  fs.mkdirSync(referenceDir, { recursive: true });
  writeFileSync(path.join(referenceDir, 'README.md'), REFERENCE_README_CONTENT);
  filesCreated.push(
    'context/',
    'context/brief/',
    'context/interface/',
    'context/decision/',
    'context/finding/',
    'context/index.json',
    'reference/',
    'reference/README.md'
  );

  return { taskDir, filesCreated };
}
