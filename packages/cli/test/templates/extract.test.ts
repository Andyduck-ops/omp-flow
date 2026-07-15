import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  getOmpFlowTemplatePath,
  getClaudeTemplatePath,
  getOpenCodeTemplatePath,
  getPiTemplatePath,
  getPiSourcePath,
  getOmpFlowSourcePath,
  readOmpFlowFile,
  readTemplate,
  readScript,
  readMarkdown,
} from "../../src/templates/extract.js";

// =============================================================================
// getXxxTemplatePath — returns existing directory paths
// =============================================================================

describe("template path functions", () => {
  it("getOmpFlowTemplatePath returns existing directory", () => {
    const p = getOmpFlowTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it("getClaudeTemplatePath returns existing directory", () => {
    const p = getClaudeTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it("getOpenCodeTemplatePath returns existing directory", () => {
    const p = getOpenCodeTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it("getPiTemplatePath returns existing directory", () => {
    const p = getPiTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });
});

// =============================================================================
// Deprecated aliases return same result
// =============================================================================

describe("deprecated source path aliases", () => {
  it("getOmpFlowSourcePath equals getOmpFlowTemplatePath", () => {
    expect(getOmpFlowSourcePath()).toBe(getOmpFlowTemplatePath());
  });

  it("getPiSourcePath equals getPiTemplatePath", () => {
    expect(getPiSourcePath()).toBe(getPiTemplatePath());
  });
});

// =============================================================================
// readOmpFlowFile — reads files from omp-flow template directory
// =============================================================================

describe("readOmpFlowFile", () => {
  it("reads workflow.md from omp-flow templates", () => {
    const content = readOmpFlowFile("workflow.md");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("#");
  });

  it("reads a script file", () => {
    const content = readOmpFlowFile("scripts/omp_flow.py");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });

  it("throws for nonexistent file", () => {
    expect(() => readOmpFlowFile("nonexistent.txt")).toThrow();
  });
});

// =============================================================================
// readTemplate — reads from category subdirectories
// =============================================================================

describe("readTemplate", () => {
  it("throws for nonexistent category/file", () => {
    expect(() => readTemplate("scripts", "nonexistent.txt")).toThrow();
  });
});

// =============================================================================
// readScript / readMarkdown helpers
// =============================================================================

describe("readScript", () => {
  it("reads a Python script from scripts/", () => {
    const content = readScript("omp_flow.py");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });
});

describe("readMarkdown", () => {
  it("reads workflow.md", () => {
    const content = readMarkdown("workflow.md");
    expect(typeof content).toBe("string");
    expect(content).toContain("#");
  });
});
