import * as fs from 'fs';
import * as path from 'path';

/**
 * Task Record - Modeled after Trellis 24-field TrellisTaskRecord.
 * Tracks parent/child relationships, status lifecycle, and metadata.
 */
export interface TaskRecord {
  // Trellis fields (existing):
  id: string;
  title: string;
  status: 'planning' | 'in_progress' | 'review' | 'completed' | 'archived';
  parent?: string;
  subtasks: string[];
  children: string[];
  relatedFiles: string[];
  createdAt: string;
  completedAt?: string;
  notes: string;
  meta: Record<string, unknown>;
  // Maestro-style unified fields:
  scope?: string;
  devType?: string;
  priority?: string;
  assignee?: string;
  branch?: string;
  baseBranch?: string;
  milestone?: string;
  phase?: string;
}

/**
 * TaskDefinitionFile - Single file target within an atomic task definition.
 */
export interface TaskDefinitionFile {
  path: string;
  target: string;
  change: string;
}

/**
 * TaskConvergence - Grep-verifiable completion criteria for an atomic task.
 */
export interface TaskConvergence {
  criteria: string[];
}

/**
 * TaskDefinition - Maestro-style atomic task with convergence criteria.
 * Stored at .omp-flow/tasks/{parentTaskId}/.task/{id}.json
 */
export interface TaskDefinition {
  id: string;               // TASK-001, TASK-002...
  title: string;
  description: string;
  scope: string;            // e.g. 'src/auth/'
  action: string;           // concrete implementation directive
  files: TaskDefinitionFile[];
  readFirst: string[];      // files executor MUST read first
  implementation: string[]; // ordered steps with concrete values
  convergence: TaskConvergence;
  dependsOn: string[];      // other TASK-IDs this depends on
  wave: number;
  executor?: string;        // 'agent' | 'gemini' | 'codex' | etc.
  type: 'feature' | 'fix' | 'refactor' | 'test';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  summaryPath?: string;
  commitHash?: string;
}

/**
 * WaveTask - A single wave within a WavePlan.
 */
export interface WaveTask {
  wave: number;
  tasks: string[];     // TASK-IDs in this wave
  parallel: boolean;
  dependsOn: number[]; // wave numbers this wave depends on
}

/**
 * WavePlan - Wave-based parallel execution plan for a parent task.
 * Stored at .omp-flow/tasks/{parentTaskId}/plan.json
 */
export interface WavePlan {
  taskId: string;       // parent task ID
  taskIds: string[];    // all TASK-IDs in plan
  waveCount: number;
  waves: WaveTask[];
  complexity?: 'low' | 'medium' | 'high';
}

/**
 * TaskSummary - Completion summary for an atomic sub-task.
 * Stored at .omp-flow/tasks/{parentTaskId}/.summaries/{taskId}-summary.md
 */
export interface TaskSummary {
  taskId: string;       // sub-task ID (TASK-001)
  parentTaskId: string; // parent task dir name
  status: 'completed' | 'failed' | 'blocked';
  executor: string;
  summary: string;
  commitHash?: string;
  completedAt: string;
}

/**
 * Goal - Modeled after Maestro task_decomposition.
 * Tracks decomposed goals with done-when criteria and evidence.
 */
export interface Goal {
  id: string;
  description: string;
  doneWhen: string;
  status: 'pending' | 'met' | 'unmet';
  evidence?: string;
}

/**
 * Feature - Modeled after brainstorm feature decomposition (F-001, F-002...).
 * Tracks decomposed product features with priority and role linkage.
 */
export interface Feature {
  id: string;           // F-001, F-002...
  slug: string;         // kebab-case slug
  title: string;
  description: string;
  relatedRoles: string[];
  priority: 'high' | 'medium' | 'low';
}
/**
 * Artifact - File-level artifact registry for workflow outputs (ANL-001, BLP-001, etc.).
 * Tracks lifecycle: created → completed → harvested (or failed).
 */
export interface Artifact {
  id: string;              // ANL-001, BLP-001, etc.
  type: 'analyze' | 'brainstorm' | 'plan' | 'execute' | 'review' | 'harvest' | 'blueprint';
  taskId: string;
  milestone?: string;
  phase?: string;
  path: string;            // relative to .omp-flow/
  status: 'created' | 'completed' | 'failed' | 'harvested';
  harvested: boolean;
  createdAt: string;
  completedAt?: string;
}

/**
 * ArtifactArchiveEntry - Snapshot of a graduated artifact in the milestone archive.
 */
export interface ArtifactArchiveEntry {
  id: string;
  type: Artifact['type'];
  milestone: string;
  path: string;
  graduatedAt: string;
  knowhowRef?: string;
  summary?: string;
}

/**
 * AccumulatedContext - Cross-task accumulated knowledge (decisions, deferred items, blockers).
 * Pruned via pruneAccumulatedContext against specs/*.md content.
 */
export interface AccumulatedContext {
  keyDecisions: Array<{ decision: string; rationale: string; source: string; lockedAt: string }>;
  deferred: Array<{ title: string; reason: string; status: 'open' | 'resolved' | 'cancelled' | 'superseded'; source: string }>;
  blockers: Array<{ title: string; severity: string; status: 'open' | 'investigating' | 'resolved'; source: string }>;
}

