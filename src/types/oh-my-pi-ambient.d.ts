declare module '@oh-my-pi/pi-coding-agent/task/executor' {
  import type { AgentDefinition } from '@oh-my-pi/pi-coding-agent/task/types';

  export interface ExecutorOptions {
    cwd: string;
    agent: AgentDefinition;
    task: string;
    context?: string;
    role?: string;
    index: number;
    id: string;
    signal?: AbortSignal;
    onProgress?: (p: unknown) => void;
    modelOverride?: string;
    taskDepth?: number;
  }

  export interface SingleResult {
    output: string;
    exitCode: number;
    aborted: boolean;
    abortReason?: string;
    usage?: unknown;
    tokens?: number;
  }

  export function runSubprocess(options: ExecutorOptions): Promise<SingleResult>;
}

declare module '@oh-my-pi/pi-coding-agent/task/types' {
  export interface AgentDefinition {
    name: string;
    description: string;
    systemPrompt: string;
    source: 'bundled' | 'user' | 'project';
    tools?: string[];
    spawns?: string[] | '*';
    readSummarize?: boolean;
  }
}
