import { OMPFlowExtension, type OMPHookContext } from './extension.js';
import { RalphFSMEngine, type CompletionStatus } from '../core/fsm.js';
import { createDispatchTool, loadAgentDefinition } from './dispatch-tool.js';
import { createVerdictTool } from './verdict-tool.js';

type OMPToolContent = { type: 'text'; text: string };

type OMPToolResponse = {
  content: OMPToolContent[];
};

type OMPFlowExecuteParams = {
  action: 'advance' | 'complete' | 'status';
  stepIndex?: number;
  completionStatus?: CompletionStatus;
  summary?: string;
};

type SessionIdContext = OMPHookContext & {
  sessionManager?: { getSessionId?: () => string | null };
};
type SystemPromptContext = SessionIdContext & {
  getSystemPrompt?: () => string | string[];
};

const ROLE_HEADING = /^#\s+(Executor|Reviewer|Architect|Qbd-Auditor|Explore|Planner|Oracle|Researcher)\s+Agent\b/im;

const ROLE_SLUGS: Record<string, string> = {
  executor: 'executor',
  reviewer: 'reviewer',
  architect: 'architect',
  'qbd-auditor': 'qbd-auditor',
  explore: 'explore',
  planner: 'planner',
  oracle: 'oracle',
  researcher: 'researcher',
};

function getSystemPromptText(ctx: SystemPromptContext): string {
  const prompt = ctx.getSystemPrompt?.();
  if (Array.isArray(prompt)) {
    return prompt.join('\n');
  }
  return prompt ?? '';
}

async function pruneChildSessionTools(pi: ExtensionAPI, ctx: SystemPromptContext, workspaceDir: string): Promise<boolean> {
  if (!pi.setActiveTools || !ctx.getSystemPrompt) {
    return false;
  }

  const match = getSystemPromptText(ctx).match(ROLE_HEADING);
  if (!match) {
    return false;
  }

  const roleName = match[1];
  if (!roleName) {
    return false;
  }

  const role = ROLE_SLUGS[roleName.toLowerCase()];
  if (!role) {
    return false;
  }

  const agentDefinition = loadAgentDefinition(workspaceDir, role);
  const whitelist = agentDefinition.tools;
  if (!whitelist || whitelist.length === 0) {
    throw new Error(`Agent definition for role ${role} must declare a non-empty tools whitelist`);
  }

  await pi.setActiveTools(whitelist);
  return true;
}

type OMPToolDefinition<
  TParams = Record<string, unknown>,
  TContext = unknown,
> = {
  name: string;
  label: string;
  description: string;
  defaultInactive?: boolean;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  execute: (
    toolCallId: string,
    params: TParams,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: TContext,
  ) => Promise<OMPToolResponse>;
};

type ExtensionContext = SessionIdContext;

type ExtensionAPI = {
  on?: (eventName: string, handler: (event: unknown, ctx: ExtensionContext) => unknown | Promise<unknown>) => void;
  registerTool?: <TParams = Record<string, unknown>, TContext = unknown>(tool: OMPToolDefinition<TParams, TContext>) => void;
  sendMessage?: (msg: string, opts?: Record<string, unknown>) => void;
  getActiveTools?: () => string[];
  setActiveTools?: (toolNames: string[]) => Promise<void> | void;
};

export default function activateExtension(pi: ExtensionAPI) {
  const extension = new OMPFlowExtension();
  let mainSessionId: string | undefined;

  if (pi.sendMessage) {
    extension.setSendMessage(pi.sendMessage);
  }

  pi.on?.('session_start', async (_event: unknown, ctx: ExtensionContext) => {
    const sessionId = ctx.sessionManager?.getSessionId?.() ?? undefined;
    extension.onSessionStart(ctx as OMPHookContext);

    const prunedChildSession = await pruneChildSessionTools(pi, ctx, process.cwd());
    if (!prunedChildSession && !mainSessionId && sessionId) {
      mainSessionId = sessionId;
    }
    if (!prunedChildSession && mainSessionId && sessionId === mainSessionId && pi.getActiveTools && pi.setActiveTools) {
      const active = pi.getActiveTools();
      if (!active.includes('omp_flow_dispatch')) {
        await pi.setActiveTools([...active, 'omp_flow_dispatch']);
      }
    }
    return ctx;
  });
  pi.on?.('before_agent_start', (_event: unknown, ctx: ExtensionContext) => extension.onBeforeAgentStart(ctx as OMPHookContext));
  pi.on?.('tool_call', (_event: unknown, ctx: ExtensionContext) => extension.onToolCall(ctx as OMPHookContext));
  pi.on?.('context', (_event: unknown, ctx: ExtensionContext) => extension.onContext(ctx as OMPHookContext));
  pi.on?.('agent_end', (_event: unknown, ctx: ExtensionContext) => extension.onAgentEnd(ctx as OMPHookContext));
  pi.on?.('agent_complete', (_event: unknown, ctx: ExtensionContext) => extension.onAgentComplete(ctx as OMPHookContext));
  pi.on?.('session_stop', (_event: unknown, ctx: ExtensionContext) => extension.onSessionStop(ctx as OMPHookContext));
  pi.on?.('session_compact', (_event: unknown, ctx: ExtensionContext) => extension.onSessionCompact(ctx as OMPHookContext));

  if (pi.registerTool) {
    pi.registerTool<OMPFlowExecuteParams>({
      name: 'omp_flow_execute',
      label: 'OMP-Flow Execute',
      description: 'Advance the Ralph FSM to the next step and return the step prompt. Use this to drive omp-flow task execution.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['advance', 'complete', 'status'], description: 'advance=next step, complete=mark current done, status=get FSM state' },
          stepIndex: { type: 'number', description: 'Step index to complete (for complete action)' },
          completionStatus: { type: 'string', enum: ['DONE', 'NEEDS_RETRY', 'BLOCKED'], description: 'Completion status for complete action' },
          summary: { type: 'string', description: 'Completion summary for complete action' }
        },
        required: ['action']
      },
      async execute(_toolCallId: string, params: OMPFlowExecuteParams): Promise<OMPToolResponse> {
        const fsm = new RalphFSMEngine();
        if (params.action === 'advance') {
          const step = fsm.advanceNextStep();
          return { content: [{ type: 'text', text: JSON.stringify(step) }] };
        }
        if (params.action === 'complete') {
          if (typeof params.stepIndex !== 'number' || !params.completionStatus) {
            return { content: [{ type: 'text', text: 'stepIndex and completionStatus are required for complete action' }] };
          }
          const status = fsm.completeStep(params.stepIndex, params.completionStatus, params.summary || '');
          return {
            content: [{ type: 'text', text: JSON.stringify({ fsmState: status.fsmState, currentStepIndex: status.currentStepIndex }) }]
          };
        }
        if (params.action === 'status') {
          const status = fsm.getStatus();
          return {
            content: [{ type: 'text', text: JSON.stringify({ fsmState: status.fsmState, currentStepIndex: status.currentStepIndex, steps: status.steps.map((step) => ({ index: step.index, status: step.status, skill: step.skill })) }) }]
          };
        }
        return { content: [{ type: 'text', text: 'Unknown action' }] };
      }
    });
    pi.registerTool(createDispatchTool(process.cwd(), () => mainSessionId));
    pi.registerTool(createVerdictTool(process.cwd()));
  }
}
