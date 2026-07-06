import { OMPFlowExtension, OMPHookContext } from '../../src/omp/extension.js';

export default function activateExtension(pi: { on: (event: string, handler: (ctx: OMPHookContext) => OMPHookContext) => void }) {
  const extension = new OMPFlowExtension();

  pi.on('session_start', (ctx: OMPHookContext) => extension.onSessionStart(ctx));
  pi.on('before_agent_start', (ctx: OMPHookContext) => extension.onBeforeAgentStart(ctx));
  pi.on('tool_call', (ctx: OMPHookContext) => extension.onToolCall(ctx));
  pi.on('context', (ctx: OMPHookContext) => extension.onContext(ctx));
  pi.on('agent_end', (ctx: OMPHookContext) => extension.onAgentEnd(ctx));
  pi.on('agent_complete', (ctx: OMPHookContext) => extension.onAgentComplete(ctx));
  pi.on('session_stop', (ctx: OMPHookContext) => extension.onSessionStop(ctx));
}
