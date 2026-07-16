/**
 * omp-flow Claude adapter parity suite (PRD R7 / AC9).
 *
 * Ported from test2's `tests/omp-flow.test.ts` + `tests/fixtures/claude-hooks/`
 * (the dogfooded acceptance baseline). Fixture-only, deterministic, no live Claude
 * binary — the same honesty boundary as the dogfooded adapter's release gate
 * (see fixtures/claude-hooks/_provenance.json: capturedFromLiveRun === false).
 *
 * The tree under test is produced by the fork's OWN `init({ claude: true })`, so the
 * five DEPLOYED `.claude/hooks/*.py` wrappers are driven exactly as Claude Code would
 * invoke them: one UTF-8 JSON payload on stdin, CLAUDE_PROJECT_DIR = confined root.
 *
 * Each of the five parity behaviors has at least one fixture-tied assertion:
 *   (a) workflow-state injection on SessionStart + UserPromptSubmit,
 *   (b) PreToolUse(Agent) protected dispatch: prompt rewrite + dispatch marker,
 *   (c) SubagentStart identity marker with {agentId, agentType},
 *   (d) PreToolUse(Write) protected-path deny,
 *   (e) PreToolUse(Bash) `.omp-flow` composition-guard deny.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

import { init } from "../../src/commands/init.js";

const FIXTURE_DIR = fileURLToPath(
  new URL("./fixtures/claude-hooks", import.meta.url),
);

const STATE_MARKER = "<!-- omp-flow-workflow-state -->";
const DISPATCH_MARKER = "<!-- omp-flow-claude-dispatch:v1 -->";
const IDENTITY_MARKER = "<!-- omp-flow-claude-identity:v1 -->";

function pythonCommand(): string {
  return process.platform === "win32" ? "python" : "python3";
}

/** Run the deployed Python control plane directly (session identity via env). */
function runPython(
  root: string,
  args: string[],
  env: Record<string, string> = {},
  input = "",
): string {
  const script = path.join(root, ".omp-flow", "scripts", "omp_flow.py");
  return execFileSync(
    pythonCommand(),
    ["-X", "utf8", script, "--cwd", root, ...args],
    { cwd: root, input, encoding: "utf8", env: { ...process.env, ...env } },
  ).trim();
}

function runPythonJson<T>(
  root: string,
  args: string[],
  env: Record<string, string> = {},
  input = "",
): T {
  return JSON.parse(runPython(root, args, env, input)) as T;
}

/**
 * Run the control plane raw (spawnSync), capturing status + stdio — for
 * exit-code assertions (null-safe status, teaching exit 2) and `-h` content
 * checks where execFileSync's throw-on-nonzero is inconvenient. Ambient
 * OMP_FLOW_CONTEXT_ID is stripped so identity comes only from the env arg.
 */
function runPyRaw(
  root: string,
  args: string[],
  env: Record<string, string | undefined> = {},
): { status: number | null; stdout: string; stderr: string } {
  const script = path.join(root, ".omp-flow", "scripts", "omp_flow.py");
  const merged: Record<string, string> = {
    ...(process.env as Record<string, string>),
  };
  delete merged.OMP_FLOW_CONTEXT_ID;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  const result = spawnSync(
    pythonCommand(),
    ["-X", "utf8", script, "--cwd", root, ...args],
    { cwd: root, encoding: "utf8", env: merged },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** Invoke a DEPLOYED `.claude/hooks/<script>` wrapper the way Claude Code does. */
function runWrapper(
  script: string,
  root: string,
  payload: unknown,
  extraEnv: Record<string, string | undefined> = {},
): { status: number | null; stdout: string; stderr: string } {
  const wrapper = path.join(root, ".claude", "hooks", script);
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CLAUDE_PROJECT_DIR: root,
  };
  // Prove identity comes from the payload/wrapper, not ambient env.
  delete env.OMP_FLOW_CONTEXT_ID;
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  const result = spawnSync(pythonCommand(), ["-X", "utf8", wrapper], {
    cwd: root,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** Deep-replace exact placeholder strings in a committed fixture. */
function fillFixture(node: unknown, subs: Record<string, string>): unknown {
  if (typeof node === "string") return node in subs ? subs[node] : node;
  if (Array.isArray(node)) return node.map((item) => fillFixture(item, subs));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>))
      out[k] = fillFixture(v, subs);
    return out;
  }
  return node;
}

function loadFixture(
  name: string,
  subs: Record<string, string>,
): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
  return fillFixture(JSON.parse(raw), subs) as Record<string, unknown>;
}

