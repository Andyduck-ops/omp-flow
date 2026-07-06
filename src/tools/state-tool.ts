import { UnifiedWorkspaceManager } from '../core/state.js';
import { RalphFSMEngine } from '../core/fsm.js';

export interface MaestroStateArgs {
  action: 'get' | 'update_phase' | 'advance_step' | 'complete_step' | 'create_session';
  phase?: string;
  milestone?: string;
  stepIdx?: number;
  status?: 'DONE' | 'DONE_WITH_CONCERNS' | 'NEEDS_RETRY' | 'BLOCKED';
  summary?: string;
  sessionId?: string;
}

export function executeMaestroState(args: MaestroStateArgs, workspaceDir: string = process.cwd()) {
  const stateMgr = new UnifiedWorkspaceManager(workspaceDir);
  const fsm = new RalphFSMEngine(workspaceDir);

  switch (args.action) {
    case 'get':
      return {
        unifiedState: stateMgr.getUnifiedState(),
        ralphStatus: fsm.getStatus(),
      };

    case 'update_phase':
      if (!args.phase) {
        throw new Error('phase is required for update_phase');
      }
      const updatedState = stateMgr.updateState({
        phase: args.phase,
        milestone: args.milestone || stateMgr.getUnifiedState().milestone,
      });
      return { success: true, workspaceState: updatedState };

    case 'create_session':
      const newSessionId = args.sessionId || `session-${Date.now()}`;
      const newSession = fsm.createSession(newSessionId);
      return { success: true, ralphStatus: newSession };

    case 'advance_step':
      const stepInfo = fsm.advanceNextStep();
      return { success: true, stepInfo };

    case 'complete_step':
      if (args.stepIdx === undefined || !args.status) {
        throw new Error('stepIdx and status are required for complete_step');
      }
      const status = fsm.completeStep(args.stepIdx, args.status, args.summary || 'Completed step');
      return { success: true, ralphStatus: status };

    default:
      throw new Error(`Unknown action: ${args.action}`);
  }
}
