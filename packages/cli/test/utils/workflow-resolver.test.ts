/**
 * Unit tests for the workflow template resolver.
 *
 * Native resolution is offline (no fetch). Marketplace resolution is exercised
 * by passing an explicit `{ source }` and stubbing `fetch` on that source's
 * index/raw URLs. There is no default marketplace: with no source, non-native
 * ids silently fall back to the bundled native workflow.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NATIVE_WORKFLOW_ID,
  WorkflowResolveError,
  listWorkflowTemplates,
  resolveWorkflowTemplate,
} from "../../src/utils/workflow-resolver.js";
import { workflowMdTemplate } from "../../src/templates/omp-flow/index.js";

// Explicit marketplace source used to exercise remote resolution. There is no
// default marketplace anymore, so every remote test must pass a source.
const SOURCE = "gh:acme/marketplace";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveWorkflowTemplate(native)", () => {
  it("returns the bundled native workflow content without network access", async () => {
    // No fetch stub installed — proves we never call the network for native.
    const resolved = await resolveWorkflowTemplate(NATIVE_WORKFLOW_ID);
    expect(resolved.id).toBe(NATIVE_WORKFLOW_ID);
    expect(resolved.source).toBe("bundled");
    expect(resolved.content).toBe(workflowMdTemplate);
  });
});

describe("resolveWorkflowTemplate(marketplace)", () => {
  it("fetches index.json, finds the workflow entry, and downloads its content", async () => {
    const index = {
      version: 1,
      templates: [
        {
          id: "tdd",
          type: "workflow",
          name: "TDD Workflow",
          description: "red/green/refactor",
          path: "workflows/tdd/workflow.md",
        },
        {
          id: "electron-fullstack",
          type: "spec",
          name: "Electron",
          path: "specs/electron-fullstack",
        },
      ],
    };
    const fakeContent = "# TDD\n\nPhase 2.1 red → green → refactor.\n";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith("/index.json")) {
          return new Response(JSON.stringify(index), { status: 200 });
        }
        if (url.endsWith("workflows/tdd/workflow.md")) {
          return new Response(fakeContent, { status: 200 });
        }
        return new Response("nope", { status: 404 });
      }),
    );

    const resolved = await resolveWorkflowTemplate("tdd", { source: SOURCE });
    expect(resolved.id).toBe("tdd");
    expect(resolved.source).toBe("marketplace");
    expect(resolved.content).toBe(fakeContent);
  });

  it("throws WorkflowResolveError with workflow-specific copy when id is missing", async () => {
    const index = {
      version: 1,
      templates: [
        {
          id: "tdd",
          type: "workflow",
          name: "TDD",
          path: "workflows/tdd/workflow.md",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify(index), { status: 200 }),
      ),
    );

    await expect(
      resolveWorkflowTemplate("does-not-exist", { source: SOURCE }),
    ).rejects.toThrow(WorkflowResolveError);
    await expect(
      resolveWorkflowTemplate("does-not-exist", { source: SOURCE }),
    ).rejects.toThrow(/workflow template/i);
  });

  it("surfaces a workflow-specific error when the index cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );

    await expect(
      resolveWorkflowTemplate("tdd", { source: SOURCE }),
    ).rejects.toThrow(/workflow template index/i);
  });

  it("rejects an entry whose path does not point to a .md file", async () => {
    const index = {
      version: 1,
      templates: [
        {
          id: "broken",
          type: "workflow",
          name: "Broken",
          path: "workflows/broken/",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify(index), { status: 200 }),
      ),
    );

    await expect(
      resolveWorkflowTemplate("broken", { source: SOURCE }),
    ).rejects.toThrow(/workflow\.md/);
  });

  it("rejects workflow paths that escape the marketplace root", async () => {
    const index = {
      version: 1,
      templates: [
        {
          id: "escape",
          type: "workflow",
          name: "Escape",
          path: "../workflow.md",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify(index), { status: 200 }),
      ),
    );

    await expect(
      resolveWorkflowTemplate("escape", { source: SOURCE }),
    ).rejects.toThrow(/marketplace root/);
  });
});

describe("resolveWorkflowTemplate(no source, non-native id)", () => {
  it("silently falls back to the bundled native workflow without any network call", async () => {
    // No default marketplace exists: a non-native id with no source must NOT
    // throw and must NOT hit the network — it degrades to native (design D-D).
    const fetchSpy = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);

    const resolved = await resolveWorkflowTemplate("tdd");
    expect(resolved.id).toBe(NATIVE_WORKFLOW_ID);
    expect(resolved.source).toBe("bundled");
    expect(resolved.content).toBe(workflowMdTemplate);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("listWorkflowTemplates", () => {
  it("always includes the bundled native entry first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    const { templates, errorMessage } = await listWorkflowTemplates({
      source: SOURCE,
    });
    expect(errorMessage).toBeTruthy();
    expect(templates[0].id).toBe(NATIVE_WORKFLOW_ID);
    expect(templates[0].source).toBe("bundled");
  });

  it("returns only the native entry (no error, no network) when no source is configured", async () => {
    const fetchSpy = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { templates, errorMessage } = await listWorkflowTemplates();
    expect(errorMessage).toBeUndefined();
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe(NATIVE_WORKFLOW_ID);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("includes workflow entries from the marketplace index", async () => {
    const index = {
      version: 1,
      templates: [
        {
          id: "tdd",
          type: "workflow",
          name: "TDD Workflow",
          path: "workflows/tdd/workflow.md",
        },
        {
          id: "channel-driven-subagent-dispatch",
          type: "workflow",
          name: "Channel-Driven",
          path: "workflows/channel-driven-subagent-dispatch/workflow.md",
        },
        {
          id: "electron-fullstack",
          type: "spec",
          name: "Electron",
          path: "specs/electron-fullstack",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify(index), { status: 200 }),
      ),
    );

    const { templates } = await listWorkflowTemplates({ source: SOURCE });
    const ids = templates.map((t) => t.id);
    expect(ids).toContain(NATIVE_WORKFLOW_ID);
    expect(ids).toContain("tdd");
    expect(ids).toContain("channel-driven-subagent-dispatch");
    expect(ids).not.toContain("electron-fullstack");
  });
});
