import { OMPFlowExtension, type OMPHookContext } from './extension.js';
import { loadAgentDefinition } from './agent-loader.js';

type ExtensionContext = OMPHookContext & {
  sessionManager?: { getSessionId?: () => string | null; taskDepth?: number };
};

type ExtensionAPI = {
  on?: (eventName: string, handler: (event: unknown, ctx: ExtensionContext) => unknown | Promise<unknown>) => void;
  sendMessage?: (msg: string, opts?: Record<string, unknown>) => void;
  setActiveTools?: (toolNames: string[]) => Promise<void> | void;
  __ompFlowExtensionActivated?: boolean;
};

async function setMainSessionTools(pi: ExtensionAPI, workspaceDir: string): Promise<void> {
  if (!pi.setActiveTools) {
    throw new Error('OMP host does not expose setActiveTools; cannot install the orchestrator tool belt.');
  }
  const tools = loadAgentDefinition(workspaceDir, 'orchestrator').tools;
  if (!tools) throw new Error('Orchestrator agent has no tool belt.');
  await pi.setActiveTools(tools);
}

export default function activateExtension(pi: ExtensionAPI) {
  if (pi.__ompFlowExtensionActivated) return;
  pi.__ompFlowExtensionActivated = true;

  const extension = new OMPFlowExtension(process.cwd());
  if (pi.sendMessage) extension.setSendMessage(pi.sendMessage);

  pi.on?.('session_start', async (_event: unknown, ctx: ExtensionContext) => {
    const started = extension.onSessionStart(ctx);
    if (ctx.sessionManager?.taskDepth === 0) {
      await setMainSessionTools(pi, process.cwd());
    }
    return { ...ctx, ...started };
  });
  pi.on?.('tool_call', (_event: unknown, ctx: ExtensionContext) => extension.onToolCall(ctx));
  pi.on?.('context', (_event: unknown, ctx: ExtensionContext) => extension.onContext(ctx));
  pi.on?.('session_compact', (_event: unknown, ctx: ExtensionContext) => extension.onSessionCompact(ctx));
  pi.on?.('agent_end', (_event: unknown, ctx: ExtensionContext) => extension.onAgentEnd(ctx));
}
