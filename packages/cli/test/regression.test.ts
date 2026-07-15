/**
 * Regression guards — re-derived from omp-flow M1 semantics (design D9).
 *
 * The upstream Trellis regression suite (~225 assertions across add_session.py,
 * migration data, shell→Python migration, cli_adapter, pull-based sub-agent
 * context, per-platform templates, codex dispatch-mode, etc.) asserted invariants
 * of subjects that M1 deletes. Per the design those Trellis semantic invariants
 * are DROPPED, not translated. What remains here are cross-cutting invariants that
 * guard the omp-flow M1 boundary itself: the deleted machinery stays deleted, the
 * session-identity law holds on the deployed Python path, and the control plane is
 * fully rebranded.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getSharedHookScripts } from "../src/templates/shared-hooks/index.js";
import { workflowMdTemplate, getAllScripts } from "../src/templates/omp-flow/index.js";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const CONTROL_PLANE = path.join(SRC, "templates", "omp-flow", "scripts");
const CLAUDE_HOOKS = path.join(SRC, "templates", "claude", "hooks");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

// ---------------------------------------------------------------------------
// D5 / R8 — session-identity law on the deployed Python control plane
// ---------------------------------------------------------------------------

describe("regression: session identity law (D5/R8)", () => {
  const pyFiles = walk(CONTROL_PLANE).filter((f) => f.endsWith(".py"));

  it("no single-session / global fallback exists anywhere on the deployed Python path", () => {
    for (const file of pyFiles) {
      const body = fs.readFileSync(file, "utf-8");
      expect(body).not.toMatch(/_resolve_single_session_fallback|session-fallback/);
    }
  });

  it("active_task.py resolves OMP_FLOW_CONTEXT_ID first", () => {
    const activeTask = fs.readFileSync(
      path.join(CONTROL_PLANE, "common", "active_task.py"),
      "utf-8",
    );
    expect(activeTask).toContain("OMP_FLOW_CONTEXT_ID");
    expect(activeTask).toContain("resolve_context_key");
    // The explicit-<sha256[:20]> context key format is unchanged.
    expect(activeTask).toContain('_context_key("explicit"');
    expect(activeTask).toContain("sha256");
    expect(activeTask).toContain(".hexdigest()[:20]");
  });
});

// ---------------------------------------------------------------------------
// D7 / R2 — full rebrand of the deployed control plane
// ---------------------------------------------------------------------------

describe("regression: control-plane rebrand (D7/R2)", () => {
  it("no 'trellis' identifier survives in the deployed Python control plane", () => {
    for (const file of walk(CONTROL_PLANE)) {
      const body = fs.readFileSync(file, "utf-8");
      expect(
        body.toLowerCase().includes("trellis"),
        `${path.basename(file)} still references trellis`,
      ).toBe(false);
    }
  });

  it("the 13-file omp_flow.py + common/* control plane is present", () => {
    expect(getAllScripts().size).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// D1 — Trellis shared hooks deleted; omp-flow Claude hooks own state injection
// ---------------------------------------------------------------------------

describe("regression: shared hooks removed (D1)", () => {
  it("ships zero Trellis shared-hook scripts", () => {
    expect(getSharedHookScripts()).toEqual([]);
  });

  it("all five Claude hooks exist and never swallow via a bare BaseException handler", () => {
    // NOTE: a bounded `except (ValueError, OSError): pass` is legitimate (e.g. the
    // documented best-effort, non-fatal CLAUDE_ENV_FILE bridge, D5) — the guard
    // here is only against catching BaseException (which would swallow the
    // fail-closed security decision).
    const hooks = [
      "session-start.py",
      "inject-workflow-state.py",
      "inject-agent-context.py",
      "inject-agent-identity.py",
      "protect-python-owned.py",
    ];
    for (const name of hooks) {
      expect(fs.existsSync(path.join(CLAUDE_HOOKS, name))).toBe(true);
      const body = fs.readFileSync(path.join(CLAUDE_HOOKS, name), "utf-8");
      expect(body).not.toContain("except BaseException");
      expect(body).not.toMatch(/except\s*:\s*(#.*)?\n/);
    }
  });
});

// ---------------------------------------------------------------------------
// workflow.md — omp-flow renders state from 12 blocks, no Trellis breadcrumbs
// ---------------------------------------------------------------------------

describe("regression: workflow.md vocabulary (D1)", () => {
  it("declares the 12 canonical workflow-state blocks", () => {
    const found = new Set(
      [...workflowMdTemplate.matchAll(/\[workflow-state:([a-z0-9_]+)\]/g)].map(
        (m) => m[1],
      ),
    );
    expect(found.size).toBe(12);
  });

  it("carries none of the Trellis breadcrumb statuses", () => {
    for (const trellisState of ["planning", "in_progress", "in_review"]) {
      expect(workflowMdTemplate).not.toContain(`[workflow-state:${trellisState}]`);
    }
  });
});