/** Compact single-line ompFlowDispatch descriptor line. */
function dispatchLine(body: Record<string, unknown>): string {
  return JSON.stringify({ ompFlowDispatch: body });
}

/** Drive a fresh task to phase=execute / status=in_progress (frozen topology). */
function driveToExecuting(
  root: string,
  env: Record<string, string>,
  title: string,
  slug: string,
  csvRows: string[],
  briefs: Record<string, string>,
): { taskId: string; dir: string } {
  const created = runPythonJson<{ taskId: string }>(
    root,
    ["task", "create", title, "--slug", slug],
    env,
  );
  const dir = path.join(root, ".omp-flow", "tasks", created.taskId);
  fs.writeFileSync(
    path.join(dir, "tasks.csv"),
    [
      "id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd",
      ...csvRows,
      "",
    ].join("\n"),
    "utf8",
  );
  for (const [id, body] of Object.entries(briefs)) {
    fs.writeFileSync(path.join(dir, ".task", id + ".implement.md"), body, "utf8");
  }
  const synthesisRel = `research/90-synthesis-001-${slug}.md`;
  fs.writeFileSync(
    path.join(dir, synthesisRel),
    "# Synthesis\n\nEvidence.\n",
    "utf8",
  );
  runPython(root, ["workflow", "select-synthesis", "--path", synthesisRel], env);
  fs.writeFileSync(
    path.join(dir, "prd.md"),
    `# PRD\n\n## Goal\n\n${title}.\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "design.md"),
    `# Design\n\n## Architecture\n\n${title} core.\n`,
    "utf8",
  );
  for (const gate of ["qbd1", "qbd2"] as const) {
    const prepared = runPythonJson<{ report: string; evidenceDigest: string }>(
      root,
      ["gate", "prepare", gate],
      env,
    );
    fs.writeFileSync(
      path.join(dir, prepared.report),
      [
        "---",
        `gate: ${gate}`,
        "verdict: PASS",
        "risk: low",
        "evidenceDigest: " + prepared.evidenceDigest,
        "---",
        "",
        "# Audit",
        "",
      ].join("\n"),
      "utf8",
    );
    runPython(root, ["gate", "inspect", gate], env);
    runPython(root, ["gate", "decide", gate, "--decision", "pass", "--note", "ok"], env);
  }
  runPython(root, ["task", "start"], env);
  return { taskId: created.taskId, dir };
}

