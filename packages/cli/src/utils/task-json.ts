/**
 * Canonical task.json shape — single source of truth shared by all TS
 * writers. The canonical types and factory now live in the
 * `omp-flow-core` task API; this module re-exports them under
 * the legacy `TaskJson` / `emptyTaskJson` names for CLI call sites.
 *
 * New code should prefer `OmpFlowTaskRecord` / `emptyTaskRecord` from
 * `omp-flow-core/task` directly.
 */

import {
  emptyTaskRecord,
  type OmpFlowTaskRecord,
} from "omp-flow-core/task";

export type TaskJson = OmpFlowTaskRecord;

export const emptyTaskJson = emptyTaskRecord;
