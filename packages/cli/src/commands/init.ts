import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import figlet from "figlet";
import inquirer from "inquirer";
import { createWorkflowStructure } from "../configurators/workflow.js";
import {
  getInitToolChoices,
  resolveCliFlag,
  configurePlatform,
  getConfiguredPlatforms,
  getPlatformsWithPythonHooks,
} from "../configurators/index.js";
import {
  getPythonCommandForPlatform,
  setResolvedPythonCommand,
} from "../configurators/shared.js";
import { AI_TOOLS, type CliFlag } from "../types/ai-tools.js";
import { DIR_NAMES, FILE_NAMES, PATHS } from "../constants/paths.js";
import { VERSION } from "../constants/version.js";
import { agentsMdContent } from "../templates/markdown/index.js";
import {
  setWriteMode,
  startRecordingWrites,
  stopRecordingWrites,
  writeFile,
  type WriteMode,
} from "../utils/file-writer.js";
import {
  detectProjectType,
  detectMonorepo,
  sanitizePkgName,
  type ProjectType,
  type DetectedPackage,
} from "../utils/project-detector.js";
import { initializeHashes, removeHash } from "../utils/template-hash.js";
import {
  NATIVE_WORKFLOW_ID,
  resolveWorkflowTemplate,
} from "../utils/workflow-resolver.js";
import {
  isCwdHomedir,
  homedirGuardMessage,
  homedirBypassEnabled,
} from "../utils/cwd-guard.js";
import {
  writeSpecRegistryConfig,
  type SpecRegistryConfig,
} from "../utils/registry-config.js";
import {
  fetchTemplateIndex,
  probeRegistryIndex,
  downloadTemplateById,
  downloadRegistryDirect,
  parseRegistrySource,
  TIMEOUTS,
  type SpecTemplate,
  type TemplateStrategy,
  type RegistrySource,
  type RegistryBackend,
} from "../utils/template-fetcher.js";
import { setupProxy, maskProxyUrl } from "../utils/proxy.js";
import { toPosix } from "../utils/posix.js";
import { updateHashes } from "../utils/template-hash.js";

const MIN_PYTHON_MAJOR = 3;
const MIN_PYTHON_MINOR = 9;
const PYTHON_VERSION_RE = /Python (\d+)\.(\d+)/;

function collectSpecPaths(cwd: string): Set<string> {
  const specRoot = path.join(cwd, PATHS.SPECS);
  const paths = new Set<string>();
  if (!fs.existsSync(specRoot)) return paths;

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        paths.add(toPosix(path.relative(cwd, fullPath)));
      }
    }
  };
  walk(specRoot);
  return paths;
}

export function isSupportedPythonVersion(versionOutput: string): boolean {
  const match = versionOutput.match(PYTHON_VERSION_RE);
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (
    major > MIN_PYTHON_MAJOR ||
    (major === MIN_PYTHON_MAJOR && minor >= MIN_PYTHON_MINOR)
  );
}

// Sentinel returned when child_process spawn is blocked by a sandbox / kernel
// policy (e.g. seccomp inside Codex's Linux sandbox). EPERM/EACCES here mean
// "the kernel refused the spawn" — NOT "python3 isn't installed". The host
// usually has python3 on PATH; we just can't probe it from this Node process.
type PythonProbe = string | null | "sandbox-restricted";