/**
 * SessionRecord - A single entry in the cross-session workspace journal.
 * Stored in .omp-flow/workspace/journal-{N}.md with 2000-line rotation.
 */
export interface SessionRecord {
  /** ISO-8601 timestamp when the session was recorded */
  timestamp: string;
  /** Short human-readable title for the session */
  title: string;
  /** Free-text summary of what happened in this session */
  summary: string;
  /** Optional git commit hash at session end */
  commitHash?: string;
}

export interface OMPFlowWorkspaceState {
  activeTask?: string;
  workflowSpec?: string;
  specRules: string[];
  tasks: string[];
  version: string;
  milestone: string;
  phase: string;
  fsmState: string;
  activeWave: number;
  artifacts: string[];
  decisions: string[];
  blockers: string[];
  goals: Goal[];
  features: Feature[];
  artifactRegistry: Artifact[];
  artifactArchive: ArtifactArchiveEntry[];
  currentMilestone?: string;
  accumulatedContext: AccumulatedContext;
  lastPruned?: string;
}

export class UnifiedWorkspaceManager {
  private rootDir: string;
  private ompFlowDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = rootDir;
    this.ompFlowDir = path.join(rootDir, '.omp-flow');
  }

  public initWorkspace(): void {
    const subDirs = [
      this.ompFlowDir,
      path.join(this.ompFlowDir, 'specs'),
      path.join(this.ompFlowDir, 'tasks'),
      path.join(this.ompFlowDir, 'knowhow'),
      path.join(this.ompFlowDir, 'scratch'),
      path.join(this.ompFlowDir, 'issues'),
      path.join(this.ompFlowDir, 'fsm'),
      path.join(this.ompFlowDir, 'events'),
      path.join(this.ompFlowDir, 'findings'),
      path.join(this.ompFlowDir, 'sessions'),
      path.join(this.ompFlowDir, 'workspace'),
    ];

    for (const dir of subDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const stateJsonPath = path.join(this.ompFlowDir, 'state.json');
    if (!fs.existsSync(stateJsonPath)) {
      const defaultState: OMPFlowWorkspaceState = {
        version: '1.0.0',
        milestone: 'M1-Initialization',
        phase: 'P0-Setup',
        fsmState: 'S_PARSE_ROUTE',
        activeWave: 1,
        artifacts: [],
        decisions: [],
        blockers: [],
        specRules: [],
        goals: [],
        features: [],
        artifactRegistry: [],
        artifactArchive: [],
        accumulatedContext: { keyDecisions: [], deferred: [], blockers: [] },
        tasks: [],
      };
      fs.writeFileSync(stateJsonPath, JSON.stringify(defaultState, null, 2), 'utf-8');
    }

    const workflowMdPath = path.join(this.ompFlowDir, 'workflow.md');
    if (!fs.existsSync(workflowMdPath)) {
      const defaultWorkflow = `# OMP-Flow Development Workflow\n\n- Phase: Setup\n- Rules: Follow strict modular TypeScript architecture.\n- Subagent Context: Inject task PRDs & boundary contracts automatically.`;
      fs.writeFileSync(workflowMdPath, defaultWorkflow, 'utf-8');
    }
  }

  public getUnifiedState(): OMPFlowWorkspaceState {
    this.initWorkspace();

    const stateJsonPath = path.join(this.ompFlowDir, 'state.json');
    let stateObj: Partial<OMPFlowWorkspaceState> = {};

    if (fs.existsSync(stateJsonPath)) {
      try {
        stateObj = JSON.parse(fs.readFileSync(stateJsonPath, 'utf-8'));
      } catch (e) {
        // Fallback
      }
    }

    let activeTask: string | undefined = undefined;
    const activeTaskPointer = path.join(this.ompFlowDir, 'tasks', '.active-task');
    if (fs.existsSync(activeTaskPointer)) {
      activeTask = fs.readFileSync(activeTaskPointer, 'utf-8').trim();
    }

    const specRules: string[] = [];
    const specDir = path.join(this.ompFlowDir, 'specs');
    if (fs.existsSync(specDir)) {
      const files = fs.readdirSync(specDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          specRules.push(fs.readFileSync(path.join(specDir, file), 'utf-8'));
        }
      }
    }

    const tasks: string[] = [];
    const tasksDir = path.join(this.ompFlowDir, 'tasks');
    if (fs.existsSync(tasksDir)) {
      const entries = fs.readdirSync(tasksDir);
      for (const entry of entries) {
        if (!entry.startsWith('.')) {
          tasks.push(entry);
        }
      }
    }

    return {
      version: stateObj.version || '1.0.0',
      milestone: stateObj.milestone || 'M1',
      phase: stateObj.phase || 'P0',
      fsmState: stateObj.fsmState || 'S_PARSE_ROUTE',
      activeWave: stateObj.activeWave || 1,
      artifacts: stateObj.artifacts || [],
      decisions: stateObj.decisions || [],
      blockers: stateObj.blockers || [],
      activeTask,
      workflowSpec: fs.existsSync(path.join(this.ompFlowDir, 'workflow.md'))
        ? fs.readFileSync(path.join(this.ompFlowDir, 'workflow.md'), 'utf-8')
        : undefined,
      specRules,
      goals: stateObj.goals || [],
      features: stateObj.features || [],
      artifactRegistry: stateObj.artifactRegistry || [],
      artifactArchive: stateObj.artifactArchive || [],
      currentMilestone: stateObj.currentMilestone,
      accumulatedContext: stateObj.accumulatedContext || { keyDecisions: [], deferred: [], blockers: [] },
      lastPruned: stateObj.lastPruned,
      tasks,
    };
  }

  public setActiveTask(taskSlug: string): void {
    const activeTaskPointer = path.join(this.ompFlowDir, 'tasks', '.active-task');
    fs.mkdirSync(path.dirname(activeTaskPointer), { recursive: true });
    fs.writeFileSync(activeTaskPointer, taskSlug, 'utf-8');
  }

  public updateState(patch: Partial<OMPFlowWorkspaceState>): OMPFlowWorkspaceState {
    const stateJsonPath = path.join(this.ompFlowDir, 'state.json');
    const current = fs.existsSync(stateJsonPath)
      ? (JSON.parse(fs.readFileSync(stateJsonPath, 'utf-8')) as OMPFlowWorkspaceState)
      : ({} as OMPFlowWorkspaceState);
    const updated = { ...current, ...patch };
    fs.writeFileSync(stateJsonPath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }

  // --- Session Reconstruction (Gap 7) ---

  /**
   * Bind a session to a task. Writes `.omp-flow/sessions/<sessionId>.json`.
   */
  public setSessionTask(sessionId: string, taskId: string): void {
    const sessionsDir = path.join(this.ompFlowDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
    const payload = { sessionId, taskId, lastSeenAt: new Date().toISOString() };
    fs.writeFileSync(sessionFile, JSON.stringify(payload, null, 2), 'utf-8');
  }

  /**
   * Resolve the task bound to a session. Returns taskId or null if no binding exists.
   */
  public resolveSessionTask(sessionId: string): string | null {
    const sessionFile = path.join(this.ompFlowDir, 'sessions', `${sessionId}.json`);
    if (!fs.existsSync(sessionFile)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(sessionFile, 'utf-8')) as { taskId?: string };
      return typeof data.taskId === 'string' ? data.taskId : null;
    } catch {
      return null;
    }
  }

  /**
   * Clear a session binding by deleting its session file.
   */
  public clearSession(sessionId: string): void {
    const sessionFile = path.join(this.ompFlowDir, 'sessions', `${sessionId}.json`);
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
    }
  }

  // --- Cross-Session Workspace Memory (Wave 5, T4) ---

  /**
   * Find the current journal file path and its 0-padded index.
   * Scans .omp-flow/workspace/ for journal-{N}.md files and returns the
   * highest-numbered one. If none exist or the highest is at the 2000-line
   * cap, creates (or returns) the next one.
   */
  private findCurrentJournal(): { filePath: string; index: number } {
    const wsDir = path.join(this.ompFlowDir, 'workspace');
    fs.mkdirSync(wsDir, { recursive: true });

    const entries = fs.readdirSync(wsDir, { withFileTypes: true });
    let maxIndex = 0;

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(/^journal-(\d+)\.md$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (idx > maxIndex) maxIndex = idx;
      }
    }

    // If the highest-indexed file exists and is over the cap, advance to next
    if (maxIndex > 0) {
      const candidatePath = path.join(wsDir, `journal-${String(maxIndex).padStart(3, '0')}.md`);
      if (fs.existsSync(candidatePath)) {
        const content = fs.readFileSync(candidatePath, 'utf-8');
        const lineCount = content.split('\n').length;
        if (lineCount >= 2000) {
          maxIndex++;
        }
      }
    } else {
      maxIndex = 1;
    }

    const index = maxIndex;
    const filePath = path.join(wsDir, `journal-${String(index).padStart(3, '0')}.md`);

    // Ensure file exists with header
    if (!fs.existsSync(filePath)) {
      const header = `# Session Journal — ${String(index).padStart(3, '0')}\n\n`;
      fs.writeFileSync(filePath, header, 'utf-8');
    }

    return { filePath, index };
  }

  /**
   * Record a session entry in the workspace journal.
   * Appends to the current journal file with rotation at 2000 lines.
   * Creates `.omp-flow/workspace/journal-{N}.md` on first call.
   */
  public recordSession(title: string, summary: string, commitHash?: string): void {
    const wsDir = path.join(this.ompFlowDir, 'workspace');
    fs.mkdirSync(wsDir, { recursive: true });

    // Find the current journal; advance if needed
    let { filePath, index } = this.findCurrentJournal();

    // Format the session entry
    const timestamp = new Date().toISOString();
    const lines: string[] = [
      '',
      `## ${timestamp} — ${title}`,
      '',
      ...(commitHash !== undefined ? [`- **Commit**: \`${commitHash}\``] : []),
      '',
      summary,
      '',
      '---',
    ];
    const entry = lines.join('\n');

    // Check line count again in case another process wrote since findCurrentJournal
    const existingContent = fs.readFileSync(filePath, 'utf-8');
    const currentLineCount = existingContent.split('\n').length;

    if (currentLineCount >= 2000) {
      index++;
      filePath = path.join(wsDir, `journal-${String(index).padStart(3, '0')}.md`);
      const header = `# Session Journal — ${String(index).padStart(3, '0')}\n\n`;
      fs.writeFileSync(filePath, header + entry + '\n', 'utf-8');
    } else {
      fs.appendFileSync(filePath, entry + '\n', 'utf-8');
    }
  }

  /**
   * Return recent session summaries for AI handoff context.
   * Reads the current journal file and returns parsed session entries
   * as SessionRecord objects, newest first.
   */
  public getWorkspaceContext(): SessionRecord[] {
    const wsDir = path.join(this.ompFlowDir, 'workspace');
    if (!fs.existsSync(wsDir)) return [];

    // Find the current (highest-indexed) journal file
    const entries = fs.readdirSync(wsDir, { withFileTypes: true });
    let maxIndex = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(/^journal-(\d+)\.md$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (idx > maxIndex) maxIndex = idx;
      }
    }
    if (maxIndex === 0) return [];

    const journalPath = path.join(wsDir, `journal-${String(maxIndex).padStart(3, '0')}.md`);
    if (!fs.existsSync(journalPath)) return [];

    const content = fs.readFileSync(journalPath, 'utf-8');
    return this.parseJournalEntries(content);
  }

  /**
   * Parse a journal file into SessionRecord entries.
   * Extracts each ## {timestamp} — {title} section with its body.
   */
  private parseJournalEntries(content: string): SessionRecord[] {
    const results: SessionRecord[] = [];
    // Each entry starts with a ## heading: ## {timestamp} — {title}
    const entryRegex = /^## (.+?) — (.+?)$\n([\s\S]*?)(?=\n## |\n$)/gm;
    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(content)) !== null) {
      const timestamp = match[1].trim();
      const title = match[2].trim();
      const body = match[3].trim();

      // Extract commit hash from body if present
      let commitHash: string | undefined;
      let summary = body;
      const commitMatch = body.match(/^\*\*Commit\*\*: `(.+?)`$/m);
      if (commitMatch) {
        commitHash = commitMatch[1];
        // Remove the commit line from summary
        summary = body.replace(/^- \*\*Commit\*\*: `.+?`$/m, '').trim();
      }
      // Remove trailing --- separator
      summary = summary.replace(/\n---$/, '').trim();

      results.push({ timestamp, title, summary, commitHash });
    }

    // Return newest first
    return results.reverse();
  }

  // --- Goal Tracking (Gap 8) ---

  /**
   * Append a goal to the workspace state.
   */
  public addGoal(goal: Goal): void {
    const current = this.getUnifiedState();
    const goals = [...current.goals, goal];
    this.updateState({ goals });
  }

  /**
   * Update a goal's status (and optional evidence) by id.
   */
  public updateGoalStatus(goalId: string, status: Goal['status'], evidence?: string): void {
    const current = this.getUnifiedState();
    const goals = current.goals.map((g) =>
      g.id === goalId ? { ...g, status, ...(evidence !== undefined ? { evidence } : {}) } : g
    );
    this.updateState({ goals });
  }

  /**
   * Return all tracked goals.
   */
  public getGoals(): Goal[] {
    return this.getUnifiedState().goals;
  }

  // --- Feature Tracking (Gap 5: Brainstorm Feature Decomposition) ---

  /**
   * Append a feature to the workspace state.
   */
  public addFeature(feature: Feature): void {
    const current = this.getUnifiedState();
    const features = [...current.features, feature];
    this.updateState({ features });
  }

  /**
   * Return all tracked features.
   */
  public getFeatures(): Feature[] {
    return this.getUnifiedState().features;
  }

  /**
   * Patch a feature by id (partial update, merged non-destructively).
   */
  public updateFeature(featureId: string, patch: Partial<Feature>): void {
    const current = this.getUnifiedState();
    const features = current.features.map((f) =>
      f.id === featureId ? { ...f, ...patch } : f
    );
    this.updateState({ features });
  }

  // --- Task Tree Management (Trellis-distilled) ---

  /**
   * Load task record from task directory.
   */
  public loadTaskRecord(taskId: string): TaskRecord | null {
    const taskJsonPath = path.join(this.ompFlowDir, 'tasks', taskId, 'task.json');
    if (!fs.existsSync(taskJsonPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(taskJsonPath, 'utf-8')) as TaskRecord;
    } catch {
      return null;
    }
  }

  /**
   * Write task record to task directory.
   */
  public writeTaskRecord(taskId: string, record: TaskRecord): void {
    const taskDir = path.join(this.ompFlowDir, 'tasks', taskId);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, 'task.json'), JSON.stringify(record, null, 2), 'utf-8');
  }

  /**
   * Create a new task with optional parent linkage.
   */
  public createTask(taskId: string, title: string, parentId?: string): TaskRecord {
    const record: TaskRecord = {
      id: taskId,
      title,
      status: 'planning',
      parent: parentId,
      subtasks: [],
      children: [],
      relatedFiles: [],
      createdAt: new Date().toISOString(),
      notes: '',
      meta: {},
      // Maestro-style unified fields (initialized undefined; callers may set)
      scope: undefined,
      devType: undefined,
      priority: undefined,
      assignee: undefined,
      branch: undefined,
      baseBranch: undefined,
      milestone: undefined,
      phase: undefined,
    };

    this.writeTaskRecord(taskId, record);

    // Link parent → child
    if (parentId) {
      const parent = this.loadTaskRecord(parentId);
      if (parent) {
        if (!parent.subtasks.includes(taskId)) parent.subtasks.push(taskId);
        if (!parent.children.includes(taskId)) parent.children.push(taskId);
        this.writeTaskRecord(parentId, parent);
      }
    }

    return record;
  }

  /**
   * Transition task status with lifecycle validation.
   */
  public transitionTask(
    taskId: string,
    newStatus: TaskRecord['status']
  ): TaskRecord | null {
    const record = this.loadTaskRecord(taskId);
    if (!record) return null;

    record.status = newStatus;
    if (newStatus === 'completed' || newStatus === 'archived') {
      record.completedAt = new Date().toISOString();
    }

    this.writeTaskRecord(taskId, record);
    return record;
  }

  /**
   * List all task records with their tree relationships.
   */
  public listTaskTree(): TaskRecord[] {
    const tasksDir = path.join(this.ompFlowDir, 'tasks');
    if (!fs.existsSync(tasksDir)) return [];

    const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
    const records: TaskRecord[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const record = this.loadTaskRecord(entry.name);
        if (record) records.push(record);
      }
    }

    return records;
  }

  // --- Task Definition Management ---

  /**
   * Load an atomic task definition from .omp-flow/tasks/{parentTaskId}/.task/{subTaskId}.json.
   * Returns null if not found or unparseable.
   */
  public loadTaskDefinition(parentTaskId: string, subTaskId: string): TaskDefinition | null {
    const defPath = path.join(this.ompFlowDir, 'tasks', parentTaskId, '.task', `${subTaskId}.json`);
    if (!fs.existsSync(defPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(defPath, 'utf-8')) as TaskDefinition;
    } catch {
      return null;
    }
  }

  /**
   * Write an atomic task definition to .omp-flow/tasks/{parentTaskId}/.task/{def.id}.json.
   * Creates the .task/ directory if missing.
   */
  public writeTaskDefinition(parentTaskId: string, def: TaskDefinition): void {
    const taskDir = path.join(this.ompFlowDir, 'tasks', parentTaskId, '.task');
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, `${def.id}.json`),
      JSON.stringify(def, null, 2),
      'utf-8'
    );
  }

  /**
   * List all atomic task definitions for a parent task.
   * Reads every .task/*.json file.
   */
  public listTaskDefinitions(parentTaskId: string): TaskDefinition[] {
    const taskDir = path.join(this.ompFlowDir, 'tasks', parentTaskId, '.task');
    if (!fs.existsSync(taskDir)) return [];

    const defs: TaskDefinition[] = [];
    const entries = fs.readdirSync(taskDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const def = JSON.parse(
            fs.readFileSync(path.join(taskDir, entry.name), 'utf-8')
          ) as TaskDefinition;
          defs.push(def);
        } catch {
          // Skip unparseable files
        }
      }
    }
    return defs;
  }

  // --- Wave Plan Management ---

  /**
   * Load the wave plan for a parent task from .omp-flow/tasks/{parentTaskId}/plan.json.
   * Returns null if not found or unparseable.
   */
  public loadWavePlan(parentTaskId: string): WavePlan | null {
    const planPath = path.join(this.ompFlowDir, 'tasks', parentTaskId, 'plan.json');
    if (!fs.existsSync(planPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(planPath, 'utf-8')) as WavePlan;
    } catch {
      return null;
    }
  }

  /**
   * Write the wave plan for a parent task to .omp-flow/tasks/{parentTaskId}/plan.json.
   */
  public writeWavePlan(parentTaskId: string, plan: WavePlan): void {
    const taskDir = path.join(this.ompFlowDir, 'tasks', parentTaskId);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, 'plan.json'),
      JSON.stringify(plan, null, 2),
      'utf-8'
    );
  }

  // --- Task Summary Management ---

  /**
   * Save a task summary as markdown at .omp-flow/tasks/{parentTaskId}/.summaries/{summary.taskId}-summary.md.
   * Format: frontmatter-style metadata header + summary body.
   */
  public saveTaskSummary(parentTaskId: string, summary: TaskSummary): void {
    const summariesDir = path.join(this.ompFlowDir, 'tasks', parentTaskId, '.summaries');
    fs.mkdirSync(summariesDir, { recursive: true });

    const lines: string[] = [
      '---',
      `taskId: ${summary.taskId}`,
      `parentTaskId: ${summary.parentTaskId}`,
      `status: ${summary.status}`,
      `executor: ${summary.executor}`,
      ...(summary.commitHash !== undefined ? [`commitHash: ${summary.commitHash}`] : []),
      `completedAt: ${summary.completedAt}`,
      '---',
      '',
      `# Summary: ${summary.taskId}`,
      '',
      summary.summary,
      '',
    ];
    fs.writeFileSync(
      path.join(summariesDir, `${summary.taskId}-summary.md`),
      lines.join('\n'),
      'utf-8'
    );
  }

  /**
   * Read all task summaries for a parent task.
   * Parses metadata from YAML-style frontmatter. Returns array sorted by taskId.
   */
  public getTaskSummaries(parentTaskId: string): TaskSummary[] {
    const summariesDir = path.join(this.ompFlowDir, 'tasks', parentTaskId, '.summaries');
    if (!fs.existsSync(summariesDir)) return [];

    const summaries: TaskSummary[] = [];
    const entries = fs.readdirSync(summariesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('-summary.md')) continue;
      const filePath = path.join(summariesDir, entry.name);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = this.parseSummaryMarkdown(content);
        if (parsed) summaries.push(parsed);
      } catch {
        // Skip unparseable files
      }
    }

    summaries.sort((a, b) => a.taskId.localeCompare(b.taskId));
    return summaries;
  }

  /**
   * Parse a summary markdown file into a TaskSummary object.
   * Expects YAML-style frontmatter between --- markers.
   */
  private parseSummaryMarkdown(content: string): TaskSummary | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) return null;

    const frontmatter = frontmatterMatch[1];
    const body = frontmatterMatch[2];

    const meta: Record<string, string> = {};
    for (const line of frontmatter.split('\n')) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      meta[key] = value;
    }

    if (!meta.taskId || !meta.status || !meta.executor || !meta.completedAt) return null;
    if (meta.status !== 'completed' && meta.status !== 'failed' && meta.status !== 'blocked') {
      return null;
    }

    // Body: strip leading blank lines, then drop the "# Summary: ..." header line if present,
    // then strip the following blank line. Take the rest trimmed.
    const bodyLines = body.split('\n');
    while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
    let summaryText: string;
    if (bodyLines.length > 0 && bodyLines[0].startsWith('# Summary:')) {
      bodyLines.shift();
      while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
      summaryText = bodyLines.join('\n').trim();
    } else {
      summaryText = body.trim();
    }

    return {
      taskId: meta.taskId,
      parentTaskId: meta.parentTaskId || '',
      status: meta.status,
      executor: meta.executor,
      summary: summaryText,
      ...(meta.commitHash ? { commitHash: meta.commitHash } : {}),
      completedAt: meta.completedAt,
    };
  }

  // --- Children Progress ---

  /**
   * Compute progress counts for a parent task's children.
   * completed/archived → completed; in_progress → inProgress; planning/review → pending.
   */
  public getChildrenProgress(parentTaskId: string): {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
  } {
    const parent = this.loadTaskRecord(parentTaskId);
    const result = { total: 0, completed: 0, inProgress: 0, pending: 0 };
    if (!parent) return result;

    result.total = parent.children.length;
    for (const childId of parent.children) {
      const child = this.loadTaskRecord(childId);
      if (!child) continue;
      if (child.status === 'completed' || child.status === 'archived') {
        result.completed++;
      } else if (child.status === 'in_progress') {
        result.inProgress++;
      } else {
        // planning, review → pending
        result.pending++;
      }
    }
    return result;
  }

  // --- Artifact Registry (Group 1) ---

  /**
   * Register a new artifact in state.json artifacts[].
   */
  public registerArtifact(artifact: Artifact): void {
    const current = this.getUnifiedState();
    const registry = [...current.artifactRegistry, artifact];
    this.updateState({ artifactRegistry: registry });
  }

  /**
   * Update an artifact's status (and optionally harvested flag) by id.
   */
  public updateArtifactStatus(
    artifactId: string,
    status: Artifact['status'],
    harvested?: boolean
  ): void {
    const current = this.getUnifiedState();
    const registry = current.artifactRegistry.map((a) =>
      a.id === artifactId
        ? {
            ...a,
            status,
            ...(harvested !== undefined ? { harvested } : {}),
            ...(status === 'completed' || status === 'failed' || status === 'harvested'
              ? { completedAt: new Date().toISOString() }
              : {}),
          }
        : a
    );
    this.updateState({ artifactRegistry: registry });
  }

  /**
   * Graduate an artifact: remove from artifacts[], push to artifactArchive[].
   */
  public graduateArtifact(
    artifactId: string,
    milestone: string,
    knowhowRef?: string,
    summary?: string
  ): void {
    const current = this.getUnifiedState();
    const artifact = current.artifactRegistry.find((a) => a.id === artifactId);
    if (!artifact) return;

    const archiveEntry: ArtifactArchiveEntry = {
      id: artifact.id,
      type: artifact.type,
      milestone,
      path: artifact.path,
      graduatedAt: new Date().toISOString(),
      ...(knowhowRef !== undefined ? { knowhowRef } : {}),
      ...(summary !== undefined ? { summary } : {}),
    };

    const registry = current.artifactRegistry.filter((a) => a.id !== artifactId);
    const archive = [...current.artifactArchive, archiveEntry];
    this.updateState({ artifactRegistry: registry, artifactArchive: archive });
  }

  /**
   * Return artifacts, optionally filtered.
   */
  public getArtifacts(filter?: {
    type?: Artifact['type'];
    taskId?: string;
    status?: Artifact['status'];
    harvested?: boolean;
  }): Artifact[] {
    const registry = this.getUnifiedState().artifactRegistry;
    if (!filter) return registry;
    return registry.filter((a) => {
      if (filter.type !== undefined && a.type !== filter.type) return false;
      if (filter.taskId !== undefined && a.taskId !== filter.taskId) return false;
      if (filter.status !== undefined && a.status !== filter.status) return false;
      if (filter.harvested !== undefined && a.harvested !== filter.harvested) return false;
      return true;
    });
  }

  // --- Accumulated Context (Group 2) ---

  /**
   * Append a key decision to accumulatedContext.
   */
  public addKeyDecision(decision: string, rationale: string, source: string): void {
    const current = this.getUnifiedState();
    const ctx = {
      ...current.accumulatedContext,
      keyDecisions: [
        ...current.accumulatedContext.keyDecisions,
        { decision, rationale, source, lockedAt: new Date().toISOString() },
      ],
    };
    this.updateState({ accumulatedContext: ctx });
  }

  /**
   * Append a deferred item to accumulatedContext.
   */
  public addDeferred(title: string, reason: string, source: string): void {
    const current = this.getUnifiedState();
    const ctx = {
      ...current.accumulatedContext,
      deferred: [
        ...current.accumulatedContext.deferred,
        { title, reason, status: 'open' as const, source },
      ],
    };
    this.updateState({ accumulatedContext: ctx });
  }

  /**
   * Append a blocker to accumulatedContext.
   */
  public addBlocker(title: string, severity: string, source: string): void {
    const current = this.getUnifiedState();
    const ctx = {
      ...current.accumulatedContext,
      blockers: [
        ...current.accumulatedContext.blockers,
        { title, severity, status: 'open' as const, source },
      ],
    };
    this.updateState({ accumulatedContext: ctx });
  }

  /**
   * Prune accumulatedContext entries per field-specific rules.
   * - keyDecisions: prune if decision text exists verbatim in any .omp-flow/specs/*.md
   * - deferred: prune if status ∈ {resolved, cancelled, superseded}
   * - blockers: prune if status == resolved
   * Updates lastPruned to current ISO timestamp; returns pruned counts per category.
   */
  public pruneAccumulatedContext(): {
    prunedDecisions: number;
    prunedDeferred: number;
    prunedBlockers: number;
  } {
    const current = this.getUnifiedState();

    // Gather all spec content
    const specDir = path.join(this.ompFlowDir, 'specs');
    const specContents: string[] = [];
    if (fs.existsSync(specDir)) {
      const files = fs.readdirSync(specDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          specContents.push(fs.readFileSync(path.join(specDir, file), 'utf-8'));
        }
      }
    }
    const specBlob = specContents.join('\n');

    let prunedDecisions = 0;
    const keyDecisions = current.accumulatedContext.keyDecisions.filter((d) => {
      if (specBlob.includes(d.decision)) {
        prunedDecisions++;
        return false;
      }
      return true;
    });

    let prunedDeferred = 0;
    const deferred = current.accumulatedContext.deferred.filter((d) => {
      if (d.status === 'resolved' || d.status === 'cancelled' || d.status === 'superseded') {
        prunedDeferred++;
        return false;
      }
      return true;
    });

    let prunedBlockers = 0;
    const blockers = current.accumulatedContext.blockers.filter((b) => {
      if (b.status === 'resolved') {
        prunedBlockers++;
        return false;
      }
      return true;
    });

    this.updateState({
      accumulatedContext: { keyDecisions, deferred, blockers },
      lastPruned: new Date().toISOString(),
    });

    return { prunedDecisions, prunedDeferred, prunedBlockers };
  }

  // --- Archive + Milestone (Group 3) ---

  /**
   * Archive a task directory to .omp-flow/tasks/archive/{YYYY-MM}/{taskId}/.
   * Atomic move via fs.renameSync on same filesystem.
   */
  public archiveTask(taskId: string): { archivedTo: string } {
    const sourceDir = path.join(this.ompFlowDir, 'tasks', taskId);
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`archiveTask: source does not exist: ${sourceDir}`);
    }

    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const archiveRoot = path.join(this.ompFlowDir, 'tasks', 'archive', month);
    fs.mkdirSync(archiveRoot, { recursive: true });

    const destDir = path.join(archiveRoot, taskId);
    fs.renameSync(sourceDir, destDir);

    const archivedTo = path.relative(this.ompFlowDir, destDir).replace(/\\/g, '/');
    return { archivedTo };
  }

  /**
   * List archived task directories, optionally filtered by YYYY-MM month.
   */
  public listArchivedTasks(month?: string): Array<{ taskId: string; month: string; path: string }> {
    const archiveRoot = path.join(this.ompFlowDir, 'tasks', 'archive');
    if (!fs.existsSync(archiveRoot)) return [];

    const result: Array<{ taskId: string; month: string; path: string }> = [];
    const months = month ? [month] : fs.readdirSync(archiveRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const m of months) {
      const monthDir = path.join(archiveRoot, m);
      if (!fs.existsSync(monthDir) || !fs.statSync(monthDir).isDirectory()) continue;
      const entries = fs.readdirSync(monthDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const relPath = path.relative(this.ompFlowDir, path.join(monthDir, entry.name)).replace(/\\/g, '/');
          result.push({ taskId: entry.name, month: m, path: relPath });
        }
      }
    }

    return result;
  }

  /**
   * Archive all artifacts into a milestone folder, graduate them, then clear the registry.
   * Writes a summary.md and resets currentMilestone.
   */
  public archiveMilestone(milestoneId: string): { archivedArtifacts: number } {
    const milestoneArtifactsDir = path.join(this.ompFlowDir, 'milestones', milestoneId, 'artifacts');
    fs.mkdirSync(milestoneArtifactsDir, { recursive: true });

    const current = this.getUnifiedState();
    let count = 0;

    for (const artifact of current.artifactRegistry) {
      // Move artifact file/dir if it lives under scratch/
      if (artifact.path.startsWith('scratch/')) {
        const sourcePath = path.join(this.ompFlowDir, artifact.path);
        if (fs.existsSync(sourcePath)) {
          const destPath = path.join(milestoneArtifactsDir, path.basename(artifact.path));
          fs.renameSync(sourcePath, destPath);
        }
      }
      this.graduateArtifact(artifact.id, milestoneId);
      count++;
    }

    // Clear artifacts registry
    this.updateState({ artifactRegistry: [], currentMilestone: undefined });

    // Write summary.md
    const summaryPath = path.join(this.ompFlowDir, 'milestones', milestoneId, 'summary.md');
    const summaryContent = [
      `# Milestone ${milestoneId}`,
      '',
      `- Artifact Count: ${count}`,
      `- Archived At: ${new Date().toISOString()}`,
      '',
    ].join('\n');
    fs.writeFileSync(summaryPath, summaryContent, 'utf-8');

    return { archivedArtifacts: count };
  }

  /**
   * Soft-delete a file/dir by moving it to .omp-flow/.trash/{ISO-timestamp}/{basename}.
   * Returns the trash path (relative to .omp-flow/).
   */
  public softDelete(sourcePath: string, reason: string): string {
    const absoluteSource = path.isAbsolute(sourcePath)
      ? sourcePath
      : path.join(this.rootDir, sourcePath);
    if (!fs.existsSync(absoluteSource)) {
      throw new Error(`softDelete: source does not exist: ${absoluteSource}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const trashDir = path.join(this.ompFlowDir, '.trash', timestamp);
    fs.mkdirSync(trashDir, { recursive: true });

    const basename = path.basename(absoluteSource);
    const destPath = path.join(trashDir, basename);
    fs.renameSync(absoluteSource, destPath);

    // Record deletion reason alongside
    fs.writeFileSync(
      path.join(trashDir, '.reason'),
      `${reason}\n${new Date().toISOString()}\n`,
      'utf-8'
    );

    return path.relative(this.ompFlowDir, destPath).replace(/\\/g, '/');
  }

  // --- Layered Index System (Track C) ---

  /**
   * Regenerate specs/index.md from the specs/ directory contents.
   * Skips if specs/ does not exist. Writes a Trellis-style spec table.
   */
  public refreshSpecIndex(): void {
    const specsDir = path.join(this.ompFlowDir, 'specs');
    if (!fs.existsSync(specsDir)) return;
    const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md') && f !== 'index.md');
    const lines: string[] = [
      '# Specs Index',
      '',
      '> Auto-generated by `omp-flow index --refresh`. Do not edit manually.',
      '',
      '## Available Specs',
      '',
      '| Spec | Category | Status |',
      '|------|----------|--------|',
    ];
    for (const f of files) {
      const name = f.replace('.md', '');
      const category = name.includes('coding') ? 'coding' : name.includes('arch') ? 'arch' : name.includes('review') ? 'review' : 'general';
      lines.push(`| [${name}](./${f}) | ${category} | Active |`);
    }
    lines.push('', '---', '', '**Last refreshed**: ' + new Date().toISOString());
    fs.writeFileSync(path.join(specsDir, 'index.md'), lines.join('\n'), 'utf-8');
  }

  /**
   * Regenerate knowhow/index.md from the knowhow/ directory contents.
   * Skips if knowhow/ does not exist.
   */
  public refreshKnowhowIndex(): void {
    const knowhowDir = path.join(this.ompFlowDir, 'knowhow');
    if (!fs.existsSync(knowhowDir)) return;
    const files = fs.readdirSync(knowhowDir).filter(f => f.endsWith('.md') && f !== 'index.md');
    const lines: string[] = [
      '# Knowhow Index',
      '',
      '> Auto-generated by `omp-flow index --refresh`.',
      '',
      '## Available Knowhow',
      '',
    ];
    for (const f of files) {
      lines.push(`- [${f}](./${f})`);
    }
    lines.push('', '**Last refreshed**: ' + new Date().toISOString());
    fs.writeFileSync(path.join(knowhowDir, 'index.md'), lines.join('\n'), 'utf-8');
  }

  /**
   * Regenerate tasks/index.md from the non-archived task tree.
   */
  public refreshTaskIndex(): void {
    const tasks = this.listTaskTree();
    const lines: string[] = [
      '# Active Tasks Index',
      '',
      '> Auto-generated by `omp-flow index --refresh`.',
      '',
      '## Tasks',
      '',
      '| Task ID | Title | Status | Children |',
      '|---------|-------|--------|----------|',
    ];
    for (const t of tasks) {
      lines.push(`| ${t.id} | ${t.title} | ${t.status} | ${t.children.length} |`);
    }
    lines.push('', '**Last refreshed**: ' + new Date().toISOString());
    fs.writeFileSync(path.join(this.ompFlowDir, 'tasks', 'index.md'), lines.join('\n'), 'utf-8');
  }
}
