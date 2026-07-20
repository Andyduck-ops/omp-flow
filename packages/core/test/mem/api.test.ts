/**
 * End-to-end tests for the public `@mindfoldhq/trellis-core/mem` API against a
 * small Claude fixture tree under a mocked $HOME.
 */

import {
  describe,
  it,
  expect,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";

const { fakeHome } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const f = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const o = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("node:path") as typeof import("node:path");
  const fakeHome = f.mkdtempSync(p.join(o.tmpdir(), "trellis-mem-api-"));
  return { fakeHome };
});

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => fakeHome };
});

const {
  listMemSessions,
  searchMemSessions,
  readMemContext,
  extractMemDialogue,
  listMemProjects,
  MemSessionNotFoundError,
} = await import("../../src/mem/index.js");

const CLAUDE_PROJECTS = nodePath.join(fakeHome, ".claude", "projects");
const PI_SESSIONS = nodePath.join(fakeHome, ".pi", "agent", "sessions");
const projectCwd = "/tmp/mem-api-project";
const projectDir = nodePath.join(
  CLAUDE_PROJECTS,
  projectCwd.replace(/[/_]/g, "-"),
);
const sessionId = "deadbeef-1234-5678-9abc-def012345678";
const sessionFile = nodePath.join(projectDir, `${sessionId}.jsonl`);

function writeJsonl(file: string, lines: readonly unknown[]): void {
  nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
  nodeFs.writeFileSync(
    file,
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
}

function piProjectDir(cwd: string): string {
  const safe = `--${nodePath
    .resolve(cwd)
    .replace(/^[/\\]/, "")
    .replace(/[/\\:]/g, "-")}--`;
  return nodePath.join(PI_SESSIONS, safe);
}

function seedPiSession(id: string, cwd: string): void {
  writeJsonl(nodePath.join(piProjectDir(cwd), `2026-06-18_${id}.jsonl`), [
    {
      type: "session",
      version: 3,
      id,
      timestamp: "2026-06-18T10:00:00.000Z",
      cwd,
    },
    {
      type: "message",
      id: "u1",
      parentId: null,
      timestamp: "2026-06-18T10:00:01.000Z",
      message: { role: "user", content: "Pi session remembers orchards" },
    },
    {
      type: "message",
      id: "a1",
      parentId: "u1",
      timestamp: "2026-06-18T10:00:02.000Z",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Orchards are indexed from Pi." }],
      },
    },
  ]);
}

function seedPiPhaseSession(id: string, cwd: string): void {
  writeJsonl(nodePath.join(piProjectDir(cwd), `2026-06-18_${id}.jsonl`), [
    {
      type: "session",
      version: 3,
      id,
      timestamp: "2026-06-18T11:00:00.000Z",
      cwd,
    },
    {
      type: "message",
      id: "u1",
      parentId: null,
      timestamp: "2026-06-18T11:00:01.000Z",
      message: { role: "user", content: "warmup outside" },
    },
    {
      type: "message",
      id: "a1",
      parentId: "u1",
      timestamp: "2026-06-18T11:00:02.000Z",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "pi brainstorm starts" },
          {
            type: "toolCall",
            name: "bash",
            arguments: { command: "task.py create --slug pi-api" },
          },
        ],
      },
    },
    {
      type: "message",
      id: "u2",
      parentId: "a1",
      timestamp: "2026-06-18T11:00:03.000Z",
      message: { role: "user", content: "pi brainstorm body" },
    },
    {
      type: "message",
      id: "b1",
      parentId: "u2",
      timestamp: "2026-06-18T11:00:04.000Z",
      message: {
        role: "bashExecution",
        command: "task.py start .trellis/tasks/06-18-pi-api",
        output: "",
      },
    },
    {
      type: "message",
      id: "u3",
      parentId: "b1",
      timestamp: "2026-06-18T11:00:05.000Z",
      message: { role: "user", content: "pi implementation" },
    },
  ]);
}

function seed(): void {
  writeJsonl(sessionFile, [
    {
      type: "user",
      cwd: projectCwd,
      timestamp: "2026-04-15T10:00:00Z",
      message: { role: "user", content: "I want to debug a memory leak" },
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Memory leaks usually come from unbounded caches.",
          },
        ],
      },
    },
    {
      type: "user",
      message: {
        role: "user",
        content: "great, can you find the cache in our heap dump?",
      },
    },
  ]);
}

beforeEach(() => {
  nodeFs.mkdirSync(projectDir, { recursive: true });
  seed();
});

afterEach(() => {
  nodeFs.rmSync(CLAUDE_PROJECTS, { recursive: true, force: true });
  nodeFs.rmSync(nodePath.join(fakeHome, ".pi"), {
    recursive: true,
    force: true,
  });
});

afterAll(() => {
  nodeFs.rmSync(fakeHome, { recursive: true, force: true });
});

describe("listMemSessions", () => {
  it("lists Pi sessions through the public API", () => {
    const piId = "pi-list-session";
    seedPiSession(piId, projectCwd);
    const rows = listMemSessions({
      filter: { platform: "pi", cwd: projectCwd, limit: 50 },
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: piId, platform: "pi" }),
      ]),
    );
  });

  it("lists the seeded session, cwd-scoped", () => {
    const rows = listMemSessions({
      filter: { platform: "all", cwd: projectCwd, limit: 50 },
    });
    expect(rows.find((s) => s.id === sessionId)).toBeDefined();
  });
});

