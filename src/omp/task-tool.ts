import { UnifiedWorkspaceManager } from '../core/state.js';
import { archiveTaskLifecycle, createTaskLifecycle, finishTaskLifecycle, startTaskLifecycle } from '../core/task-lifecycle.js';
import { deployInitResources } from '../cli/init.js';

type TaskToolAction = 'init' | 'create' | 'start' | 'finish' | 'archive' | 'list' | 'status';

type TaskToolParams = {
  action: TaskToolAction;
  taskId?: string;
  title?: string;
  slug?: string;
  parentId?: string;
  dryRun?: boolean;
  force?: boolean;
  skipExisting?: boolean;
};

type ToolContent = { type: 'text'; text: string };

type ToolResponse = { content: ToolContent[] };

function jsonResponse(value: unknown): ToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function requireTaskId(input: TaskToolParams): string {
  if (!input.taskId) {
    throw new Error(`taskId is required for action=${input.action}`);
  }
  return input.taskId;
}

export function createTaskTool(workspaceDir: string) {
  return {
    name: 'omp_flow_task',
    label: 'OMP-Flow Task Lifecycle',
    defaultInactive: true,
    description: 'Manage omp-flow lifecycle state through host APIs: init, create, start, finish, archive, list, and status.',
    promptSnippet: 'Use omp_flow_task for omp-flow init/task lifecycle operations. Do not use bash for omp-flow lifecycle commands.',
    promptGuidelines: [
      'Use omp_flow_task(action="init") to deploy .omp agents, settings, and .omp-flow templates.',
      'Use omp_flow_task(action="create", title="...") to create a seeded task directory.',
      'Use omp_flow_task(action="finish", taskId="...") to harvest, archive, and journal a completed task.',
    ],
    parameters: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['init', 'create', 'start', 'finish', 'archive', 'list', 'status'], description: 'Lifecycle operation' },
        taskId: { type: 'string', description: 'Task ID for start, finish, archive, or status context' },
        title: { type: 'string', description: 'Task title for create' },
        slug: { type: 'string', description: 'Optional slug for create' },
        parentId: { type: 'string', description: 'Optional parent task ID for create' },
        dryRun: { type: 'boolean', description: 'For init: show deployment actions without copying files' },
        force: { type: 'boolean', description: 'For init: overwrite managed resources' },
        skipExisting: { type: 'boolean', description: 'For init: skip existing managed resources' },
      },
      required: ['action'],
    },
    async execute(_toolCallId: string, input: TaskToolParams): Promise<ToolResponse> {
      try {
        const stateMgr = new UnifiedWorkspaceManager(workspaceDir);

        if (input.action === 'init') {
          stateMgr.initWorkspace();
          const plan = deployInitResources({
            cwd: workspaceDir,
            dryRun: input.dryRun,
            force: input.force,
            skipExisting: input.skipExisting,
          });
          return jsonResponse({ ok: true, action: input.action, plan });
        }

        if (input.action === 'create') {
          const result = await createTaskLifecycle({
            workspaceDir,
            title: input.title || 'Untitled Task',
            slug: input.slug,
            parentId: input.parentId,
          });
          return jsonResponse({ ok: true, action: input.action, ...result });
        }

        if (input.action === 'start') {
          const taskId = requireTaskId(input);
          const record = startTaskLifecycle(taskId, workspaceDir);
          return jsonResponse({ ok: record !== null, action: input.action, taskId, record });
        }

        if (input.action === 'finish') {
          const taskId = requireTaskId(input);
          const result = finishTaskLifecycle(taskId, workspaceDir);
          return jsonResponse({ ok: true, action: input.action, ...result });
        }

        if (input.action === 'archive') {
          const taskId = requireTaskId(input);
          const result = archiveTaskLifecycle(taskId, workspaceDir);
          return jsonResponse({ ok: true, action: input.action, taskId, ...result });
        }

        if (input.action === 'list') {
          return jsonResponse({ ok: true, action: input.action, tasks: stateMgr.listTaskTree() });
        }

        if (input.action === 'status') {
          return jsonResponse({ ok: true, action: input.action, state: stateMgr.getUnifiedState(), tasks: stateMgr.listTaskTree() });
        }

        return jsonResponse({ ok: false, action: input.action, error: 'Unknown action' });
      } catch (error) {
        return jsonResponse({ ok: false, action: input.action, error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
