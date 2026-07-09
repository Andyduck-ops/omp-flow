import { ReferenceDigester } from '../core/reference-digestion.js';
import { readActiveTaskId } from './active-task.js';

type ReferenceToolAction = 'digest_file' | 'digest_repo' | 'list' | 'render';

type ReferenceToolParams = {
  action: ReferenceToolAction;
  taskId?: string;
  sourceRepo?: string;
  sourcePath?: string;
  lineStart?: number;
  lineEnd?: number;
  filePattern?: string;
  summary?: string;
  intent?: string;
  complianceHints?: string[];
  refs?: string;
};

type ToolContent = { type: 'text'; text: string };

type ToolResponse = { content: ToolContent[] };

function jsonResponse(value: unknown): ToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function requireString(value: string | undefined, fieldName: string): string {
  if (!value || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function resolveTaskId(workspaceDir: string, input: ReferenceToolParams): string {
  const explicit = input.taskId?.trim();
  if (explicit) {
    return explicit;
  }

  const active = readActiveTaskId(workspaceDir);
  if (!active) {
    throw new Error('taskId is required because no active omp-flow task is set');
  }
  return active;
}

function resolveLineRange(input: ReferenceToolParams): { start: number; end: number } | undefined {
  const start = input.lineStart;
  const end = input.lineEnd;
  if (start === undefined && end === undefined) {
    return undefined;
  }
  if (typeof start !== 'number' || typeof end !== 'number') {
    throw new Error('lineStart and lineEnd must be provided together');
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
    throw new Error('lineStart/lineEnd must be a valid 1-based inclusive range');
  }
  return { start, end };
}

export function createReferenceTool(workspaceDir: string) {
  return {
    name: 'omp_flow_reference',
    label: 'OMP-Flow Reference Digestion',
    defaultInactive: true,
    description: 'Digest Tier 1 reference repository files into task-local Tier 2 reference slices, list digests, or render ref: blocks.',
    promptSnippet: 'Use omp_flow_reference after Research Gate to turn selected Tier 1 source anchors into task-local ref: slices for tasks.csv.',
    promptGuidelines: [
      'Use digest_file for precise source anchors from reference/<repo> or other workspace-relative Tier 1 sources.',
      'Use list to discover available task-local ref: slugs before writing tasks.csv reference entries.',
      'Use render to preview the exact <omp-flow-references> block that a CSV ref: entry will inject.',
      'Do not put general research notes in reference/; write research reports to research/ and only digest reusable source slices here.',
    ],
    parameters: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['digest_file', 'digest_repo', 'list', 'render'], description: 'Reference operation' },
        taskId: { type: 'string', description: 'Task workspace ID; defaults to active task' },
        sourceRepo: { type: 'string', description: 'Workspace-relative Tier 1 repo/root, e.g. reference/superpowers' },
        sourcePath: { type: 'string', description: 'Path inside sourceRepo for digest_file' },
        lineStart: { type: 'number', description: 'Optional 1-based inclusive start line for digest_file' },
        lineEnd: { type: 'number', description: 'Optional 1-based inclusive end line for digest_file' },
        filePattern: { type: 'string', description: 'Optional glob-like path pattern for digest_repo' },
        summary: { type: 'string', description: 'Short summary stored in metadata' },
        intent: { type: 'string', description: 'Why this reference matters to downstream agents' },
        complianceHints: { type: 'array', items: { type: 'string' }, description: 'MUST/MUST NOT hints inferred from this reference' },
        refs: { type: 'string', description: 'Semicolon-delimited ref specs, e.g. ref:slug#L1-20;ref:other' },
      },
      required: ['action'],
    },
    async execute(_toolCallId: string, input: ReferenceToolParams): Promise<ToolResponse> {
      try {
        const taskId = resolveTaskId(workspaceDir, input);
        const digester = new ReferenceDigester(workspaceDir);

        if (input.action === 'digest_file') {
          const sourceRepo = requireString(input.sourceRepo, 'sourceRepo');
          const sourcePath = requireString(input.sourcePath, 'sourcePath');
          const reference = digester.digestFile(
            taskId,
            sourceRepo,
            sourcePath,
            resolveLineRange(input),
            input.summary,
            input.intent,
            input.complianceHints,
          );
          return jsonResponse({ ok: true, action: input.action, taskId, reference, ref: `ref:${reference.slug}` });
        }

        if (input.action === 'digest_repo') {
          const sourceRepo = requireString(input.sourceRepo, 'sourceRepo');
          const references = digester.digestRepo(taskId, sourceRepo, input.filePattern);
          return jsonResponse({
            ok: true,
            action: input.action,
            taskId,
            count: references.length,
            references,
            refs: references.map((reference) => `ref:${reference.slug}`),
          });
        }

        if (input.action === 'list') {
          const references = digester.listDigested(taskId);
          return jsonResponse({
            ok: true,
            action: input.action,
            taskId,
            count: references.length,
            references,
            refs: references.map((reference) => `ref:${reference.slug}`),
          });
        }

        if (input.action === 'render') {
          const refs = requireString(input.refs, 'refs');
          return jsonResponse({
            ok: true,
            action: input.action,
            taskId,
            refs,
            block: digester.renderReferencesBlock(refs, taskId),
          });
        }

        return jsonResponse({ ok: false, action: input.action, error: 'Unknown action' });
      } catch (error) {
        return jsonResponse({ ok: false, action: input.action, error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