describe("omp-flow Claude adapter parity (deployed hooks + fixtures)", () => {
  let root: string;
  const claudeEnv = { OMP_FLOW_CONTEXT_ID: "claude-session-1" };
  const claudeSid = "claude-session-1";
  let claude: { taskId: string; dir: string };

  const qbdEnv = { OMP_FLOW_CONTEXT_ID: "claude-qbd-session" };
  const qbdSid = "claude-qbd-session";
  let qbdTask: { taskId: string };
  let prep: { report: string; evidenceDigest: string };

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "omp-flow-parity-"));
    fs.mkdirSync(path.join(root, ".git"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      // Faithful `omp-flow init --claude`: deploys .omp-flow/ + .claude/.
      await init({ claude: true, yes: true });
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
      errSpy.mockRestore();
    }

    // Executor session: a task driven to phase=execute with two frozen rows.
    claude = driveToExecuting(
      root,
      claudeEnv,
      "Claude Task",
      "claude",
      [
        "A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md",
        "B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md",
      ],
      { "A-001": "# A brief\n", "B-001": "# B brief\n" },
    );

    // QbD session: a task with a PREPARED qbd1 gate (protected-write allow path).
    qbdTask = runPythonJson<{ taskId: string }>(
      root,
      ["task", "create", "Claude QbD", "--slug", "claude-qbd"],
      qbdEnv,
    );
    const qbdDir = path.join(root, ".omp-flow", "tasks", qbdTask.taskId);
    fs.writeFileSync(
      path.join(qbdDir, "research", "90-synthesis-001-claude-qbd.md"),
      "# Synthesis\n\nEvidence.\n",
      "utf8",
    );
    runPython(
      root,
      ["workflow", "select-synthesis", "--path", "research/90-synthesis-001-claude-qbd.md"],
      qbdEnv,
    );
    fs.writeFileSync(
      path.join(qbdDir, "prd.md"),
      "# PRD\n\n## Goal\n\nClaude QbD.\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(qbdDir, "design.md"),
      "# Design\n\n## Architecture\n\nClaude QbD core.\n",
      "utf8",
    );
    prep = runPythonJson<{ report: string; evidenceDigest: string }>(
      root,
      ["gate", "prepare", "qbd1"],
      qbdEnv,
    );
  }, 120_000);

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("fixtures are honestly labelled as hand-authored (not captured from a live run)", () => {
    const provenance = JSON.parse(
      fs.readFileSync(path.join(FIXTURE_DIR, "_provenance.json"), "utf8"),
    ) as { capturedFromLiveRun: boolean };
    expect(provenance.capturedFromLiveRun).toBe(false);
  });

  it("deploys all five managed Claude hook wrappers", () => {
    for (const script of [
      "session-start.py",
      "inject-workflow-state.py",
      "inject-agent-context.py",
      "inject-agent-identity.py",
      "protect-python-owned.py",
    ]) {
      expect(fs.existsSync(path.join(root, ".claude", "hooks", script))).toBe(
        true,
      );
    }
  });

  // (a) Parity behavior 1: workflow-state injection on two events + non-fatal bridge.
  it("SessionStart injects workflow state, resolves the session phase, and bridges CLAUDE_ENV_FILE", () => {
    const envFile = path.join(root, "claude-env-bridge.sh");
    fs.writeFileSync(envFile, "", "utf8");
    const ss = runWrapper(
      "session-start.py",
      root,
      loadFixture("session-start.json", { __SESSION__: claudeSid, __ROOT__: root }),
      { CLAUDE_ENV_FILE: envFile },
    );
    expect(ss.status).toBe(0);
    const out = JSON.parse(ss.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext.startsWith(STATE_MARKER)).toBe(
      true,
    );
    expect(out.hookSpecificOutput.additionalContext).toContain("Phase: execute");
    const bridge = fs.readFileSync(envFile, "utf8");
    expect(bridge).toContain("export OMP_FLOW_CONTEXT_ID=claude-session-1");
    expect(bridge.trim().split(/\r?\n/).length).toBe(1);
  });

  it("SessionStart degrades gracefully (non-fatal) when CLAUDE_ENV_FILE is absent", () => {
    const ss = runWrapper(
      "session-start.py",
      root,
      loadFixture("session-start.json", { __SESSION__: claudeSid, __ROOT__: root }),
      { CLAUDE_ENV_FILE: undefined },
    );
    expect(ss.status).toBe(0);
    const ctx = (
      JSON.parse(ss.stdout) as {
        hookSpecificOutput: { additionalContext: string };
      }
    ).hookSpecificOutput.additionalContext;
    expect(ctx).toContain("Phase: execute");
    expect(ctx).not.toContain("STOP");
  });

  it("UserPromptSubmit injects per-turn workflow state; missing session fails closed", () => {
    const ups = runWrapper(
      "inject-workflow-state.py",
      root,
      loadFixture("user-prompt-submit.json", {
        __SESSION__: claudeSid,
        __ROOT__: root,
      }),
    );
    const out = JSON.parse(ups.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(ups.status).toBe(0);
    expect(out.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(out.hookSpecificOutput.additionalContext.startsWith(STATE_MARKER)).toBe(
      true,
    );
    expect(out.hookSpecificOutput.additionalContext).toContain("Phase: execute");

    const noSession = runWrapper("inject-workflow-state.py", root, {
      hook_event_name: "UserPromptSubmit",
      cwd: root,
    });
    expect(noSession.status).toBe(0);
    expect(
      JSON.parse(noSession.stdout).hookSpecificOutput.additionalContext,
    ).toContain("STOP");
  });

  // (b) Parity behavior 2: PreToolUse(Agent) protected dispatch — rewrite + marker.
  it("PreToolUse(Agent) rewrites the executor prompt with the dispatch marker and the row brief", () => {
    const execPrompt =
      dispatchLine({
        version: 1,
        role: "executor",
        taskId: claude.taskId,
        rowId: "A-001",
      }) + "\n实现根行 — implement the root row.";
    const res = runWrapper(
      "inject-agent-context.py",
      root,
      loadFixture("pretooluse-agent-executor.json", {
        __SESSION__: claudeSid,
        __ROOT__: root,
        __DISPATCH_PROMPT__: execPrompt,
      }),
    );
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout) as {
      hookSpecificOutput: {
        permissionDecision: string;
        updatedInput: Record<string, unknown>;
      };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe("allow");
    const prompt = String(out.hookSpecificOutput.updatedInput.prompt);
    expect(prompt.startsWith(DISPATCH_MARKER + "\n")).toBe(true);
    expect(prompt).toContain("# A brief");
    expect(prompt).toContain("implement the root row.");
    expect(prompt).toContain("实现根行"); // UTF-8 round-trips
    expect(out.hookSpecificOutput.updatedInput.subagent_type).toBe(
      "omp-flow-implement",
    );
  });

  it("PreToolUse(Task) QbD dispatch is allowed and re-rendered read-only with the dispatch marker", () => {
    const qbdPrompt =
      dispatchLine({
        version: 1,
        role: "qbd-auditor",
        taskId: qbdTask.taskId,
        gate: "qbd1",
        report: prep.report,
        evidenceDigest: prep.evidenceDigest,
      }) + "\nAudit as instructed.";
    const res = runWrapper(
      "inject-agent-context.py",
      root,
      loadFixture("pretooluse-task-qbd.json", {
        __SESSION__: qbdSid,
        __ROOT__: root,
        __DISPATCH_PROMPT__: qbdPrompt,
      }),
    );
    const out = JSON.parse(res.stdout) as {
      hookSpecificOutput: {
        permissionDecision: string;
        updatedInput: Record<string, unknown>;
      };
    };
    expect(res.status).toBe(0);
    expect(out.hookSpecificOutput.permissionDecision).toBe("allow");
    const prompt = String(out.hookSpecificOutput.updatedInput.prompt);
    expect(prompt.startsWith(DISPATCH_MARKER + "\n")).toBe(true);
    expect(prompt).toContain("Audit qbd1 evidence adversarially");
  });

  it("PreToolUse(Agent) denies an unknown reserved omp-flow-* agent (fail-closed dispatch)", () => {
    const res = runWrapper("inject-agent-context.py", root, {
      hook_event_name: "PreToolUse",
      session_id: claudeSid,
      cwd: root,
      tool_name: "Agent",
      tool_input: { subagent_type: "omp-flow-implment", prompt: "x" },
    });
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout) as {
      hookSpecificOutput: {
        permissionDecision: string;
        permissionDecisionReason: string;
      };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput.permissionDecisionReason).toMatch(
      /Unknown reserved omp-flow agent/,
    );
  });

  // (c) Parity behavior 3: SubagentStart identity marker with {agentId, agentType}.
  it("SubagentStart injects exactly one identity marker binding {agentId, agentType}", () => {
    const managed = [
      "omp-flow-research",
      "omp-flow-architect",
      "omp-flow-qbd",
      "omp-flow-implement",
      "omp-flow-check",
    ];
    for (const name of managed) {
      const payload =
        name === "omp-flow-check"
          ? loadFixture("subagent-start-check.json", {
              __SESSION__: "sub-sess",
              __AGENT_ID__: `native-${name}`,
              __ROOT__: root,
            })
          : {
              hook_event_name: "SubagentStart",
              session_id: "sub-sess",
              agent_type: name,
              agent_id: `native-${name}`,
              cwd: root,
            };
      const id = runWrapper("inject-agent-identity.py", root, payload);
      expect(id.status).toBe(0);
      const ctx = (
        JSON.parse(id.stdout) as {
          hookSpecificOutput: { additionalContext: string };
        }
      ).hookSpecificOutput.additionalContext;
      expect(ctx.startsWith(IDENTITY_MARKER + "\n")).toBe(true);
      expect((ctx.match(/omp-flow-claude-identity:v1/g) ?? []).length).toBe(1);
      const identity = JSON.parse(ctx.split("\n")[1]) as {
        agentId: string;
        agentType: string;
      };
      expect(identity.agentId).toBe(`native-${name}`);
      expect(identity.agentType).toBe(name);
    }
  });

  it("SubagentStart emits no identity marker for an unrecognized agent_type", () => {
    const res = runWrapper("inject-agent-identity.py", root, {
      hook_event_name: "SubagentStart",
      session_id: "sub-sess",
      agent_type: "general-purpose",
      agent_id: "x",
    });
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain(IDENTITY_MARKER);
  });

  // (d) Parity behavior 4: PreToolUse(Write) protected-path deny (+ QbD-report allow).
  it("PreToolUse(Write) denies a protected Python-owned task.json write for a non-QbD writer", () => {
    const res = runWrapper(
      "protect-python-owned.py",
      root,
      loadFixture("pretooluse-write-protected.json", {
        __SESSION__: claudeSid,
        __ROOT__: root,
        __WRITE_PATH__: `.omp-flow/tasks/${claude.taskId}/task.json`,
      }),
    );
    const out = JSON.parse(res.stdout) as {
      hookSpecificOutput: {
        permissionDecision: string;
        permissionDecisionReason: string;
      };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput.permissionDecisionReason).toMatch(
      /Python-owned path/,
    );
  });

  it("PreToolUse(Write) allows the exact prepared QbD report (the sole protected-path exception)", () => {
    const res = runWrapper(
      "protect-python-owned.py",
      root,
      loadFixture("pretooluse-write-qbd-report.json", {
        __SESSION__: qbdSid,
        __AGENT_ID__: "qbd-native-1",
        __ROOT__: root,
        __WRITE_PATH__: `.omp-flow/tasks/${qbdTask.taskId}/${prep.report}`,
      }),
    );
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout) as {
      hookSpecificOutput: { permissionDecision: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  // (e) Parity behavior 5: PreToolUse(Bash) `.omp-flow` composition guard.
  it("PreToolUse(Bash) permits a clean omp_flow.py invocation but denies shell composition around it", () => {
    const clean = runWrapper(
      "protect-python-owned.py",
      root,
      loadFixture("pretooluse-bash-omp-flow.json", {
        __SESSION__: claudeSid,
        __ROOT__: root,
        __BASH_COMMAND__:
          "python .omp-flow/scripts/omp_flow.py --cwd . task current",
      }),
    );
    expect(clean.status).toBe(0);
    expect(clean.stdout.trim()).toBe("");

    const composed = runWrapper(
      "protect-python-owned.py",
      root,
      loadFixture("pretooluse-bash-omp-flow.json", {
        __SESSION__: claudeSid,
        __ROOT__: root,
        __BASH_COMMAND__:
          "python .omp-flow/scripts/omp_flow.py --cwd . task current > steal.txt",
      }),
    );
    const out = JSON.parse(composed.stdout) as {
      hookSpecificOutput: {
        permissionDecision: string;
        permissionDecisionReason: string;
      };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput.permissionDecisionReason).toMatch(
      /shell composition/,
    );
  });

  it("PreToolUse(Bash) denies direct access to a protected path", () => {
    const res = runWrapper(
      "protect-python-owned.py",
      root,
      loadFixture("pretooluse-bash-omp-flow.json", {
        __SESSION__: claudeSid,
        __ROOT__: root,
        __BASH_COMMAND__: "cat .omp-flow/tasks/x/task.json",
      }),
    );
    const out = JSON.parse(res.stdout) as {
      hookSpecificOutput: { permissionDecision: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  // (f) Row A-001: read-only CLI inspection verbs + help sweep + workflow explain.
  //     Fixes the four M3 misfires (status --task / task show / topology list /
  //     task select --task) and lands the frozen shapes from
  //     interface:cli-inspection-verbs against the init-produced control plane.
  describe("CLI inspection verbs + help + workflow explain (Row A-001)", () => {
    it("status --task returns the frozen {active, task, topology} shape (exit 0)", () => {
      const out = runPythonJson<{
        active: { task_id: string } | null;
        task: { id: string } | null;
        topology: { rows: number; byStatus: Record<string, number> } | null;
      }>(root, ["status", "--task", claude.taskId], claudeEnv);
      expect(out.task?.id).toBe(claude.taskId);
      expect(out.topology?.rows).toBe(2);
      expect(out.topology?.byStatus.pending).toBe(2);
    });

    it("status is null-safe when the session has no selected task (exit 0)", () => {
      const r = runPyRaw(root, ["status"], { OMP_FLOW_CONTEXT_ID: "a001-no-task" });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout) as {
        active: unknown;
        task: unknown;
        topology: unknown;
      };
      expect(out.active).toBeNull();
      expect(out.task).toBeNull();
      expect(out.topology).toBeNull();
    });

    it("status reports a stale pointer with task null (never hard-fails on identity)", () => {
      const sid = "a001-stale";
      const cur = runPythonJson<{ contextKey: string }>(
        root,
        ["task", "current"],
        { OMP_FLOW_CONTEXT_ID: sid },
      );
      const sessionFile = path.join(
        root,
        ".omp-flow",
        ".runtime",
        "sessions",
        `${cur.contextKey}.json`,
      );
      fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
      fs.writeFileSync(
        sessionFile,
        JSON.stringify({
          current_task: "does-not-exist",
          context_key: cur.contextKey,
        }),
        "utf8",
      );
      const r = runPyRaw(root, ["status"], { OMP_FLOW_CONTEXT_ID: sid });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout) as {
        active: { stale: boolean } | null;
        task: unknown;
        topology: unknown;
      };
      expect(out.active?.stale).toBe(true);
      expect(out.task).toBeNull();
      expect(out.topology).toBeNull();
    });

    it("task show ID returns a summary-only shape; a bogus id exits 2 naming task list", () => {
      const out = runPythonJson<{
        task: { id: string };
        gates: Record<string, { status: string; attempt: number }>;
        topology: { rows: number; frozen: boolean };
        evidence: { entries: number };
        taskDir: string;
      }>(root, ["task", "show", claude.taskId], claudeEnv);
      expect(out.task.id).toBe(claude.taskId);
      expect(out.gates.qbd1.status).toBe("approved");
      expect(out.gates.qbd2.status).toBe("approved");
      expect(out.topology.rows).toBe(2);
      expect(out.topology.frozen).toBe(true);
      expect(out.evidence.entries).toBe(0);
      expect(out.taskDir.endsWith(claude.taskId)).toBe(true);

      const bogus = runPyRaw(root, ["task", "show", "no-such-task"], claudeEnv);
      expect(bogus.status).toBe(2);
      expect(bogus.stderr).toMatch(/task list/);
    });

    it("topology list returns rows + byStatus + non-fatal validation (ok on a valid DAG)", () => {
      const out = runPythonJson<{
        taskId: string;
        rows: Array<{ id: string }>;
        byStatus: Record<string, number>;
        validation: { ok: boolean; waves?: Record<string, number> };
      }>(root, ["topology", "list", "--task", claude.taskId], claudeEnv);
      expect(out.taskId).toBe(claude.taskId);
      expect(out.rows.length).toBe(2);
      expect(out.byStatus.pending).toBe(2);
      expect(out.validation.ok).toBe(true);
      expect(out.validation.waves?.["A-001"]).toBe(1);
    });

    it("topology list degrades to validation.ok=false on a broken DAG instead of aborting", () => {
      const brokenEnv = { OMP_FLOW_CONTEXT_ID: "a001-broken" };
      const created = runPythonJson<{ taskId: string }>(
        root,
        ["task", "create", "A001 Broken", "--slug", "a001-broken"],
        brokenEnv,
      );
      const dir = path.join(root, ".omp-flow", "tasks", created.taskId);
      // wave 5 is wrong for a root row (expected 1): validate_rows raises, but the
      // listing must still return the rows with validation.ok=false.
      fs.writeFileSync(
        path.join(dir, "tasks.csv"),
        [
          "id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd",
          "A-001,5,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md",
          "",
        ].join("\n"),
        "utf8",
      );
      const out = runPythonJson<{
        rows: Array<{ id: string }>;
        validation: { ok: boolean; error?: string };
      }>(root, ["topology", "list", "--task", created.taskId], brokenEnv);
      expect(out.rows.length).toBe(1);
      expect(out.validation.ok).toBe(false);
      expect(typeof out.validation.error).toBe("string");
      expect(out.validation.error).toMatch(/wave/i);
    });

    it("task select accepts --task as an alias of the positional (the M3 misfire class)", () => {
      const sid = "a001-select";
      const selected = runPythonJson<{ task_id: string }>(
        root,
        ["task", "select", "--task", claude.taskId],
        { OMP_FLOW_CONTEXT_ID: sid },
      );
      expect(selected.task_id).toBe(claude.taskId);
      const cur = runPythonJson<{ taskId: string }>(
        root,
        ["task", "current"],
        { OMP_FLOW_CONTEXT_ID: sid },
      );
      expect(cur.taskId).toBe(claude.taskId);
    });

    it("workflow explain renders a section, lists sections, and errors teachably on an unknown one", () => {
      const phases = runPython(root, ["workflow", "explain", "phases"]);
      expect(phases).toContain("## Phase Index");
      expect(phases).toContain("Explore");

      const list = runPython(root, ["workflow", "explain"]);
      expect(list).toMatch(/phases/);
      expect(list).toMatch(/guardrails/);

      const bogus = runPyRaw(root, ["workflow", "explain", "bogus"]);
      expect(bogus.status).toBe(2);
      expect(bogus.stderr).toMatch(/Valid sections/);
      expect(bogus.stderr).toMatch(/phases/);
    });

    it("omp_flow.py -h and each new subparser -h carry non-empty help; the epilog names the inspection verbs", () => {
      const top = runPyRaw(root, ["-h"]);
      expect(top.status).toBe(0);
      expect(top.stdout).toContain("status");
      expect(top.stdout).toContain("task show");
      expect(top.stdout).toContain("topology list");
      expect(top.stdout).toContain("workflow explain");
      for (const sub of [
        ["task", "show"],
        ["topology", "list"],
        ["workflow", "explain"],
        ["status"],
      ]) {
        const help = runPyRaw(root, [...sub, "-h"]);
        expect(help.status).toBe(0);
        expect(help.stdout).toMatch(/usage:/);
        expect(help.stdout.length).toBeGreaterThan(0);
      }
    });
  });
});
