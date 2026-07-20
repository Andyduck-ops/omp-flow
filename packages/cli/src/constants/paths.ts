/**
 * Path constants for omp-flow workflow structure
 *
 * Change these values to rename directories across the entire project.
 * All paths should be relative to the project root.
 */

/** Managed-block markers — single source consumed by update + prune. */
export const OMP_FLOW_BLOCK_START = "<!-- OMP-FLOW:START -->";
export const OMP_FLOW_BLOCK_END = "<!-- OMP-FLOW:END -->";

// Directory names (can be renamed)
export const DIR_NAMES = {
  /** Root workflow directory */
  WORKFLOW: ".omp-flow",
  /** Tasks directory (under the workflow dir) - unified task storage */
  TASKS: "tasks",
  /** Archive directory (under tasks/) */
  ARCHIVE: "archive",
  /** Scripts directory (under the workflow dir) - Python control plane */
  SCRIPTS: "scripts",
  /** Specs directory (under the workflow dir) */
  SPECS: "specs",
  /** Knowhow directory (under the workflow dir) */
  KNOWHOW: "knowhow",
  /** Runtime state directory (under the workflow dir) */
  RUNTIME: ".runtime",
  /** Sessions directory (under the runtime dir) */
  SESSIONS: "sessions",
} as const;

// File names
export const FILE_NAMES = {
  /** Root agent instructions file */
  AGENTS: "AGENTS.md",
  /** Task metadata */
  TASK_JSON: "task.json",
  /** Requirements document */
  PRD: "prd.md",
  /** Workflow guide */
  WORKFLOW_GUIDE: "workflow.md",
  /** Journal file prefix */
  JOURNAL_PREFIX: "journal-",
} as const;

// Constructed paths (relative to project root)
export const PATHS = {
  /** the workflow dir */
  WORKFLOW: DIR_NAMES.WORKFLOW,
  /** <workflow>/tasks/ */
  TASKS: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}`,
  /** <workflow>/tasks/archive/ */
  TASKS_ARCHIVE: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}/${DIR_NAMES.ARCHIVE}`,
  /** <workflow>/.runtime/sessions/ */
  RUNTIME_SESSIONS: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.RUNTIME}/${DIR_NAMES.SESSIONS}`,
  /** <workflow>/specs/ */
  SPECS: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SPECS}`,
  /** <workflow>/knowhow/ */
  KNOWHOW: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.KNOWHOW}`,
  /** <workflow>/scripts/ */
  SCRIPTS: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SCRIPTS}`,
  /** <workflow>/workflow.md */
  WORKFLOW_GUIDE_FILE: `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.WORKFLOW_GUIDE}`,
} as const;

/**
 * Get task directory path
 * @example getTaskDir("01-21-my-task") => "<workflow>/tasks/01-21-my-task"
 */
export function getTaskDir(taskName: string): string {
  return `${PATHS.TASKS}/${taskName}`;
}

/**
 * Get archive directory path
 * @example getArchiveDir() => "<workflow>/tasks/archive"
 */
export function getArchiveDir(): string {
  return PATHS.TASKS_ARCHIVE;
}
