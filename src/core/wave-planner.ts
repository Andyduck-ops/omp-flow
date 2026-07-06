import * as fs from 'fs';
import * as path from 'path';
import type {
  WavePlan,
  WaveTask,
  TaskDefinition,
  TaskDefinitionFile,
  TaskConvergence,
  Feature,
} from './state.js';

/**
 * Wave Planner - Auto-generates plan.json + .task/TASK-NNN.json files from
 * prd.md + guidance-specification.md. Modeled after Maestro's plan-waves flow.
 */

interface ParsedFeature {
  feature: Feature;
  requirement: string;
  acceptance: string[];
}

/**
 * Read .omp-flow/tasks/{taskId}/prd.md and extract:
 * - Lines under "## Requirements" starting with "- "
 * - Lines under "## Acceptance Criteria" starting with "- "
 */
function parsePrd(prdPath: string): {
  requirements: string[];
  acceptanceCriteria: string[];
} {
  const requirements: string[] = [];
  const acceptanceCriteria: string[] = [];

  if (!fs.existsSync(prdPath)) {
    return { requirements, acceptanceCriteria };
  }

  const content = fs.readFileSync(prdPath, 'utf8');
  const lines = content.split(/\r?\n/);

  let section: 'none' | 'requirements' | 'acceptance' = 'none';
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+Requirements\s*$/i.test(line.trim())) {
      section = 'requirements';
      continue;
    }
    if (/^##\s+Acceptance\s+Criteria\s*$/i.test(line.trim())) {
      section = 'acceptance';
      continue;
    }
    if (/^##\s+/.test(line.trim()) && section !== 'none') {
      // exited the section
      section = 'none';
      continue;
    }
    if (section === 'requirements' && /^\s*-\s+/.test(line)) {
      const text = line.replace(/^\s*-\s+/, '').trim();
      if (text) requirements.push(text);
    } else if (section === 'acceptance' && /^\s*-\s+/.test(line)) {
      const text = line.replace(/^\s*-\s+/, '').trim();
      if (text) acceptanceCriteria.push(text);
    }
  }

  return { requirements, acceptanceCriteria };
}

/**
 * Parse the §4 Feature Decomposition table from guidance-specification.md.
 * Table rows look like: `| F-001 | slug | Title | priority | roles |`
 */
function parseGuidanceSpec(guidancePath: string): Feature[] {
  const features: Feature[] = [];
  if (!fs.existsSync(guidancePath)) {
    return features;
  }

  const content = fs.readFileSync(guidancePath, 'utf8');
  const lines = content.split(/\r?\n/);

  let inSection = false;
  let headerSeen = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (/^##\s+.*Feature\s+Decomposition/i.test(trimmed)) {
      inSection = true;
      headerSeen = false;
      continue;
    }
    if (inSection && /^##\s+/.test(trimmed)) {
      inSection = false;
      continue;
    }
    if (!inSection) continue;

    if (!trimmed.startsWith('|')) continue;

    // skip header separator row (|---|---|...)
    if (/^\|[\s:|-]+\|?$/.test(trimmed)) {
      continue;
    }
    // skip header row (| id | slug | Title | priority | roles |)
    if (!headerSeen) {
      headerSeen = true;
      if (/id|slug|title|priority|role/i.test(trimmed)) {
        continue;
      }
    }

    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length < 3) continue;

    const id = cells[0];
    const slug = cells[1];
    const title = cells[2];
    const priorityRaw = cells[3]?.toLowerCase() ?? 'medium';
    const rolesRaw = cells[4] ?? '';

    if (!/^F-\d+$/i.test(id)) continue;

    const priority: Feature['priority'] =
      priorityRaw === 'high' ? 'high' : priorityRaw === 'low' ? 'low' : 'medium';

    const relatedRoles = rolesRaw
      .split(/[,;/]/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    features.push({
      id,
      slug,
      title,
      description: title,
      relatedRoles,
      priority,
    });
  }

  return features;
}

/**
 * Slugify a requirement line: kebab-case of first 3-4 words.
 */
function slugifyRequirement(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 4);
  return words.join('-');
}

/**
 * Derive Feature[] from raw requirement lines when no guidance-spec exists.
 */
