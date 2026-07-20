/**
 * Executing statusline smoke test (PRD R2 / R4b · finding:statusline-api-drift).
 *
 * A "file exists" check does NOT catch the control-plane API drift that makes a
 * naively-rebranded statusline.py crash on an active task (TypeError on the
 * resolver call, AttributeError on `active.task_path`). This test therefore
 * EXECUTES the DEPLOYED `.claude/hooks/statusline.py` — produced by the fork's
 * own `init({ claude: true, withStatusline: true })` — with an active-task stdin
 * payload against a real `.omp-flow/` tree (control-plane scripts + a task dir +
 * an active session pointing at it), and asserts: no exception, exit 0, and a
 * task line is emitted. It is intentionally a SEPARATE file from parity.test.ts
 * (the untouched M1 14-test parity suite).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { init } from "../../src/commands/init.js";

function pythonCommand(): string {
  return process.platform === "win32" ? "python" : "python3";
}

/** Run the deployed Python control plane directly (session identity via env). */
function runPythonJson<T>(
  root: string,
  args: string[],
  env: Record<string, string> = {},
): T {
  const script = path.join(root, ".omp-flow", "scripts", "omp_flow.py");
  const out = execFileSync(
    pythonCommand(),
    ["-X", "utf8", script, "--cwd", root, ...args],
    { cwd: root, encoding: "utf8", env: { ...process.env, ...env } },
  ).trim();
  return JSON.parse(out) as T;
}

/**
 * Invoke the DEPLOYED `.claude/hooks/statusline.py` exactly as Claude Code does:
 * one UTF-8 CC-session JSON on stdin. Session identity is supplied via
 * OMP_FLOW_CONTEXT_ID (the resolver checks it before the payload).
 */
function runStatusline(
  root: string,
  payload: unknown,
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const wrapper = path.join(root, ".claude", "hooks", "statusline.py");
  const result = spawnSync(pythonCommand(), ["-X", "utf8", wrapper], {
    cwd: root,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...(process.env as Record<string, string>), ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("omp-flow statusline smoke (deployed --with-statusline; R2/R4b)", () => {
  let root: string;
  const sid = "statusline-smoke-session";
  const activeEnv = { OMP_FLOW_CONTEXT_ID: sid };

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "omp-flow-statusline-"));
    fs.mkdirSync(path.join(root, ".git"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      // Faithful `omp-flow init --claude --with-statusline`: deploys .omp-flow/
      // control plane + .claude/ including the opt-in statusline.py.
      await init({ claude: true, yes: true, withStatusline: true });
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
    // `task create` with a session identity auto-activates the task, so the
    // resolver returns a live task_id for the smoke payload below.
    runPythonJson<{ taskId: string }>(
      root,
      ["task", "create", "Smoke Task", "--slug", "smoke"],
      activeEnv,
    );
  }, 120_000);

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("deploys statusline.py under --with-statusline", () => {
    expect(
      fs.existsSync(path.join(root, ".claude", "hooks", "statusline.py")),
    ).toBe(true);
  });

  it("EXECUTES without crashing and emits a task line for an active task (exit 0)", () => {
    const payload = {
      model: { display_name: "Opus 4.8" },
      context_window: { used_percentage: 12, context_window_size: 200_000 },
      cost: { total_duration_ms: 5_000 },
      session_id: sid,
    };
    const res = runStatusline(root, payload, activeEnv);
    // The decisive crash check: a control-plane drift would raise and print a
    // traceback + non-zero exit. Neither may happen.
    expect(res.stderr).not.toContain("Traceback");
    expect(res.status).toBe(0);
    const firstLine = res.stdout.trim().split(/\r?\n/)[0];
    // Task line: `[P2] Smoke Task (planning) [session]` — [P2] is the cosmetic
    // default (omp-flow task.json has no priority field; design §D-E).
    expect(firstLine).toContain("Smoke Task");
    expect(firstLine).toContain("[P2]");
    expect(firstLine).toContain("(planning)");
  });

  it("degrades to info-line-only (no crash, exit 0) when no task is active", () => {
    const payload = {
      model: { display_name: "Opus 4.8" },
      context_window: { used_percentage: 3, context_window_size: 200_000 },
      session_id: "no-such-session",
    };
    const res = runStatusline(root, payload, {
      OMP_FLOW_CONTEXT_ID: "no-such-session",
    });
    expect(res.stderr).not.toContain("Traceback");
    expect(res.status).toBe(0);
    // No active task for this identity → no task line (the title never appears).
    expect(res.stdout).not.toContain("Smoke Task");
  });
});
