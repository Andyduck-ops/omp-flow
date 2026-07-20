import path from "node:path";

import { DIR_NAMES, PATHS } from "../constants/paths.js";
import { copyOmpFlowDir } from "../templates/extract.js";

// Import omp-flow templates (generic, not project-specific)
import {
  workflowMdTemplate,
  configYamlTemplate,
  gitignoreTemplate,
} from "../templates/omp-flow/index.js";

import { writeFile, ensureDir } from "../utils/file-writer.js";
import { replacePythonCommandLiterals } from "./shared.js";
import {
  type ProjectType,
  type DetectedPackage,
} from "../utils/project-detector.js";

/**
 * Options for creating workflow structure
 */
export interface WorkflowOptions {
  /** Detected or specified project type (retained for caller compatibility) */
  projectType: ProjectType;
  /** Skip creating local spec templates (retained for caller compatibility) */
  skipSpecTemplates?: boolean;
  /** Detected monorepo packages (retained for caller compatibility) */
  packages?: DetectedPackage[];
  /** Package names that use remote templates (retained for caller compatibility) */
  remoteSpecPackages?: Set<string>;
  /**
   * Optional override for `.omp-flow/workflow.md` content. When omitted the
   * bundled native template is written. Set by `init --workflow` (or
   * `--workflow-source`) after the resolver has fetched marketplace content.
   * Caller is still responsible for removing the `.omp-flow/workflow.md` hash
   * entry for non-native workflows so update.ts treats them as user-managed.
   */
  workflowMdOverride?: string;
}

/**
 * Create the `.omp-flow/` workflow structure:
 * 1. Copy the Python control plane (`scripts/`) — dogfooded, dir-walked.
 * 2. Write `workflow.md`, `config.yaml`, `.gitignore`.
 * 3. Create the runtime scaffold: `tasks/archive/`, `.runtime/sessions/`,
 *    `specs/`, `knowhow/` — the omp-flow layout. This replaces the Trellis
 *    `workspace/` + `spec/` skeletons and the channel seed-agent dispatch, both
 *    dropped in M1 (D8): the Python control plane is the only task producer.
 *
 * @param cwd - Current working directory
 * @param options - Workflow options. Only `workflowMdOverride` is consumed; the
 *   remaining fields are retained for caller compatibility.
 */
export async function createWorkflowStructure(
  cwd: string,
  options?: WorkflowOptions,
): Promise<void> {
  const workflowMd = options?.workflowMdOverride ?? workflowMdTemplate;

  // Create base .omp-flow directory
  ensureDir(path.join(cwd, DIR_NAMES.WORKFLOW));

  // Copy scripts/ directory from templates (Python control plane)
  await copyOmpFlowDir("scripts", path.join(cwd, PATHS.SCRIPTS), {
    executable: true,
  });

  // Copy workflow.md (native bundled template or selected marketplace variant)
  await writeFile(
    path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE),
    replacePythonCommandLiterals(workflowMd),
  );

  // Copy .gitignore from templates
  await writeFile(
    path.join(cwd, DIR_NAMES.WORKFLOW, ".gitignore"),
    gitignoreTemplate,
  );

  // Copy config.yaml from templates
  await writeFile(
    path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml"),
    configYamlTemplate,
  );

  // Runtime scaffold (omp-flow layout). Empty directories the Python control
  // plane populates at runtime; ensureDir(TASKS_ARCHIVE) also creates tasks/.
  ensureDir(path.join(cwd, PATHS.TASKS_ARCHIVE));
  ensureDir(path.join(cwd, PATHS.RUNTIME_SESSIONS));
  ensureDir(path.join(cwd, PATHS.SPECS));
  ensureDir(path.join(cwd, PATHS.KNOWHOW));
}
