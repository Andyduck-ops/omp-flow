import { describe, expect, it, vi } from "vitest";
import {
  buildUpgradeCommand,
  resolveUpgradeTag,
  upgrade,
} from "../../src/commands/upgrade.js";

describe("upgrade command", () => {
  it("defaults stable versions to latest", () => {
    expect(resolveUpgradeTag("0.5.12")).toBe("latest");
  });

  it("defaults beta versions to beta", () => {
    expect(resolveUpgradeTag("0.6.0-beta.8")).toBe("beta");
  });

  it("defaults rc versions to rc", () => {
    expect(resolveUpgradeTag("0.5.0-rc.7")).toBe("rc");
  });

  it("honors an explicit tag or version", () => {
    expect(resolveUpgradeTag("0.6.0-beta.8", "latest")).toBe("latest");
    expect(resolveUpgradeTag("0.6.0-beta.8", "0.6.0-beta.9")).toBe(
      "0.6.0-beta.9",
    );
  });

  it("rejects shell-shaped tags", () => {
    expect(() => resolveUpgradeTag("0.5.12", "latest && rm -rf /")).toThrow(
      /Invalid npm tag\/version/,
    );
  });

  it("builds POSIX npm global install command without shell", () => {
    expect(
      buildUpgradeCommand({ tag: "beta" }, "0.5.12", "darwin"),
    ).toMatchObject({
      command: "npm",
      args: ["install", "-g", "omp-flow@beta"],
      spawnOptions: { stdio: "inherit", shell: false },
      displayCommand: "npm install -g omp-flow@beta",
      target: "omp-flow@beta",
      tag: "beta",
      binaryCheckCommand: "which omp-flow",
    });
  });

  it("builds Windows command through cmd.exe", () => {
    expect(
      buildUpgradeCommand({ tag: "beta" }, "0.5.12", "win32"),
    ).toMatchObject({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm install -g omp-flow@beta"],
      spawnOptions: { stdio: "inherit", shell: false },
      displayCommand: "npm install -g omp-flow@beta",
      target: "omp-flow@beta",
      tag: "beta",
      binaryCheckCommand: "where omp-flow",
    });
  });

  it("dry-run does not execute npm", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const runner = vi.fn();

    await upgrade({ dryRun: true, tag: "latest" }, runner);

    expect(runner).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Run: npm install -g omp-flow@latest"),
    );

    log.mockRestore();
  });

  it("executes npm install for real upgrades", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const runner = vi.fn(() => ({ status: 0, signal: null }));

    await upgrade({ tag: "latest" }, runner);

    // Platform-aware: upgrade() derives command/args from process.platform via
    // buildUpgradeCommand (win32 -> cmd.exe runner form; POSIX -> npm directly)
    // and binaryCheckCommand (win32 -> `where`, POSIX -> `which`). Assert against
    // the CORRECT production output on the host so the test passes on BOTH.
    const isWin = process.platform === "win32";
    expect(runner).toHaveBeenCalledWith(
      isWin ? "cmd.exe" : "npm",
      isWin
        ? ["/d", "/s", "/c", "npm install -g omp-flow@latest"]
        : ["install", "-g", "omp-flow@latest"],
      { stdio: "inherit", shell: false },
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("omp-flow --version"),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(isWin ? "where omp-flow" : "which omp-flow"),
    );

    log.mockRestore();
  });

  it("fails when npm exits non-zero", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const runner = vi.fn(() => ({ status: 1, signal: null }));

    // Platform-aware: the troubleshooting block's binary-check hint is
    // `where omp-flow` on win32 and `which omp-flow` on POSIX (upgrade.ts
    // binaryCheckCommand). Build the expected pattern from the host platform.
    const binaryCheck =
      process.platform === "win32" ? "where omp-flow" : "which omp-flow";
    await expect(upgrade({ tag: "latest" }, runner)).rejects.toThrow(
      new RegExp(
        `npm install failed with exit code 1\\.[\\s\\S]*Troubleshooting:[\\s\\S]*Manual command: npm install -g omp-flow@latest[\\s\\S]*npm config get prefix[\\s\\S]*${binaryCheck}`,
      ),
    );

    log.mockRestore();
  });
});
