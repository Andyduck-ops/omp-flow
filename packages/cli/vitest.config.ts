import { defineConfig } from "vitest/config";

// Heavy-I/O test files (git subprocess spawning + large sandbox filesystem
// churn). Under default file parallelism they starve sibling test files on
// this machine's disk/subprocess bandwidth — proven by the full suite going
// red at default parallelism while `vitest run --fileParallelism=false` is
// fully green (row A-001 contention confirmation, 2026-07-17). They run as
// a separate sequential project AFTER the main group (sequence.groupOrder),
// so the rest of the suite keeps full parallelism and no timeout is
// inflated.
const HEAVY_IO_TESTS = [
  "test/utils/template-fetcher.test.ts",
  "test/commands/init-uninstall-overdelete.integration.test.ts",
];

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/cli/index.ts"],
      reportsDirectory: "./coverage",
    },
    projects: [
      {
        test: {
          name: "main",
          testTimeout: 10_000,
          include: ["test/**/*.test.ts"],
          exclude: ["third/**", "node_modules/**", ...HEAVY_IO_TESTS],
          setupFiles: ["./test/setup.ts"],
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: "heavy-io",
          testTimeout: 10_000,
          include: HEAVY_IO_TESTS,
          exclude: ["third/**", "node_modules/**"],
          setupFiles: ["./test/setup.ts"],
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
