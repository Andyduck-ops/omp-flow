import * as fs from 'fs';
import * as path from 'path';
import { UnifiedWorkspaceManager } from '../core/state.js';
import { RalphFSMEngine } from '../core/fsm.js';
import { ContextPackageBuilder } from '../core/context-package.js';
import { EventBus } from '../core/events.js';
import { MemoryEngine } from '../core/memory.js';
import { SharedContextStore } from '../core/shared-context-store.js';
import { executeMaestroBoundaryCheck, cleanTargetFilePath } from '../tools/drift-check-tool.js';
import { getCSVWorkflowStatus, formatCSVStatusWarning, getPendingCSVRows } from '../core/csv-adapter.js';

export interface OMPHookContext {
  prompt?: string;
  systemPrompt?: string;
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  subagentPrompt?: string;
  subagentRole?: string;
  subagentId?: string;
  modelTier?: 'smol' | 'default' | 'slow';
  shouldContinue?: boolean;  // legacy field, not used by OMP session_stop
  stop_hook_active?: boolean;
  additionalContext?: string;
  continue?: boolean;         // OMP-native: true = continue session with additionalContext
  decision?: 'block';         // OMP-native: 'block' = prevent session from stopping (also continues)
  block?: boolean;
  reason?: string;
  messages?: unknown[];
}

const ABSOLUTE_NO_WRITE: RegExp[] = [
  /^\.omp-flow\/tasks\/[^/]+\/tasks\.csv$/,
  /^\.omp-flow\/tasks\/[^/]+\/evidence\.csv$/,
  /^\.omp-flow\/state\.json$/,
  /^\.omp-flow\/fsm(?:\/.*)?\/[^/]+\.json$/,
  /^\.omp-flow\/tasks\/[^/]+\/fsm\/.*\.json$/,
  /^\.omp-flow\/tasks\/[^/]+\/\.task\/[^/]+\.verdict\.json$/,
  /^\.omp-flow\/tasks\/[^/]+\/\.task\/[^/]+\.auditcheck\.json$/,
  /^\.omp-flow\/tasks\/[^/]+\/\.task\/[^/]+\.json$/,
  /^\.omp-flow\/tasks\/[^/]+\/context\/index\.json$/,
  /^\.omp-flow\/tasks\/[^/]+\/context\/.*\.json$/,
  /^\.omp-flow\/tasks\/[^/]+\/plan\.json$/,
];