function detectPythonVersion(command: string): PythonProbe {
  try {
    return execSync(`${command} --version`, {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EPERM" || code === "EACCES") {
      return "sandbox-restricted";
    }
    return null;
  }
}

export function requireSupportedPython(command: string): string {
  // Final escape hatch — set when the user knows python3 is on PATH but
  // the probe keeps failing for environment-specific reasons.
  if (process.env.OMP_FLOW_SKIP_PYTHON_CHECK === "1") {
    return `version check skipped (OMP_FLOW_SKIP_PYTHON_CHECK=1)`;
  }

  const versionOutput = detectPythonVersion(command);

  if (versionOutput === "sandbox-restricted") {
    console.warn(
      chalk.yellow(
        `⚠ Python version check skipped — sandboxed environment blocked ` +
          `child_process spawn (EPERM/EACCES). Assuming "${command}" is on ` +
          `PATH. If init fails later, re-run on the host or set ` +
          `OMP_FLOW_SKIP_PYTHON_CHECK=1.`,
      ),
    );
    return `version unknown (sandbox-restricted)`;
  }

  if (!versionOutput) {
    throw new Error(
      `Python command "${command}" not found. OmpFlow init requires Python ≥ 3.9.`,
    );
  }

  if (!isSupportedPythonVersion(versionOutput)) {
    throw new Error(
      `${versionOutput} detected via "${command}", but OmpFlow init requires Python ≥ 3.9.`,
    );
  }

  return versionOutput;
}

/**
 * Candidate Python command list per platform.
 *
 * Windows: `python` is the usual python.org installer choice, but Microsoft
 * Store ships `python3`, and the `py` launcher is `py -3`. We try all three
 * before giving up — fixes #236 where users with only `python3` (not
 * `python`) had `omp-flow init` fail outright.
 *
 * Non-Windows: `python3` is canonical; `python` is a fallback for systems
 * where Python 3 is the only Python and is named `python` (some Arch
 * configs, conda envs).
 */
const PYTHON_CANDIDATES: Record<"win32" | "other", readonly string[]> = {
  win32: ["python", "python3", "py -3"],
  other: ["python3", "python"],
};

/**
 * Detect a working Python ≥ 3.9 command on the host platform.
 *
 * Honors `OMP_FLOW_PYTHON_CMD` (explicit override, no probe) and
 * `OMP_FLOW_SKIP_PYTHON_CHECK=1` (skip probe, trust platform default).
 *
 * Otherwise tries each candidate in `PYTHON_CANDIDATES` in order and returns
 * the first whose `--version` matches `Python ≥ 3.9`. Caches the result via
 * `setResolvedPythonCommand` so all downstream template / configurator
 * writes pick up the resolved value.
 *
 * Throws a helpful, Windows-aware error if no candidate works.
 */
export function resolveSupportedPython(): {
  command: string;
  version: string;
} {
  // Explicit override — user knows their environment.
  const override = process.env.OMP_FLOW_PYTHON_CMD?.trim();
  if (override) {
    setResolvedPythonCommand(override);
    return { command: override, version: "set via OMP_FLOW_PYTHON_CMD" };
  }

  // Skip probe entirely.
  if (process.env.OMP_FLOW_SKIP_PYTHON_CHECK === "1") {
    const fallback = getPythonCommandForPlatform();
    setResolvedPythonCommand(fallback);
    return {
      command: fallback,
      version: "version check skipped (OMP_FLOW_SKIP_PYTHON_CHECK=1)",
    };
  }

  const candidates =
    process.platform === "win32"
      ? PYTHON_CANDIDATES.win32
      : PYTHON_CANDIDATES.other;

  const probeFailures: string[] = [];
  for (const candidate of candidates) {
    const probe = detectPythonVersion(candidate);
    if (probe === "sandbox-restricted") {
      console.warn(
        chalk.yellow(
          `⚠ Python version check skipped — sandboxed environment blocked ` +
            `child_process spawn (EPERM/EACCES). Assuming "${candidate}" is ` +
            `on PATH. If init fails later, re-run on the host or set ` +
            `OMP_FLOW_SKIP_PYTHON_CHECK=1.`,
        ),
      );
      setResolvedPythonCommand(candidate);
      return {
        command: candidate,
        version: "version unknown (sandbox-restricted)",
      };
    }
    if (!probe) {
      probeFailures.push(`${candidate}: not found`);
      continue;
    }
    if (!isSupportedPythonVersion(probe)) {
      probeFailures.push(`${candidate}: ${probe} (< 3.9)`);
      continue;
    }
    setResolvedPythonCommand(candidate);
    return { command: candidate, version: probe };
  }

  const isWindows = process.platform === "win32";
  const installHint = isWindows
    ? `Install Python ≥ 3.9 from https://www.python.org/downloads/windows/ — make sure ` +
      `"Add Python to PATH" is checked in the installer. Or, if Python is ` +
      `installed under a different name, set OMP_FLOW_PYTHON_CMD=<your-cmd> ` +
      `before re-running init (e.g. \`set OMP_FLOW_PYTHON_CMD=py -3\`).`
    : `Install Python ≥ 3.9 from https://www.python.org/downloads/ or via your ` +
      `package manager. Or set OMP_FLOW_PYTHON_CMD=<your-cmd> before re-running.`;

  throw new Error(
    `No supported Python command found. Tried: ${candidates.join(", ")}.\n` +
      `Probe results:\n  ${probeFailures.join("\n  ")}\n\n` +
      `OmpFlow init requires Python ≥ 3.9. ${installHint}\n` +
      `Last-resort escape hatch: set OMP_FLOW_SKIP_PYTHON_CHECK=1 to skip the probe entirely.`,
  );
}

function getOsDisplayName(
  platform: NodeJS.Platform = process.platform,
): string {
  switch (platform) {
    case "win32":
      return "Windows";
    case "darwin":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return platform;
  }
}

function logPythonAdaptationNotice(command: string): void {
  const osName = getOsDisplayName();
  console.log(
    chalk.blue(
      `📌 ${osName} detected: OmpFlow rendered Python commands as "${command}" in generated hooks, settings, and help text`,
    ),
  );
}

// =============================================================================
// Developer name helper
// =============================================================================

/**
 * Slugify a developer name for safe use in task directory names.
 *
 * Unlike `sanitizePkgName` (which only strips npm @scope/ prefixes), this
 * handles arbitrary developer input: spaces, Unicode letters, punctuation,
 * path separators. Returns "user" fallback when input slugifies to empty.
 *
 * Exported for unit testing; not part of the public API.
 */
export function slugifyDeveloperName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "user";
}

/**
 * Handle re-init when .omp-flow/ already exists.
 * Returns true if handled (caller should return), false if user chose full re-init.
 */