describe("searchMemSessions", () => {
  it("searches Pi cleaned dialogue through the public API", () => {
    const piId = "pi-search-session";
    seedPiSession(piId, projectCwd);
    const result = searchMemSessions({
      keyword: "orchards",
      filter: { platform: "pi", cwd: projectCwd, limit: 50 },
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.session.id).toBe(piId);
    expect(result.matches[0]?.session.platform).toBe("pi");
  });

  it("returns a ranked match with hit counts and a totalMatches count", () => {
    const result = searchMemSessions({
      keyword: "memory",
      filter: { platform: "all", cwd: projectCwd, limit: 50 },
    });
    expect(result.matches.length).toBe(1);
    expect(result.totalMatches).toBe(1);
    const m = result.matches[0];
    expect(m?.session.id).toBe(sessionId);
    expect(m?.hit.count).toBeGreaterThan(0);
    expect(m?.score).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it("returns no matches for an absent keyword", () => {
    const result = searchMemSessions({
      keyword: "kombucha",
      filter: { cwd: projectCwd },
    });
    expect(result.matches).toEqual([]);
    expect(result.totalMatches).toBe(0);
  });
});

describe("readMemContext", () => {
  it("returns Pi context windows through the public API", () => {
    const piId = "pi-context-session";
    seedPiSession(piId, projectCwd);
    const result = readMemContext({
      sessionId: piId,
      filter: { platform: "pi", cwd: projectCwd },
      grep: "orchards",
      turns: 1,
      around: 0,
    });
    expect(result.session.platform).toBe("pi");
    expect(result.totalTurns).toBe(2);
    expect(result.turns.some((t) => t.isHit)).toBe(true);
  });

  it("returns the matched session's turns around a grep hit", () => {
    const result = readMemContext({
      sessionId,
      filter: { cwd: projectCwd },
      grep: "memory",
      turns: 1,
      around: 0,
    });
    expect(result.session.id).toBe(sessionId);
    expect(result.turns.length).toBeGreaterThan(0);
    expect(result.turns.some((t) => t.isHit)).toBe(true);
    expect(result.totalTurns).toBe(3);
  });

  it("throws MemSessionNotFoundError for an unknown id", () => {
    expect(() =>
      readMemContext({ sessionId: "no-such-id", filter: { cwd: projectCwd } }),
    ).toThrow(MemSessionNotFoundError);
  });
});

describe("extractMemDialogue", () => {
  it("slices Pi brainstorm windows through the public API", () => {
    const piId = "pi-phase-session";
    seedPiPhaseSession(piId, projectCwd);
    const result = extractMemDialogue({
      sessionId: piId,
      filter: { platform: "pi", cwd: projectCwd },
      phase: "brainstorm",
    });
    expect(result.phase).toBe("brainstorm");
    expect(result.windows).toEqual([
      { label: "pi-api", startTurn: 1, endTurn: 3 },
    ]);
    expect(result.turns.map((t) => t.text)).toEqual([
      "pi brainstorm starts",
      "pi brainstorm body",
    ]);
  });

  it("dumps cleaned dialogue for the session", () => {
    const result = extractMemDialogue({
      sessionId,
      filter: { cwd: projectCwd },
    });
    expect(result.session.id).toBe(sessionId);
    expect(result.turns.length).toBe(3);
    expect(result.phase).toBe("all");
  });

  it("filters turns by grep after phase slicing", () => {
    const result = extractMemDialogue({
      sessionId,
      filter: { cwd: projectCwd },
      grep: "cache",
    });
    expect(
      result.turns.every((t) => t.text.toLowerCase().includes("cache")),
    ).toBe(true);
    expect(result.turns.length).toBeGreaterThan(0);
  });

  it("warns and returns full dialogue when no brainstorm boundary exists", () => {
    const result = extractMemDialogue({
      sessionId,
      filter: { cwd: projectCwd },
      phase: "brainstorm",
    });
    expect(
      result.warnings.some((w) => w.code === "no-brainstorm-boundary"),
    ).toBe(true);
    expect(result.turns.length).toBe(3);
  });

  it("throws MemSessionNotFoundError for an unknown id", () => {
    expect(() =>
      extractMemDialogue({
        sessionId: "no-such-id",
        filter: { cwd: projectCwd },
      }),
    ).toThrow(MemSessionNotFoundError);
  });
});

describe("listMemProjects", () => {
  it("aggregates the seeded session's cwd with a per-platform count", () => {
    const rows = listMemProjects();
    const ours = rows.find((r) => r.cwd === projectCwd);
    expect(ours).toBeDefined();
    expect(ours?.sessions).toBeGreaterThan(0);
    expect(ours?.by_platform.claude).toBe(1);
    expect(ours?.by_platform.pi).toBe(0);
  });

  it("includes Pi sessions in project aggregation", () => {
    const piId = "pi-project-session";
    seedPiSession(piId, projectCwd);
    const rows = listMemProjects({ filter: { platform: "pi" } });
    const ours = rows.find((r) => r.cwd === projectCwd);
    expect(ours).toBeDefined();
    expect(ours?.sessions).toBe(1);
    expect(ours?.by_platform.pi).toBe(1);
    expect(ours?.by_platform.claude).toBe(0);
  });
});
