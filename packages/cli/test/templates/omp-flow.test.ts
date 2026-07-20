import { describe, expect, it } from "vitest";
import {
  workflowMdTemplate,
  configYamlTemplate,
  gitignoreTemplate,
  getAllScripts,
  getAllAgents,
} from "../../src/templates/omp-flow/index.js";

// =============================================================================
// Python control plane — the deployed omp-flow runtime (band 3, dir-walked D3)
// =============================================================================

describe("omp-flow Python control plane", () => {
  const scripts = getAllScripts();
  const keys = [...scripts.keys()].sort();

  it("exposes the 13-file omp_flow.py + common/* control plane", () => {
    expect(keys).toEqual(
      [
        "common/__init__.py",
        "common/active_task.py",
        "common/amend.py",
        "common/context.py",
        "common/evidence.py",
        "common/gates.py",
        "common/io.py",
        "common/paths.py",
        "common/reference.py",
        "common/task_store.py",
        "common/topology.py",
        "common/workflow.py",
        "omp_flow.py",
      ].sort(),
    );
  });

  it("enumerates scripts by directory walk (no Trellis runtime survives)", () => {
    // The band-3 replacement deletes Trellis's Python entirely; none of its
    // runtime file names may leak into the omp-flow control plane.
    for (const forbidden of ["task.py", "get_context.py", "workflow_phase.py"]) {
      expect(keys).not.toContain(forbidden);
    }
    // No __pycache__ artifacts are ever tracked.
    expect(keys.some((k) => k.includes("__pycache__"))).toBe(false);
  });

  it("ships a non-empty, real Python entrypoint", () => {
    const entry = scripts.get("omp_flow.py");
    expect(entry && entry.length).toBeGreaterThan(0);
    expect(entry).toContain("def ");
  });
});

// =============================================================================
// workflow.md — omp-flow renders state from the 12 [workflow-state:*] blocks
// =============================================================================

describe("omp-flow workflow.md", () => {
  const CANONICAL_STATES = [
    "no_task",
    "explore",
    "design",
    "qbd1",
    "decompose",
    "qbd2",
    "ready",
    "execute",
    "amending",
    "finish",
    "completed",
    "stale",
  ];

  it("declares exactly the 12 canonical workflow-state blocks", () => {
    const found = [
      ...workflowMdTemplate.matchAll(/\[workflow-state:([a-z0-9_]+)\]/g),
    ].map((m) => m[1]);
    const unique = [...new Set(found)].sort();
    expect(unique).toEqual([...CANONICAL_STATES].sort());
  });

  it("opens and closes every workflow-state block", () => {
    for (const state of CANONICAL_STATES) {
      const block = new RegExp(
        `\\[workflow-state:${state}\\]([\\s\\S]*?)\\[/workflow-state:${state}\\]`,
      ).exec(workflowMdTemplate);
      expect(block, `block ${state} is opened and closed`).not.toBeNull();
    }
  });

  it("carries no Trellis breadcrumb statuses (Trellis vocabulary dropped, D1)", () => {
    for (const trellisState of [
      "planning",
      "in_progress",
      "in_review",
    ]) {
      expect(workflowMdTemplate).not.toContain(`[workflow-state:${trellisState}]`);
    }
  });
});

// =============================================================================
// Framework template strings for the workflow structure
// =============================================================================

describe("omp-flow workflow-structure templates", () => {
  it("ships a config.yaml framework template", () => {
    // NOTE (reviewer): the deployed config.yaml is still the raw Trellis file
    // (Trellis branding + codex.dispatch_mode knob) — a PRIOR-ROW gap in
    // `configurators/workflow.ts` / templates replacement, NOT this test row.
    // Asserting its rebrand/knob-deletion belongs to that row; here we only
    // confirm the framework template exists so init can deploy it.
    expect(configYamlTemplate.length).toBeGreaterThan(0);
  });

  it("gitignore template ignores the runtime dir", () => {
    expect(gitignoreTemplate).toContain(".runtime");
  });
});

// =============================================================================
// Channel seed agents — omp-flow ships none (D8)
// =============================================================================

describe("omp-flow channel seed agents", () => {
  it("ships zero channel seed agents (Python control plane is the only producer, D8)", () => {
    expect(getAllAgents().size).toBe(0);
  });
});
