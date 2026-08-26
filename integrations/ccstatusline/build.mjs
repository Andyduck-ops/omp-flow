#!/usr/bin/env node
import {
  createHash
} from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import {
  tmpdir
} from "node:os";
import {
  dirname,
  join,
  resolve
} from "node:path";
import {
  spawnSync
} from "node:child_process";
import {
  fileURLToPath
} from "node:url";

const integrationRoot = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(integrationRoot, "flow-status-build.json"), "utf8"));
const args = process.argv.slice(2);

function argument(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function run(command, commandArgs, options = {}) {
  let executable = command;
  let executableArgs = commandArgs;
  if (process.platform === "win32" && command === "npm") {
    const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    if (!existsSync(npmCli)) throw new Error(`npm CLI not found beside Node: ${npmCli}`);
    executable = process.execPath;
    executableArgs = [npmCli, ...commandArgs];
  }
  const childEnv = {
    ...process.env,
    CI: "1"
  };
  // The reviewed provider tests assert its Unicode progress rendering. A caller's
  // presentation-only NO_COLOR preference must not change release artifact bytes or tests.
  delete childEnv.NO_COLOR;
  const result = spawnSync(executable, executableArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    env: childEnv,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
    timeout: options.timeout ?? 180_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim() : "";
    throw new Error(`${command} ${commandArgs.join(" ")} failed (${result.status})${detail ? `\n${detail}` : ""}`);
  }
  return String(result.stdout ?? "").trim();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (config.version !== 2) throw new Error("Unsupported Flow Status build manifest");
const outputArg = argument("--output");
const outputRoot = outputArg
  ? resolve(outputArg)
  : join(integrationRoot, "artifacts");
mkdirSync(outputRoot, { recursive: true });
const supervisorPath = resolve(
  argument("--supervisor") ?? join(integrationRoot, "..", "..", "dist", "cli", "flow-status-supervisor.js")
);
if (!existsSync(supervisorPath)) {
  throw new Error(`Built Flow Status supervisor is missing: ${supervisorPath}. Run npm run build first.`);
}

const sourceArg = argument("--source");
const source = sourceArg
  ? resolve(sourceArg)
  : config.upstream.url;
const temporaryRoot = mkdtempSync(join(tmpdir(), "omp-flow-ccstatusline-"));
const checkout = join(temporaryRoot, "source");
const patchPath = resolve(integrationRoot, config.patch.path);

try {
  if (sha256(patchPath) !== config.patch.sha256) {
    throw new Error("Reviewed ccstatusline patch digest mismatch");
  }
  const cloneArgs = ["clone", "--no-checkout"];
  if (sourceArg) cloneArgs.push("--no-hardlinks");
  cloneArgs.push(source, checkout);
  run("git", cloneArgs, { timeout: 180_000 });
  run("git", ["checkout", "--detach", config.upstream.revision], { cwd: checkout });
  const revision = run("git", ["rev-parse", "HEAD"], { cwd: checkout, capture: true });
  if (revision !== config.upstream.revision) {
    throw new Error(`Pinned upstream mismatch: ${revision}`);
  }
  run("git", ["diff", "--exit-code"], { cwd: checkout });
  run("git", ["apply", "--check", patchPath], { cwd: checkout });
  run("git", ["apply", patchPath], { cwd: checkout });

  const installArgs = ["install", "--frozen-lockfile"];
  if (!args.includes("--online")) installArgs.push("--offline");
  run("bun", installArgs, { cwd: checkout, timeout: 300_000 });
  run("bun", ["tsc", "--noEmit"], { cwd: checkout, timeout: 180_000 });
  run("bun", [
    "eslint",
    "src/providers/FlowStatusProvider.ts",
    "src/providers/__tests__/FlowStatusProvider.test.ts",
    "src/widgets/FlowStatus.ts",
    "src/widgets/__tests__/FlowStatus.test.ts",
    "src/types/Widget.ts",
    "src/utils/widget-manifest.ts",
    "src/widgets/index.ts",
    "src/ccstatusline.ts",
    "--config",
    "eslint.config.js",
    "--max-warnings=0"
  ], { cwd: checkout, timeout: 180_000 });
  run("bun", [
    "test",
    "src/providers/__tests__/FlowStatusProvider.test.ts",
    "src/widgets/__tests__/FlowStatus.test.ts",
    "src/utils/__tests__/widgets.test.ts"
  ], { cwd: checkout, timeout: 180_000 });

  const packagePath = join(checkout, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  packageJson.name = config.package.name;
  packageJson.version = config.package.version;
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  // Bun otherwise embeds the random checkout's absolute __dirname in this standalone bundle.
  // The package version is replaced at build time, so the development-only fallback is unreachable
  // in release bytes; defining it to a stable relative value makes clean builds byte reproducible.
  run("bun", [
    "build",
    "src/ccstatusline.ts",
    "--target=node",
    "--outfile=dist/ccstatusline.js",
    "--target-version=14",
    "--define",
    '__dirname="."'
  ], { cwd: checkout, timeout: 180_000 });
  run("bun", ["run", "scripts/replace-version.ts"], { cwd: checkout, timeout: 180_000 });

  const capabilityText = run(
    process.execPath,
    [join(checkout, "dist", "ccstatusline.js"), "--capabilities", "--json"],
    { cwd: checkout, capture: true }
  );
  const capability = JSON.parse(capabilityText);
  if (
    capability.flowStatusWidgetV2 !== config.capability.flowStatusWidgetV2
    || capability.flowStatusSnapshotV2 !== config.capability.flowStatusSnapshotV2
    || JSON.stringify(capability.flowStatusViewsV2) !== JSON.stringify(config.capability.flowStatusViewsV2)
    || capability.flowStatusSharedFrameReadV2 !== config.capability.flowStatusSharedFrameReadV2
    || capability.upstreamRevision !== config.capability.upstreamRevision
  ) {
    throw new Error(`Capability probe mismatch: ${capabilityText}`);
  }

  const artifactPaths = {
    provider: join(outputRoot, "ccstatusline.js"),
    supervisor: join(outputRoot, "supervisor.js"),
    packageMetadata: join(outputRoot, "package.json")
  };
  copyFileSync(join(checkout, "dist", "ccstatusline.js"), artifactPaths.provider);
  copyFileSync(supervisorPath, artifactPaths.supervisor);
  copyFileSync(packagePath, artifactPaths.packageMetadata);

  const artifacts = {
    provider: {
      path: "integrations/ccstatusline/artifacts/ccstatusline.js",
      sha256: sha256(artifactPaths.provider)
    },
    supervisor: {
      path: "integrations/ccstatusline/artifacts/supervisor.js",
      sha256: sha256(artifactPaths.supervisor)
    },
    packageMetadata: {
      path: "integrations/ccstatusline/artifacts/package.json",
      sha256: sha256(artifactPaths.packageMetadata)
    }
  };
  if (args.includes("--write-manifest")) {
    config.artifacts = artifacts;
    writeFileSync(
      join(integrationRoot, "flow-status-build.json"),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8"
    );
  } else if (JSON.stringify(config.artifacts) !== JSON.stringify(artifacts)) {
    throw new Error("Materialized Flow Status artifact digests do not match the release manifest");
  }

  const result = {
    version: 1,
    package: config.package,
    upstreamRevision: revision,
    patchSha256: config.patch.sha256,
    outputRoot,
    artifacts,
    capability
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
