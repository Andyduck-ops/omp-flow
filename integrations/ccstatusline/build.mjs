#!/usr/bin/env node
import {
  createHash
} from "node:crypto";
import {
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
  basename,
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
  const result = spawnSync(executable, executableArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1"
    },
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
if (!outputArg) throw new Error("--output <directory> is required");
const outputRoot = resolve(outputArg);
mkdirSync(outputRoot, { recursive: true });

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
  run("bun", ["run", "build"], { cwd: checkout, timeout: 180_000 });

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

  const packText = run("npm", ["pack", "--json", "--pack-destination", outputRoot], {
    cwd: checkout,
    capture: true,
    timeout: 180_000
  });
  const packed = JSON.parse(packText);
  if (!Array.isArray(packed) || packed.length !== 1 || typeof packed[0]?.filename !== "string") {
    throw new Error("npm pack returned an unexpected result");
  }
  const tarball = join(outputRoot, basename(packed[0].filename));
  const result = {
    version: 1,
    package: config.package,
    upstreamRevision: revision,
    patchSha256: config.patch.sha256,
    tarball,
    tarballSha256: sha256(tarball),
    capability
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