function deriveFeaturesFromRequirements(requirements: string[]): Feature[] {
  return requirements.map((req, idx) => {
    const num = String(idx + 1).padStart(3, '0');
    return {
      id: `F-${num}`,
      slug: slugifyRequirement(req),
      title: req.split(/[.:;]/)[0].trim().slice(0, 80),
      description: req,
      relatedRoles: [],
      priority: 'medium',
    };
  });
}

/**
 * Read relatedFiles from task.json if available.
 */
function readRelatedFiles(taskDir: string): string[] {
  const taskJsonPath = path.join(taskDir, 'task.json');
  if (!fs.existsSync(taskJsonPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(taskJsonPath, 'utf8')) as {
      relatedFiles?: string[];
    };
    return Array.isArray(data.relatedFiles) ? data.relatedFiles : [];
  } catch {
    return [];
  }
}

/**
 * Build a TaskDefinition from a parsed feature + its acceptance criteria.
 */
function buildTaskDefinition(
  parsed: ParsedFeature,
  index: number,
  relatedFiles: string[],
  wave: number,
  dependsOn: string[],
): TaskDefinition {
  const num = String(index + 1).padStart(3, '0');
  const id = `TASK-${num}`;
  const { feature, requirement, acceptance } = parsed;

  const scope = feature.slug || (relatedFiles[0] ? path.dirname(relatedFiles[0]) : 'src/');

  const files: TaskDefinitionFile[] = [];

  const readFirst: string[] = relatedFiles.slice();

  const implementation: string[] = [
    'Read existing code in scope',
    `Implement ${feature.title}`,
    'Run lint and tests',
  ];

  const convergence: TaskConvergence = {
    criteria:
      acceptance.length > 0
        ? acceptance.slice()
        : [`${feature.title} implemented`],
  };

  return {
    id,
    title: feature.title,
    description: requirement,
    scope,
    action: `Implement: ${feature.title}`,
    files,
    readFirst,
    implementation,
    convergence,
    dependsOn,
    wave,
    executor: 'agent',
    type: 'feature',
    status: 'pending',
  };
}

/**
 * Infer waves from features + a dependency map.
 *
 * - No dependency map: all features land in wave 1, parallel=true.
 * - With map: features with no deps → wave 1, features depending on wave 1 → wave 2, etc.
 * - Max 3 waves; remaining merge into wave 3.
 */
export function inferWaves(
  features: Feature[],
  dependencies?: Map<string, string[]>,
): WaveTask[] {
  if (features.length === 0) return [];

  // No dependency info → single wave, fully parallel.
  if (!dependencies || dependencies.size === 0) {
    return [
      {
        wave: 1,
        tasks: features.map((_, idx) => `TASK-${String(idx + 1).padStart(3, '0')}`),
        parallel: true,
        dependsOn: [],
      },
    ];
  }

  // Map feature.id → index for TASK-ID derivation.
  const idToIndex = new Map<string, number>();
  features.forEach((f, idx) => idToIndex.set(f.id, idx));

  // waveOf[featureIndex] = assigned wave number (1-based).
  const waveOf = new Array<number>(features.length).fill(0);

  // Iteratively assign waves. A feature's wave = 1 + max(dep waves), or 1 if no deps.
  // Cap at 3 waves.
  let changed = true;
  let safety = features.length + 3;
  while (changed && safety-- > 0) {
    changed = false;
    for (let i = 0; i < features.length; i++) {
      const featId = features[i].id;
      const deps = dependencies.get(featId) ?? [];
      const validDepWaves = deps
        .filter((d) => idToIndex.has(d))
        .map((d) => waveOf[idToIndex.get(d)!])
        .filter((w) => w > 0);

      let target: number;
      if (validDepWaves.length === 0) {
        target = 1;
      } else {
        target = Math.min(3, 1 + Math.max(...validDepWaves));
      }

      if (target > waveOf[i]) {
        waveOf[i] = target;
        changed = true;
      }
    }
  }

  // Any unassigned (e.g. cycle members) → wave 1.
  for (let i = 0; i < waveOf.length; i++) {
    if (waveOf[i] === 0) waveOf[i] = 1;
  }

  // Group TASK-IDs by wave.
  const waveToTasks = new Map<number, string[]>();
  for (let i = 0; i < features.length; i++) {
    const w = waveOf[i];
    const taskId = `TASK-${String(i + 1).padStart(3, '0')}`;
    if (!waveToTasks.has(w)) waveToTasks.set(w, []);
    waveToTasks.get(w)!.push(taskId);
  }

  const sortedWaves = Array.from(waveToTasks.keys()).sort((a, b) => a - b);

  // Compress wave numbers to 1..N (max 3).
  const compressed = new Map<number, number>();
  sortedWaves.forEach((w, idx) => {
    compressed.set(w, Math.min(3, idx + 1));
  });

  const waves: WaveTask[] = [];
  for (const w of sortedWaves) {
    const cw = compressed.get(w)!;
    const tasks = waveToTasks.get(w)!;
    const dependsOn: number[] = [];
    if (cw > 1) {
      dependsOn.push(cw - 1);
    }
    waves.push({
      wave: cw,
      tasks,
      parallel: true,
      dependsOn,
    });
  }

  return waves;
}