async function handleReinit(
  cwd: string,
  options: InitOptions,
  developerName: string | undefined,
  pythonCmd: string,
): Promise<boolean> {
  const TOOLS = getInitToolChoices();
  const configuredPlatforms = getConfiguredPlatforms(cwd);
  const configuredNames = [...configuredPlatforms]
    .map((id) => AI_TOOLS[id].name)
    .join(", ");

  // Determine explicit platform flags
  const explicitTools = TOOLS.filter(
    (t) => options[t.key as keyof InitOptions],
  ).map((t) => t.key);

  let doAddPlatforms = explicitTools.length > 0;
  let doAddDeveloper = !!options.user;
  let platformsToAdd: string[] = explicitTools;

  // No explicit flags → show menu
  if (!doAddPlatforms && !doAddDeveloper) {
    if (options.yes) {
      console.log(chalk.gray(`Already initialized with: ${configuredNames}`));
      console.log(
        chalk.gray(
          "Use platform flags (e.g., --codex) or -u <name> to add platforms/developer.",
        ),
      );
      return true;
    }

    console.log(
      chalk.gray(`\n   Already initialized with: ${configuredNames}\n`),
    );

    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message: "OmpFlow is already initialized. What would you like to do?",
        choices: [
          { name: "Add AI platform(s)", value: "add-platform" },
          {
            name: "Set up developer identity on this device",
            value: "add-developer",
          },
          { name: "Full re-initialize", value: "full" },
        ],
      },
    ]);

    if (action === "full") {
      return false; // Fall through to full init
    }
    if (action === "add-platform") doAddPlatforms = true;
    if (action === "add-developer") doAddDeveloper = true;
  }

  // --- Add platforms ---
  if (doAddPlatforms) {
    if (platformsToAdd.length === 0) {
      // Interactive: show only unconfigured platforms
      const unconfigured = TOOLS.filter((t) => {
        const pid = resolveCliFlag(t.key);
        return pid && !configuredPlatforms.has(pid);
      });

      if (unconfigured.length === 0) {
        console.log(
          chalk.green("✓ All available platforms are already configured."),
        );
      } else {
        const answers = await inquirer.prompt<{ tools: string[] }>([
          {
            type: "checkbox",
            name: "tools",
            message: "Select platforms to add:",
            choices: unconfigured.map((t) => ({
              name: t.name,
              value: t.key,
            })),
          },
        ]);
        platformsToAdd = answers.tools;
      }
    }

    const reinitWritten = startRecordingWrites(cwd);
    try {
      for (const tool of platformsToAdd) {
        const platformId = resolveCliFlag(tool as CliFlag);
        if (platformId) {
          if (configuredPlatforms.has(platformId)) {
            console.log(
              chalk.gray(
                `  ○ ${AI_TOOLS[platformId].name} already configured, skipping`,
              ),
            );
          } else {
            console.log(
              chalk.blue(`📝 Configuring ${AI_TOOLS[platformId].name}...`),
            );
            await configurePlatform(platformId, cwd, {
              withStatusline: options.withStatusline,
            });
            if (platformId === "claude-code" && options.withStatusline) {
              console.log(
                chalk.gray(
                  "   ↳ OmpFlow statusLine installed (--with-statusline)",
                ),
              );
            }
          }
        }
      }
    } finally {
      stopRecordingWrites();
    }

    // Update template hashes. Merge mode: preserve previously-tracked
    // platforms' hashes, layer in the newly-added platform's writes.
    const hashedCount = initializeHashes(cwd, {
      trackedPaths: reinitWritten,
      merge: true,
    });
    if (hashedCount > 0) {
      console.log(
        chalk.gray(`📋 Tracking ${hashedCount} template files for updates`),
      );
    }
  }

  // --- Add developer ---
  if (doAddDeveloper) {
    let devName = developerName;
    if (!devName) {
      devName = await askInput("Your name: ");
      while (!devName) {
        console.log(chalk.yellow("Name is required"));
        devName = await askInput("Your name: ");
      }
    }

    try {
      const scriptPath = path.join(cwd, PATHS.SCRIPTS, "init_developer.py");
      execSync(`${pythonCmd} "${scriptPath}" "${devName}"`, {
        cwd,
        stdio: "pipe",
      });
      console.log(chalk.green(`✓ Developer "${devName}" initialized`));
    } catch {
      console.log(
        chalk.yellow("⚠ Could not initialize developer. Run manually:"),
      );
      console.log(
        chalk.gray(
          `  ${pythonCmd} .omp-flow/scripts/init_developer.py ${devName}`,
        ),
      );
    }
  }

  return true;
}

interface InitOptions {
  cursor?: boolean;
  claude?: boolean;
  opencode?: boolean;
  codex?: boolean;
  kilo?: boolean;
  kiro?: boolean;
  gemini?: boolean;
  antigravity?: boolean;
  devin?: boolean;
  /** Deprecated alias for `devin` — Windsurf was renamed to Devin. */
  windsurf?: boolean;
  qoder?: boolean;
  codebuddy?: boolean;
  copilot?: boolean;
  droid?: boolean;
  pi?: boolean;
  reasonix?: boolean;
  zcode?: boolean;
  trae?: boolean;
  omp?: boolean;
  yes?: boolean;
  user?: string;
  force?: boolean;
  skipExisting?: boolean;
  template?: string;
  overwrite?: boolean;
  append?: boolean;
  registry?: string;
  monorepo?: boolean;
  /** Claude Code only: install the opt-in OmpFlow statusLine (--with-statusline) */
  withStatusline?: boolean;
  workflow?: string;
  workflowSource?: string;
}

// Compile-time check: every CliFlag must be a key of InitOptions.
// If a new platform is added to CliFlag but not to InitOptions, this line errors.
// Uses [X] extends [Y] to prevent distributive conditional behavior.
type _AssertCliFlagsInOptions = [CliFlag] extends [keyof InitOptions]
  ? true
  : "ERROR: CliFlag has values not present in InitOptions";
const _cliFlagCheck: _AssertCliFlagsInOptions = true;

/**
 * Write monorepo package configuration to config.yaml (non-destructive patch).
 * Appends packages: and default_package: without disturbing existing config.
 */
function writeMonorepoConfig(cwd: string, packages: DetectedPackage[]): void {
  const configPath = path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml");
  let content = "";

  try {
    content = fs.readFileSync(configPath, "utf-8");
  } catch {
    // Config not created yet; will be created by createWorkflowStructure
    return;
  }

  // Don't overwrite if packages: already exists (re-init case)
  if (/^packages\s*:/m.test(content)) {
    return;
  }

  const lines = ["\n# Auto-detected monorepo packages", "packages:"];
  for (const pkg of packages) {
    lines.push(`  ${sanitizePkgName(pkg.name)}:`);
    lines.push(`    path: ${pkg.path}`);
    if (pkg.isSubmodule) {
      lines.push("    type: submodule");
    } else if (pkg.isGitRepo) {
      lines.push("    git: true");
    }
  }

  // Use first non-submodule package as default, fallback to first package
  const defaultPkg =
    packages.find((p) => !p.isSubmodule)?.name ?? packages[0]?.name;
  if (defaultPkg) {
    lines.push(`default_package: ${defaultPkg}`);
  }

  fs.writeFileSync(
    configPath,
    content.trimEnd() + "\n" + lines.join("\n") + "\n",
    "utf-8",
  );
}

interface InitAnswers {
  tools: string[];
  template?: string;
  existingDirAction?: TemplateStrategy;
}

