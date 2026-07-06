import { UnifiedWorkspaceManager } from '../core/state.js';
import { RalphFSMEngine } from '../core/fsm.js';
import { ContextPackageBuilder } from '../core/context-package.js';
import { executeMaestroState } from '../tools/state-tool.js';
import { executeMaestroSpecSearch } from '../tools/spec-search-tool.js';
import { executeMaestroBoundaryCheck } from '../tools/drift-check-tool.js';

export * from './state-tool.js';
export * from './spec-search-tool.js';
export * from './drift-check-tool.js';

export const OMP_FLOW_TOOLS = [
  {
    name: 'omp_flow_state',
    description: 'Get or update unified Trellis/.workflow state and Ralph FSM step status.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'update_phase', 'advance_step', 'complete_step', 'create_session'] },
        phase: { type: 'string' },
        milestone: { type: 'string' },
        stepIdx: { type: 'number' },
        status: { type: 'string', enum: ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_RETRY', 'BLOCKED'] },
        summary: { type: 'string' },
        sessionId: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'omp_flow_spec_search',
    description: 'Search project specs, knowhow recipes, and Trellis specifications.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword or rule pattern to search' },
      },
      required: ['query'],
    },
  },
  {
    name: 'omp_flow_boundary_check',
    description: 'Check modified files for boundary drift against task context package.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        modifiedFiles: { type: 'array', items: { type: 'string' } },
      },
      required: ['taskId', 'modifiedFiles'],
    },
  },
];