/**
 * Generate a WavePlan from prd.md + guidance-specification.md.
 *
 * - Reads .omp-flow/tasks/{taskId}/prd.md
 * - Reads .omp-flow/tasks/{taskId}/guidance-specification.md (optional)
 * - Reads .omp-flow/tasks/{taskId}/task.json for relatedFiles (optional)
 * - Writes plan.json + .task/TASK-NNN.json
 * - Returns the WavePlan
 */
export function generateWavePlan(taskId: string, workspaceDir: string): WavePlan {
  const taskDir = path.join(workspaceDir, '.omp-flow', 'tasks', taskId);
  const prdPath = path.join(taskDir, 'prd.md');
  const guidancePath = path.join(taskDir, 'guidance-specification.md');
  const planPath = path.join(taskDir, 'plan.json');
  const taskDefDir = path.join(taskDir, '.task');

  const { requirements, acceptanceCriteria } = parsePrd(prdPath);

  // Features come from guidance-spec if present, else derived from requirements.
  let features: Feature[];
  if (fs.existsSync(guidancePath)) {
    features = parseGuidanceSpec(guidancePath);
    if (features.length === 0) {
      features = deriveFeaturesFromRequirements(requirements);
    }
  } else {
    features = deriveFeaturesFromRequirements(requirements);
  }

  const relatedFiles = readRelatedFiles(taskDir);

  // Map each feature to its requirement text + acceptance criteria slice.
  // When features were derived from requirements, they pair 1:1 by index.
  // When features came from guidance-spec, requirements may be empty or shorter;
  // fall back to feature.description as the requirement text.
  const parsed: ParsedFeature[] = features.map((feature, idx) => {
    const requirement = requirements[idx] ?? feature.description;
    const acceptance = acceptanceCriteria.length > 0
      ? acceptanceCriteria
      : [`${feature.title} implemented`];
    return { feature, requirement, acceptance };
  });

  // No dependency map currently derivable from prd/guidance → single wave.
  const waves = inferWaves(features);

  // Build wave lookup: taskId → wave number + dependsOn (parent TASK-IDs).
  const taskWave = new Map<string, { wave: number; dependsOn: string[] }>();
  for (const w of waves) {
    const priorWaveTaskIds: string[] = [];
    for (const depWave of w.dependsOn) {
      const depWaveTask = waves.find((x) => x.wave === depWave);
      if (depWaveTask) priorWaveTaskIds.push(...depWaveTask.tasks);
    }
    for (const tId of w.tasks) {
      taskWave.set(tId, { wave: w.wave, dependsOn: priorWaveTaskIds.slice() });
    }
  }

  const taskDefs: TaskDefinition[] = parsed.map((p, idx) => {
    const tId = `TASK-${String(idx + 1).padStart(3, '0')}`;
    const meta = taskWave.get(tId) ?? { wave: 1, dependsOn: [] };
    return buildTaskDefinition(p, idx, relatedFiles, meta.wave, meta.dependsOn);
  });

  // Persist .task/TASK-NNN.json files.
  if (!fs.existsSync(taskDefDir)) {
    fs.mkdirSync(taskDefDir, { recursive: true });
  }
  for (const td of taskDefs) {
    const tdPath = path.join(taskDefDir, `${td.id}.json`);
    fs.writeFileSync(tdPath, JSON.stringify(td, null, 2), 'utf8');
  }

  const plan: WavePlan = {
    taskId,
    taskIds: taskDefs.map((t) => t.id),
    waveCount: waves.length,
    waves,
    complexity:
      waves.length <= 1 ? 'low' : waves.length === 2 ? 'medium' : 'high',
  };

  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');

  return plan;
}
