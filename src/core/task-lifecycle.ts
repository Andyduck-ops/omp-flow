import * as fs from 'fs';
import * as path from 'path';

import { auditTaskPlan } from './qbd-advisor.js';
import { HarvestManager } from './harvest.js';
import { UnifiedWorkspaceManager, type TaskRecord } from './state.js';
import { createTaskSeed, ensureTaskSeed, type TaskSeedResult } from './task-seed.js';

export interface CreateTaskLifecycleOptions {
  workspaceDir?: string;
  title: string;
  slug?: string;
  parentId?: string;
  now?: Date;
}

export interface CreateTaskLifecycleResult {
  taskId: string;
  title: string;
  parentId?: string;
  taskDir: string;
  filesCreated: string[];
  qbd: Awaited<ReturnType<typeof auditTaskPlan>>;
}

export interface FinishTaskLifecycleResult {
  taskId: string;
  syncResult: ReturnType<HarvestManager['syncSpecsBeforeCommit']>;
  harvestResult: ReturnType<HarvestManager['harvestLearnings']>;
  archivedTo?: string;
  journalPath: string;
}

export interface EnsurePlanSeedResult extends TaskSeedResult {
  taskId: string;
}

export function buildTaskId(title: string, slug: string | undefined, now = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const slugBase = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${mm}-${dd}-${slugBase || 'untitled-task'}`;
}

export function ensurePlanningSeed(taskId: string, workspaceDir = process.cwd()): EnsurePlanSeedResult {
  const seed = ensureTaskSeed(taskId, { workspaceDir });
  return { ...seed, taskId };
}

export async function createTaskLifecycle(options: CreateTaskLifecycleOptions): Promise<CreateTaskLifecycleResult> {
  const workspaceDir = options.workspaceDir ?? process.cwd();
  const title = options.title || 'Untitled Task';
  const taskId = buildTaskId(title, options.slug, options.now);
  const stateMgr = new UnifiedWorkspaceManager(workspaceDir);

  stateMgr.initWorkspace();
  stateMgr.createTask(taskId, title, options.parentId);
  const seed = createTaskSeed(taskId, { workspaceDir });

  const qbd = await auditTaskPlan(taskId, workspaceDir);
  stateMgr.setActiveTask(taskId);

  return {
    taskId,
    title,
    parentId: options.parentId,
    taskDir: seed.taskDir,
    filesCreated: seed.filesCreated,
    qbd,
  };
}

export function startTaskLifecycle(taskId: string, workspaceDir = process.cwd()): TaskRecord | null {
  const stateMgr = new UnifiedWorkspaceManager(workspaceDir);
  stateMgr.setActiveTask(taskId);
  return stateMgr.transitionTask(taskId, 'in_progress');
}

export function finishTaskLifecycle(taskId: string, workspaceDir = process.cwd()): FinishTaskLifecycleResult {
  const stateMgr = new UnifiedWorkspaceManager(workspaceDir);
  const harvester = new HarvestManager(workspaceDir);
  const syncResult = harvester.syncSpecsBeforeCommit();
  const harvestResult = harvester.harvestLearnings();
  harvester.commitSpecState();

  stateMgr.transitionTask(taskId, 'completed');

  let archivedTo: string | undefined;
  try {
    archivedTo = stateMgr.archiveTask(taskId).archivedTo;
  } catch {
    archivedTo = undefined;
  }

  const journalDir = path.join(workspaceDir, '.omp-flow', 'workspace');
  fs.mkdirSync(journalDir, { recursive: true });
  const journalFiles = fs.existsSync(journalDir)
    ? fs.readdirSync(journalDir).filter((fileName) => fileName.startsWith('journal-')).sort()
    : [];
  const lastIdx = journalFiles.length > 0
    ? parseInt(journalFiles[journalFiles.length - 1]!.replace('journal-', '').replace('.md', ''), 10) || 1
    : 0;
  const journalPath = path.join(journalDir, `journal-${lastIdx + 1}.md`);
  const journalEntry = [
    `# Journal Entry - ${taskId}`,
    `**Date**: ${new Date().toISOString()}`,
    '**Status**: completed',
    `**Specs**: ${syncResult.totalSpecs} total (${syncResult.isDirty ? 'dirty' : 'clean'})`,
    `**Harvest**: ${harvestResult.harvestedCount} gotchas, ${harvestResult.findingsCount} findings`,
    `**Archive**: ${archivedTo ?? '(skipped)'}`,
    '',
    '## Summary',
    `Completed task ${taskId}.`,
    '',
  ].join('\n');
  fs.writeFileSync(journalPath, journalEntry, 'utf-8');

  return { taskId, syncResult, harvestResult, archivedTo, journalPath };
}

export function archiveTaskLifecycle(taskId: string, workspaceDir = process.cwd()): { archivedTo: string } {
  return new UnifiedWorkspaceManager(workspaceDir).archiveTask(taskId);
}