function normalizePath(filePath: string): string {
  if (/^[a-z]+:\/\//i.test(filePath)) throw new Error(`URI scheme not allowed: ${filePath}`);
  if (path.isAbsolute(filePath)) throw new Error(`Absolute path not allowed: ${filePath}`);
  if (filePath.includes('\0')) throw new Error('NUL byte in path');
  const resolved = path.resolve(filePath);
  const relative = path.relative(process.cwd(), resolved);
  if (relative.startsWith('..')) throw new Error(`Path escapes workspace: ${filePath}`);
  return relative.replace(/\\/g, '/').toLowerCase();
}
export class OMPFlowExtension {
  private workspaceDir: string;
  private stateMgr: UnifiedWorkspaceManager;
  private fsm: RalphFSMEngine;
  private packageBuilder: ContextPackageBuilder;
  private eventBus: EventBus;
  private memory: MemoryEngine;
  private activeRowId?: string;
  private activeRole?: string;
  private sendMessageFn?: (msg: string, opts?: Record<string, unknown>) => void;
  private injectContext: boolean = false;
  private static readonly CONTEXT_PACK_MARKER = '<!-- omp-flow-context-pack -->';

  constructor(workspaceDir: string = process.cwd()) {
    this.workspaceDir = workspaceDir;
    this.stateMgr = new UnifiedWorkspaceManager(workspaceDir);
    this.fsm = new RalphFSMEngine(workspaceDir);
    this.packageBuilder = new ContextPackageBuilder(workspaceDir);
    this.eventBus = new EventBus(workspaceDir);
    this.memory = new MemoryEngine(workspaceDir);
  }
  public setSendMessage(fn: (msg: string, opts?: Record<string, unknown>) => void): void {
    this.sendMessageFn = fn;
  }

  public onSessionStart(ctx: OMPHookContext): OMPHookContext {
    const state = this.stateMgr.getUnifiedState();
    const ralph = this.fsm.getStatus();
    const currentStep = ralph.steps.find((s) => s.index === ralph.currentStepIndex) || ralph.steps[0];

    this.eventBus.append('session_started', {
      activeTask: state.activeTask,
      fsmState: ralph.fsmState,
      step: ralph.currentStepIndex,
    }, {
      taskId: state.activeTask,
      sessionId: ralph.sessionId,
    });

    let injectedRules = '';
    if (state.specRules.length > 0) {
      injectedRules = `\n<active-spec-rules>\n${state.specRules.join('\n---\n')}\n</active-spec-rules>`;
    }

    const recentKnowhow = this.memory.getRecentKnowhow(5);
    let knowhowBlock = '';
    if (recentKnowhow.length > 0) {
      knowhowBlock = `\n<recent-knowhow>\n${recentKnowhow.map((k) => `- ${k}`).join('\n')}\n</recent-knowhow>`;
    }

    let autoFixBlock = '';
    if (ralph.autoFixIterations && ralph.autoFixIterations > 0) {
      autoFixBlock = `\nAuto-Fix Loop: Iteration ${ralph.autoFixIterations}/${ralph.maxAutoFixIterations || 3}`;
    }

    let boundaryContractBlock = '';
    if (state.activeTask) {
      const scratchDir = path.join(
        this.workspaceDir,
        '.omp-flow',
        'scratch',
        state.activeTask
      );
      const contextPackagePath = path.join(scratchDir, 'context-package.json');
      if (fs.existsSync(contextPackagePath)) {
        const boundaryPkg = JSON.parse(fs.readFileSync(contextPackagePath, 'utf-8')) as { boundary: { in_scope: string[]; out_of_scope: string[]; constraints: string[]; done_when: string[] } };
        const b = boundaryPkg.boundary;
        boundaryContractBlock = `\n<boundary-contract>\nIn Scope: ${b.in_scope.join(', ')}\nOut of Scope: ${b.out_of_scope.join(', ')}\nConstraints: ${b.constraints.join('; ')}\nDone When: ${b.done_when.join('; ')}\n</boundary-contract>`;
      }
    }

    const verifyCommands = this.fsm.getVerifyCommands(state.activeTask);
    const verifyCommandsBlock = verifyCommands.length > 0
      ? `\n<verify-commands>\n${verifyCommands.map((command) => `- ${command}`).join('\n')}\n</verify-commands>`
      : '';

    const maestroContext = `\n<omp-flow-context>\nActive Task: ${state.activeTask || 'None'}\nMilestone: ${state.milestone} | Phase: ${state.phase}\nFSM State: ${ralph.fsmState} (${ralph.status})\nCurrent Step: Step ${ralph.currentStepIndex}/${ralph.steps.length} [Skill: ${currentStep?.skill || 'plan'} | Stage: ${currentStep?.stage || 'planning'}]\nActive Wave: ${state.activeWave}${autoFixBlock}\n${injectedRules}${knowhowBlock}\n${boundaryContractBlock}${verifyCommandsBlock}</omp-flow-context>`;

    return {
      ...ctx,
      systemPrompt: (ctx.systemPrompt || '') + maestroContext,
    };
  }

  public onBeforeAgentStart(ctx: OMPHookContext): OMPHookContext {
    const state = this.stateMgr.getUnifiedState();
    const taskId = state.activeTask || 'TASK-DEFAULT';
    const role = ctx.subagentRole || 'executor';
    const pendingRows = state.activeTask
      ? getPendingCSVRows(state.activeTask, this.workspaceDir)
      : [];
    const currentRow = pendingRows.find((row) => row.status === 'in_progress') || pendingRows[0] || null;
    this.activeRowId = currentRow?.id;
    this.activeRole = role;

    const scratchDir = path.join(this.workspaceDir, '.omp-flow', 'scratch', taskId);
    const contextPackagePath = path.join(
      scratchDir,
      role ? `context-package-${role}.json` : 'context-package.json'
    );
    const pkg = fs.existsSync(contextPackagePath)
      ? JSON.parse(fs.readFileSync(contextPackagePath, 'utf-8'))
      : this.packageBuilder.buildPackage(taskId, role);

    this.eventBus.append('agent_spawned', {
      role,
      taskId,
      inScope: pkg.boundary.in_scope,
    }, {
      taskId,
      agentId: ctx.subagentId,
    });

    let recommendedModelTier: 'smol' | 'default' | 'slow' = 'default';
    const roleLower = role.toLowerCase();
    if (roleLower.includes('architect') || roleLower.includes('reviewer') || roleLower.includes('grill')) {
      recommendedModelTier = 'slow';
    } else if (roleLower.includes('status') || roleLower.includes('route') || roleLower.includes('check')) {
      recommendedModelTier = 'smol';
    }
    if (currentRow?.tier) {
      const tier = currentRow.tier.toLowerCase();
      if (tier === 'smol' || tier === 'default' || tier === 'slow') {
        recommendedModelTier = tier;
      }
    }

    const agentId = ctx.subagentId || `${role.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;

    const ralph = this.fsm.getStatus();
    // Populate boundaryContract on status if available from context package
    if (!ralph.boundaryContract) {
      ralph.boundaryContract = pkg.boundary;
    }
    const sessionAnchor = this.fsm.buildSessionAnchor(ralph, ctx.prompt || undefined);
    const waveContext = this.buildWaveContext(state.activeWave);
    const referencesBlock = this.buildReferenceBlock(currentRow?.reference);
    const contextPackBlock = this.buildContextPackBlock(taskId, currentRow?.context, ctx.prompt || ctx.subagentPrompt || '');

    const ircContext = `<irc-coordination-context>\nAgent ID: ${agentId}\nCommunication Protocol: Use irc tool to message sibling agents.\n- Direct Message: irc(op="send", to="<PeerId>", message="...")\n- Broadcast Wave: irc(op="send", to="all", message="...")\n</irc-coordination-context>`;

    const verifyCommands = this.fsm.getVerifyCommands(taskId);
    const verifyCommandsBlock = verifyCommands.length > 0
      ? `\n<verify-commands>\n${verifyCommands.map((command) => `- ${command}`).join('\n')}\n</verify-commands>`
      : '';
 
    // Inject CSV workflow status so every agent knows which rows are unchecked
    let csvStatusBlock = '';
    if (state.activeTask) {
      const csvStatus = getCSVWorkflowStatus(state.activeTask, this.workspaceDir);
      if (csvStatus) {
        csvStatusBlock = '\n' + formatCSVStatusWarning(csvStatus);
      }
    }
    let rowContextBlock = '';
    if (currentRow?.contextFiles) {
      const filePaths = currentRow.contextFiles.split(';').map((p) => p.trim()).filter((p) => p.length > 0).slice(0, 10);
      const fileContents: string[] = [];
      for (const filePath of filePaths) {
        try {
          const fullPath = path.resolve(this.workspaceDir, filePath);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const cappedContent = Buffer.byteLength(content, 'utf-8') > 2000
              ? Buffer.from(content, 'utf-8').subarray(0, 2000).toString('utf-8') + '\n... [truncated]'
              : content;
            fileContents.push(`--- ${filePath} ---\n${cappedContent}\n--- end ---`);
          }
        } catch {
          // skip unreadable files
        }
      }
      if (fileContents.length > 0) {
        rowContextBlock = '\n<row-context-files>\n' + fileContents.join('\n') + '\n</row-context-files>';
      }
    }

    let taskBriefBlock = '';
    if (currentRow?.taskMd) {
      const taskMdPath = path.resolve(this.workspaceDir, currentRow.taskMd);
      if (fs.existsSync(taskMdPath)) {
        const taskMdContent = fs.readFileSync(taskMdPath, 'utf-8');
        const truncated = taskMdContent.length > 3000 ? taskMdContent.slice(0, 2997) + '...' : taskMdContent;
        taskBriefBlock = `\n<task-brief>\n${truncated}\n</task-brief>`;
      }
    }


    const subagentContext = `${sessionAnchor}${csvStatusBlock}${taskBriefBlock}\n${rowContextBlock}${verifyCommandsBlock}${referencesBlock ? '\n' + referencesBlock : ''}${contextPackBlock ? '\n' + contextPackBlock : ''}${waveContext ? '\n' + waveContext : ''}\n${ircContext}\n\n${ctx.prompt || ctx.subagentPrompt || ''}`;

    return {
      ...ctx,
      modelTier: recommendedModelTier,
      subagentPrompt: subagentContext,
    };
  }

  private buildWaveContext(currentWave: number): string {
    if (currentWave <= 1) return '';
    const priorWaveDiscoveries = this.eventBus.readDiscoveries({
      type: 'finding',
    });
    if (priorWaveDiscoveries.length === 0) return '';

    const lines = ['<wave-context>'];
    lines.push(`Prior wave findings (${priorWaveDiscoveries.length} entries):`);
    for (const d of priorWaveDiscoveries.slice(-10)) {
      const dataStr = typeof d.data === 'object'
        ? JSON.stringify(d.data).slice(0, 200)
        : String(d.data).slice(0, 200);
      lines.push(`- [${d.worker}] ${dataStr}`);
    }
    lines.push('</wave-context>');
    return lines.join('\n');
  }
  private buildReferenceBlock(referenceSpec?: string): string {
    if (!referenceSpec) return '';

    const references = referenceSpec
      .split(';')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, 10);
    if (references.length === 0) return '';

    const rendered: string[] = [];
    for (const referencePath of references) {
      try {
        const fullPath = path.resolve(this.workspaceDir, referencePath);
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
          continue;
        }
        const content = fs.readFileSync(fullPath, 'utf-8');
        const cappedContent = Buffer.byteLength(content, 'utf-8') > 4000
          ? Buffer.from(content, 'utf-8').subarray(0, 4000).toString('utf-8') + '\n... [truncated]'
          : content;
        rendered.push(`<reference path="${referencePath}">\n${cappedContent}\n</reference>`);
      } catch {
        // Skip unreadable references
      }
    }

    if (rendered.length === 0) return '';
    return `<omp-flow-references>\n${rendered.join('\n')}\n</omp-flow-references>`;
  }

  private buildContextPackBlock(taskId: string, contextRefs: string | undefined, existingPrompt: string): string {
    if (!contextRefs) return '';
    if (existingPrompt.includes(OMPFlowExtension.CONTEXT_PACK_MARKER)) return '';

    const store = new SharedContextStore(this.workspaceDir, taskId);
    const rendered = store.renderPromptBlocks(contextRefs);
    if (!rendered || rendered.trim().length === 0) return '';

    return `${OMPFlowExtension.CONTEXT_PACK_MARKER}\n${rendered}`;
  }

  public onToolCall(ctx: OMPHookContext): OMPHookContext & { block?: boolean; reason?: string } {
    const state = this.stateMgr.getUnifiedState();
    const taskId = state.activeTask;
    const input = ctx.input ?? ctx.toolArgs ?? {};

    if (ctx.toolName === 'write' || ctx.toolName === 'edit') {
      const rawPath = ctx.toolName === 'write'
        ? typeof input.path === 'string'
          ? input.path
          : ''
        : cleanTargetFilePath(typeof input.input === 'string' ? input.input : '');

      try {
        const normalized = normalizePath(rawPath);
        for (const pattern of ABSOLUTE_NO_WRITE) {
          if (pattern.test(normalized)) {
            if (taskId) {
              this.eventBus.append('boundary_violation', {
                tool: ctx.toolName,
                targetPath: rawPath,
                violations: ['absolute_no_write'],
              }, { taskId });
            }
            return { ...ctx, block: true, reason: `Blocked: control-plane file is host-managed: ${rawPath}` };
          }
        }
      } catch (e) {
        return { ...ctx, block: true, reason: `Blocked: invalid path: ${e instanceof Error ? e.message : e}` };
      }

      if (taskId && rawPath) {
        const driftResult = executeMaestroBoundaryCheck(taskId, [rawPath], this.workspaceDir);
        if (driftResult.hasDrift) {
          this.eventBus.append('boundary_violation', {
            tool: ctx.toolName,
            targetPath: rawPath,
            violations: driftResult.violations,
          }, { taskId });

          const role = (ctx.subagentRole || '').toLowerCase();
          const isFixPath = role.includes('reviewer') || role.includes('grill') || role.includes('debugger');
          if (isFixPath) {
            throw new Error(
              `[omp-flow] Reviewer-fix boundary violation: '${rawPath}' is out_of_scope. ` +
                `Edit blocked. Defer this Finding (F.status='deferred') and escalate via NEEDS_RETRY.`
            );
          }

          console.warn(`[omp-flow Boundary Warning] Tool '${ctx.toolName}' target path '${rawPath}' violates boundary constraints!`);
        }

        if (driftResult.readiness) {
          this.eventBus.append('readiness_checked', {
            score: driftResult.readiness.totalScore,
            gateStatus: driftResult.readiness.gateStatus,
            breakdown: driftResult.readiness,
          }, { taskId });
        }
      }
    }

    if (taskId && ctx.toolName === 'bash' && typeof input.command === 'string') {
      const command = input.command;
      if (!command.includes('OMP_FLOW_TASK_ID')) {
        const rowId = this.activeRowId || '';
        const role = this.activeRole || ctx.subagentRole || 'executor';
        const contextIndex = `.omp-flow/tasks/${taskId}/context/index.json`;
        const referenceDir = `.omp-flow/tasks/${taskId}/reference`;
        const wrappedCommand = `export OMP_FLOW_TASK_ID=${taskId}; export OMP_FLOW_ROW_ID=${rowId}; export OMP_FLOW_AGENT_ROLE=${role}; export OMP_FLOW_CONTEXT_INDEX=${contextIndex}; export OMP_FLOW_REFERENCE_DIR=${referenceDir}; ${command}`;
        input.command = wrappedCommand;
        ctx.input = input;
        if (ctx.toolArgs) ctx.toolArgs.command = wrappedCommand;
      }
    }

    return ctx;
  }

  public onSessionStop(ctx: OMPHookContext): OMPHookContext {
    // Re-fire guard: OMP caps at 8 continuations. If we're being called again
    // because the session_stop hook was already active, stop — don't loop.
    if (ctx.stop_hook_active === true) {
      return ctx;
    }

    const ralph = this.fsm.getStatus();
    const state = this.stateMgr.getUnifiedState();
    const hasPending = ralph.steps.some((s) => s.status === 'pending' || s.status === 'running' || s.status === 'failed');

    this.eventBus.append('session_stopped', {
      fsmState: ralph.fsmState,
      status: ralph.status,
      pendingSteps: hasPending,
      activeTask: state.activeTask,
    }, { sessionId: ralph.sessionId });

    // Don't continue if there's no active task — FSM has default pending steps
    // but they're meaningless without a real task to execute
    if (!state.activeTask) {
      return ctx;
    }
    // Check for unverified completed rows — block continuation
    const csvStatus = state.activeTask ? getCSVWorkflowStatus(state.activeTask, this.workspaceDir) : null;
    if (csvStatus && csvStatus.unchecked > 0) {
      return {
        ...ctx,
        continue: true,
        additionalContext: `⚠️ ${csvStatus.unchecked} completed rows lack check evidence. Run check agents before continuing. Unchecked: ${csvStatus.rows.filter(r => r.status === 'completed' && !r.hasCheckEvidence).map(r => r.id).join(', ')}`,
        prompt: `⚠️ ${csvStatus.unchecked} unchecked completed rows. Run check agents first.`,
      };
    }

    if (ralph.status === 'running' && hasPending) {
      if (this.fsm.isAutoFixExhausted()) {
        console.warn('[omp-flow] Auto-fix loop exhausted. Manual intervention required.');
        return ctx;
      }

      const nextStep = this.fsm.advanceNextStep();
      // Don't continue if all steps complete OR if step is blocked/escalating
      if (nextStep.isComplete || nextStep.prompt.includes('Escalation required') || nextStep.prompt.includes('blocked')) {
        return ctx;
      }
      // OMP session_stop contract: { continue: true, additionalContext } continues the session
      return {
        ...ctx,
        continue: true,
        additionalContext: nextStep.prompt,
        prompt: nextStep.prompt,
      };
    }

    // Session has no pending steps or is not running — normal stop, no continuation
    return ctx;
  }

  /**
   * Fires on every LLM call (via `context` hook).
   * Reserved for task-scoped context injection; global discovery injection is disabled.
   */
  public onContext(ctx: OMPHookContext): OMPHookContext {
    if (!this.injectContext) return ctx;
    this.injectContext = false;

    const state = this.stateMgr.getUnifiedState();
    const taskId = state.activeTask;
    if (!taskId) return ctx;

    const store = new SharedContextStore(this.workspaceDir, taskId);
    const decisions = store.list({ type: 'decision' })
      .filter((entry) => entry.status === 'accepted' || entry.status === undefined);
    const interfaces = store.list({ type: 'interface' });
    const entries = [...decisions, ...interfaces].slice(0, 10);
    if (entries.length === 0) return ctx;
    if (ctx.prompt?.includes(OMPFlowExtension.CONTEXT_PACK_MARKER)) return ctx;

    const refs = entries.map((entry) => entry.entryId).join(';');
    const pack = store.renderPromptBlocks(refs);
    if (!pack) return ctx;

    const injected = `${OMPFlowExtension.CONTEXT_PACK_MARKER}\n${pack}`;
    return {
      ...ctx,
      messages: [...(ctx.messages || []), { role: 'user', content: injected }],
    };
  }

  /**
   * Fires on session_compact — sets injectContext=true so the next onContext call
   * re-injects the context pack (防失忆). session_compact returns no payload (hooks.md:56).
   */
  public onSessionCompact(ctx: OMPHookContext): OMPHookContext {
    this.injectContext = true;
    return ctx;
  }

  /**
   * Fires on agent_end hook — captures completion signal and appends to EventBus.
   * This replaces the agent_complete event path with a real OMP hook binding.
   */
  public onAgentEnd(ctx: OMPHookContext): OMPHookContext {
    const state = this.stateMgr.getUnifiedState();
    this.eventBus.append('agent_completed', {
      role: ctx.subagentRole || 'executor',
      taskId: state.activeTask,
    }, {
      taskId: state.activeTask,
      agentId: ctx.subagentId,
    });
    return ctx;
  }

  public onAgentComplete(ctx: OMPHookContext): OMPHookContext {
    const state = this.stateMgr.getUnifiedState();
    const taskId = state.activeTask || 'TASK-DEFAULT';
    const agentId = ctx.subagentId || 'unknown';
    const role = ctx.subagentRole || 'executor';

    this.eventBus.append('agent_completed', {
      role,
      taskId,
    }, { taskId, agentId });

    const output = ctx.toolResult || ctx.prompt || '';
    if (output) {
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
      this.eventBus.appendDiscovery(
        agentId,
        'implementation_note',
        {
          role,
          taskId,
          output: outputStr.slice(0, 2000),
        },
        `${agentId}-${taskId}`
      );
    }
    const ralph = this.fsm.getStatus();
    const hasPending = ralph.steps.some((step) => step.status === 'pending');
    if (hasPending && this.sendMessageFn) {
      const nextStep = ralph.steps.find((step) => step.status === 'pending');
      this.sendMessageFn(
        `[omp-flow] Step ${ralph.currentStepIndex} complete. Next: Step ${nextStep?.index} (${nextStep?.skill}). Run omp_flow_execute tool with action=advance to continue.`,
        { triggerTurn: true, deliverAs: 'followUp' }
      );
    }

    return ctx;
  }
}

export default function activateExtension(pi: { on: (event: string, handler: (ctx: OMPHookContext) => OMPHookContext) => void }) {
  const extension = new OMPFlowExtension();

  pi.on('session_start', (ctx) => extension.onSessionStart(ctx));
  pi.on('before_agent_start', (ctx) => extension.onBeforeAgentStart(ctx));
  pi.on('tool_call', (ctx) => extension.onToolCall(ctx));
  pi.on('context', (ctx) => extension.onContext(ctx));
  pi.on('agent_end', (ctx) => extension.onAgentEnd(ctx));
  pi.on('agent_complete', (ctx) => extension.onAgentComplete(ctx));
  pi.on('session_stop', (ctx) => extension.onSessionStop(ctx));
  pi.on('session_compact', (ctx) => extension.onSessionCompact(ctx));
}