export async function init(options: InitOptions): Promise<void> {
  // Refuse to run in $HOME — running here would scoop platform runtime data
  // (Claude/Codex/OpenCode session histories etc.) into the omp-flow hash
  // manifest, and a subsequent `omp-flow uninstall` would wipe it.
  if (isCwdHomedir() && !homedirBypassEnabled()) {
    console.error(chalk.red(homedirGuardMessage("init")));
    process.exit(1);
  }

  // Deprecated alias: --windsurf → --devin (Windsurf was renamed to Devin).
  // Normalize here too so programmatic callers (not just the CLI action) map
  // correctly. The CLI action prints the deprecation notice.
  if (options.windsurf) {
    options.devin = true;
    delete options.windsurf;
  }

  // Platform gate: omp-flow ships the Claude Code and Codex toolchains. Every
  // other platform's methodology resources are still parked for a later
  // milestone, so explicitly requesting one fails fast rather than deploying a
  // methodology-less platform (PRD R10 / AC12; M3 lifts the park for codex only).
  const shippedPlatforms = new Set<string>(["claude", "codex"]);
  const requestedParked = getInitToolChoices()
    .filter(
      (t) =>
        !shippedPlatforms.has(t.key) && options[t.key as keyof InitOptions],
    )
    .map((t) => t.key);
  if (requestedParked.length > 0) {
    console.error(
      chalk.red(
        `✖ Platform(s) not available in this release: ${requestedParked.join(", ")}.\n` +
          `  omp-flow ships Claude Code and Codex; the other platforms are parked for a later milestone.`,
      ),
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const isFirstInit = !fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW));

  // Generate ASCII art banner dynamically using FIGlet "Rebel" font
  const banner = figlet.textSync("OmpFlow", { font: "Rebel" });
  console.log(chalk.cyan(`\n${banner.trimEnd()}`));
  console.log(
    chalk.gray(
      "\n   All-in-one AI framework & toolkit for Claude Code & Cursor\n",
    ),
  );

  // Set up proxy before any network calls
  const proxyUrl = setupProxy();
  if (proxyUrl) {
    console.log(chalk.gray(`   Using proxy: ${maskProxyUrl(proxyUrl)}\n`));
  }

  // Set write mode based on options
  let writeMode: WriteMode = "ask";
  if (options.force) {
    writeMode = "force";
    console.log(chalk.gray("Mode: Force overwrite existing files\n"));
  } else if (options.skipExisting) {
    writeMode = "skip";
    console.log(chalk.gray("Mode: Skip existing files\n"));
  } else if (options.yes) {
    // -y implies non-interactive: never prompt on conflicts. Default to skip
    // (preserve user files) — explicit --force is required to overwrite.
    writeMode = "skip";
    console.log(chalk.gray("Mode: Non-interactive (skip existing files)\n"));
  }
  setWriteMode(writeMode);

  // Detect developer name from git config or options
  let developerName = options.user;
  if (!developerName) {
    // Only detect from git if current directory is a git repo
    const isGitRepo = fs.existsSync(path.join(cwd, ".git"));
    if (isGitRepo) {
      try {
        developerName = execSync("git config user.name", {
          cwd,
          encoding: "utf-8",
        }).trim();
      } catch {
        // Git not available or no user.name configured
      }
    }
  }

  if (developerName) {
    console.log(chalk.blue("👤 Developer:"), chalk.gray(developerName));
  }

  const { command: pythonCmd } = resolveSupportedPython();

  // ==========================================================================
  // Re-init fast path: skip full flow when .omp-flow/ already exists
  // ==========================================================================

  // Aborted-init recovery (issue #204): if .omp-flow/ exists but tasks/ is
  // empty, the previous init never reached bootstrap creation. Fall through
  // to the full flow so the main-dispatch tasksEmpty fallback fires —
  // handleReinit's joiner branch would otherwise mis-route the recovery.
  const tasksDirEarly = path.join(cwd, PATHS.TASKS);
  const tasksEmptyEarly =
    !fs.existsSync(tasksDirEarly) || fs.readdirSync(tasksDirEarly).length === 0;
  const hasTemplateRequest = !!options.template || !!options.registry;

  if (
    !isFirstInit &&
    !options.force &&
    !options.skipExisting &&
    !tasksEmptyEarly &&
    !hasTemplateRequest
  ) {
    const reinitDone = await handleReinit(
      cwd,
      options,
      developerName,
      pythonCmd,
    );
    if (reinitDone) return;
    // reinitDone === false means user chose "full re-initialize" → fall through
  }

  if (!developerName && !options.yes) {
    // Ask for developer name if not detected and not in yes mode
    console.log(
      chalk.gray(
        "\nOmpFlow supports team collaboration - each developer has their own\n" +
          `workspace directory (${DIR_NAMES.WORKFLOW}/workspace/{name}/) to track AI sessions.\n` +
          "Tip: Usually this is your git username (git config user.name).\n",
      ),
    );
    developerName = await askInput("Your name: ");
    while (!developerName) {
      console.log(chalk.yellow("Name is required"));
      developerName = await askInput("Your name: ");
    }
    console.log(chalk.blue("👤 Developer:"), chalk.gray(developerName));
  }

  // Detect project type (silent - no output)
  const detectedType = detectProjectType(cwd);

  // Parse custom registry source early (needed by both monorepo + single-repo flows)
  let registry: RegistrySource | undefined;
  let registrySourceForConfig: string | undefined;
  if (options.registry) {
    try {
      registry = parseRegistrySource(options.registry);
      registrySourceForConfig = options.registry;
    } catch (error) {
      console.log(
        chalk.red(
          error instanceof Error ? error.message : "Invalid registry source",
        ),
      );
      return;
    }
  }

  // Determine template strategy from flags (needed before monorepo template downloads)
  let templateStrategy: TemplateStrategy = "skip";
  if (options.overwrite) {
    templateStrategy = "overwrite";
  } else if (options.append) {
    templateStrategy = "append";
  }

  // ==========================================================================
  // Monorepo Detection
  // ==========================================================================

  let monorepoPackages: DetectedPackage[] | undefined;
  let remoteSpecPackages: Set<string> | undefined;

  if (options.monorepo !== false) {
    // options.monorepo: true = --monorepo, false = --no-monorepo, undefined = auto
    const detected = detectMonorepo(cwd);

    if (options.monorepo === true && !detected) {
      console.log(
        chalk.red(
          "Error: --monorepo specified but no multi-package layout detected.",
        ),
      );
      console.log("");
      console.log(chalk.gray("Checked:"));
      console.log(chalk.gray("  ✗ pnpm-workspace.yaml"));
      console.log(chalk.gray("  ✗ package.json workspaces"));
      console.log(chalk.gray("  ✗ Cargo.toml [workspace]"));
      console.log(chalk.gray("  ✗ go.work"));
      console.log(chalk.gray("  ✗ pyproject.toml [tool.uv.workspace]"));
      console.log(chalk.gray("  ✗ .gitmodules"));
      console.log(chalk.gray("  ✗ sibling .git directories (need ≥ 2)"));
      console.log("");
      console.log("To configure manually, add to .omp-flow/config.yaml:");
      console.log("");
      console.log(chalk.cyan("  packages:"));
      console.log(chalk.cyan("    frontend:"));
      console.log(chalk.cyan("      path: ./frontend"));
      console.log(chalk.cyan("      git: true       # if it has its own .git"));
      console.log(chalk.cyan("    backend:"));
      console.log(chalk.cyan("      path: ./backend"));
      console.log(chalk.cyan("      git: true"));
      return;
    }

    if (detected && detected.length > 0) {
      let enableMonorepo = false;

      if (options.monorepo === true || options.yes) {
        enableMonorepo = true;
      } else {
        // Show detected packages and ask
        console.log(chalk.blue("\n🔍 Detected monorepo packages:"));
        for (const pkg of detected) {
          const tag = pkg.isSubmodule
            ? chalk.gray(" (submodule)")
            : pkg.isGitRepo
              ? chalk.gray(" (git repo)")
              : "";
          console.log(
            chalk.gray(`   - ${pkg.name}`) +
              chalk.gray(` (${pkg.path})`) +
              chalk.gray(` [${pkg.type}]`) +
              tag,
          );
        }
        console.log("");

        const { useMonorepo } = await inquirer.prompt<{
          useMonorepo: boolean;
        }>([
          {
            type: "confirm",
            name: "useMonorepo",
            message: "Enable monorepo mode?",
            default: true,
          },
        ]);
        enableMonorepo = useMonorepo;
      }

      if (enableMonorepo) {
        monorepoPackages = detected;
        remoteSpecPackages = new Set<string>();

        // Per-package template selection (unless -y mode: all use blank spec)
        if (!options.yes && !options.template) {
          for (const pkg of detected) {
            const { specSource } = await inquirer.prompt<{
              specSource: string;
            }>([
              {
                type: "list",
                name: "specSource",
                message: `Spec source for ${pkg.name} (${pkg.path}):`,
                choices: [
                  { name: "From scratch (OmpFlow default)", value: "blank" },
                  { name: "Download remote template", value: "remote" },
                ],
                default: "blank",
              },
            ]);

            if (specSource === "remote") {
              // Use existing template download flow, targeting spec/<name>/
              const destDir = path.join(
                cwd,
                PATHS.SPECS,
                sanitizePkgName(pkg.name),
              );
              console.log(chalk.blue(`📦 Select template for ${pkg.name}...`));
              // Fetch templates if not already done
              const templates = await fetchTemplateIndex();
              const specTemplates = templates
                .filter((t) => t.type === "spec")
                .map((t) => ({
                  name: `${t.id} (${t.name})`,
                  value: t.id,
                }));

              if (specTemplates.length > 0) {
                const { templateId } = await inquirer.prompt<{
                  templateId: string;
                }>([
                  {
                    type: "list",
                    name: "templateId",
                    message: `Select template for ${pkg.name}:`,
                    choices: specTemplates,
                  },
                ]);

                const result = await downloadTemplateById(
                  cwd,
                  templateId,
                  templateStrategy,
                  templates.find((t) => t.id === templateId),
                  undefined,
                  destDir,
                );

                if (result.success) {
                  console.log(chalk.green(`   ${result.message}`));
                  remoteSpecPackages.add(sanitizePkgName(pkg.name));
                } else {
                  console.log(chalk.yellow(`   ${result.message}`));
                  console.log(chalk.gray("   Falling back to blank spec..."));
                }
              } else {
                console.log(
                  chalk.gray("   No templates available. Using blank spec."),
                );
              }
            }
          }
        } else if (options.template) {
          // --template as default for all packages
          for (const pkg of detected) {
            const destDir = path.join(
              cwd,
              PATHS.SPECS,
              sanitizePkgName(pkg.name),
            );
            const result = await downloadTemplateById(
              cwd,
              options.template,
              templateStrategy,
              undefined,
              registry,
              destDir,
            );
            if (result.success && !result.skipped) {
              remoteSpecPackages.add(sanitizePkgName(pkg.name));
            }
          }
        }
      }
    }
  }

  // Tool definitions derived from platform registry
  const TOOLS = getInitToolChoices();

  // Build tools from explicit flags
  const explicitTools = TOOLS.filter(
    (t) => options[t.key as keyof InitOptions],
  ).map((t) => t.key);

  let tools: string[];

  if (explicitTools.length > 0) {
    // Explicit flags take precedence (works with or without -y)
    tools = explicitTools;
  } else if (options.yes) {
    // No explicit tools + -y: default to Cursor and Claude
    tools = TOOLS.filter((t) => t.defaultChecked).map((t) => t.key);
  } else {
    // Interactive mode
    const answers = await inquirer.prompt<InitAnswers>([
      {
        type: "checkbox",
        name: "tools",
        message: "Select AI tools to configure:",
        choices: TOOLS.map((t) => ({
          name: t.name,
          value: t.key,
          checked: t.defaultChecked,
        })),
      },
    ]);
    tools = answers.tools;
  }

  // Only Claude Code and Codex are shipped. Drop any still-parked selection that
  // reached here via the -y defaults or interactive multi-select (explicit
  // parked flags were already rejected at the top of init()). No parked platform
  // is ever configured (M3 lifts the park for codex only).
  const shippedCliFlags = new Set<string>([
    AI_TOOLS["claude-code"].cliFlag,
    AI_TOOLS.codex.cliFlag,
  ]);
  tools = tools.filter((t) => shippedCliFlags.has(t));

  // Treat unknown project type as fullstack
  const projectType: ProjectType =
    detectedType === "unknown" ? "fullstack" : detectedType;

  if (tools.length === 0) {
    console.log(
      chalk.yellow("No tools selected. At least one tool is required."),
    );
    return;
  }

  // Claude Code statusLine is opt-in only via `--with-statusline`; when the flag
  // is set, configureClaude deploys the omp-flow-native statusline hook. There is
  // no interactive prompt (the M1-era opt-in stub was a no-op and is removed).

  // ==========================================================================
  // Template Selection (single-repo only; monorepo handles templates above)
  // ==========================================================================

  let selectedTemplate: string | null = null;

  // Pre-fetched templates list (used to pass selected SpecTemplate to downloadTemplateById)
  let fetchedTemplates: SpecTemplate[] = [];
  let registryBackend: RegistryBackend | undefined;

  if (monorepoPackages) {
    // Monorepo: template selection already handled above
  } else if (options.template) {
    // Template specified via --template flag
    selectedTemplate = options.template;
    if (registry) {
      const probeResult = await probeRegistryIndex(
        `${registry.rawBaseUrl}/index.json`,
        registry,
      );
      registryBackend = probeResult.backend;
      if (probeResult.error) {
        console.log(chalk.red(`Error: ${probeResult.error.message}`));
        return;
      }
      if (probeResult.isNotFound) {
        console.log(
          chalk.red(
            "Error: Registry has no index.json. Remove --template to use direct download mode.",
          ),
        );
        return;
      }
      fetchedTemplates = probeResult.templates;
    }
  } else if (!options.yes) {
    // Interactive mode: show template selection
    let templates: SpecTemplate[];
    let registryProbeNotFound = false;
    let registryProbeError: Error | undefined;
    if (registry) {
      const timeoutSec = TIMEOUTS.INDEX_FETCH_MS / 1000;
      console.log(
        chalk.gray(
          `   Fetching available templates from ${registry.gigetSource}`,
        ),
      );
      let elapsed = 0;
      const ticker = setInterval(() => {
        elapsed++;
        process.stdout.write(
          `\r${chalk.gray(`   Loading... ${elapsed}s/${timeoutSec}s`)}`,
        );
      }, 1000);
      process.stdout.write(chalk.gray(`   Loading... 0s/${timeoutSec}s`));
      const probeResult = await probeRegistryIndex(
        `${registry.rawBaseUrl}/index.json`,
        registry,
      );
      templates = probeResult.templates;
      registryProbeNotFound = probeResult.isNotFound;
      registryProbeError = probeResult.error;
      registryBackend = probeResult.backend;
      clearInterval(ticker);
      // Clear the loading line
      process.stdout.write("\r\x1b[2K");
    } else {
      // No registry configured: no default marketplace exists, so there is no
      // remote source to fetch. Fall through to the blank-template picker.
      templates = [];
    }
    fetchedTemplates = templates;

    if (templates.length === 0 && registry && registryProbeNotFound) {
      // Custom registry: confirmed no index.json — will try direct download later
      console.log(
        chalk.gray(
          "   No index.json found at registry. Will download as direct spec template.",
        ),
      );
    } else if (templates.length === 0 && registry) {
      // Custom registry: transient error (not a 404) — abort, don't misclassify
      console.log(
        chalk.red(
          `   ${registryProbeError?.message ?? "Could not reach registry. Check your connection and try again."}`,
        ),
      );
      return;
    } else if (templates.length === 0) {
      console.log(
        chalk.gray(
          "   Could not fetch templates (offline or server unavailable).",
        ),
      );
      console.log(chalk.gray("   Using blank templates.\n"));
    }

    if (templates.length > 0) {
      // Build template choices
      const specTemplates = templates
        .filter((t) => t.type === "spec")
        .map((t) => ({
          name: `${t.id} (${t.name})`,
          value: t.id,
        }));

      const templateChoices = registry
        ? specTemplates
        : [
            {
              name: "from scratch (default)",
              value: "blank",
            },
            ...specTemplates,
            {
              name: "custom (enter a registry source)",
              value: "__custom__",
            },
          ];

      // Loop to allow returning from custom source input back to the picker
      let templatePicked = false;
      while (templateChoices.length > 0 && !templatePicked) {
        const templateAnswer = await inquirer.prompt<{ template: string }>([
          {
            type: "list",
            name: "template",
            message: "Select a spec template:",
            choices: templateChoices,
            default: registry ? undefined : "blank",
          },
        ]);

        if (templateAnswer.template === "__custom__") {
          // Prompt for custom registry source (empty → back to picker)
          const customSource = await askInput(
            "Enter registry source (e.g., gh:myorg/myrepo/specs), or press Enter to go back: ",
          );
          if (!customSource) {
            continue; // Back to picker
          }
          try {
            registry = parseRegistrySource(customSource);
            registrySourceForConfig = customSource;
            fetchedTemplates = []; // Reset so direct-download guard works correctly
            // Probe index.json to detect marketplace vs direct download
            const customIndexUrl = `${registry.rawBaseUrl}/index.json`;
            console.log(
              chalk.gray(
                `   Checking for templates at ${registry.gigetSource}...`,
              ),
            );
            const customProbe = await probeRegistryIndex(
              customIndexUrl,
              registry,
            );
            const customTemplates = customProbe.templates;
            registryBackend = customProbe.backend;
            if (customTemplates.length > 0) {
              // Marketplace mode: show picker with custom templates
              fetchedTemplates = customTemplates;
              const customChoices = customTemplates
                .filter((t) => t.type === "spec")
                .map((t) => ({
                  name: `${t.id} (${t.name})`,
                  value: t.id,
                }));
              if (customChoices.length > 0) {
                const customAnswer = await inquirer.prompt<{
                  template: string;
                }>([
                  {
                    type: "list",
                    name: "template",
                    message: "Select a spec template:",
                    choices: customChoices,
                  },
                ]);
                selectedTemplate = customAnswer.template;

                // Check if spec directory already exists and ask what to do
                const specDir = path.join(cwd, PATHS.SPECS);
                if (
                  fs.existsSync(specDir) &&
                  !options.overwrite &&
                  !options.append
                ) {
                  const actionAnswer = await inquirer.prompt<{
                    action: TemplateStrategy;
                  }>([
                    {
                      type: "list",
                      name: "action",
                      message: `Directory ${PATHS.SPECS} already exists. What do you want to do?`,
                      choices: [
                        { name: "Skip (keep existing)", value: "skip" },
                        {
                          name: "Overwrite (replace all)",
                          value: "overwrite",
                        },
                        {
                          name: "Append (add missing files only)",
                          value: "append",
                        },
                      ],
                      default: "skip",
                    },
                  ]);
                  templateStrategy = actionAnswer.action;
                }
              }
              templatePicked = true;
            } else if (customProbe.isNotFound) {
              // No index.json → direct download mode
              templatePicked = true;
            } else {
              // Transient error (not 404) — loop back, don't misclassify
              console.log(
                chalk.yellow(
                  `   ${customProbe.error?.message ?? "Could not reach registry. Try again or enter a different source."}`,
                ),
              );
              registry = undefined; // Reset so we don't fall through to direct download
              registrySourceForConfig = undefined;
            }
          } catch (error) {
            console.log(
              chalk.red(
                error instanceof Error
                  ? error.message
                  : "Invalid registry source",
              ),
            );
            // Loop back to picker
          }
        } else {
          templatePicked = true;
          if (templateAnswer.template !== "blank") {
            selectedTemplate = templateAnswer.template;

            // Check if spec directory already exists and ask what to do
            const specDir = path.join(cwd, PATHS.SPECS);
            if (
              fs.existsSync(specDir) &&
              !options.overwrite &&
              !options.append
            ) {
              const actionAnswer = await inquirer.prompt<{
                action: TemplateStrategy;
              }>([
                {
                  type: "list",
                  name: "action",
                  message: `Directory ${PATHS.SPECS} already exists. What do you want to do?`,
                  choices: [
                    { name: "Skip (keep existing)", value: "skip" },
                    { name: "Overwrite (replace all)", value: "overwrite" },
                    {
                      name: "Append (add missing files only)",
                      value: "append",
                    },
                  ],
                  default: "skip",
                },
              ]);
              templateStrategy = actionAnswer.action;
            }
          }
        }
      }
    }
  }
  // -y mode with --registry (no --template): probe index.json to detect mode
  // Skip when monorepo mode already handled templates above
  if (options.yes && registry && !selectedTemplate && !monorepoPackages) {
    const probeResult = await probeRegistryIndex(
      `${registry.rawBaseUrl}/index.json`,
      registry,
    );
    registryBackend = probeResult.backend;
    if (probeResult.templates.length > 0) {
      // Marketplace mode requires interactive selection — can't auto-select
      console.log(
        chalk.red(
          "Error: Registry is a marketplace with multiple templates. " +
            "Use --template <id> to specify which one, or remove -y for interactive selection.",
        ),
      );
      return;
    }
    if (!probeResult.isNotFound) {
      // Transient error (not 404) — abort, don't misclassify as direct-download
      console.log(
        chalk.red(
          `Error: ${probeResult.error?.message ?? "Could not reach registry. Check your connection and try again."}`,
        ),
      );
      return;
    }
    // isNotFound=true → no index.json, proceed with direct download (fetchedTemplates stays empty)
  }

  // ==========================================================================
  // Download Remote Template (if selected or direct registry download)
  // ==========================================================================

  let useRemoteTemplate = false;
  let registrySpecConfigToPersist: SpecRegistryConfig | null = null;

  if (selectedTemplate) {
    // Marketplace mode: download specific template by ID
    console.log(chalk.blue(`📦 Downloading template "${selectedTemplate}"...`));
    console.log(chalk.gray("   This may take a moment on slow connections."));

    // Find pre-fetched SpecTemplate to avoid double-fetch
    const prefetched = fetchedTemplates.find((t) => t.id === selectedTemplate);

    const result = await downloadTemplateById(
      cwd,
      selectedTemplate,
      templateStrategy,
      prefetched,
      registry,
      undefined,
      registryBackend,
    );

    if (result.success) {
      if (result.skipped) {
        console.log(chalk.gray(`   ${result.message}`));
      } else {
        console.log(chalk.green(`   ${result.message}`));
        useRemoteTemplate = true;
        if (registry) {
          registrySpecConfigToPersist = {
            source: registrySourceForConfig ?? registry.gigetSource,
            template: selectedTemplate,
          };
        }
      }
    } else {
      console.log(chalk.yellow(`   ${result.message}`));
      console.log(chalk.gray("   Falling back to blank templates..."));
      const retryCmd = registry
        ? `omp-flow init --registry ${registry.gigetSource} --template ${selectedTemplate}`
        : `omp-flow init --template ${selectedTemplate}`;
      console.log(chalk.gray(`   You can retry later: ${retryCmd}`));
    }
  } else if (registry && fetchedTemplates.length === 0) {
    // Direct download mode: registry has no index.json, download directory directly
    console.log(
      chalk.blue(`📦 Downloading spec from ${registry.gigetSource}...`),
    );
    console.log(chalk.gray("   This may take a moment on slow connections."));

    // Ask about existing spec dir in interactive mode
    if (!options.yes && !options.overwrite && !options.append) {
      const specDir = path.join(cwd, PATHS.SPECS);
      if (fs.existsSync(specDir)) {
        const actionAnswer = await inquirer.prompt<{
          action: TemplateStrategy;
        }>([
          {
            type: "list",
            name: "action",
            message: `Directory ${PATHS.SPECS} already exists. What do you want to do?`,
            choices: [
              { name: "Skip (keep existing)", value: "skip" },
              { name: "Overwrite (replace all)", value: "overwrite" },
              { name: "Append (add missing files only)", value: "append" },
            ],
            default: "skip",
          },
        ]);
        templateStrategy = actionAnswer.action;
      }
    }

    const result = await downloadRegistryDirect(
      cwd,
      registry,
      templateStrategy,
      undefined,
      registryBackend,
    );

    if (result.success) {
      if (result.skipped) {
        console.log(chalk.gray(`   ${result.message}`));
      } else {
        console.log(chalk.green(`   ${result.message}`));
        useRemoteTemplate = true;
        registrySpecConfigToPersist = {
          source: registrySourceForConfig ?? registry.gigetSource,
        };
      }
    } else {
      console.log(chalk.yellow(`   ${result.message}`));
      console.log(chalk.gray("   Falling back to blank templates..."));
      console.log(
        chalk.gray(
          `   You can retry later: omp-flow init --registry ${registry.gigetSource}`,
        ),
      );
    }
  }

  // ==========================================================================
  // Resolve workflow template (default: native bundled)
  // ==========================================================================

  const workflowIdInput = options.workflow?.trim();
  const workflowId =
    workflowIdInput && workflowIdInput.length > 0
      ? workflowIdInput
      : NATIVE_WORKFLOW_ID;
  let workflowMdOverride: string | undefined;
  if (workflowId !== NATIVE_WORKFLOW_ID || options.workflowSource) {
    const resolved = await resolveWorkflowTemplate(workflowId, {
      source: options.workflowSource,
    });
    if (resolved.id !== NATIVE_WORKFLOW_ID) {
      workflowMdOverride = resolved.content;
      console.log(
        chalk.blue(`🧭 Using workflow template: ${chalk.cyan(resolved.id)}`),
      );
    }
  }

  // ==========================================================================
  // Create Workflow Structure
  // ==========================================================================

  // Record every successful write from here through createRootFiles. The
  // captured set is the source of truth for `.template-hashes.json`'s
  // platform/root entries — replacing the previous "walk every managed dir"
  // approach that swept user-owned runtime files into the manifest
  // (.codex/sessions/, .claude/projects/, pre-existing AGENTS.md).
  const writtenPaths = startRecordingWrites(cwd);
  try {
    // Create workflow structure with project type
    console.log(chalk.blue("📁 Creating workflow structure..."));
    await createWorkflowStructure(cwd, {
      projectType,
      skipSpecTemplates: useRemoteTemplate,
      packages: monorepoPackages,
      remoteSpecPackages,
      workflowMdOverride,
    });

    // Write monorepo packages to config.yaml (non-destructive patch)
    if (monorepoPackages) {
      writeMonorepoConfig(cwd, monorepoPackages);
      console.log(chalk.blue("📦 Monorepo packages written to config.yaml"));
    }

    // Write version file for update tracking
    const versionPath = path.join(cwd, DIR_NAMES.WORKFLOW, ".version");
    fs.writeFileSync(versionPath, VERSION);

    // Configure selected tools by copying entire directories (dogfooding)
    for (const tool of tools) {
      const platformId = resolveCliFlag(tool);
      if (platformId) {
        console.log(
          chalk.blue(`📝 Configuring ${AI_TOOLS[platformId].name}...`),
        );
        await configurePlatform(platformId, cwd, {
          withStatusline: options.withStatusline,
        });
        if (platformId === "claude-code" && options.withStatusline) {
          console.log(
            chalk.gray("   ↳ OmpFlow statusLine installed (--with-statusline)"),
          );
        }
      }
    }

    const pythonPlatforms = getPlatformsWithPythonHooks();
    const hasSelectedPythonPlatform = pythonPlatforms.some((id) =>
      tools.includes(AI_TOOLS[id].cliFlag),
    );
    if (hasSelectedPythonPlatform) {
      logPythonAdaptationNotice(pythonCmd);
    }

    // Create root files (skip if exists)
    await createRootFiles(cwd);
  } finally {
    stopRecordingWrites();
  }

  if (registrySpecConfigToPersist) {
    writeSpecRegistryConfig(cwd, registrySpecConfigToPersist);
  }

  // Initialize template hashes for modification tracking
  const hashedCount = initializeHashes(cwd, { trackedPaths: writtenPaths });
  if (useRemoteTemplate) {
    const specFilesToHash = new Map<string, string>();
    for (const relativePath of collectSpecPaths(cwd)) {
      const content = fs.readFileSync(path.join(cwd, relativePath), "utf-8");
      specFilesToHash.set(relativePath, content);
    }
    if (specFilesToHash.size > 0) {
      updateHashes(cwd, specFilesToHash);
    }
  }
  if (hashedCount > 0) {
    console.log(
      chalk.gray(`📋 Tracking ${hashedCount} template files for updates`),
    );
  }

  // Non-native workflow is user-managed local content. Drop the
  // `.omp-flow/workflow.md` hash entry so `omp-flow update` classifies it as
  // modified and does not silently restore native bytes. See design.md
  // "Durable-state contract".
  if (workflowMdOverride !== undefined && workflowId !== NATIVE_WORKFLOW_ID) {
    removeHash(cwd, PATHS.WORKFLOW_GUIDE_FILE);
  }

  // Initialize developer identity (silent - no output)
  if (developerName) {
    try {
      const scriptPath = path.join(cwd, PATHS.SCRIPTS, "init_developer.py");
      execSync(`${pythonCmd} "${scriptPath}" "${developerName}"`, {
        cwd,
        stdio: "pipe", // Silent
      });
    } catch {
      // Silent failure - user can run init_developer.py manually
    }

    // Onboarding pointer (M1, D8): omp-flow does NOT write a bootstrap/joiner
    // task.json — the Python control plane (`omp_flow.py`) is the only task
    // producer. Point the developer at the workflow guide and the doctor /
    // task-create entry points instead. `--task <id>` is the documented
    // compensation when the Bash session bridge is not sourced (D5).
    console.log(chalk.bold("\n✓ omp-flow initialized. Next steps:"));
    console.log(
      chalk.gray(
        `  • Read .omp-flow/workflow.md for the phase / gate workflow\n` +
          `  • Verify the install: ${pythonCmd} .omp-flow/scripts/omp_flow.py doctor\n` +
          `  • Create a task: ${pythonCmd} .omp-flow/scripts/omp_flow.py task create\n` +
          `    (add --task <id> when the session bridge is not sourced)`,
      ),
    );
  }
}

/**
 * Simple readline-based input (no flickering like inquirer)
 */
function askInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function createRootFiles(cwd: string): Promise<void> {
  const agentsPath = path.join(cwd, FILE_NAMES.AGENTS);

  // Write AGENTS.md from template
  const agentsWritten = await writeFile(agentsPath, agentsMdContent);
  if (agentsWritten) {
    console.log(chalk.blue("📄 Created AGENTS.md"));
  }
}
