/**
 * omp-flow Codex pull-handshake fixture test (PRD R7 / AC-R7 clause 7).
 *
 * Fixture-only, deterministic, NO live Codex binary. Codex is a class-2 (pull)
 * platform: its deployed sub-agents load their bound context by shelling out to
 * `omp_flow.py context --role <role> --task <t> [--row <row>]` (the prelude C1
 * injects into every pull agent). This test proves that exact deployed command
 * is well-formed end to end: it lifts the `context` invocation VERBATIM from the
 * deployed `.codex/agents/omp-flow-implement.toml`, substitutes the fixture
 * task/row IDs, and runs the SAME Python `context` entrypoint the sub-agent
 * would — asserting it returns freeze-checked, row-bound executor context on a
 * frozen row and DENIES on a wrong-status / bogus row.
 *
 * Mirrors the Claude parity suite's runPython + driveToExecuting fixture
 * approach (test/omp-flow/parity.test.ts) — the same honesty boundary.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { init } from "../../src/commands/init.js";

function pythonCommand(): string {
  return process.platform === "win32" ? "python" : "python3";
}

/** Run the DEPLOYED omp-flow control plane directly (freeze-only pull path). */
function runPython(
  root: string,
  args: string[],
  env: Record<string, string> = {},
): string {
  const script = path.join(root, ".omp-flow", "scripts", "omp_flow.py");
  return execFileSync(
    pythonCommand(),
    ["-X", "utf8", script, "--cwd", root, ...args],
    { cwd: root, encoding: "utf8", env: { ...process.env, ...env } },
  ).trim();
}

function runPythonJson<T>(
  root: string,
  args: string[],
  env: Record<string, string> = {},
): T {
  return JSON.parse(runPython(root, args, env)) as T;
}

/** Split a shell-ish arg string, honoring a single double-quoted --prompt. */
function tokenizeArgs(s: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : m[2]);
  }
  return tokens;
}

/**
 * Lift the `omp_flow.py context …` invocation for a role out of a deployed
 * codex agent toml and return its arg vector with the fixture IDs substituted.
 * Proves the DEPLOYED command string (not a hand-written one) is what runs.
 */
function deployedContextArgs(
  tomlPath: string,
  roleToken: string,
  subs: Record<string, string>,
): string[] {
  const content = fs.readFileSync(tomlPath, "utf-8");
  const line = content
    .split(/\r?\n/)
    .find((l) => l.includes(`omp_flow.py context --role ${roleToken}`));
  if (!line) {
    throw new Error(`no context line for role ${roleToken} in ${tomlPath}`);
  }
  const marker = "omp_flow.py ";
  let argStr = line.slice(line.indexOf(marker) + marker.length);
  for (const [from, to] of Object.entries(subs)) {
    argStr = argStr.split(from).join(to);
  }
  return tokenizeArgs(argStr);
}

/** Drive a fresh task to phase=execute / status=in_progress (frozen rows). */
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
  fs.writeFileSync(path.join(dir, synthesisRel), "# Synthesis\n\nEvidence.\n", "utf8");
  runPython(root, ["workflow", "select-synthesis", "--path", synthesisRel], env);
  fs.writeFileSync(path.join(dir, "prd.md"), `# PRD\n\n## Goal\n\n${title}.\n`, "utf8");
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

describe("omp-flow codex pull-handshake (deployed prelude → freeze-checked context)", () => {
  let root: string;
  let task: { taskId: string };
  const env = { OMP_FLOW_CONTEXT_ID: "codex-fixture-1" };
  const ROW = "A-001";
  let implementToml: string;
  let checkToml: string;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "omp-flow-codex-pull-"));
    fs.mkdirSync(path.join(root, ".git"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      // Faithful `omp-flow init --codex`: deploys .omp-flow/ + .codex/.
      await init({ codex: true, yes: true });
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
    implementToml = path.join(root, ".codex", "agents", "omp-flow-implement.toml");
    checkToml = path.join(root, ".codex", "agents", "omp-flow-check.toml");

    task = driveToExecuting(
      root,
      env,
      "Codex Fixture",
      "codex-fixture",
      [
        `${ROW},1,P0,Root,src/a.ts,implement,,,pending,task,.task/${ROW}.implement.md`,
      ],
      { [ROW]: "# A brief — the frozen executor row.\n" },
    );
  }, 120_000);

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("the deployed executor prelude command returns freeze-checked, row-bound context", () => {
    // Lift the EXACT executor command from the deployed toml, substitute IDs.
    const args = deployedContextArgs(implementToml, "executor", {
      "<taskId>": task.taskId,
      "<rowId>": ROW,
    });
    expect(args[0]).toBe("context");
    expect(args).toContain("--role");
    expect(args).toContain("executor");
    expect(args).toContain(task.taskId);
    expect(args).toContain(ROW);

    const out = runPython(root, args);
    expect(out.length).toBeGreaterThan(0);
    // Freeze-checked executor handoff bound to this exact task+row.
    expect(out).toContain("<!-- omp-flow-python-context -->");
    expect(out).toContain("Executor Handoff");
    expect(out).toContain(`Task ID: ${task.taskId}`);
    expect(out).toContain("## Committed Design");
    expect(out).toContain("# A brief — the frozen executor row.");
  });

  it("DENIES the pull on a wrong-status role (reviewer on a pending row)", () => {
    // The deployed reviewer command, run against the same frozen row whose
    // status is `pending` (valid for executor, NOT for reviewer). The freeze
    // passes; the role/status gate rejects — proving the row-bound guarantee.
    const args = deployedContextArgs(checkToml, "reviewer", {
      "<taskId>": task.taskId,
      "<rowId>": ROW,
    });
    expect(() => runPython(root, args)).toThrow();
  });

  it("DENIES the pull on a bogus row id (unfrozen / absent row)", () => {
    const args = deployedContextArgs(implementToml, "executor", {
      "<taskId>": task.taskId,
      "<rowId>": "NOPE-999",
    });
    expect(() => runPython(root, args)).toThrow();
  });
});
