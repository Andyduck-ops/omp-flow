import { describe, expect, it } from "vitest";
import {
  DIR_NAMES,
  FILE_NAMES,
  PATHS,
  OMP_FLOW_BLOCK_START,
  OMP_FLOW_BLOCK_END,
  getTaskDir,
  getArchiveDir,
} from "../../src/constants/paths.js";

// =============================================================================
// DIR_NAMES — constant structure (omp-flow runtime layout)
// =============================================================================

describe("DIR_NAMES", () => {
  it("has all expected keys", () => {
    expect(DIR_NAMES).toHaveProperty("WORKFLOW");
    expect(DIR_NAMES).toHaveProperty("TASKS");
    expect(DIR_NAMES).toHaveProperty("ARCHIVE");
    expect(DIR_NAMES).toHaveProperty("SCRIPTS");
    expect(DIR_NAMES).toHaveProperty("SPECS");
    expect(DIR_NAMES).toHaveProperty("KNOWHOW");
    expect(DIR_NAMES).toHaveProperty("RUNTIME");
    expect(DIR_NAMES).toHaveProperty("SESSIONS");
  });

  it("WORKFLOW is .omp-flow", () => {
    expect(DIR_NAMES.WORKFLOW).toBe(".omp-flow");
  });

  it("all values are non-empty strings", () => {
    for (const value of Object.values(DIR_NAMES)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// FILE_NAMES — constant structure
// =============================================================================

describe("FILE_NAMES", () => {
  it("has all expected keys", () => {
    expect(FILE_NAMES).toHaveProperty("AGENTS");
    expect(FILE_NAMES).toHaveProperty("TASK_JSON");
    expect(FILE_NAMES).toHaveProperty("PRD");
    expect(FILE_NAMES).toHaveProperty("WORKFLOW_GUIDE");
    expect(FILE_NAMES).toHaveProperty("JOURNAL_PREFIX");
  });

  it("all values are non-empty strings", () => {
    for (const value of Object.values(FILE_NAMES)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Managed-block markers — single source consumed by update + prune
// =============================================================================

describe("managed-block markers", () => {
  it("use the OMP-FLOW namespace", () => {
    expect(OMP_FLOW_BLOCK_START).toBe("<!-- OMP-FLOW:START -->");
    expect(OMP_FLOW_BLOCK_END).toBe("<!-- OMP-FLOW:END -->");
  });
});

// =============================================================================
// PATHS — derived from DIR_NAMES + FILE_NAMES
// =============================================================================

describe("PATHS", () => {
  it("WORKFLOW equals DIR_NAMES.WORKFLOW", () => {
    expect(PATHS.WORKFLOW).toBe(DIR_NAMES.WORKFLOW);
  });

  it("all paths start with DIR_NAMES.WORKFLOW", () => {
    for (const value of Object.values(PATHS)) {
      expect(value.startsWith(DIR_NAMES.WORKFLOW)).toBe(true);
    }
  });

  it("TASKS is WORKFLOW/tasks", () => {
    expect(PATHS.TASKS).toBe(`${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}`);
  });

  it("TASKS_ARCHIVE is WORKFLOW/tasks/archive", () => {
    expect(PATHS.TASKS_ARCHIVE).toBe(
      `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}/${DIR_NAMES.ARCHIVE}`,
    );
  });

  it("RUNTIME_SESSIONS is WORKFLOW/.runtime/sessions", () => {
    expect(PATHS.RUNTIME_SESSIONS).toBe(
      `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.RUNTIME}/${DIR_NAMES.SESSIONS}`,
    );
  });

  it("SPECS is WORKFLOW/specs", () => {
    expect(PATHS.SPECS).toBe(`${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SPECS}`);
  });

  it("KNOWHOW is WORKFLOW/knowhow", () => {
    expect(PATHS.KNOWHOW).toBe(`${DIR_NAMES.WORKFLOW}/${DIR_NAMES.KNOWHOW}`);
  });

  it("SCRIPTS is WORKFLOW/scripts", () => {
    expect(PATHS.SCRIPTS).toBe(`${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SCRIPTS}`);
  });

  it("WORKFLOW_GUIDE_FILE is WORKFLOW/workflow.md", () => {
    expect(PATHS.WORKFLOW_GUIDE_FILE).toBe(
      `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.WORKFLOW_GUIDE}`,
    );
  });

  it("uses / separator (not backslash)", () => {
    for (const value of Object.values(PATHS)) {
      expect(value).not.toContain("\\");
    }
  });
});

// =============================================================================
// getTaskDir — pure string concatenation
// =============================================================================

describe("getTaskDir", () => {
  it("returns correct path for task name", () => {
    expect(getTaskDir("01-21-my-task")).toBe(".omp-flow/tasks/01-21-my-task");
  });

  it("handles nested-looking names", () => {
    expect(getTaskDir("sub/task")).toBe(".omp-flow/tasks/sub/task");
  });

  it("handles empty string", () => {
    expect(getTaskDir("")).toBe(".omp-flow/tasks/");
  });
});

// =============================================================================
// getArchiveDir — pure, no arguments
// =============================================================================

describe("getArchiveDir", () => {
  it("returns correct archive path", () => {
    expect(getArchiveDir()).toBe(".omp-flow/tasks/archive");
  });

  it("is under PATHS.TASKS", () => {
    expect(getArchiveDir().startsWith(PATHS.TASKS + "/")).toBe(true);
  });
});
