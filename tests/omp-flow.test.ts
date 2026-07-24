import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { deployInitResources, getManagedResources, renderManagedResource } from '../src/cli/init.js';
import { analyzeChanges, interactiveUpdate } from '../src/cli/update.js';
import { computeHash, loadHashes, saveHashes } from '../src/cli/template-hash.js';
import { normalizeHarnesses, readHarnessConfig, writeHarnessConfig } from '../src/cli/harness.js';
import { OMPFlowExtension } from '../src/omp/extension.js';
import activateExtension from '../src/omp/extension-entry.js';
import { loadAgentDefinition } from '../src/omp/agent-loader.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('Assertion Failed: ' + message);
}

function pythonCommand(): string {
  return process.platform === 'win32' ? 'python' : 'python3';
}

// Session-identity env vars read by the deployed control plane
// (.omp-flow/scripts/common/active_task.py:16-21, :43, :48).
const IDENTITY_ENV_KEYS = [
  'OMP_FLOW_CONTEXT_ID',
  'CODEX_THREAD_ID',
  'CODEX_SESSION_ID',
  'OMP_SESSION_ID',
  'PI_SESSION_ID',
] as const;

// Copy process.env, strip identity keys case-insensitively (win32 env keys are
// case-insensitive; the spread loses Node's proxy semantics), then overlay
// per-case overrides: undefined deletes, string sets. Explicit identity always
// wins — this proves identity comes from each test case (or the hook payload),
// not the ambient host env. Denylist over the inherited env, never an
// allowlist: Windows Python children crash without SYSTEMROOT et al.
function spawnEnv(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  const denied = new Set<string>(IDENTITY_ENV_KEYS);
  for (const key of Object.keys(env)) {
    if (denied.has(key.toUpperCase())) delete env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function runPython(
  root: string,
  args: string[],
  env: Record<string, string | undefined> = {},
  input = '',
): string {
  const script = path.join(root, '.omp-flow', 'scripts', 'omp_flow.py');
  return execFileSync(
    pythonCommand(),
    ['-X', 'utf8', script, '--cwd', root, ...args],
    {
      cwd: root,
      input,
      encoding: 'utf8',
      env: spawnEnv(env),
    },
  ).trim();
}

function runPythonJson<T>(
  root: string,
  args: string[],
  env: Record<string, string | undefined> = {},
  input = '',
): T {
  return JSON.parse(runPython(root, args, env, input)) as T;
}

function expectPythonFailure(
  root: string,
  args: string[],
  expected: string,
  env: Record<string, string | undefined> = {},
  input = '',
): void {
  const script = path.join(root, '.omp-flow', 'scripts', 'omp_flow.py');
  const result = spawnSync(
    pythonCommand(),
    ['-X', 'utf8', script, '--cwd', root, ...args],
    { cwd: root, encoding: 'utf8', env: spawnEnv(env), input },
  );
  assert(result.status === 2, 'Python command fails with workflow exit code');
  assert(result.stderr.includes(expected), 'Python failure includes: ' + expected);
}

function readCsv(root: string, taskId: string): string {
  return fs.readFileSync(path.join(root, '.omp-flow', 'tasks', taskId, 'tasks.csv'), 'utf8');
}

// --- Row-D Claude Hook wrapper harness -------------------------------------
// Invoke a managed .claude/hooks/<script>.py wrapper exactly as Claude Code would:
// one UTF-8 JSON payload on stdin, CLAUDE_PROJECT_DIR pointing at the confined
// project root. The wrapper itself sets OMP_FLOW_CONTEXT_ID=<raw session_id> for
// its Python child, so tests need not (and must not) pre-seed it.
function runWrapper(
  script: string,
  root: string,
  payload: unknown,
  extraEnv: Record<string, string | undefined> = {},
  wrapperDir: string = path.join(process.cwd(), 'templates', 'claude', 'hooks'),
): { status: number | null; stdout: string; stderr: string } {
  const wrapper = path.join(wrapperDir, script);
  // spawnEnv strips all ambient identity keys: identity comes from the payload
  // (or explicit extraEnv), never the ambient env.
  const env = spawnEnv({ CLAUDE_PROJECT_DIR: root, ...extraEnv });
  const result = spawnSync(pythonCommand(), ['-X', 'utf8', wrapper], {
    cwd: root,
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

// Deep-replace exact placeholder strings in a committed fixture with dynamic
// (runtime task id / path / session) values, proving the wrapper parses the
// documented Claude 2.1.199 field names while filling test-specific ids.
function fillFixture(node: unknown, subs: Record<string, string>): unknown {
  if (typeof node === 'string') return node in subs ? subs[node] : node;
  if (Array.isArray(node)) return node.map(item => fillFixture(item, subs));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) out[key] = fillFixture(value, subs);
    return out;
  }
  return node;
}

function loadFixture(name: string, subs: Record<string, string>): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'claude-hooks', name), 'utf8');
  return fillFixture(JSON.parse(raw), subs) as Record<string, unknown>;
}

// --- 07-22-dispatch-stutter A-001 golden capture/replay helpers --------------
// The golden corpus (tests/fixtures/claude-hooks/golden/) records the CURRENT
// subprocess-implementation hook stdout for a fixed payload set. Byte-identity
// is asserted modulo the declared __GOLDEN_*__ placeholders ONLY: every other
// byte must match (PRD AC4). Capture contract: `OMP_GOLDEN_CAPTURE=1 npm test`
// re-records the corpus; the default run REPLAYS it and fails on any drift.

// Deep SUBSTRING substitution of golden placeholders. Unlike fillFixture (exact
// whole-string matches), golden payloads embed placeholders inside composite
// strings such as dispatch descriptor lines and repo-relative report paths.
function goldenFill<T>(node: T, subs: Array<[string, string]>): T {
  if (typeof node === 'string') {
    let out: string = node;
    for (const [placeholder, value] of subs) out = out.split(placeholder).join(value);
    return out as unknown as T;
  }
  if (Array.isArray(node)) return node.map(item => goldenFill(item, subs)) as unknown as T;
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) out[key] = goldenFill(value, subs);
    return out as unknown as T;
  }
  return node;
}

// Normalize live wrapper output back into placeholder form. Each dynamic value
// is replaced in its raw, JSON-string-escaped, and posix-separator spellings
// (hook stdout is JSON, so Windows paths appear with escaped backslashes, while
// Python's as_posix() renders the same root with forward slashes). Longest form
// first so an escaped path is never corrupted by its raw-substring rule.
function goldenNormalize(text: string, subs: Array<[string, string]>): string {
  const rules: Array<[string, string]> = [];
  for (const [placeholder, value] of subs) {
    const forms = new Set<string>([JSON.stringify(value).slice(1, -1), value, value.split('\\').join('/')]);
    for (const form of forms) if (form) rules.push([form, placeholder]);
  }
  rules.sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [from, to] of rules) out = out.split(from).join(to);
  return out;
}

// Extract the visible deny/STOP reason from a wrapper's stdout envelope (the
// AC5 error-string parity reference): a deny's permissionDecisionReason, or a
// state hook's systemMessage. Allow/no-op outputs yield null.
function goldenReason(stdoutText: string): string | null {
  if (!stdoutText.trim()) return null;
  const parsed = JSON.parse(stdoutText) as {
    hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
    systemMessage?: string;
  };
  if (parsed.hookSpecificOutput?.permissionDecision === 'deny') {
    return parsed.hookSpecificOutput.permissionDecisionReason ?? null;
  }
  if (typeof parsed.systemMessage === 'string') return parsed.systemMessage;
  return null;
}

interface GoldenCase {
  name: string;
  kind: 'claude-dispatch-context' | 'claude-qbd-report' | 'claude-workflow-state' | 'claude-protect-write';
  outcome: 'allow' | 'deny' | 'core-error';
  script: string;
  payload: Record<string, unknown>;
  env?: Record<string, string>;
}

interface GoldenRecord {
  case: string;
  kind: string;
  outcome: string;
  script: string;
  payload: Record<string, unknown>;
  env: Record<string, string> | null;
  exitCode: number | null;
  stdout: string;
  reason: string | null;
}

// Compact single-line ompFlowDispatch descriptor as it appears as the first
// non-blank line of a native Agent/Task prompt.
function dispatchLine(body: Record<string, unknown>): string {
  return JSON.stringify({ ompFlowDispatch: body });
}

// Parse the leading `---` YAML-ish frontmatter of a Claude agent card into a flat map.
function parseFrontmatter(content: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  assert(match, 'Agent card has leading frontmatter');
  const fields: Record<string, string> = {};
  for (const line of match![1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
}

// Drive a fresh task all the way to an executing, QbD 2-frozen state (phase=execute,
// status=in_progress) so amendment/design tests can start from real frozen topology.
function driveToExecuting(
  root: string,
  env: Record<string, string>,
  title: string,
  slug: string,
  csvRows: string[],
  briefs: Record<string, string>,
): { taskId: string; dir: string } {
  const created = runPythonJson<{ taskId: string }>(root, ['task', 'create', title, '--slug', slug], env);
  const dir = path.join(root, '.omp-flow', 'tasks', created.taskId);
  fs.writeFileSync(
    path.join(dir, 'tasks.csv'),
    ['id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd', ...csvRows, ''].join('\n'),
    'utf8',
  );
  for (const [id, body] of Object.entries(briefs)) {
    fs.writeFileSync(path.join(dir, '.task', id + '.implement.md'), body, 'utf8');
  }
  const synthesisRel = `research/90-synthesis-001-${slug}.md`;
  fs.writeFileSync(path.join(dir, synthesisRel), '# Synthesis\n\nEvidence.\n', 'utf8');
  runPython(root, ['workflow', 'select-synthesis', '--path', synthesisRel], env);
  fs.writeFileSync(path.join(dir, 'prd.md'), `# PRD\n\n## Goal\n\n${title}.\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'design.md'), `# Design\n\n## Architecture\n\n${title} core.\n`, 'utf8');
  for (const gate of ['qbd1', 'qbd2'] as const) {
    const prepared = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['gate', 'prepare', gate], env);
    fs.writeFileSync(
      path.join(dir, prepared.report),
      ['---', `gate: ${gate}`, 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + prepared.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', gate], env);
    runPython(root, ['gate', 'decide', gate, '--decision', 'pass', '--note', 'ok'], env);
  }
  runPython(root, ['task', 'start'], env);
  return { taskId: created.taskId, dir };
}

// Take a ready row from pending to completed with passing evidence.
function completeRow(root: string, dir: string, env: Record<string, string>, rowId: string, reviewer: string): void {
  runPython(root, ['topology', 'mark-result', '--row', rowId, '--result', 'success'], env);
  fs.writeFileSync(path.join(dir, '.task', `${rowId}.review.md`), '# Review\n\nPASS\n', 'utf8');
  runPython(root, [
    'evidence', 'submit', '--row', rowId, '--verdict', 'pass', '--tests-run', '1', '--tests-failed', '0',
    '--report', `.task/${rowId}.review.md`, '--evidence', `${rowId} passed`, '--reviewer-agent-id', reviewer,
  ], env);
}

async function runTests(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-portable-'));
  fs.mkdirSync(path.join(root, '.git'));

  try {
    console.log('--- Test 1: project init deploys portable core and Harness adapters ---');
    let missingHarnessRejected = false;
    try {
      deployInitResources({ cwd: root, force: true });
    } catch (error) {
      missingHarnessRejected = String(error).includes('At least one harness');
    }
    assert(missingHarnessRejected, 'Programmatic init requires an explicit harness selection');
    assert(readHarnessConfig(root) === null, 'No harness config exists before initialization');
    const harnessCombinations = [
      ['omp'], ['codex'], ['claude'], ['omp', 'codex'],
      ['omp', 'claude'], ['codex', 'claude'], ['omp', 'codex', 'claude'],
    ] as const;
    const adapterDirs: Record<string, string> = { omp: '.omp', codex: '.codex', claude: '.claude' };
    for (const harnesses of harnessCombinations) {
      const resources = getManagedResources(harnesses);
      assert(resources.some(entry => entry.group === 'core'), 'Every harness selection includes the core');
      for (const harness of ['omp', 'codex', 'claude'] as const) {
        const selected = harnesses.includes(harness);
        assert(
          resources.some(entry => entry.group === harness) === selected,
          `Harness selection keeps ${harness} resources isolated`,
        );
        // Declarations must never point into an unselected adapter's directory.
        const targetsAdapterDir = resources.some(entry => entry.destinationPath.split(path.sep)[0] === adapterDirs[harness]);
        assert(targetsAdapterDir === selected, `Selection [${harnesses.join(',')}] has no ${harness} directory leakage`);
      }
      // Every declared resource is either shared core (under .omp-flow) or owned by a selected adapter directory.
      for (const entry of resources) {
        if (entry.group === 'core') {
          assert(entry.destinationPath.split(path.sep)[0] === '.omp-flow', 'Core resources deploy under .omp-flow');
          continue;
        }
        assert((harnesses as readonly string[]).includes(entry.group), `Resource group ${entry.group} belongs to the selection`);
        assert(
          entry.destinationPath.split(path.sep)[0] === adapterDirs[entry.group],
          `Adapter resource for ${entry.group} deploys under its own directory`,
        );
      }
    }
    const claudeResources = getManagedResources(['claude']);
    assert(claudeResources.every(entry => entry.group === 'core' || entry.destinationPath.startsWith('.claude')), 'Claude selection has no OMP or Codex deployment leakage');
    assert(claudeResources.some(entry => entry.destinationPath === path.join('.claude', 'settings.json')), 'Claude settings are managed');
    assert(claudeResources.some(entry => entry.destinationPath === path.join('.claude', 'hooks', 'session-start.py')), 'Claude Hooks are declared as managed resources');
    assert(claudeResources.some(entry => entry.destinationPath === path.join('.claude', 'agents', 'omp-flow-implement.md')), 'Claude agents are declared as managed resources');
    // Boundary: the Claude group declares only settings/agents/hooks/skills; no commands, status line, plugin, model alias, or dispatcher.
    assert(
      !claudeResources.some(entry => /commands|statusline|plugin|model-alias|dispatcher/i.test(entry.destinationPath)),
      'Claude registry adds no commands, status line, plugin, model alias, or dispatcher',
    );
    // Registry accepts, normalizes, and persists Claude at schema version 1 without deploying its not-yet-provisioned sources.
    assert(normalizeHarnesses(['claude']).join(',') === 'claude', 'Claude is an accepted harness');
    assert(normalizeHarnesses(['claude', 'omp']).join(',') === 'omp,claude', 'Mixed selection with Claude normalizes to canonical order');
    assert(normalizeHarnesses(['claude', 'codex', 'omp']).join(',') === 'omp,codex,claude', 'Full selection normalizes to canonical order');
    const registryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-registry-'));
    try {
      const persisted = writeHarnessConfig(registryDir, ['claude', 'omp']);
      assert(persisted.schemaVersion === 1, 'Persisting a Claude selection keeps schema version 1');
      assert(persisted.harnesses.join(',') === 'omp,claude', 'Persisted Claude selection is normalized');
      const readBack = readHarnessConfig(registryDir, true)!;
      assert(readBack.schemaVersion === 1 && readBack.harnesses.join(',') === 'omp,claude', 'Claude selection round-trips through config.json');
      const claudeOnly = writeHarnessConfig(registryDir, ['claude']);
      assert(claudeOnly.harnesses.join(',') === 'claude', 'Claude-only selection persists');
      assert(!fs.existsSync(path.join(registryDir, '.claude')), 'Declaring a Claude selection deploys none of its resources');
    } finally {
      fs.rmSync(registryDir, { recursive: true, force: true });
    }
    const initPlan = deployInitResources({ cwd: root, force: true, harnesses: ['omp', 'codex'] });
    assert(initPlan.some(entry => entry.displayPath.includes('omp_flow.py')), 'Python core is managed');
    assert(fs.existsSync(path.join(root, '.codex', 'hooks.json')), 'Codex hooks deployed');
    assert(fs.existsSync(path.join(root, '.codex', 'agents', 'omp-flow-implement.toml')), 'Codex agents deployed');
    assert(fs.existsSync(path.join(root, '.codex', 'skills', 'omp-flow', 'SKILL.md')), 'Codex skills deployed');
    assert(fs.existsSync(path.join(root, '.codex', 'skills', 'omp-flow-research', 'SKILL.md')), 'Codex phase skills deployed');
    assert(fs.existsSync(path.join(root, '.codex', 'config.toml')), 'Codex project config deployed');
    assert(fs.existsSync(path.join(root, '.omp', 'skills', 'omp-flow', 'SKILL.md')), 'OMP project skills deployed');
    assert(fs.existsSync(path.join(root, '.omp', 'skills', 'omp-flow-execute', 'SKILL.md')), 'OMP phase skills deployed');
    assert(!fs.existsSync(path.join(root, '.omp', 'skills', 'omp-flow-executor')), 'Legacy role-named Skill is not deployed');
    assert(readHarnessConfig(root, true)!.harnesses.join(',') === 'omp,codex', 'Harness manifest records both adapters');
    const sharedRouter = fs.readFileSync(path.join(process.cwd(), 'templates', 'common', 'skills', 'omp-flow', 'SKILL.md'), 'utf8');
    const ompRouter = fs.readFileSync(path.join(root, '.omp', 'skills', 'omp-flow', 'SKILL.md'), 'utf8');
    const codexRouter = fs.readFileSync(path.join(root, '.codex', 'skills', 'omp-flow', 'SKILL.md'), 'utf8');
    assert(sharedRouter === ompRouter && sharedRouter === codexRouter, 'Both Harnesses deploy the neutral shared Skill source');
    assert(sharedRouter.includes('## Phase Routing'), 'Router Skill maps workflow phase to a phase Skill');
    assert(sharedRouter.includes('## Red Flags'), 'Router Skill includes anti-rationalization guidance');
    const codexImplementPrompt = fs.readFileSync(path.join(root, '.codex', 'agents', 'omp-flow-implement.toml'), 'utf8');
    assert(codexImplementPrompt.includes('# Identity And Recursion Guard'), 'Codex prompt declares recursion contract first');
    assert(codexImplementPrompt.includes('# Pull Context'), 'Codex prompt pulls deterministic context');
    assert(codexImplementPrompt.includes('multi_agent = false'), 'Codex child collaboration is physically disabled');
    assert(codexImplementPrompt.includes('# Postconditions And Handoff'), 'Codex prompt defines artifact postconditions');
    const ompExecutorPrompt = fs.readFileSync(path.join(root, '.omp', 'agents', 'executor.md'), 'utf8');
    const ompExecutorTemplate = fs.readFileSync(path.join(process.cwd(), 'templates', 'omp', 'agents', 'executor.md'), 'utf8');
    assert(ompExecutorPrompt === ompExecutorTemplate, 'OMP agent deploys from the OMP adapter template source');
    assert(ompExecutorPrompt.includes('workflow breadcrumbs apply to Main'), 'OMP child ignores Main-only dispatch breadcrumbs');
    assert(ompExecutorPrompt.includes('## Postconditions'), 'OMP prompt defines completion postconditions');
    assert(!fs.existsSync(path.join(root, '.omp-flow', 'scripts', 'get_context.py')), 'Compatibility wrapper is not deployed');
    assert(fs.existsSync(path.join(root, '.omp-flow', 'scripts', 'common', 'topology.py')), 'Topology module deployed');
    const hooks = fs.readFileSync(path.join(root, '.codex', 'hooks.json'), 'utf8');
    assert(!hooks.includes('{{PYTHON_CMD}}'), 'Codex hook Python command is rendered');
    const obsoletePath = path.join(root, '.omp-flow', 'scripts', 'get_context.py');
    const obsoleteContent = '# old managed wrapper\n';
    fs.writeFileSync(obsoletePath, obsoleteContent, 'utf8');
    const obsoleteSkillPath = path.join(root, '.omp', 'skills', 'omp-flow-executor', 'SKILL.md');
    fs.mkdirSync(path.dirname(obsoleteSkillPath), { recursive: true });
    fs.writeFileSync(obsoleteSkillPath, obsoleteContent, 'utf8');
    const managedHashes = loadHashes(root);
    managedHashes['.omp-flow/scripts/get_context.py'] = computeHash(obsoleteContent);
    managedHashes['.omp/skills/omp-flow-executor/SKILL.md'] = computeHash(obsoleteContent);
    saveHashes(root, managedHashes);
    const updatePlan = await interactiveUpdate({ cwd: root, force: true });
    assert(updatePlan.some(entry => entry.relativePath.endsWith('get_context.py') && entry.action === 'delete'), 'Update plans managed obsolete file deletion');
    assert(!fs.existsSync(obsoletePath), 'Update removes unchanged obsolete managed wrapper');
    assert(updatePlan.some(entry => entry.relativePath.endsWith('omp-flow-executor/SKILL.md') && entry.action === 'delete'), 'Update plans legacy Skill deletion');
    assert(!fs.existsSync(obsoleteSkillPath), 'Update removes unchanged legacy role-named Skill');

    const codexOnly = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-codex-'));
    const ompOnly = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-omp-'));
    try {
      fs.mkdirSync(path.join(codexOnly, '.git'));
      fs.mkdirSync(path.join(ompOnly, '.git'));
      deployInitResources({ cwd: codexOnly, force: true, harnesses: ['codex'] });
      deployInitResources({ cwd: ompOnly, force: true, harnesses: ['omp'] });
      assert(fs.existsSync(path.join(codexOnly, '.codex', 'agents', 'omp-flow-check.toml')), 'Codex-only installs Codex adapter');
      assert(!fs.existsSync(path.join(codexOnly, '.omp')), 'Codex-only does not install OMP adapter');
      const codexUpdatePlan = analyzeChanges(codexOnly, loadHashes(codexOnly));
      assert(!codexUpdatePlan.some(entry => entry.relativePath.startsWith('.omp/')), 'Codex-only update excludes OMP resources');
      assert(fs.existsSync(path.join(ompOnly, '.omp', 'agents', 'executor.md')), 'OMP-only installs OMP adapter');
      assert(!fs.existsSync(path.join(ompOnly, '.codex')), 'OMP-only does not install Codex adapter');
      const before = process.cwd();
      const codexHandlers: string[] = [];
      try {
        process.chdir(codexOnly);
        activateExtension({ on(eventName) { codexHandlers.push(eventName); } });
      } finally {
        process.chdir(before);
      }
      assert(codexHandlers.length === 0, 'OMP extension is inert in Codex-only projects');
      deployInitResources({ cwd: codexOnly, harnesses: ['omp'] });
      assert(readHarnessConfig(codexOnly, true)!.harnesses.join(',') === 'omp,codex', 'Init incrementally adds a Harness');
      assert(fs.existsSync(path.join(codexOnly, '.omp', 'agents', 'orchestrator.md')), 'Incremental Harness install deploys its adapter');
    } finally {
      fs.rmSync(codexOnly, { recursive: true, force: true });
      fs.rmSync(ompOnly, { recursive: true, force: true });
    }

    console.log('--- Test 1c: Claude settings and agent-card static contract ---');
    // Structural (template-source) contract: read the B-owned template sources directly.
    // Test 1d exercises the real selected-Claude init/deploy + source/deployed parity now
    // that the Row-D hook wrappers exist on disk.
    const claudeDir = path.join(process.cwd(), 'templates', 'claude');
    const settingsRaw = fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8');
    const settings = JSON.parse(settingsRaw) as {
      env: Record<string, string>;
      enabledPlugins: Record<string, unknown>;
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout: number }> }>>;
    };
    // settings.json must be strict JSON with a fail-closed shape and no silent write grants.
    assert(settings.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR === '1', 'Claude settings maintain the project working dir for Bash');
    assert(typeof settings.enabledPlugins === 'object' && Object.keys(settings.enabledPlugins).length === 0, 'Claude settings enable no plugins');
    assert(!('permissions' in settings), 'Claude settings add no permission allowlist that silently grants writes');
    // Every declared Hook command targets a managed .claude/hooks script under CLAUDE_PROJECT_DIR
    // with the {{PYTHON_CMD}} placeholder and -X utf8, never a shebang or bare relative path.
    const claudeHookScripts = new Set<string>();
    for (const [, entries] of Object.entries(settings.hooks)) {
      for (const entry of entries) {
        for (const command of entry.hooks) {
          assert(command.type === 'command', 'Claude Hook is a command Hook');
          assert(/^\{\{PYTHON_CMD\}\} -X utf8 "\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/[a-z-]+\.py"$/.test(command.command), 'Claude Hook command invokes a managed script under CLAUDE_PROJECT_DIR: ' + command.command);
          claudeHookScripts.add(command.command.replace(/^.*\/hooks\//, '').replace(/"$/, ''));
        }
      }
    }
    // SessionStart: exactly the four documented sources, each 30s -> session-start.py.
    const sessionMatchers = settings.hooks.SessionStart.map(entry => entry.matcher);
    assert(JSON.stringify([...sessionMatchers].sort()) === JSON.stringify(['clear', 'compact', 'resume', 'startup']), 'SessionStart declares exact startup/resume/clear/compact matchers');
    assert(settings.hooks.SessionStart.every(entry => entry.hooks.every(h => h.timeout === 30 && h.command.includes('session-start.py'))), 'Every SessionStart matcher calls session-start.py with a 30s timeout');
    // UserPromptSubmit: single unmatched 15s workflow-state injection.
    assert(settings.hooks.UserPromptSubmit.length === 1 && settings.hooks.UserPromptSubmit[0].matcher === undefined, 'UserPromptSubmit has one unmatched entry');
    assert(settings.hooks.UserPromptSubmit[0].hooks.every(h => h.timeout === 15 && h.command.includes('inject-workflow-state.py')), 'UserPromptSubmit injects workflow state with a 15s timeout');
    // PreToolUse: exact Agent/Task (context, 30s) and Write/Edit/Bash (protection, 15s) matchers.
    const preToolByMatcher = new Map(settings.hooks.PreToolUse.map(entry => [entry.matcher!, entry.hooks]));
    assert(JSON.stringify([...preToolByMatcher.keys()].sort()) === JSON.stringify(['Agent', 'Bash', 'Edit', 'Task', 'Write']), 'PreToolUse declares exact Agent/Task/Write/Edit/Bash matchers');
    for (const dispatchMatcher of ['Agent', 'Task']) {
      assert(preToolByMatcher.get(dispatchMatcher)!.every(h => h.timeout === 30 && h.command.includes('inject-agent-context.py')), `PreToolUse ${dispatchMatcher} injects agent context with a 30s timeout`);
    }
    for (const mutationMatcher of ['Write', 'Edit', 'Bash']) {
      assert(preToolByMatcher.get(mutationMatcher)!.every(h => h.timeout === 15 && h.command.includes('protect-python-owned.py')), `PreToolUse ${mutationMatcher} guards Python-owned paths with a 15s timeout`);
    }
    // Every command references only the five Row-D Hook scripts; none are invented by Row B.
    assert(
      JSON.stringify([...claudeHookScripts].sort()) === JSON.stringify(['inject-agent-context.py', 'inject-agent-identity.py', 'inject-workflow-state.py', 'protect-python-owned.py', 'session-start.py']),
      'Claude settings reference exactly the five declared Row-D Hook scripts',
    );
    // The five agent names are the single source of identity: filename stem == frontmatter name.
    const claudeAgentNames = ['omp-flow-research', 'omp-flow-architect', 'omp-flow-qbd', 'omp-flow-implement', 'omp-flow-check'];
    const subagentMatchers = settings.hooks.SubagentStart.map(entry => entry.matcher!);
    assert(subagentMatchers.length === claudeAgentNames.length, 'One SubagentStart matcher per managed agent name');
    assert(new Set(subagentMatchers).size === subagentMatchers.length, 'SubagentStart matchers are unique (no duplicate identity injection)');
    assert(JSON.stringify([...subagentMatchers].sort()) === JSON.stringify([...claudeAgentNames].sort()), 'SubagentStart matchers cover exactly the five agent names');
    assert(settings.hooks.SubagentStart.every(entry => entry.hooks.every(h => h.timeout === 15 && h.command.includes('inject-agent-identity.py'))), 'Every SubagentStart matcher injects identity with a 15s timeout');
    // One-to-one settings SubagentStart <-> agent frontmatter name coverage, plus tool/marker contract.
    for (const name of claudeAgentNames) {
      const cardPath = path.join(claudeDir, 'agents', name + '.md');
      assert(fs.existsSync(cardPath), 'Agent card exists for ' + name);
      const cardBody = fs.readFileSync(cardPath, 'utf8');
      const fm = parseFrontmatter(cardBody);
      assert(fm.name === name, `Agent frontmatter name matches its filename stem for ${name}`);
      assert(fm.model === 'inherit', `Agent ${name} inherits the harness model`);
      assert(subagentMatchers.includes(fm.name), `Agent ${name} has a matching SubagentStart matcher`);
      const tools = (fm.tools ?? '').split(',').map(t => t.trim()).filter(Boolean);
      assert(tools.length > 0, `Agent ${name} declares an explicit tool set`);
      assert(!tools.includes('Agent') && !tools.includes('Task'), `Agent ${name} excludes recursive Agent/Task dispatch`);
      assert(!tools.some(t => /mcp|team|dispatch/i.test(t)), `Agent ${name} excludes agent teams, MCP, and custom dispatchers`);
      // Both marker gates and a role write boundary must be present before the agent may act.
      assert(cardBody.includes('<!-- omp-flow-claude-dispatch:v1 -->'), `Agent ${name} gates on the dispatch marker`);
      assert(cardBody.includes('<!-- omp-flow-claude-identity:v1 -->'), `Agent ${name} gates on the identity marker`);
      assert(/agentType.+`?omp-flow-/.test(cardBody) && cardBody.includes(name), `Agent ${name} binds identity to its own exact type`);
      assert(cardBody.includes('## Startup Gate') && cardBody.includes('## Write Boundary'), `Agent ${name} declares a startup gate and a write boundary`);
    }
    // QbD is Read/Write only (report-only writer); Implement/Check get the full mutation belt.
    const qbdTools = parseFrontmatter(fs.readFileSync(path.join(claudeDir, 'agents', 'omp-flow-qbd.md'), 'utf8')).tools;
    assert(qbdTools === 'Read, Write', 'QbD auditor receives only Read/Write');
    for (const worker of ['omp-flow-implement', 'omp-flow-check']) {
      const workerTools = parseFrontmatter(fs.readFileSync(path.join(claudeDir, 'agents', worker + '.md'), 'utf8')).tools.split(',').map(t => t.trim());
      for (const tool of ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash']) {
        assert(workerTools.includes(tool), `${worker} has ${tool}`);
      }
    }
    // The Check card threads the native reviewer agent id through to Python evidence.
    const checkBody = fs.readFileSync(path.join(claudeDir, 'agents', 'omp-flow-check.md'), 'utf8');
    assert(checkBody.includes('--reviewer-agent-id') && checkBody.includes('agentId'), 'Check card passes the native reviewer agent id unchanged');
    // No unexpected native resources: only settings.json + agents/ under templates/claude (hooks/ is Row D).
    const claudeTop = fs.readdirSync(claudeDir).sort();
    assert(!claudeTop.includes('commands') && !claudeTop.includes('statusline') && !claudeTop.includes('plugin'), 'Claude template adds no commands, status line, or plugin manifest');
    assert(fs.readdirSync(path.join(claudeDir, 'agents')).sort().join(',') === claudeAgentNames.map(n => n + '.md').sort().join(','), 'Claude agents directory holds exactly the five managed cards');
    // {{PYTHON_CMD}} is resolved on deploy exactly as it is for the Codex hooks.
    const renderedSettings = renderManagedResource(path.join('templates', 'claude', 'settings.json'), settingsRaw);
    assert(!renderedSettings.includes('{{PYTHON_CMD}}'), 'Claude settings Python command is rendered on deploy');
    const renderedSessionCommand = (JSON.parse(renderedSettings) as typeof settings).hooks.SessionStart[0].hooks[0].command;
    assert(renderedSessionCommand === pythonCommand() + ' -X utf8 "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.py"', 'Rendered Claude command uses the platform Python and confined project root');

    console.log('--- Test 1d: real selected-Claude deploy, source/deployed parity, and isolation (Rows A-D integration) ---');
    // The crux integration proof. Before Row D the Claude hook wrappers did not exist on disk,
    // so a selected-Claude init could not run. Now every declared Claude source exists, so a real
    // deployInitResources({harnesses:['claude']}) MUST succeed end-to-end and deploy the full set.
    const claudeProj = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-claude-deploy-'));
    try {
      fs.mkdirSync(path.join(claudeProj, '.git'));
      const claudePlan = deployInitResources({ cwd: claudeProj, force: true, harnesses: ['claude'] });
      const claudeManaged = getManagedResources(['claude']);
      // (1) The deployed file set EXACTLY equals getManagedResources(['claude']) destinations.
      for (const resource of claudeManaged) {
        assert(fs.existsSync(path.join(claudeProj, resource.destinationPath)), 'selected-Claude deploy writes ' + resource.destinationPath);
      }
      assert(claudePlan.length === claudeManaged.length, 'Claude deploy plan covers exactly the managed Claude+core resources');
      assert(claudePlan.every(entry => entry.action === 'create' && fs.existsSync(entry.destination)), 'Every planned Claude resource is created on disk');
      // Required Claude artifacts: settings.json + exactly five agents + exactly five Row-D hooks + shared skills.
      assert(fs.existsSync(path.join(claudeProj, '.claude', 'settings.json')), 'deployed .claude/settings.json');
      const deployedAgents = fs.readdirSync(path.join(claudeProj, '.claude', 'agents')).sort();
      assert(JSON.stringify(deployedAgents) === JSON.stringify(claudeAgentNames.map(n => n + '.md').sort()), 'deployed .claude/agents holds exactly the five managed cards');
      const deployedHooks = fs.readdirSync(path.join(claudeProj, '.claude', 'hooks')).sort();
      assert(
        JSON.stringify(deployedHooks) === JSON.stringify(['_omp_core.py', 'inject-agent-context.py', 'inject-agent-identity.py', 'inject-workflow-state.py', 'protect-python-owned.py', 'session-start.py']),
        'deployed .claude/hooks holds exactly the five Row-D wrappers plus the shared in-process shim',
      );
      const deployedSkills = fs.readdirSync(path.join(claudeProj, '.claude', 'skills')).sort();
      assert(deployedSkills.includes('omp-flow') && deployedSkills.every(skill => fs.existsSync(path.join(claudeProj, '.claude', 'skills', skill, 'SKILL.md'))), 'deployed .claude/skills carry the routed SKILL.md files');
      // (2) No cross-adapter leakage: the OMP and Codex adapter directories are never created.
      assert(!fs.existsSync(path.join(claudeProj, '.omp')), 'selected-Claude deploy creates no .omp directory');
      assert(!fs.existsSync(path.join(claudeProj, '.codex')), 'selected-Claude deploy creates no .codex directory');
      // The shared Python core still deploys under .omp-flow (it is harness-independent).
      assert(fs.existsSync(path.join(claudeProj, '.omp-flow', 'scripts', 'omp_flow.py')), 'selected-Claude deploy still installs the shared Python core');
      assert(readHarnessConfig(claudeProj, true)!.harnesses.join(',') === 'claude', 'selected-Claude deploy records claude as the only harness');
      // (3) SOURCE/DEPLOYED parity: every deployed file byte-matches its rendered template.
      for (const resource of claudeManaged) {
        const rendered = renderManagedResource(resource.sourcePath, fs.readFileSync(path.join(process.cwd(), resource.sourcePath), 'utf8'));
        const deployed = fs.readFileSync(path.join(claudeProj, resource.destinationPath), 'utf8');
        assert(deployed === rendered, 'deployed file byte-matches its rendered template: ' + resource.destinationPath);
      }
      // (4) {{PYTHON_CMD}} is resolved in the DEPLOYED settings.json (not merely in the rendered template).
      const deployedSettingsRaw = fs.readFileSync(path.join(claudeProj, '.claude', 'settings.json'), 'utf8');
      assert(!deployedSettingsRaw.includes('{{PYTHON_CMD}}'), 'deployed Claude settings resolve the {{PYTHON_CMD}} placeholder');
      const deployedSettings = JSON.parse(deployedSettingsRaw) as typeof settings;
      assert(
        deployedSettings.hooks.SessionStart[0].hooks[0].command === pythonCommand() + ' -X utf8 "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.py"',
        'deployed Claude hook command uses the platform Python and the confined project root',
      );
      // (4b) Done Condition 4 at the DEPLOYED level: no custom dispatcher, model alias, plugin, or status line.
      assert(JSON.stringify(fs.readdirSync(path.join(claudeProj, '.claude')).sort()) === JSON.stringify(['agents', 'hooks', 'settings.json', 'skills']), 'deployed .claude holds only settings/agents/hooks/skills');
      assert(Object.keys(deployedSettings.enabledPlugins).length === 0, 'deployed Claude settings enable no plugins');
      const deployedSettingsRecord = deployedSettings as unknown as Record<string, unknown>;
      assert(!('permissions' in deployedSettingsRecord) && !('model' in deployedSettingsRecord) && !('statusLine' in deployedSettingsRecord), 'deployed Claude settings add no permission allowlist, model alias, or status line');
      for (const name of claudeAgentNames) {
        const fm = parseFrontmatter(fs.readFileSync(path.join(claudeProj, '.claude', 'agents', name + '.md'), 'utf8'));
        assert(fm.name === name && fm.model === 'inherit', 'deployed agent ' + name + ' keeps its exact name and inherits the harness model (no alias)');
      }
      const deployedSub = deployedSettings.hooks.SubagentStart.map(entry => entry.matcher!).sort();
      assert(JSON.stringify(deployedSub) === JSON.stringify([...claudeAgentNames].sort()), 'deployed SubagentStart matchers map one-to-one onto the deployed agent frontmatter names');
      // (5) Configured-Claude update isolation: a fresh deploy plans no changes and never touches .omp/.codex.
      const claudeUpdatePlan = analyzeChanges(claudeProj, loadHashes(claudeProj));
      assert(!claudeUpdatePlan.some(entry => entry.relativePath.startsWith('.omp/') || entry.relativePath.startsWith('.codex/')), 'configured-Claude update excludes OMP and Codex resources');
      assert(claudeUpdatePlan.some(entry => entry.relativePath === '.claude/settings.json'), 'configured-Claude update manages the Claude settings');
      assert(claudeUpdatePlan.every(entry => entry.status === 'unchanged' && entry.action === 'skip'), 'a freshly deployed Claude project has no pending template drift');
      // (6) DEPLOYED-adapter smoke: drive a task to executing, then invoke the DEPLOYED wrappers exactly as
      // Claude Code would. Byte-parity (3) means Test 8i's exhaustive Row-D matrix applies to these deployed
      // copies; here we prove invocation from the deployed .claude/hooks path resolves real workflow state.
      const deployedHookDir = path.join(claudeProj, '.claude', 'hooks');
      const depEnv = { OMP_FLOW_CONTEXT_ID: 'claude-deployed-1' };
      const depSid = 'claude-deployed-1';
      const dep = driveToExecuting(
        claudeProj, depEnv, 'Deployed Claude', 'deployed-claude',
        ['A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md'],
        { 'A-001': '# A brief\n' },
      );
      const depEnvFile = path.join(claudeProj, 'claude-env-bridge.sh');
      fs.writeFileSync(depEnvFile, '', 'utf8');
      const depSs = runWrapper('session-start.py', claudeProj, { hook_event_name: 'SessionStart', source: 'startup', session_id: depSid, cwd: claudeProj }, { CLAUDE_ENV_FILE: depEnvFile }, deployedHookDir);
      assert(depSs.status === 0, 'deployed session-start.py exits 0');
      const depSsOut = JSON.parse(depSs.stdout) as { hookSpecificOutput: { additionalContext: string } };
      assert(depSsOut.hookSpecificOutput.additionalContext.includes('Phase: execute'), 'deployed session-start.py resolves the executing task phase');
      assert(fs.readFileSync(depEnvFile, 'utf8').includes('export OMP_FLOW_CONTEXT_ID=claude-deployed-1'), 'deployed session-start.py bridges the raw session id to CLAUDE_ENV_FILE');
      const depDispatch = dispatchLine({ version: 1, role: 'executor', taskId: dep.taskId, rowId: 'A-001' }) + '\nImplement the root row.';
      const depCtx = runWrapper('inject-agent-context.py', claudeProj, { hook_event_name: 'PreToolUse', session_id: depSid, cwd: claudeProj, tool_name: 'Agent', tool_input: { subagent_type: 'omp-flow-implement', description: 'Implement the assigned row', model: 'inherit', prompt: depDispatch } }, {}, deployedHookDir);
      assert(depCtx.status === 0, 'deployed inject-agent-context.py exits 0 for a valid dispatch');
      const depCtxOut = JSON.parse(depCtx.stdout) as { hookSpecificOutput: { permissionDecision: string; updatedInput: Record<string, unknown> } };
      assert(depCtxOut.hookSpecificOutput.permissionDecision === 'allow' && String(depCtxOut.hookSpecificOutput.updatedInput.prompt).includes('# A brief'), 'deployed dispatch wrapper allows and injects the exact row brief');
      // (7) Incremental Claude install: adding claude to a configured omp+codex project deploys only the
      // Claude adapter and preserves the existing adapters.
      const mixedProj = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-mixed-claude-'));
      try {
        fs.mkdirSync(path.join(mixedProj, '.git'));
        deployInitResources({ cwd: mixedProj, force: true, harnesses: ['omp', 'codex'] });
        assert(!fs.existsSync(path.join(mixedProj, '.claude')), 'omp+codex project has no Claude adapter before the incremental install');
        deployInitResources({ cwd: mixedProj, harnesses: ['claude'] });
        assert(readHarnessConfig(mixedProj, true)!.harnesses.join(',') === 'omp,codex,claude', 'incremental Claude install extends the harness manifest to omp,codex,claude');
        assert(fs.existsSync(path.join(mixedProj, '.claude', 'settings.json')) && fs.existsSync(path.join(mixedProj, '.claude', 'hooks', 'session-start.py')), 'incremental Claude install deploys the Claude adapter');
        assert(fs.existsSync(path.join(mixedProj, '.omp', 'agents', 'executor.md')) && fs.existsSync(path.join(mixedProj, '.codex', 'agents', 'omp-flow-implement.toml')), 'incremental Claude install preserves the existing OMP and Codex adapters');
      } finally {
        fs.rmSync(mixedProj, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(claudeProj, { recursive: true, force: true });
    }

    console.log('--- Test 2: full scaffold and session-scoped active task ---');
    // Drift guard: the spawnEnv() identity denylist must exactly match the env-read
    // surface of the DEPLOYED control plane (deployed<->template byte-parity is
    // Test 1d's job). Derive the key set from both read shapes in active_task.py:
    // literal os.environ.get("KEY") reads, and ENV_KEYS tuple entries — whose
    // platform-label class is [a-z0-9_-]+ to match _clean_label's alphabet.
    // Documented fallback if these read shapes are ever refactored (not built
    // now): a `python -c` runtime dump of the tuple.
    {
      const activeTaskSource = fs.readFileSync(path.join(root, '.omp-flow', 'scripts', 'common', 'active_task.py'), 'utf8');
      const derived = new Set<string>();
      for (const match of activeTaskSource.matchAll(/os\.environ\.get\(\s*"([A-Z][A-Z0-9_]*)"/g)) derived.add(match[1]);
      for (const match of activeTaskSource.matchAll(/\(\s*"[a-z0-9_-]+"\s*,\s*"([A-Z][A-Z0-9_]*)"\s*\)/g)) derived.add(match[1]);
      const denylist = new Set<string>(IDENTITY_ENV_KEYS);
      const missing = [...derived].filter(key => !denylist.has(key));
      const extra = [...denylist].filter(key => !derived.has(key));
      assert(
        missing.length === 0 && extra.length === 0,
        'spawnEnv identity denylist drifted from the deployed active_task.py: '
          + missing.map(key => `IDENTITY_ENV_KEYS is missing ${key}`)
            .concat(extra.map(key => `IDENTITY_ENV_KEYS has extra key ${key} not read by active_task.py`))
            .join('; '),
      );
    }
    const alphaEnv = { CODEX_THREAD_ID: 'alpha-thread' };
    const betaEnv = { CODEX_THREAD_ID: 'beta-thread' };
    const alpha = runPythonJson<{ taskId: string; activation: string }>(
      root, ['task', 'create', 'Alpha Task', '--slug', 'alpha'], alphaEnv,
    );
    const beta = runPythonJson<{ taskId: string }>(
      root, ['task', 'create', 'Beta Task', '--slug', 'beta'], betaEnv,
    );
    assert(alpha.activation === 'session', 'Task create activates current session');
    const alphaCurrent = runPythonJson<{ taskId: string }>(root, ['task', 'current'], alphaEnv);
    const betaCurrent = runPythonJson<{ taskId: string }>(root, ['task', 'current'], betaEnv);
    assert(alphaCurrent.taskId === alpha.taskId, 'Alpha session keeps alpha task');
    assert(betaCurrent.taskId === beta.taskId, 'Beta session keeps beta task');
    assert(alphaCurrent.taskId !== betaCurrent.taskId, 'Sessions do not overwrite each other');
    // Blank strings (not absent keys) deliberately pin the Python-side "blank means
    // absent" .strip() contract (active_task.py:43, :56); spawnEnv() already covers
    // absence, so this is a contract pin, not residual isolation plumbing.
    const noSessionEnv = {
      CODEX_THREAD_ID: '', CODEX_SESSION_ID: '', OMP_SESSION_ID: '', PI_SESSION_ID: '', OMP_FLOW_CONTEXT_ID: '',
    };
    expectPythonFailure(root, ['task', 'create', 'No Session', '--slug', 'no-session'], 'No session identity', noSessionEnv);
    const noSessionTasks = fs.readdirSync(path.join(root, '.omp-flow', 'tasks')).filter(name => name.endsWith('-no-session'));
    assert(noSessionTasks.length === 0, 'Failed activation leaves no task workspace');

    const alphaDir = path.join(root, '.omp-flow', 'tasks', alpha.taskId);
    for (const relative of [
      'task.json',
      'brainstorm.md',
      'prd.md',
      'design.md',
      'tasks.csv',
      'evidence.csv',
      'qbd/qbd-1',
      'qbd/qbd-2',
      '.task',
      'context/index.json',
    ]) {
      assert(fs.existsSync(path.join(alphaDir, relative)), 'Scaffold contains ' + relative);
    }
    assert(readCsv(root, alpha.taskId).trim().split(/\r?\n/).length === 1, 'Seed tasks.csv is header-only');
    assert(fs.readdirSync(path.join(alphaDir, '.task')).length === 0, 'Seed creates no concrete row artifact');
    assert(fs.readdirSync(path.join(alphaDir, 'qbd', 'qbd-1')).length === 0, 'Seed creates no QbD result');

    console.log('--- Test 3: workflow state comes from workflow.md ---');
    const state = runPython(root, ['workflow', 'state'], alphaEnv);
    assert(state.includes('Phase: explore'), 'Workflow state includes task phase');
    assert(state.includes('Stay in exploration'), 'Workflow block is parsed from workflow.md');
    const hook = runPythonJson<{ hookSpecificOutput: { additionalContext: string } }>(
      root,
      ['hook', 'codex-workflow-state'],
      alphaEnv,
      JSON.stringify({ session_id: 'alpha-thread', platform: 'codex', cwd: root }),
    );
    assert(hook.hookSpecificOutput.additionalContext.includes('Phase: explore'), 'Codex Hook returns additionalContext');

    console.log('--- Test 4: exact topology is the only DAG ---');
    fs.writeFileSync(
      path.join(alphaDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,decision:decision-001,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,constraint-001,pending,task,.task/B-001.implement.md',
        'C-A001B001--003,2,P0,Join,src/c.ts,implement,,"decision:decision-001; constraint-001",pending,task,.task/C-A001B001--003.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(alphaDir, '.task', 'A-001.implement.md'), '# Root brief\n', 'utf8');
    fs.writeFileSync(path.join(alphaDir, '.task', 'B-001.implement.md'), '# Peer brief\n', 'utf8');
    fs.writeFileSync(path.join(alphaDir, '.task', 'C-A001B001--003.implement.md'), '# Join brief\n', 'utf8');
    fs.writeFileSync(
      path.join(alphaDir, 'context', 'index.json'),
      JSON.stringify({
        entries: [
          { entryId: 'decision-001', type: 'decision', path: 'decision-001.md' },
          { entryId: 'constraint-001', type: 'constraint', path: 'constraint-001.md' },
        ],
      }),
      'utf8',
    );
    fs.writeFileSync(path.join(alphaDir, 'context', 'decision-001.md'), '# Decision\n\nApprove approach.\n', 'utf8');
    fs.writeFileSync(path.join(alphaDir, 'context', 'constraint-001.md'), '# Constraint\n\nUse existing patterns.\n', 'utf8');
    const topology = runPythonJson<{ rows: number; waves: Record<string, number> }>(
      root, ['topology', 'validate'], alphaEnv,
    );
    assert(topology.rows === 3, 'All exact topology rows validate');
    assert(topology.waves['C-003'] === 2, 'Dependent row wave is derived from exact refs');

    // Context references are validated at freeze time: comma-separated file paths fail,
    // unresolved type:entryId fails, and valid semicolon-separated refs pass.
    const withContext = (aContext: string) => [
      'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
      `A-001,1,P0,Root,src/a.ts,implement,,${aContext},pending,task,.task/A-001.implement.md`,
      'B-001,1,P0,Peer,src/b.ts,implement,,constraint-001,pending,task,.task/B-001.implement.md',
      'C-A001B001--003,2,P0,Join,src/c.ts,implement,,"decision:decision-001; constraint-001",pending,task,.task/C-A001B001--003.implement.md',
      '',
    ].join('\n');
    fs.writeFileSync(
      path.join(alphaDir, 'tasks.csv'),
      withContext('"context/decision-001.md, context/constraint-001.md"'),
      'utf8',
    );
    expectPythonFailure(root, ['topology', 'validate'], 'Row A-001 has malformed context reference', alphaEnv);
    fs.writeFileSync(
      path.join(alphaDir, 'tasks.csv'),
      withContext('decision:NONEXISTENT'),
      'utf8',
    );
    expectPythonFailure(root, ['topology', 'validate'], 'Row A-001 has unresolved context reference: decision:NONEXISTENT', alphaEnv);
    fs.writeFileSync(path.join(alphaDir, 'tasks.csv'), withContext('decision:decision-001'), 'utf8');

    const invalidCsv = readCsv(root, alpha.taskId).replace(
      'C-A001B001--003,2',
      'C-AB-003,2',
    );
    fs.writeFileSync(path.join(alphaDir, 'tasks.csv'), invalidCsv, 'utf8');
    expectPythonFailure(root, ['topology', 'validate'], 'Invalid topology ID', alphaEnv);
    fs.writeFileSync(
      path.join(alphaDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md',
        'C-A001B001--003,2,P0,Join,src/c.ts,implement,,,pending,task,.task/C-A001B001--003.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );

    // M2: active rows may not depend on retired (superseded/cancelled) rows,
    // but a completed row depending on a retired row is historical and allowed.
    const supersededDepCsv = [
      'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
      'A-001,1,P0,Root,src/a.ts,implement,,,superseded,task,.task/A-001.implement.md',
      'B-001,1,P0,Peer,src/b.ts,implement,,,completed,task,.task/B-001.implement.md',
      'C-A001B001--003,2,P0,Join,src/c.ts,implement,,,pending,task,.task/C-A001B001--003.implement.md',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(alphaDir, 'tasks.csv'), supersededDepCsv, 'utf8');
    expectPythonFailure(
      root, ['topology', 'validate'], 'Active row C-A001B001--003 depends on superseded row A-001', alphaEnv,
    );
    // The same retired dependency is tolerated once the dependant is completed (historical).
    fs.writeFileSync(
      path.join(alphaDir, 'tasks.csv'),
      supersededDepCsv.replace('C-A001B001--003,2,P0,Join,src/c.ts,implement,,,pending', 'C-A001B001--003,2,P0,Join,src/c.ts,implement,,,completed'),
      'utf8',
    );
    const retiredHistorical = runPythonJson<{ rows: number }>(root, ['topology', 'validate'], alphaEnv);
    assert(retiredHistorical.rows === 3, 'Completed row may historically depend on a superseded row');
    // Restore the canonical all-pending topology for the QbD gate tests that follow.
    fs.writeFileSync(
      path.join(alphaDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,decision:decision-001,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,constraint-001,pending,task,.task/B-001.implement.md',
        'C-A001B001--003,2,P0,Join,src/c.ts,implement,,"decision:decision-001; constraint-001",pending,task,.task/C-A001B001--003.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );

    console.log('--- Test 4b: topology accept is the only legal row-authoring path ---');
    const acceptEnv = { CODEX_THREAD_ID: 'accept-thread' };
    const acceptTask = runPythonJson<{ taskId: string }>(root, ['task', 'create', 'Accept Task', '--slug', 'accept'], acceptEnv);
    const acceptDir = path.join(root, '.omp-flow', 'tasks', acceptTask.taskId);
    const acceptTaskJson = JSON.parse(fs.readFileSync(path.join(acceptDir, 'task.json'), 'utf8')) as { phase: string };
    acceptTaskJson.phase = 'decompose';
    fs.writeFileSync(path.join(acceptDir, 'task.json'), JSON.stringify(acceptTaskJson, null, 2), 'utf8');
    const acceptDraft = [
      'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
      'A-001,1,P0,Root,src/a.ts,implement,,decision:accept-001,pending,task,.task/A-001.implement.md',
      'B-A001--002,2,P0,Child,src/b.ts,implement,,,pending,task,.task/B-A001--002.implement.md',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(acceptDir, '.task', 'tasks-draft.csv'), acceptDraft, 'utf8');
    fs.writeFileSync(path.join(acceptDir, '.task', 'A-001.implement.md'), '# A brief\n', 'utf8');
    fs.writeFileSync(path.join(acceptDir, '.task', 'B-A001--002.implement.md'), '# B brief\n', 'utf8');
    fs.writeFileSync(
      path.join(acceptDir, 'context', 'index.json'),
      JSON.stringify({ entries: [{ entryId: 'accept-001', type: 'decision', path: 'accept-001.md' }] }),
      'utf8',
    );
    fs.writeFileSync(path.join(acceptDir, 'context', 'accept-001.md'), '# Decision\n\nApproved.\n', 'utf8');
    const accepted = runPythonJson<{ taskId: string; rows: number; waves: Record<string, number> }>(
      root, ['topology', 'accept', '--file', '.task/tasks-draft.csv'], acceptEnv,
    );
    assert(accepted.taskId === acceptTask.taskId, 'accept returns the active task id');
    assert(accepted.rows === 2, 'accept installs both rows');
    assert(accepted.waves['A-001'] === 1 && accepted.waves['B-002'] === 2, 'accept returns canonical wave map');
    assert(readCsv(root, acceptTask.taskId).trim() === acceptDraft.trim(), 'installed tasks.csv matches the draft');
    // accept is only allowed in phase=decompose.
    acceptTaskJson.phase = 'ready';
    fs.writeFileSync(path.join(acceptDir, 'task.json'), JSON.stringify(acceptTaskJson, null, 2), 'utf8');
    expectPythonFailure(root, ['topology', 'accept', '--file', '.task/tasks-draft.csv'], 'phase=decompose', acceptEnv);
    acceptTaskJson.phase = 'decompose';
    fs.writeFileSync(path.join(acceptDir, 'task.json'), JSON.stringify(acceptTaskJson, null, 2), 'utf8');
    // accept rejects any row whose status is not pending.
    fs.writeFileSync(
      path.join(acceptDir, '.task', 'tasks-draft.csv'),
      acceptDraft.replace('A-001,1,P0,Root,src/a.ts,implement,,decision:accept-001,pending', 'A-001,1,P0,Root,src/a.ts,implement,,decision:accept-001,completed'),
      'utf8',
    );
    expectPythonFailure(root, ['topology', 'accept', '--file', '.task/tasks-draft.csv'], 'Row A-001 is not pending', acceptEnv);
    // accept rejects a draft whose brief is missing.
    fs.writeFileSync(
      path.join(acceptDir, '.task', 'tasks-draft.csv'),
      acceptDraft + 'D-001,1,P0,Extra,src/d.ts,implement,,,pending,task,.task/D-001.implement.md\n',
      'utf8',
    );
    expectPythonFailure(root, ['topology', 'accept', '--file', '.task/tasks-draft.csv'], 'Required file not found', acceptEnv);
    // accept rejects a draft whose brief still contains the uncommitted-template marker.
    fs.writeFileSync(path.join(acceptDir, '.task', 'D-001.implement.md'), '<!-- Uncommitted template.\n', 'utf8');
    expectPythonFailure(root, ['topology', 'accept', '--file', '.task/tasks-draft.csv'], 'still an uncommitted template', acceptEnv);
    fs.unlinkSync(path.join(acceptDir, '.task', 'D-001.implement.md'));
    // accept rejects an unresolved context reference.
    fs.writeFileSync(
      path.join(acceptDir, '.task', 'tasks-draft.csv'),
      acceptDraft.replace('decision:accept-001', 'decision:MISSING'),
      'utf8',
    );
    expectPythonFailure(root, ['topology', 'accept', '--file', '.task/tasks-draft.csv'], 'Row A-001 has unresolved context reference: decision:MISSING', acceptEnv);

    console.log('--- Test 5: Reference provenance and QbD gates ---');
    const upstream = path.join(root, 'reference', 'sample');
    fs.mkdirSync(upstream, { recursive: true });
    fs.writeFileSync(path.join(upstream, 'source.ts'), 'export const value = 1;\n', 'utf8');
    const digested = runPythonJson<{ reference: { slug: string } }>(
      root,
      [
        'reference', 'digest-file', '--source-repo', 'reference/sample',
        '--source-path', 'source.ts', '--summary', 'Sample source',
      ],
      alphaEnv,
    );
    assert(digested.reference.slug.endsWith('source-ts'), 'Reference slug includes source extension');
    expectPythonFailure(
      root,
      ['reference', 'digest-file', '--source-repo', 'src', '--source-path', 'index.ts'],
      'source-repo must be under repository reference/',
      alphaEnv,
    );

    const synthesis = path.join(alphaDir, 'research', '90-synthesis-001-test.md');
    fs.writeFileSync(synthesis, '# Synthesis\n\nConfirmed evidence.\n', 'utf8');
    runPython(root, [
      'workflow', 'select-synthesis', '--path', 'research/90-synthesis-001-test.md',
    ], alphaEnv);
    fs.writeFileSync(path.join(alphaDir, 'prd.md'), '# PRD\n\n## Goal\n\nPortable workflow.\n', 'utf8');
    fs.writeFileSync(path.join(alphaDir, 'design.md'), '# Design\n\n## Architecture\n\nPython core.\n', 'utf8');
    const qbd1 = runPythonJson<{ report: string; evidenceDigest: string }>(
      root, ['gate', 'prepare', 'qbd1'], alphaEnv,
    );
    assert(qbd1.report === 'qbd/qbd-1/audit-001.md', 'QbD 1 report is outside .task');
    fs.writeFileSync(
      path.join(alphaDir, qbd1.report),
      [
        '---',
        'gate: qbd1',
        'verdict: PASS',
        'risk: low',
        'evidenceDigest: ' + qbd1.evidenceDigest,
        '---',
        '',
        '# Audit',
        '',
      ].join('\n'),
      'utf8',
    );
    const inspected1 = runPythonJson<{ status: string }>(root, ['gate', 'inspect', 'qbd1'], alphaEnv);
    assert(inspected1.status === 'awaiting_human', 'QbD model PASS waits for human');
    runPython(root, ['gate', 'decide', 'qbd1', '--decision', 'pass', '--note', 'Approved test design'], alphaEnv);

    const referenceSlice = path.join(alphaDir, 'reference', digested.reference.slug + '.ts');
    const approvedReference = fs.readFileSync(referenceSlice, 'utf8');
    fs.writeFileSync(referenceSlice, approvedReference + '// changed\n', 'utf8');
    expectPythonFailure(root, ['gate', 'prepare', 'qbd2'], 'qbd1 approved evidence is stale', alphaEnv);
    fs.writeFileSync(referenceSlice, approvedReference, 'utf8');

    const qbd2 = runPythonJson<{ report: string; evidenceDigest: string }>(
      root, ['gate', 'prepare', 'qbd2'], alphaEnv,
    );
    fs.writeFileSync(
      path.join(alphaDir, qbd2.report),
      [
        '---',
        'gate: qbd2',
        'verdict: PASS',
        'risk: low',
        'evidenceDigest: ' + qbd2.evidenceDigest,
        '---',
        '',
        '# Audit',
        '',
      ].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', 'qbd2'], alphaEnv);
    runPython(root, ['gate', 'decide', 'qbd2', '--decision', 'pass', '--note', 'Approved test topology'], alphaEnv);
    const approvedTask = JSON.parse(fs.readFileSync(path.join(alphaDir, 'task.json'), 'utf8')) as {
      phase: string;
      topologyFrozen: boolean;
    };
    assert(approvedTask.phase === 'ready' && approvedTask.topologyFrozen, 'QbD 2 human PASS freezes topology');

    console.log('--- Test 6: execution context and independent evidence ---');
    runPython(root, ['task', 'start'], alphaEnv);
    const rework = runPythonJson<{ phase: string; reworkRecord: string }>(root, [
      'task', 'rework', '--reason', 'Human-approved test topology correction',
    ], alphaEnv);
    assert(rework.phase === 'decompose', 'Human-approved rework returns task to decomposition');
    assert(fs.existsSync(path.join(alphaDir, rework.reworkRecord)), 'Rework records the human-approved reason');
    const reworkedTask = JSON.parse(fs.readFileSync(path.join(alphaDir, 'task.json'), 'utf8')) as {
      status: string;
      phase: string;
      topologyFrozen: boolean;
      gates: { qbd2: { status: string } };
    };
    assert(
      reworkedTask.status === 'planning'
        && reworkedTask.phase === 'decompose'
        && !reworkedTask.topologyFrozen
        && reworkedTask.gates.qbd2.status === 'needs_revision',
      'Rework clears only the QbD 2 execution freeze',
    );
    const qbd2Rework = runPythonJson<{ report: string; evidenceDigest: string }>(
      root, ['gate', 'prepare', 'qbd2'], alphaEnv,
    );
    assert(qbd2Rework.report === 'qbd/qbd-2/audit-002.md', 'Rework reserves a new QbD 2 attempt');
    const reworkedGate = JSON.parse(fs.readFileSync(path.join(alphaDir, 'task.json'), 'utf8')) as {
      gates: { qbd2: { status: string; verdict?: string; inspectedAt?: string; humanDecision?: string } };
    };
    assert(
      reworkedGate.gates.qbd2.status === 'prepared'
        && reworkedGate.gates.qbd2.verdict === undefined
        && reworkedGate.gates.qbd2.inspectedAt === undefined
        && reworkedGate.gates.qbd2.humanDecision === undefined,
      'New QbD attempt clears the prior verdict and human decision',
    );
    fs.writeFileSync(
      path.join(alphaDir, qbd2Rework.report),
      [
        '---',
        'gate: qbd2',
        'verdict: PASS',
        'risk: low',
        'evidenceDigest: ' + qbd2Rework.evidenceDigest,
        '---',
        '',
        '# Rework Audit',
        '',
      ].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', 'qbd2'], alphaEnv);
    runPython(root, ['gate', 'decide', 'qbd2', '--decision', 'pass', '--note', 'Approved corrected test topology'], alphaEnv);
    runPython(root, ['task', 'start'], alphaEnv);
    const frozenBriefPath = path.join(alphaDir, '.task', 'A-001.implement.md');
    const frozenBrief = fs.readFileSync(frozenBriefPath, 'utf8');
    fs.writeFileSync(frozenBriefPath, frozenBrief + '\nUnauthorized mutation.\n', 'utf8');
    expectPythonFailure(root, ['topology', 'ready', '--role', 'executor'], 'qbd2 approved evidence is stale', alphaEnv);
    fs.writeFileSync(frozenBriefPath, frozenBrief, 'utf8');
    const ready = runPythonJson<{ rows: Array<{ id: string }> }>(
      root, ['topology', 'ready', '--role', 'executor'], alphaEnv,
    );
    assert(ready.rows.map(row => row.id).join(',') === 'A-001,B-001', 'Only root rows are initially ready');
    expectPythonFailure(root, ['context', '--role', 'reviewer', '--row', 'A-001'], 'not valid for reviewer', alphaEnv);
    const executorContext = runPython(root, ['context', '--role', 'executor', '--row', 'A-001'], alphaEnv, 'Implement root.');
    assert(executorContext.includes('A-001') && executorContext.includes('# Root brief'), 'Executor receives exact row brief');
    runPython(root, ['topology', 'mark-result', '--row', 'A-001', '--result', 'success'], alphaEnv);
    const reviewReady = runPythonJson<{ rows: Array<{ id: string }> }>(
      root, ['topology', 'ready', '--role', 'reviewer'], alphaEnv,
    );
    assert(reviewReady.rows.map(row => row.id).join(',') === 'A-001', 'Reviewer sees only rows awaiting review');
    const reviewerContext = runPython(root, ['context', '--role', 'reviewer', '--row', 'A-001'], alphaEnv, 'Review root.');
    assert(reviewerContext.includes('--task ' + alpha.taskId), 'Reviewer handoff uses explicit parent task identity');
    fs.writeFileSync(path.join(alphaDir, '.task', 'A-001.review.md'), '# Review\n\nPASS\n', 'utf8');
    runPython(
      root,
      [
        'evidence', 'submit',
        '--row', 'A-001',
        '--verdict', 'pass',
        '--tests-run', '2',
        '--tests-failed', '0',
        '--report', '.task/A-001.review.md',
        '--evidence', 'focused tests passed',
        '--reviewer-agent-id', 'reviewer-test-1',
      ],
      alphaEnv,
    );
    assert(readCsv(root, alpha.taskId).includes('A-001,1,P0,Root,src/a.ts,implement,,decision:decision-001,completed'), 'Evidence marks row completed');
    // After this row, the task remains executing; the old completed-row rework forbid is removed
    // (rework is now legal and re-derives currency at the next qbd2 PASS -- see AC2 DL-C test below).
    const nextReady = runPythonJson<{ rows: Array<{ id: string }> }>(
      root, ['topology', 'ready', '--role', 'executor'], alphaEnv,
    );
    assert(nextReady.rows.some(row => row.id === 'B-001'), 'Independent root remains ready');
    assert(!nextReady.rows.some(row => row.id === 'C-A001B001--003'), 'Join waits for every exact dependency');

    console.log('--- Test 7: thin OMP adapter preserves native task ---');
    const ompEnv = { OMP_FLOW_CONTEXT_ID: 'omp-main' };
    runPython(root, ['task', 'select', alpha.taskId], ompEnv);
    const extension = new OMPFlowExtension(root);
    extension.onSessionStart({ sessionManager: { getSessionId: () => 'omp-main', taskDepth: 0 } });
    const bashInput: Record<string, unknown> = { command: 'omp-flow status' };
    extension.onToolCall({
      toolName: 'bash',
      input: bashInput,
      sessionManager: { getSessionId: () => 'omp-main', taskDepth: 0 },
    });
    assert((bashInput.env as Record<string, string>).OMP_FLOW_CONTEXT_ID === 'omp-main', 'Main bash receives session identity through native env input');
    const childBash: Record<string, unknown> = { command: 'echo child' };
    extension.onToolCall({
      toolName: 'bash',
      input: childBash,
      sessionManager: { getSessionId: () => 'omp-child', taskDepth: 1 },
    });
    assert(childBash.env === undefined, 'Child bash does not create an unrelated active-task session');
    const injected = extension.onContext({
      messages: [],
      sessionManager: { getSessionId: () => 'omp-main', taskDepth: 0 },
    });
    assert(JSON.stringify(injected.messages).includes('omp-flow-workflow-state'), 'OMP context uses Python workflow state');
    const nativeInput: Record<string, unknown> = {
      agent: 'executor',
      assignment: 'Implement row B-001',
    };
    const nativeResult = extension.onToolCall({
      toolName: 'task',
      input: nativeInput,
      sessionManager: { getSessionId: () => 'omp-main', taskDepth: 0 },
    });
    assert(nativeResult.block !== true, 'Valid native task is not blocked');
    assert(String(nativeInput.assignment).includes('OMP-Flow Executor Handoff'), 'Native assignment is enriched by Python');

    const qbdInput: Record<string, unknown> = { agent: 'qbd-auditor', assignment: 'Prepared QbD prompt' };
    extension.onToolCall({ toolName: 'task', input: qbdInput });
    assert(qbdInput.assignment === 'Prepared QbD prompt', 'Prepared QbD prompt remains native and untouched');

    const entrySource = fs.readFileSync(path.join(process.cwd(), 'src', 'omp', 'extension-entry.ts'), 'utf8');
    assert(!entrySource.includes('registerTool('), 'OMP adapter registers no custom tools');
    const handlers: Array<(event: unknown, ctx: Record<string, unknown>) => unknown | Promise<unknown>> = [];
    let activeTools: string[] = [];
    activateExtension({
      on(eventName, handler) {
        if (eventName === 'session_start') handlers.push(handler as (event: unknown, ctx: Record<string, unknown>) => unknown);
      },
      setActiveTools(toolNames) {
        activeTools = toolNames;
      },
    });
    await handlers[0]!({}, { sessionManager: { getSessionId: () => 'main', taskDepth: 0 } });
    const orchestratorTools = loadAgentDefinition(process.cwd(), 'orchestrator').tools ?? [];
    assert(JSON.stringify(activeTools) === JSON.stringify(orchestratorTools), 'Main uses orchestrator native belt');
    assert(activeTools.includes('bash') && activeTools.includes('write') && activeTools.includes('task'), 'Main can run Python and native task');
    assert(!activeTools.some(tool => tool.startsWith('omp_flow_')), 'No custom omp-flow tools pollute main belt');

    console.log('--- Test 8: completed topology enters finish and archives ---');
    // Per-row freeze localizes: mutating a COMPLETED row's brief must not brick siblings.
    const completedBriefPath = path.join(alphaDir, '.task', 'A-001.implement.md');
    const completedBrief = fs.readFileSync(completedBriefPath, 'utf8');
    fs.writeFileSync(completedBriefPath, completedBrief + '\nPost-completion edit.\n', 'utf8');
    const localizedReady = runPythonJson<{ rows: Array<{ id: string }> }>(
      root, ['topology', 'ready', '--role', 'executor'], alphaEnv,
    );
    assert(
      localizedReady.rows.some(row => row.id === 'B-001'),
      'Mutating a completed row brief does not brick a sibling row (per-row digest localizes)',
    );
    // Shared design evidence still fails closed for ALL rows even while a completed brief drifts.
    const designPath = path.join(alphaDir, 'design.md');
    const designBody = fs.readFileSync(designPath, 'utf8');
    fs.writeFileSync(designPath, designBody + '\nAdversarial design drift.\n', 'utf8');
    expectPythonFailure(root, ['topology', 'ready', '--role', 'executor'], 'design evidence is stale', alphaEnv);
    fs.writeFileSync(designPath, designBody, 'utf8');
    // A sibling row still marks/completes normally while the completed row's brief is mutated.
    runPython(root, ['topology', 'mark-result', '--row', 'B-001', '--result', 'success'], alphaEnv);
    fs.writeFileSync(completedBriefPath, completedBrief, 'utf8');
    fs.writeFileSync(path.join(alphaDir, '.task', 'B-001.review.md'), '# Review\n\nPASS\n', 'utf8');
    runPython(root, [
      'evidence', 'submit', '--task', alpha.taskId, '--row', 'B-001', '--verdict', 'pass',
      '--tests-run', '1', '--tests-failed', '0', '--report', '.task/B-001.review.md',
      '--evidence', 'B passed', '--reviewer-agent-id', 'reviewer-test-2',
    ], alphaEnv);
    const joinReady = runPythonJson<{ rows: Array<{ id: string }> }>(
      root, ['topology', 'ready', '--role', 'executor'], alphaEnv,
    );
    assert(joinReady.rows.map(row => row.id).join(',') === 'C-A001B001--003', 'Join unlocks after both exact dependencies pass');
    runPython(root, ['topology', 'mark-result', '--row', 'C-A001B001--003', '--result', 'success'], alphaEnv);
    fs.writeFileSync(path.join(alphaDir, '.task', 'C-A001B001--003.review.md'), '# Review\n\nPASS\n', 'utf8');
    runPython(root, [
      'evidence', 'submit', '--task', alpha.taskId, '--row', 'C-A001B001--003', '--verdict', 'pass',
      '--tests-run', '1', '--tests-failed', '0', '--report', '.task/C-A001B001--003.review.md',
      '--evidence', 'C passed', '--reviewer-agent-id', 'reviewer-test-3',
    ], alphaEnv);
    const finishingTask = JSON.parse(fs.readFileSync(path.join(alphaDir, 'task.json'), 'utf8')) as { phase: string };
    assert(finishingTask.phase === 'finish', 'Last PASS evidence enters finish phase');
    runPython(root, ['task', 'finish'], alphaEnv);
    const archived = runPythonJson<{ archivedTo: string }>(root, ['task', 'archive'], alphaEnv);
    assert(fs.existsSync(archived.archivedTo), 'Completed task moves to monthly archive');

    console.log('--- Test 8b: finish tolerates superseded and cancelled rows ---');
    const gammaEnv = { CODEX_THREAD_ID: 'gamma-thread' };
    const gamma = runPythonJson<{ taskId: string }>(
      root, ['task', 'create', 'Gamma Task', '--slug', 'gamma'], gammaEnv,
    );
    const gammaDir = path.join(root, '.omp-flow', 'tasks', gamma.taskId);
    fs.writeFileSync(
      path.join(gammaDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,superseded,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,cancelled,task,.task/B-001.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );
    const gammaFinished = runPythonJson<{ status: string; phase: string }>(root, ['task', 'finish'], gammaEnv);
    assert(
      gammaFinished.status === 'completed' && gammaFinished.phase === 'completed',
      'Finish accepts a topology whose rows are superseded or cancelled without evidence',
    );
    // Finish is only legal once every row is either retired (superseded/cancelled) or has a valid
    // PASS verdict (completed); a still-pending row must block finish.
    fs.writeFileSync(
      path.join(gammaDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,superseded,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );
    expectPythonFailure(root, ['task', 'finish'], 'All topology rows must be completed', gammaEnv);

    console.log('--- Test 8m: task finish cross-checks PASS verdict and frozen evidence ---');
    const finishEnv = { CODEX_THREAD_ID: 'finish-thread' };
    const finishTask = driveToExecuting(
      root, finishEnv, 'Finish Evidence', 'finish-evidence',
      ['A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md'],
      { 'A-001': '# A brief\n' },
    );
    // Completed row without a verdict file fails finish.
    runPython(root, ['topology', 'mark-result', '--row', 'A-001', '--result', 'success'], finishEnv);
    let finishCsv = readCsv(root, finishTask.taskId);
    finishCsv = finishCsv.replace(',review,', ',completed,');
    fs.writeFileSync(path.join(finishTask.dir, 'tasks.csv'), finishCsv, 'utf8');
    expectPythonFailure(root, ['task', 'finish'], 'Row A-001 is completed but has no current PASS evidence', finishEnv);
    // Non-pass (uppercase) verdict fails closed.
    fs.writeFileSync(
      path.join(finishTask.dir, '.task', 'A-001.verdict.json'),
      JSON.stringify({ verdict: 'PASS', tests_run: '1', tests_failed: '0' }),
      'utf8',
    );
    expectPythonFailure(root, ['task', 'finish'], 'Row A-001 is completed but has no current PASS evidence', finishEnv);
    // Malformed (non-object) verdict JSON fails closed without AttributeError.
    fs.writeFileSync(
      path.join(finishTask.dir, '.task', 'A-001.verdict.json'),
      JSON.stringify(['not', 'a', 'dict']),
      'utf8',
    );
    expectPythonFailure(root, ['task', 'finish'], 'Expected JSON object in', finishEnv);
    // Object verdict JSON missing the required key also fails closed.
    fs.writeFileSync(
      path.join(finishTask.dir, '.task', 'A-001.verdict.json'),
      JSON.stringify({ tests_run: '1', tests_failed: '0' }),
      'utf8',
    );
    expectPythonFailure(root, ['task', 'finish'], 'Row A-001 is completed but has no current PASS evidence', finishEnv);
    // Valid pass verdict but stale frozen evidence fails closed.
    fs.writeFileSync(
      path.join(finishTask.dir, '.task', 'A-001.verdict.json'),
      JSON.stringify({ verdict: 'pass', tests_run: '1', tests_failed: '0' }),
      'utf8',
    );
    const finishFrozenBrief = fs.readFileSync(path.join(finishTask.dir, '.task', 'A-001.implement.md'), 'utf8');
    fs.writeFileSync(path.join(finishTask.dir, '.task', 'A-001.implement.md'), finishFrozenBrief + '\nPost-completion edit.\n', 'utf8');
    expectPythonFailure(root, ['task', 'finish'], 'qbd2 approved evidence is stale for row A-001', finishEnv);
    fs.writeFileSync(path.join(finishTask.dir, '.task', 'A-001.implement.md'), finishFrozenBrief, 'utf8');
    // All completed rows with valid PASS verdict and unchanged frozen evidence succeed.
    const finished = runPythonJson<{ status: string; phase: string }>(root, ['task', 'finish'], finishEnv);
    assert(finished.status === 'completed' && finished.phase === 'completed', 'Finish succeeds when completed rows have valid PASS verdicts and frozen evidence');

    console.log('--- Test 8c: amendment / ECO change-order flow ---');
    const deltaEnv = { CODEX_THREAD_ID: 'delta-thread' };
    const delta = runPythonJson<{ taskId: string }>(
      root, ['task', 'create', 'Delta Task', '--slug', 'delta'], deltaEnv,
    );
    const deltaDir = path.join(root, '.omp-flow', 'tasks', delta.taskId);
    fs.writeFileSync(
      path.join(deltaDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(deltaDir, '.task', 'A-001.implement.md'), '# A brief\n', 'utf8');
    fs.writeFileSync(path.join(deltaDir, '.task', 'B-001.implement.md'), '# B brief\n', 'utf8');
    fs.writeFileSync(path.join(deltaDir, 'research', '90-synthesis-001-delta.md'), '# Synthesis\n\nEvidence.\n', 'utf8');
    runPython(root, ['workflow', 'select-synthesis', '--path', 'research/90-synthesis-001-delta.md'], deltaEnv);
    fs.writeFileSync(path.join(deltaDir, 'prd.md'), '# PRD\n\n## Goal\n\nDelta.\n', 'utf8');
    fs.writeFileSync(path.join(deltaDir, 'design.md'), '# Design\n\n## Architecture\n\nDelta core.\n', 'utf8');
    const dq1 = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['gate', 'prepare', 'qbd1'], deltaEnv);
    fs.writeFileSync(
      path.join(deltaDir, dq1.report),
      ['---', 'gate: qbd1', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + dq1.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', 'qbd1'], deltaEnv);
    runPython(root, ['gate', 'decide', 'qbd1', '--decision', 'pass', '--note', 'ok'], deltaEnv);
    const dq2 = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['gate', 'prepare', 'qbd2'], deltaEnv);
    fs.writeFileSync(
      path.join(deltaDir, dq2.report),
      ['---', 'gate: qbd2', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + dq2.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', 'qbd2'], deltaEnv);
    runPython(root, ['gate', 'decide', 'qbd2', '--decision', 'pass', '--note', 'ok'], deltaEnv);
    runPython(root, ['task', 'start'], deltaEnv);
    // Take A-001 all the way through to completed evidence so the amendment runs against real completed work.
    runPython(root, ['topology', 'mark-result', '--row', 'A-001', '--result', 'success'], deltaEnv);
    fs.writeFileSync(path.join(deltaDir, '.task', 'A-001.review.md'), '# Review\n\nPASS\n', 'utf8');
    runPython(root, [
      'evidence', 'submit', '--row', 'A-001', '--verdict', 'pass', '--tests-run', '1', '--tests-failed', '0',
      '--report', '.task/A-001.review.md', '--evidence', 'A passed', '--reviewer-agent-id', 'rev-d1',
    ], deltaEnv);
    assert(readCsv(root, delta.taskId).includes('A-001,1,P0,Root,src/a.ts,implement,,,completed'), 'Delta A-001 completes');
    const evidenceBefore = fs.readFileSync(path.join(deltaDir, 'evidence.csv'), 'utf8');
    const verdictBefore = fs.readFileSync(path.join(deltaDir, '.task', 'A-001.verdict.json'), 'utf8');

    // Propose an amendment; only one open amendment is allowed at a time.
    const proposed = runPythonJson<{ id: string; status: string; proposal: string }>(
      root, ['topology', 'amend', 'propose', '--reason', 'Add D-001 and edit A-001 brief'], deltaEnv,
    );
    assert(proposed.id === 'amend-001' && proposed.status === 'open', 'First amendment is amend-001/open');
    expectPythonFailure(
      root, ['topology', 'amend', 'propose', '--reason', 'second'], 'open amendment already exists', deltaEnv,
    );
    // Fill the proposal (strip the uncommitted-template marker) so prepare accepts it.
    fs.writeFileSync(
      path.join(deltaDir, proposed.proposal),
      ['---', 'amendment: amend-001', 'gate: qbd2-delta', '---', '', '# Amendment Proposal',
        '', '## Change Set', '', 'Add D-001; edit A-001 brief.', '', '## Impact Statement', '',
        'A-001 is completed; editing its brief will make it non-current and the currency closure will downgrade it to needs_fix.', ''].join('\n'),
      'utf8',
    );
    // The new row's brief must exist on disk; the edited row's brief is mutated in place.
    fs.writeFileSync(path.join(deltaDir, '.task', 'D-001.implement.md'), '# D brief\n', 'utf8');
    fs.writeFileSync(path.join(deltaDir, '.task', 'A-001.implement.md'), '# A brief\n\nRefined scope after amendment.\n', 'utf8');
    const changeSet = JSON.stringify([
      { op: 'add-row', id: 'D-001', wave: 1, priority: 'P1', title: 'New', scope: 'src/d.ts', action: 'implement', modelSlot: 'task' },
      { op: 'edit-brief', id: 'A-001' },
    ]);
    runPython(root, ['topology', 'amend', 'set-change', '--change', changeSet], deltaEnv);
    // edit-brief on a completed row is accepted at set-change; currency closure handles it at decide.
    const preparedAmend = runPythonJson<{ report: string; evidenceDigest: string }>(
      root, ['topology', 'amend', 'prepare'], deltaEnv,
    );
    assert(preparedAmend.report === 'qbd/qbd-2/amend-001/audit-001.md', 'Delta audit report is under the amendment dir');
    fs.writeFileSync(
      path.join(deltaDir, preparedAmend.report),
      ['---', 'gate: qbd2-delta', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + preparedAmend.evidenceDigest, '---', '', '# Delta Audit', ''].join('\n'),
      'utf8',
    );
    const inspectedAmend = runPythonJson<{ status: string; verdict: string }>(root, ['topology', 'amend', 'inspect'], deltaEnv);
    assert(inspectedAmend.status === 'awaiting_human' && inspectedAmend.verdict === 'PASS', 'Delta PASS awaits a human decision');
    const applied = runPythonJson<{ status: string; applied: Array<{ op: string; id: string }> }>(
      root, ['topology', 'amend', 'decide', '--decision', 'pass', '--note', 'approve delta'], deltaEnv,
    );
    assert(applied.status === 'approved', 'Amendment closes as approved');
    assert(applied.applied.some(item => item.op === 'add-row' && item.id === 'D-001'), 'Apply summary reports the add-row');
    assert(
      applied.applied.some(item => item.op === 'downgrade' && item.id === 'A-001'),
      'Currency closure downgrades the edited completed row',
    );

    const deltaCsv = readCsv(root, delta.taskId);
    assert(
      deltaCsv.includes('D-001,1,P1,New,src/d.ts,implement,,,pending,task,.task/D-001.implement.md'),
      'New row is appended to tasks.csv as pending',
    );
    assert(
      deltaCsv.includes('A-001,1,P0,Root,src/a.ts,implement,,,needs_fix'),
      'Completed-row edit-brief is downgraded to needs_fix by currency closure',
    );
    const amendReady = runPythonJson<{ rows: Array<{ id: string }> }>(root, ['topology', 'ready', '--role', 'executor'], deltaEnv);
    const readyIds = amendReady.rows.map(row => row.id);
    assert(readyIds.includes('D-001'), 'Newly added row is ready/executable (per-row digest refreshed)');
    assert(readyIds.includes('B-001'), 'Pending row stays ready while the edited completed row is downgraded');
    assert(readyIds.includes('A-001'), 'Downgraded completed row is now ready for rework');
    const dContext = runPython(root, ['context', '--role', 'executor', '--row', 'D-001'], deltaEnv, 'Implement D.');
    assert(dContext.includes('# D brief'), 'New row context resolves end-to-end with the refreshed digest');
    // The amendment changed A-001's status via closure, but its independent evidence files are untouched.
    assert(fs.readFileSync(path.join(deltaDir, 'evidence.csv'), 'utf8') === evidenceBefore, 'Completed row evidence.csv is untouched');
    assert(fs.readFileSync(path.join(deltaDir, '.task', 'A-001.verdict.json'), 'utf8') === verdictBefore, 'Completed row verdict JSON is untouched');

    // Reject path: a fully prepared+inspected amendment that is rejected changes nothing.
    const csvAfterApprove = readCsv(root, delta.taskId);
    const reject = runPythonJson<{ id: string; proposal: string }>(
      root, ['topology', 'amend', 'propose', '--reason', 'try supersede B'], deltaEnv,
    );
    assert(reject.id === 'amend-002', 'A second amendment is allocated only after the first closes');
    fs.writeFileSync(
      path.join(deltaDir, reject.proposal),
      ['---', 'amendment: amend-002', 'gate: qbd2-delta', '---', '', '# Proposal', '', '## Change Set', '',
        'Supersede B-001.', '', '## Impact Statement', '', 'B-001 not started.', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['topology', 'amend', 'set-change', '--change', JSON.stringify([{ op: 'supersede', id: 'B-001' }])], deltaEnv);
    const rejPrep = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['topology', 'amend', 'prepare'], deltaEnv);
    fs.writeFileSync(
      path.join(deltaDir, rejPrep.report),
      ['---', 'gate: qbd2-delta', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + rejPrep.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['topology', 'amend', 'inspect'], deltaEnv);
    const rejected = runPythonJson<{ status: string; applied: unknown[] }>(
      root, ['topology', 'amend', 'decide', '--decision', 'reject', '--note', 'not now'], deltaEnv,
    );
    assert(rejected.status === 'rejected' && rejected.applied.length === 0, 'Reject applies no changes');
    assert(readCsv(root, delta.taskId) === csvAfterApprove, 'Reject leaves the topology byte-for-byte unchanged');

    console.log('--- Test 8d: uncommitted-template brief is rejected before it can half-apply ---');
    // Atomicity invariant after the approved amendment: a row is in tasks.csv IFF gates.qbd2.rows
    // carries its frozen digest. This is exactly the mutual consistency a half-apply would break.
    const deltaState = JSON.parse(fs.readFileSync(path.join(deltaDir, 'task.json'), 'utf8')) as {
      gates: { qbd2: { rows: Record<string, string> } };
    };
    const deltaRowIds = readCsv(root, delta.taskId).trim().split(/\r?\n/).slice(1)
      .filter(Boolean).map(line => line.split(',')[0]);
    for (const rowId of deltaRowIds) {
      assert(typeof deltaState.gates.qbd2.rows[rowId] === 'string', `tasks.csv row ${rowId} has a frozen digest in task.json`);
    }
    assert(typeof deltaState.gates.qbd2.rows['D-001'] === 'string', 'Approved add-row D-001: tasks.csv and task.json agree');
    // An add-row whose new brief still carries the uncommitted-template marker must be rejected at
    // set-change, so it can never reach decide and commit tasks.csv while the digest recompute raises.
    const marked = runPythonJson<{ id: string; proposal: string }>(
      root, ['topology', 'amend', 'propose', '--reason', 'add E-001 with an unfinished brief'], deltaEnv,
    );
    fs.writeFileSync(
      path.join(deltaDir, marked.proposal),
      ['---', 'amendment: ' + marked.id, 'gate: qbd2-delta', '---', '', '# Proposal', '', '## Change Set', '',
        'Add E-001.', '', '## Impact Statement', '', 'None.', ''].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(deltaDir, '.task', 'E-001.implement.md'),
      '# E brief\n\n<!-- Uncommitted template. Fill me in. -->\n',
      'utf8',
    );
    const markedChange = JSON.stringify([
      { op: 'add-row', id: 'E-001', wave: 1, priority: 'P1', title: 'E', scope: 'src/e.ts', action: 'implement', modelSlot: 'task' },
    ]);
    expectPythonFailure(root, ['topology', 'amend', 'set-change', '--change', markedChange], 'uncommitted template', deltaEnv);
    // The rejected change set never mutated the topology: E-001 is absent from BOTH files.
    assert(!readCsv(root, delta.taskId).includes('E-001'), 'Marked-brief add-row never reached tasks.csv');
    const afterMarked = JSON.parse(fs.readFileSync(path.join(deltaDir, 'task.json'), 'utf8')) as {
      gates: { qbd2: { rows: Record<string, string> } };
    };
    assert(afterMarked.gates.qbd2.rows['E-001'] === undefined, 'Marked-brief add-row left no frozen digest');

    console.log('--- Test 8e: gate reset escape hatch (M4) ---');
    // gate reset is the only legitimate exit from a qbd1 stale / needs_revision / attempt>=3
    // deadlock without hand-editing task.json (which the system forbids).
    const resetEnv = { CODEX_THREAD_ID: 'reset-thread' };
    const resetTask = runPythonJson<{ taskId: string }>(root, ['task', 'create', 'Reset Task', '--slug', 'reset'], resetEnv);
    const resetDir = path.join(root, '.omp-flow', 'tasks', resetTask.taskId);
    fs.writeFileSync(path.join(resetDir, 'research', '90-synthesis-001-reset.md'), '# Synthesis\n\nEvidence.\n', 'utf8');
    runPython(root, ['workflow', 'select-synthesis', '--path', 'research/90-synthesis-001-reset.md'], resetEnv);
    fs.writeFileSync(path.join(resetDir, 'prd.md'), '# PRD\n\n## Goal\n\nReset.\n', 'utf8');
    fs.writeFileSync(path.join(resetDir, 'design.md'), '# Design\n\n## Architecture\n\nReset core.\n', 'utf8');
    const rq1 = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['gate', 'prepare', 'qbd1'], resetEnv);
    // A model FAIL verdict lands qbd1 in needs_revision (a stuck, hand-edit-only state pre-M4).
    fs.writeFileSync(
      path.join(resetDir, rq1.report),
      ['---', 'gate: qbd1', 'verdict: FAIL', 'risk: high', 'evidenceDigest: ' + rq1.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    const rq1Inspected = runPythonJson<{ status: string }>(root, ['gate', 'inspect', 'qbd1'], resetEnv);
    assert(rq1Inspected.status === 'needs_revision', 'qbd1 FAIL audit lands in needs_revision');
    expectPythonFailure(root, ['gate', 'reset', 'qbd1', '--reason', '   '], 'non-empty', resetEnv);
    const gateReset = runPythonJson<{ resetRecord: string; status: string; attempt: number; phase: string }>(
      root, ['gate', 'reset', 'qbd1', '--reason', 'Auditor deadlocked; restart qbd1 cleanly'], resetEnv,
    );
    assert(
      gateReset.status === 'not_started' && gateReset.attempt === 0 && gateReset.phase === 'design',
      'Gate reset returns qbd1 to a clean pre-prepare state at phase=design',
    );
    assert(fs.existsSync(path.join(resetDir, gateReset.resetRecord)), 'Gate reset writes a reset-NNN record');
    const resetRecordBody = fs.readFileSync(path.join(resetDir, gateReset.resetRecord), 'utf8');
    assert(resetRecordBody.includes('priorStatus: needs_revision') && resetRecordBody.includes('Auditor deadlocked'), 'Reset record captures prior status and reason');
    // A fresh prepare now works -- the whole point of the escape hatch.
    const rq1b = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['gate', 'prepare', 'qbd1'], resetEnv);
    // Post-reset prepare must reserve a MONOTONIC-GLOBAL slot (audit-002.md), never re-reserving
    // audit-001.md which already holds the pre-reset FAIL report (the M4 collision defect).
    assert(rq1b.report === 'qbd/qbd-1/audit-002.md', 'A fresh qbd1 prepare after reset reserves the next non-colliding audit slot');
    // Append-only: the pre-reset audit-001.md survives untouched with its original verdict: FAIL.
    assert(rq1.report === 'qbd/qbd-1/audit-001.md', 'Pre-reset report was the first audit slot');
    assert(fs.existsSync(path.join(resetDir, rq1.report)), 'Pre-reset audit-001.md survives the post-reset prepare');
    assert(
      fs.readFileSync(path.join(resetDir, rq1.report), 'utf8').includes('verdict: FAIL'),
      'Pre-reset audit-001.md keeps its original verdict: FAIL frontmatter (append-only, not displaced)',
    );
    // Drive qbd1 to approved, then confirm resetting an APPROVED gate is rejected.
    fs.writeFileSync(
      path.join(resetDir, rq1b.report),
      ['---', 'gate: qbd1', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + rq1b.evidenceDigest, '---', '', '# Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['gate', 'inspect', 'qbd1'], resetEnv);
    runPython(root, ['gate', 'decide', 'qbd1', '--decision', 'pass', '--note', 'ok'], resetEnv);
    expectPythonFailure(root, ['gate', 'reset', 'qbd1', '--reason', 'must not unfreeze'], 'is approved', resetEnv);

    console.log('--- Test 8f: cumulative amendment cap forces a full QbD 2 re-audit (M4) ---');
    // The cap is exercised against hand-built amendment history (realistic record shape) so the
    // threshold is reached deterministically without running dozens of full amendment cycles.
    const capEnv = { CODEX_THREAD_ID: 'cap-thread' };
    const capTask = runPythonJson<{ taskId: string }>(root, ['task', 'create', 'Cap Task', '--slug', 'cap'], capEnv);
    const capDir = path.join(root, '.omp-flow', 'tasks', capTask.taskId);
    const capJsonPath = path.join(capDir, 'task.json');
    fs.writeFileSync(
      path.join(capDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md',
        'C-001,1,P0,Third,src/c.ts,implement,,,pending,task,.task/C-001.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );
    const capJson = JSON.parse(fs.readFileSync(capJsonPath, 'utf8')) as Record<string, any>;
    capJson.status = 'in_progress';
    capJson.phase = 'execute';
    capJson.topologyFrozen = true;
    capJson.gates = {
      qbd2: {
        status: 'approved', attempt: 1, evidenceDigest: 'sha256:x', evidencePaths: [], designDigest: 'sha256:d',
        rows: { 'A-001': 'sha256:a', 'B-001': 'sha256:b', 'C-001': 'sha256:c' },
      },
    };
    // Path (a): more than 3 approved amendments.
    capJson.amendments = [
      { id: 'amend-001', status: 'approved', changeSet: [] },
      { id: 'amend-002', status: 'approved', changeSet: [] },
      { id: 'amend-003', status: 'approved', changeSet: [] },
      { id: 'amend-004', status: 'approved', changeSet: [] },
    ];
    fs.writeFileSync(capJsonPath, JSON.stringify(capJson, null, 2), 'utf8');
    expectPythonFailure(root, ['topology', 'amend', 'propose', '--reason', 'one more'], 'Amendment cap reached', capEnv);
    expectPythonFailure(root, ['topology', 'amend', 'propose', '--reason', 'one more'], 'Completed rows are not an obstacle', capEnv);
    // Path (b): below the approved-count cap, but retired-or-edited rows exceed one third.
    fs.writeFileSync(
      path.join(capDir, 'tasks.csv'),
      [
        'id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd',
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,superseded,task,.task/B-001.implement.md',
        '',
      ].join('\n'),
      'utf8',
    );
    capJson.amendments = [{ id: 'amend-001', status: 'approved', changeSet: [{ op: 'supersede', id: 'B-001' }] }];
    capJson.gates.qbd2.rows = { 'A-001': 'sha256:a', 'B-001': 'sha256:b' };
    fs.writeFileSync(capJsonPath, JSON.stringify(capJson, null, 2), 'utf8');
    expectPythonFailure(root, ['topology', 'amend', 'propose', '--reason', 'too much drift'], 'exceed one third', capEnv);

    console.log('--- Test 8g: design-level amendment downgrades uncovered completed rows (M4) ---');
    const epsEnv = { CODEX_THREAD_ID: 'epsilon-thread' };
    const eps = driveToExecuting(
      root, epsEnv, 'Epsilon', 'epsilon',
      [
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md',
        'C-A001B001--003,2,P0,Join,src/c.ts,implement,,,pending,task,.task/C-A001B001--003.implement.md',
      ],
      { 'A-001': '# A brief\n', 'B-001': '# B brief\n', 'C-A001B001--003': '# Join brief\n' },
    );
    // Complete A-001 and B-001; the join row stays pending so the task stays in execute phase.
    completeRow(root, eps.dir, epsEnv, 'A-001', 'rev-e1');
    completeRow(root, eps.dir, epsEnv, 'B-001', 'rev-e2');
    assert(readCsv(root, eps.taskId).includes('A-001,1,P0,Root,src/a.ts,implement,,,completed'), 'Epsilon A-001 completes');
    assert(readCsv(root, eps.taskId).includes('B-001,1,P0,Peer,src/b.ts,implement,,,completed'), 'Epsilon B-001 completes');
    const epsEvidenceBefore = fs.readFileSync(path.join(eps.dir, 'evidence.csv'), 'utf8');
    // A design edit on disk: prd/design changed. Impact Statement keeps A-001 valid but not B-001.
    fs.writeFileSync(path.join(eps.dir, 'design.md'), '# Design\n\n## Architecture\n\nEpsilon core, revised.\n', 'utf8');
    const epsProposed = runPythonJson<{ id: string; proposal: string }>(
      root, ['topology', 'amend', 'propose', '--reason', 'Design revision; A stays valid, B must be redone'], epsEnv,
    );
    fs.writeFileSync(
      path.join(eps.dir, epsProposed.proposal),
      ['---', 'amendment: ' + epsProposed.id, 'gate: qbd2-delta', '---', '', '# Proposal', '', '## Change Set', '',
        'Edit design.', '', '## Impact Statement', '', 'A-001 unaffected by the design change.', '',
        'valid-completed: A-001', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['topology', 'amend', 'set-change', '--change', JSON.stringify([{ op: 'edit-design' }])], epsEnv);
    const epsPrepared = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['topology', 'amend', 'prepare'], epsEnv);
    fs.writeFileSync(
      path.join(eps.dir, epsPrepared.report),
      ['---', 'gate: qbd2-delta', 'verdict: PASS', 'risk: low', 'evidenceDigest: ' + epsPrepared.evidenceDigest, '---', '', '# Delta Audit', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['topology', 'amend', 'inspect'], epsEnv);
    const epsApplied = runPythonJson<{ status: string; applied: Array<{ op: string; id?: string }> }>(
      root, ['topology', 'amend', 'decide', '--decision', 'pass', '--note', 'approve design change'], epsEnv,
    );
    assert(epsApplied.status === 'approved', 'Design amendment closes as approved');
    assert(epsApplied.applied.some(item => item.op === 'downgrade' && item.id === 'B-001'), 'Uncovered completed row B-001 is downgraded');
    const epsCsv = readCsv(root, eps.taskId);
    assert(epsCsv.includes('A-001,1,P0,Root,src/a.ts,implement,,,completed'), 'Listed completed row A-001 stays completed');
    assert(epsCsv.includes('B-001,1,P0,Peer,src/b.ts,implement,,,needs_fix'), 'Unlisted completed row B-001 is downgraded to needs_fix');
    assert(fs.readFileSync(path.join(eps.dir, 'evidence.csv'), 'utf8') === epsEvidenceBefore, 'Downgraded row evidence.csv is preserved (append-only history)');
    // B-001 re-enters the execute loop as a ready candidate.
    const epsReady = runPythonJson<{ rows: Array<{ id: string }> }>(root, ['topology', 'ready', '--role', 'executor'], epsEnv);
    assert(epsReady.rows.some(row => row.id === 'B-001'), 'Downgraded row re-enters the ready set for re-implementation');
    // edit-design without a valid-completed declaration must fail closed at prepare.
    const epsBad = runPythonJson<{ id: string; proposal: string }>(
      root, ['topology', 'amend', 'propose', '--reason', 'another design edit, no declaration'], epsEnv,
    );
    fs.writeFileSync(
      path.join(eps.dir, epsBad.proposal),
      ['---', 'amendment: ' + epsBad.id, 'gate: qbd2-delta', '---', '', '# Proposal', '', '## Change Set', '',
        'Edit design again.', '', '## Impact Statement', '', 'Forgot to declare valid-completed rows.', ''].join('\n'),
      'utf8',
    );
    runPython(root, ['topology', 'amend', 'set-change', '--change', JSON.stringify([{ op: 'edit-design' }])], epsEnv);
    expectPythonFailure(root, ['topology', 'amend', 'prepare'], 'valid-completed', epsEnv);

    console.log('--- Test 8h: Claude hook control-plane API (Row C) ---');
    // The Row-D Claude wrappers always export OMP_FLOW_CONTEXT_ID=<raw session_id>; the raw id is
    // also echoed as the payload session_id (validated for presence, never trusted for identity).
    const claudeEnv = { OMP_FLOW_CONTEXT_ID: 'claude-session-1' };
    const claudeSid = 'claude-session-1';
    const claude = driveToExecuting(
      root, claudeEnv, 'Claude Task', 'claude',
      [
        'A-001,1,P0,Root,src/a.ts,implement,,,pending,task,.task/A-001.implement.md',
        'B-001,1,P0,Peer,src/b.ts,implement,,,pending,task,.task/B-001.implement.md',
      ],
      { 'A-001': '# A brief\n', 'B-001': '# B brief\n' },
    );

    // (1) Session workflow-state injection: marker + resolved phase, event echoed back.
    for (const event of ['SessionStart', 'UserPromptSubmit'] as const) {
      const wf = runPythonJson<{ hookSpecificOutput: { hookEventName: string; additionalContext: string } }>(
        root, ['hook', 'claude-workflow-state'], claudeEnv,
        JSON.stringify({ session_id: claudeSid, event }),
      );
      assert(wf.hookSpecificOutput.hookEventName === event, `claude-workflow-state echoes ${event}`);
      assert(wf.hookSpecificOutput.additionalContext.startsWith('<!-- omp-flow-workflow-state -->'), 'claude workflow state carries the ASCII marker');
      assert(wf.hookSpecificOutput.additionalContext.includes('Phase: execute'), 'claude workflow state resolves the session task phase');
    }
    // Every recognized payload requires a non-empty session_id (no env-only identity bridge).
    expectPythonFailure(root, ['hook', 'claude-workflow-state'], 'non-empty string session_id', claudeEnv, JSON.stringify({ event: 'SessionStart' }));
    expectPythonFailure(root, ['hook', 'claude-workflow-state'], 'Unsupported Claude workflow-state event', claudeEnv, JSON.stringify({ session_id: claudeSid, event: 'PreToolUse' }));

    // (2) Typed dispatch-context: valid executor descriptor flows through build_context.
    const dispatch = runPythonJson<{ role: string; taskId: string; rowId: string; prompt: string }>(
      root, ['hook', 'claude-dispatch-context'], claudeEnv,
      JSON.stringify({ session_id: claudeSid, assignment: 'Implement the root row.', descriptor: { ompFlowDispatch: { version: 1, role: 'executor', taskId: claude.taskId, rowId: 'A-001' } } }),
    );
    assert(dispatch.role === 'executor' && dispatch.rowId === 'A-001', 'Dispatch resolves the executor descriptor');
    assert(dispatch.prompt.includes('A-001') && dispatch.prompt.includes('# A brief') && dispatch.prompt.includes('Implement the root row.'), 'Executor prompt carries the exact row brief and original assignment');
    // Unknown / out-of-scope role, unknown key, wrong version all deny (schema-drift guards).
    expectPythonFailure(root, ['hook', 'claude-dispatch-context'], 'Unsupported dispatch role', claudeEnv, JSON.stringify({ session_id: claudeSid, descriptor: { ompFlowDispatch: { version: 1, role: 'qbd-auditor', taskId: claude.taskId } } }));
    expectPythonFailure(root, ['hook', 'claude-dispatch-context'], 'Unsupported dispatch role', claudeEnv, JSON.stringify({ session_id: claudeSid, descriptor: { ompFlowDispatch: { version: 1, role: 'omp-flow-implement', taskId: claude.taskId, rowId: 'A-001' } } }));
    expectPythonFailure(root, ['hook', 'claude-dispatch-context'], 'Unknown descriptor keys', claudeEnv, JSON.stringify({ session_id: claudeSid, descriptor: { ompFlowDispatch: { version: 1, role: 'executor', taskId: claude.taskId, rowId: 'A-001', extra: 'x' } } }));
    expectPythonFailure(root, ['hook', 'claude-dispatch-context'], 'version must be exactly 1', claudeEnv, JSON.stringify({ session_id: claudeSid, descriptor: { ompFlowDispatch: { version: 2, role: 'executor', taskId: claude.taskId, rowId: 'A-001' } } }));
    // Active-task mismatch denies (no global fallback to "the only task").
    expectPythonFailure(root, ['hook', 'claude-dispatch-context'], "does not match the session's active task", claudeEnv, JSON.stringify({ session_id: claudeSid, descriptor: { ompFlowDispatch: { version: 1, role: 'executor', taskId: 'some-other-task', rowId: 'A-001' } } }));
    // (C-4) Executor context flows through the CURRENT per-row verify_row_frozen: a drifted design denies.
    const claudeDesign = path.join(claude.dir, 'design.md');
    const claudeDesignBody = fs.readFileSync(claudeDesign, 'utf8');
    fs.writeFileSync(claudeDesign, claudeDesignBody + '\nUnfrozen drift.\n', 'utf8');
    expectPythonFailure(root, ['hook', 'claude-dispatch-context'], 'stale', claudeEnv, JSON.stringify({ session_id: claudeSid, descriptor: { ompFlowDispatch: { version: 1, role: 'executor', taskId: claude.taskId, rowId: 'A-001' } } }));
    fs.writeFileSync(claudeDesign, claudeDesignBody, 'utf8');
    const dispatchAgain = runPythonJson<{ prompt: string }>(
      root, ['hook', 'claude-dispatch-context'], claudeEnv,
      JSON.stringify({ session_id: claudeSid, assignment: 'redo', descriptor: { ompFlowDispatch: { version: 1, role: 'executor', taskId: claude.taskId, rowId: 'A-001' } } }),
    );
    assert(dispatchAgain.prompt.includes('# A brief'), 'Dispatch context resolves again once the frozen digest is restored');

    // (3) QbD prepared-gate validation: a fresh task with a PREPARED (not yet approved) qbd1 gate.
    const qbdEnv = { OMP_FLOW_CONTEXT_ID: 'claude-qbd-session' };
    const qbdSid = 'claude-qbd-session';
    const qbdTask = runPythonJson<{ taskId: string }>(root, ['task', 'create', 'Claude QbD', '--slug', 'claude-qbd'], qbdEnv);
    const qbdDir = path.join(root, '.omp-flow', 'tasks', qbdTask.taskId);
    fs.writeFileSync(path.join(qbdDir, 'research', '90-synthesis-001-claude-qbd.md'), '# Synthesis\n\nEvidence.\n', 'utf8');
    runPython(root, ['workflow', 'select-synthesis', '--path', 'research/90-synthesis-001-claude-qbd.md'], qbdEnv);
    fs.writeFileSync(path.join(qbdDir, 'prd.md'), '# PRD\n\n## Goal\n\nClaude QbD.\n', 'utf8');
    fs.writeFileSync(path.join(qbdDir, 'design.md'), '# Design\n\n## Architecture\n\nClaude QbD core.\n', 'utf8');
    const prep = runPythonJson<{ report: string; evidenceDigest: string }>(root, ['gate', 'prepare', 'qbd1'], qbdEnv);
    const qbdDescriptor = { version: 1, role: 'qbd-auditor', taskId: qbdTask.taskId, gate: 'qbd1', report: prep.report, evidenceDigest: prep.evidenceDigest };
    const qbdReport = runPythonJson<{ gate: string; report: string; evidenceDigest: string; prompt: string }>(
      root, ['hook', 'claude-qbd-report'], qbdEnv,
      JSON.stringify({ session_id: qbdSid, descriptor: { ompFlowDispatch: qbdDescriptor } }),
    );
    assert(qbdReport.gate === 'qbd1' && qbdReport.report === prep.report && qbdReport.evidenceDigest === prep.evidenceDigest, 'QbD validation returns the current prepared report/digest');
    assert(qbdReport.prompt.includes('Audit qbd1 evidence adversarially') && qbdReport.prompt.includes(prep.evidenceDigest), 'QbD prompt is reconstructed read-only from the prepared evidence');
    // No mutation: the gate stays prepared (inspect would have flipped status).
    const qbdStateAfter = JSON.parse(fs.readFileSync(path.join(qbdDir, 'task.json'), 'utf8')) as { gates: { qbd1: { status: string } } };
    assert(qbdStateAfter.gates.qbd1.status === 'prepared', 'QbD validation does not mutate gate state');
    // A session that has NOT selected the descriptor task is denied (no descriptor-only path).
    const noSelEnv = { OMP_FLOW_CONTEXT_ID: 'claude-unselected' };
    expectPythonFailure(root, ['hook', 'claude-qbd-report'], 'requires the session to have already selected', noSelEnv, JSON.stringify({ session_id: 'claude-unselected', descriptor: { ompFlowDispatch: qbdDescriptor } }));
    // Mismatched descriptor report / digest deny.
    expectPythonFailure(root, ['hook', 'claude-qbd-report'], 'does not match the prepared report', qbdEnv, JSON.stringify({ session_id: qbdSid, descriptor: { ompFlowDispatch: { ...qbdDescriptor, report: 'qbd/qbd-1/audit-999.md' } } }));
    expectPythonFailure(root, ['hook', 'claude-qbd-report'], 'does not match the current prepared digest', qbdEnv, JSON.stringify({ session_id: qbdSid, descriptor: { ompFlowDispatch: { ...qbdDescriptor, evidenceDigest: 'sha256:deadbeef' } } }));
    // A drifted evidence file makes the current digest stale, denying before the descriptor is even compared.
    const qbdDesign = path.join(qbdDir, 'design.md');
    const qbdDesignBody = fs.readFileSync(qbdDesign, 'utf8');
    fs.writeFileSync(qbdDesign, qbdDesignBody + '\nDrifted.\n', 'utf8');
    expectPythonFailure(root, ['hook', 'claude-qbd-report'], 'stale', qbdEnv, JSON.stringify({ session_id: qbdSid, descriptor: { ompFlowDispatch: qbdDescriptor } }));
    fs.writeFileSync(qbdDesign, qbdDesignBody, 'utf8');

    // (4) Protected-write predicate: recomputed each call from session/gate/digest/report/path.
    const correctWritePath = `.omp-flow/tasks/${qbdTask.taskId}/${prep.report}`;
    const writeAllow = runPythonJson<{ decision: string; gate: string; report: string; agentType: string }>(
      root, ['hook', 'claude-protect-write'], qbdEnv,
      JSON.stringify({ session_id: qbdSid, agent_id: 'qbd-native-1', agent_type: 'omp-flow-qbd', path: correctWritePath }),
    );
    assert(writeAllow.decision === 'allow' && writeAllow.gate === 'qbd1' && writeAllow.report === prep.report && writeAllow.agentType === 'omp-flow-qbd', 'Protected write allows the exact prepared QbD report');
    // Wrong path, wrong identity, non-qbd type, and no active task each deny.
    expectPythonFailure(root, ['hook', 'claude-protect-write'], 'is not the current prepared QbD report', qbdEnv, JSON.stringify({ session_id: qbdSid, agent_id: 'x', agent_type: 'omp-flow-qbd', path: `.omp-flow/tasks/${qbdTask.taskId}/qbd/qbd-1/audit-002.md` }));
    expectPythonFailure(root, ['hook', 'claude-protect-write'], 'agent_type omp-flow-qbd', qbdEnv, JSON.stringify({ session_id: qbdSid, agent_id: 'x', agent_type: 'omp-flow-implement', path: correctWritePath }));
    expectPythonFailure(root, ['hook', 'claude-protect-write'], 'non-empty agent_id', qbdEnv, JSON.stringify({ session_id: qbdSid, agent_id: '', agent_type: 'omp-flow-qbd', path: correctWritePath }));
    // The executing Claude task has no prepared QbD gate (both approved) -> not eligible.
    expectPythonFailure(root, ['hook', 'claude-protect-write'], 'No currently prepared QbD gate', claudeEnv, JSON.stringify({ session_id: claudeSid, agent_id: 'x', agent_type: 'omp-flow-qbd', path: `.omp-flow/tasks/${claude.taskId}/qbd/qbd-2/audit-001.md` }));

    console.log('--- Test 8i: Claude Hook wrappers (Row D) ---');
    // Wrappers are exercised exactly as Claude Code invokes them: one UTF-8 JSON
    // payload on stdin, CLAUDE_PROJECT_DIR = confined project root. Fixtures are
    // hand-authored to the documented 2.1.199 contract (see _provenance.json), not
    // captured from a live run. Reuses Test 8h state: `claude` (executing task,
    // both gates approved, session claudeSid) and `qbdTask` (qbd1 PREPARED, selected
    // by session qbdSid) plus its prepared report `prep`.
    const DISPATCH_MARKER = '<!-- omp-flow-claude-dispatch:v1 -->';
    const IDENTITY_MARKER = '<!-- omp-flow-claude-identity:v1 -->';
    const STATE_MARKER = '<!-- omp-flow-workflow-state -->';
    const provenance = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'claude-hooks', '_provenance.json'), 'utf8')) as { capturedFromLiveRun: boolean };
    assert(provenance.capturedFromLiveRun === false, 'Fixtures are honestly labelled as hand-authored, not captured from a live run');

    // (A) session-start.py: SessionStart bootstrap bridges CLAUDE_ENV_FILE + injects state.
    const envFile = path.join(root, 'claude-env-bridge.sh');
    fs.writeFileSync(envFile, '', 'utf8');
    const ss = runWrapper('session-start.py', root, loadFixture('session-start.json', { __SESSION__: claudeSid, __ROOT__: root }), { CLAUDE_ENV_FILE: envFile });
    assert(ss.status === 0, 'session-start success exits 0');
    const ssOut = JSON.parse(ss.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    assert(ssOut.hookSpecificOutput.hookEventName === 'SessionStart', 'session-start echoes the SessionStart event');
    assert(ssOut.hookSpecificOutput.additionalContext.startsWith(STATE_MARKER), 'session-start injects the ASCII workflow-state marker');
    assert(ssOut.hookSpecificOutput.additionalContext.includes('Phase: execute'), 'session-start resolves the session task phase');
    const bridge = fs.readFileSync(envFile, 'utf8');
    assert(bridge.includes('export OMP_FLOW_CONTEXT_ID=claude-session-1'), 'session-start appends the raw session id export to CLAUDE_ENV_FILE');
    assert(bridge.trim().split(/\r?\n/).length === 1, 'session-start appends exactly one export line');
    // A hostile session id is shell-quoted so it cannot break out of the export (no active task needed).
    const injectFile = path.join(root, 'claude-env-inject.sh');
    fs.writeFileSync(injectFile, '', 'utf8');
    const hostileSid = "x'; rm -rf / #";
    const ssInject = runWrapper('session-start.py', root, { hook_event_name: 'SessionStart', source: 'startup', session_id: hostileSid, cwd: root }, { CLAUDE_ENV_FILE: injectFile });
    assert(ssInject.status === 0, 'session-start with a hostile session id still exits 0');
    const injectedBridge = fs.readFileSync(injectFile, 'utf8');
    // shlex.quote wraps in single quotes and encodes embedded single quotes as '"'"'.
    assert(injectedBridge.trim() === `export OMP_FLOW_CONTEXT_ID='x'"'"'; rm -rf / #'`, 'a hostile session id is safely shell-quoted as a single export line');
    // Missing session_id is fatal but serializable -> STOP context, exit 0, no permissive fallback.
    const ssNoSession = runWrapper('session-start.py', root, { hook_event_name: 'SessionStart', source: 'startup', cwd: root }, { CLAUDE_ENV_FILE: envFile });
    assert(ssNoSession.status === 0, 'session-start missing session still exits 0 (non-blockable)');
    const ssNoSessionOut = JSON.parse(ssNoSession.stdout) as { hookSpecificOutput: { additionalContext: string }; systemMessage: string };
    assert(ssNoSessionOut.hookSpecificOutput.additionalContext.includes('STOP'), 'session-start missing session returns a STOP context');
    assert(typeof ssNoSessionOut.systemMessage === 'string' && ssNoSessionOut.systemMessage.length > 0, 'session-start failure carries a systemMessage');
    // Missing CLAUDE_ENV_FILE is a best-effort bridge miss, NOT fatal: the session must still
    // boot and inject workflow-state (the load-bearing output). Some Claude builds never source
    // CLAUDE_ENV_FILE into the Bash tool, so STOPping the whole session over a convenience channel
    // is disproportionate; lifecycle Bash calls then pass identity explicitly.
    const ssNoEnvFile = runWrapper('session-start.py', root, loadFixture('session-start.json', { __SESSION__: claudeSid, __ROOT__: root }), { CLAUDE_ENV_FILE: undefined });
    const ssNoEnvOut = JSON.parse(ssNoEnvFile.stdout) as { hookSpecificOutput: { additionalContext: string } };
    assert(ssNoEnvFile.status === 0, 'session-start without CLAUDE_ENV_FILE still exits 0');
    assert(ssNoEnvOut.hookSpecificOutput.additionalContext.includes('Phase: execute') && !ssNoEnvOut.hookSpecificOutput.additionalContext.includes('STOP'), 'session-start without CLAUDE_ENV_FILE degrades gracefully: workflow-state still injected, no STOP');

    // (B) inject-workflow-state.py: per-turn UserPromptSubmit injection.
    const ups = runWrapper('inject-workflow-state.py', root, loadFixture('user-prompt-submit.json', { __SESSION__: claudeSid, __ROOT__: root }));
    const upsOut = JSON.parse(ups.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    assert(ups.status === 0 && upsOut.hookSpecificOutput.hookEventName === 'UserPromptSubmit', 'workflow-state echoes UserPromptSubmit');
    assert(upsOut.hookSpecificOutput.additionalContext.startsWith(STATE_MARKER) && upsOut.hookSpecificOutput.additionalContext.includes('Phase: execute'), 'workflow-state injects marker + resolved phase');
    const upsNoSession = runWrapper('inject-workflow-state.py', root, { hook_event_name: 'UserPromptSubmit', cwd: root });
    assert(upsNoSession.status === 0 && JSON.parse(upsNoSession.stdout).hookSpecificOutput.additionalContext.includes('STOP'), 'workflow-state without a session fails closed with STOP');

    // (C) inject-agent-context.py: PreToolUse(Agent|Task) fail-closed dispatch boundary.
    const execPrompt = dispatchLine({ version: 1, role: 'executor', taskId: claude.taskId, rowId: 'A-001' }) + '\n实现根行 — implement the root row.';
    const execCtx = runWrapper('inject-agent-context.py', root, loadFixture('pretooluse-agent-executor.json', { __SESSION__: claudeSid, __ROOT__: root, __DISPATCH_PROMPT__: execPrompt }));
    assert(execCtx.status === 0, 'valid executor dispatch exits 0');
    const execOut = JSON.parse(execCtx.stdout) as { hookSpecificOutput: { permissionDecision: string; updatedInput: Record<string, unknown> } };
    assert(execOut.hookSpecificOutput.permissionDecision === 'allow', 'valid executor dispatch is allowed');
    const execUpdated = execOut.hookSpecificOutput.updatedInput;
    assert(String(execUpdated.prompt).startsWith(DISPATCH_MARKER + '\n'), 'dispatch prompt begins with the dispatch marker');
    assert(String(execUpdated.prompt).includes('# A brief') && String(execUpdated.prompt).includes('implement the root row.'), 'dispatch prompt carries the exact row brief and original objective');
    assert(String(execUpdated.prompt).includes('实现根行'), 'UTF-8 objective text round-trips through the wrapper');
    assert(execUpdated.model === 'inherit' && execUpdated.description === 'Implement the assigned row' && execUpdated.subagent_type === 'omp-flow-implement', 'every native tool_input field except prompt is preserved');
    // QbD dispatch: prepared-gate prompt is re-rendered read-only.
    const qbdPrompt = dispatchLine({ version: 1, role: 'qbd-auditor', taskId: qbdTask.taskId, gate: 'qbd1', report: prep.report, evidenceDigest: prep.evidenceDigest }) + '\nAudit as instructed.';
    const qbdCtx = runWrapper('inject-agent-context.py', root, loadFixture('pretooluse-task-qbd.json', { __SESSION__: qbdSid, __ROOT__: root, __DISPATCH_PROMPT__: qbdPrompt }));
    const qbdCtxOut = JSON.parse(qbdCtx.stdout) as { hookSpecificOutput: { permissionDecision: string; updatedInput: Record<string, unknown> } };
    assert(qbdCtx.status === 0 && qbdCtxOut.hookSpecificOutput.permissionDecision === 'allow', 'valid QbD dispatch is allowed');
    assert(String(qbdCtxOut.hookSpecificOutput.updatedInput.prompt).startsWith(DISPATCH_MARKER + '\n') && String(qbdCtxOut.hookSpecificOutput.updatedInput.prompt).includes('Audit qbd1 evidence adversarially'), 'QbD dispatch injects the read-only prepared audit prompt');
    // Deny matrix for the dispatch boundary.
    function agentDeny(toolInput: Record<string, unknown>, session: string = claudeSid): { status: number | null; reason: string; stdout: string } {
      const res = runWrapper('inject-agent-context.py', root, { hook_event_name: 'PreToolUse', session_id: session, cwd: root, tool_name: 'Agent', tool_input: toolInput });
      let reason = '';
      if (res.stdout.trim()) {
        const parsed = JSON.parse(res.stdout) as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } };
        if (parsed.hookSpecificOutput?.permissionDecision === 'deny') reason = parsed.hookSpecificOutput.permissionDecisionReason ?? '';
      }
      return { status: res.status, reason, stdout: res.stdout };
    }
    // Unknown non-reserved native agent: the sole intentional no-op (no output, exit 0).
    const passthrough = runWrapper('inject-agent-context.py', root, { hook_event_name: 'PreToolUse', session_id: claudeSid, cwd: root, tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', prompt: 'do research' } });
    assert(passthrough.status === 0 && passthrough.stdout.trim() === '', 'unknown non-reserved native agent passes through unchanged (no output)');
    // Unknown reserved omp-flow-* name denies.
    const typo = agentDeny({ subagent_type: 'omp-flow-implment', prompt: execPrompt });
    assert(typo.status === 0 && /Unknown reserved omp-flow agent/.test(typo.reason), 'reserved-name typo denies visibly');
    // Descriptor role must equal the agent role map.
    const roleMismatch = agentDeny({ subagent_type: 'omp-flow-implement', prompt: dispatchLine({ version: 1, role: 'researcher', taskId: claude.taskId, rowId: 'A-001' }) + '\nx' });
    assert(/does not match agent/.test(roleMismatch.reason), 'descriptor role mismatch denies');
    // First non-blank prompt line must be a JSON dispatch descriptor.
    const malformed = agentDeny({ subagent_type: 'omp-flow-research', prompt: 'plain text with no descriptor' });
    assert(/JSON dispatch descriptor|ompFlowDispatch object/.test(malformed.reason), 'non-JSON descriptor line denies');
    // A recognized dispatch missing session_id denies (fail-closed).
    const noSessionDispatch = runWrapper('inject-agent-context.py', root, { hook_event_name: 'PreToolUse', cwd: root, tool_name: 'Agent', tool_input: { subagent_type: 'omp-flow-implement', prompt: execPrompt } });
    assert(noSessionDispatch.status === 0 && /non-empty string session_id/.test(JSON.parse(noSessionDispatch.stdout).hookSpecificOutput.permissionDecisionReason), 'recognized dispatch without session_id denies');
    // Active-task mismatch denies (Python; no global fallback).
    const wrongTask = agentDeny({ subagent_type: 'omp-flow-implement', prompt: dispatchLine({ version: 1, role: 'executor', taskId: 'some-other-task', rowId: 'A-001' }) + '\nx' });
    assert(/does not match the session's active task/.test(wrongTask.reason), 'active-task mismatch denies');
    // Malformed stdin is an environment failure before a decision -> exit 2 blocks the spawn.
    const badJson = runWrapper('inject-agent-context.py', root, 'not json at all');
    assert(badJson.status === 2 && badJson.stdout.trim() === '', 'malformed dispatch payload blocks with exit 2 and no JSON');

    // (D) inject-agent-identity.py: SubagentStart identity, one injection per managed type.
    const managedNames = ['omp-flow-research', 'omp-flow-architect', 'omp-flow-qbd', 'omp-flow-implement', 'omp-flow-check'];
    for (const name of managedNames) {
      const payload = name === 'omp-flow-check'
        ? loadFixture('subagent-start-check.json', { __SESSION__: 'sub-sess', __AGENT_ID__: `native-${name}`, __ROOT__: root })
        : { hook_event_name: 'SubagentStart', session_id: 'sub-sess', agent_type: name, agent_id: `native-${name}`, cwd: root };
      const id = runWrapper('inject-agent-identity.py', root, payload);
      assert(id.status === 0, `identity injection for ${name} exits 0`);
      const idOut = JSON.parse(id.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
      assert(Object.keys(idOut).join(',') === 'hookSpecificOutput', `identity for ${name} emits exactly one hookSpecificOutput envelope`);
      const ctx = idOut.hookSpecificOutput.additionalContext;
      assert(ctx.startsWith(IDENTITY_MARKER + '\n'), `identity for ${name} leads with the identity marker`);
      assert((ctx.match(/omp-flow-claude-identity:v1/g) ?? []).length === 1, `exactly one identity marker for ${name}`);
      const identity = JSON.parse(ctx.split('\n')[1]) as { agentId: string; agentType: string };
      assert(identity.agentId === `native-${name}` && identity.agentType === name, `identity for ${name} binds the native agent_id and exact type`);
    }
    // Missing agent_id / wrong type cannot block, but must NOT emit an identity marker (agent stops).
    const idNoAgent = runWrapper('inject-agent-identity.py', root, { hook_event_name: 'SubagentStart', session_id: 'sub-sess', agent_type: 'omp-flow-check' });
    assert(idNoAgent.status === 0 && !idNoAgent.stdout.includes(IDENTITY_MARKER) && idNoAgent.stdout.includes('STOP'), 'missing agent_id injects a STOP context with no identity marker');
    const idBadType = runWrapper('inject-agent-identity.py', root, { hook_event_name: 'SubagentStart', session_id: 'sub-sess', agent_type: 'general-purpose', agent_id: 'x' });
    assert(idBadType.status === 0 && !idBadType.stdout.includes(IDENTITY_MARKER), 'unrecognized agent_type injects no identity marker');

    // (E) protect-python-owned.py: Write/Edit/Bash integrity boundary.
    function protectDecision(payload: Record<string, unknown>): { status: number | null; decision: string; reason: string; stdout: string } {
      const res = runWrapper('protect-python-owned.py', root, payload);
      let decision = '';
      let reason = '';
      if (res.stdout.trim()) {
        const parsed = JSON.parse(res.stdout) as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } };
        decision = parsed.hookSpecificOutput?.permissionDecision ?? '';
        reason = parsed.hookSpecificOutput?.permissionDecisionReason ?? '';
      }
      return { status: res.status, decision, reason, stdout: res.stdout };
    }
    const qbdReportRel = `.omp-flow/tasks/${qbdTask.taskId}/${prep.report}`;
    // QbD prepared-report Write is the sole protected-path exception (recomputed each call).
    const qbdWriteAllow = protectDecision(loadFixture('pretooluse-write-qbd-report.json', { __SESSION__: qbdSid, __AGENT_ID__: 'qbd-native-1', __ROOT__: root, __WRITE_PATH__: qbdReportRel }));
    assert(qbdWriteAllow.status === 0 && qbdWriteAllow.decision === 'allow', 'QbD prepared-report Write is allowed by the read-only predicate');
    // The QbD exception applies to Write, NEVER Edit.
    const editQbd = protectDecision({ tool_name: 'Edit', session_id: qbdSid, cwd: root, agent_id: 'qbd-native-1', agent_type: 'omp-flow-qbd', tool_input: { file_path: qbdReportRel, old_string: 'a', new_string: 'b' } });
    assert(editQbd.decision === 'deny', 'QbD report Edit never qualifies for the Write exception');
    // QbD identity but wrong (protected) path denies via the Python predicate.
    const wrongQbdPath = protectDecision({ tool_name: 'Write', session_id: qbdSid, cwd: root, agent_id: 'qbd-native-1', agent_type: 'omp-flow-qbd', tool_input: { file_path: `.omp-flow/tasks/${qbdTask.taskId}/task.json`, content: 'x' } });
    assert(wrongQbdPath.decision === 'deny', 'QbD identity writing a non-report protected path denies');
    // A protected mutation without QbD identity denies.
    const protectedWrite = protectDecision(loadFixture('pretooluse-write-protected.json', { __SESSION__: claudeSid, __ROOT__: root, __WRITE_PATH__: `.omp-flow/tasks/${claude.taskId}/task.json` }));
    assert(protectedWrite.decision === 'deny' && /Python-owned path/.test(protectedWrite.reason), 'protected task.json Write denies for a non-QbD writer');
    const protectedCsv = protectDecision({ tool_name: 'Write', session_id: claudeSid, cwd: root, tool_input: { file_path: `.omp-flow/tasks/${claude.taskId}/tasks.csv`, content: 'x' } });
    assert(protectedCsv.decision === 'deny' && /Python-owned path/.test(protectedCsv.reason), 'tasks.csv Write is now protected and denies for a non-QbD writer');
    // Out-of-root Write/Edit defers to Claude's normal permission flow (R10).
    const traversal = protectDecision({ tool_name: 'Write', session_id: claudeSid, cwd: root, tool_input: { file_path: '../escape.txt', content: 'x' } });
    assert(traversal.status === 0 && traversal.stdout.trim() === '', 'Write escaping the project root defers to normal Claude flow');
    // A path that traverses out and back into a protected path still resolves in-root and denies.
    const traversalBack = protectDecision({ tool_name: 'Write', session_id: claudeSid, cwd: root, tool_input: { file_path: `../${path.basename(root)}/.omp-flow/tasks/${claude.taskId}/task.json`, content: 'x' } });
    assert(traversalBack.decision === 'deny' && /Python-owned path/.test(traversalBack.reason), 'Write escaping and re-entering the root at a protected path still denies');
    // Unprotected mutation defers to Claude's normal flow (no output).
    const freeWrite = protectDecision({ tool_name: 'Write', session_id: claudeSid, cwd: root, tool_input: { file_path: 'src/feature.ts', content: 'x' } });
    assert(freeWrite.status === 0 && freeWrite.stdout.trim() === '', 'unprotected Write produces no decision (normal Claude flow)');
    // Bash: one tokenized omp_flow.py invocation is allowed; direct/composed access denies.
    const bashOk = protectDecision(loadFixture('pretooluse-bash-omp-flow.json', { __SESSION__: claudeSid, __ROOT__: root, __BASH_COMMAND__: 'python .omp-flow/scripts/omp_flow.py --cwd . task current' }));
    assert(bashOk.status === 0 && bashOk.stdout.trim() === '', 'a clean omp_flow.py invocation is permitted');
    const bashDirect = protectDecision(loadFixture('pretooluse-bash-omp-flow.json', { __SESSION__: claudeSid, __ROOT__: root, __BASH_COMMAND__: 'cat .omp-flow/tasks/x/task.json' }));
    assert(bashDirect.decision === 'deny' && /managed omp_flow\.py/.test(bashDirect.reason), 'direct protected-path Bash access denies');
    const bashRedirect = protectDecision(loadFixture('pretooluse-bash-omp-flow.json', { __SESSION__: claudeSid, __ROOT__: root, __BASH_COMMAND__: 'echo hi > .omp-flow/tasks/t/evidence.csv' }));
    assert(bashRedirect.decision === 'deny' && /redirect target .* resolves under \.omp-flow/.test(bashRedirect.reason), 'redirection into .omp-flow denies with M-redirect');
    const bashSubst = protectDecision(loadFixture('pretooluse-bash-omp-flow.json', { __SESSION__: claudeSid, __ROOT__: root, __BASH_COMMAND__: 'python .omp-flow/scripts/omp_flow.py --cwd . task current && rm .omp-flow/config.json' }));
    assert(bashSubst.decision === 'deny', 'chained second command touching .omp-flow denies');
    const bashFree = protectDecision({ tool_name: 'Bash', session_id: claudeSid, cwd: root, tool_input: { command: 'ls src && echo done' } });
    assert(bashFree.status === 0 && bashFree.stdout.trim() === '', 'Bash not touching .omp-flow defers to normal Claude flow');
    // Fix A (recognition): a QUOTED / absolute omp_flow.py path is permitted — Windows
    // shlex.split(posix=false) keeps quote chars in the token and CJK/space project paths
    // REQUIRE quoting, so the `$`-anchored managed-script regex must match after quote-strip.
    const bashQuotedAbs = protectDecision(loadFixture('pretooluse-bash-omp-flow.json', { __SESSION__: claudeSid, __ROOT__: root, __BASH_COMMAND__: `python -X utf8 "${root}/.omp-flow/scripts/omp_flow.py" --cwd "${root}" task current` }));
    assert(bashQuotedAbs.status === 0 && bashQuotedAbs.stdout.trim() === '', 'a quoted absolute omp_flow.py path is recognized and permitted');
    // CONTRACT AMENDMENT (fixture P5) — the single sanctioned lock flip. Under the
    // quote-aware segment policy, `cd "<root>" && python "<root>/.omp-flow/.../omp_flow.py"
    // task current` now ALLOWS: segment 1 (`cd "<root>"`) is .omp-flow-free, segment 2 is
    // a strictly tokenized managed omp_flow.py invocation. This inverts the pre-M4 deny at
    // (formerly) this line. See the amendment ADR:
    // .omp-flow/tasks/07-16-m4-claude-polish/context/adr/bash-composition-contract-amendment.md
    // Every OTHER pre-M4 Bash deny assertion in this block stays intact (no-weaker).
    const bashCdManagedCli = protectDecision(loadFixture('pretooluse-bash-omp-flow.json', { __SESSION__: claudeSid, __ROOT__: root, __BASH_COMMAND__: `cd "${root}" && python "${root}/.omp-flow/scripts/omp_flow.py" task current` }));
    assert(bashCdManagedCli.status === 0 && bashCdManagedCli.stdout.trim() === '', 'fixture P5 (contract amendment): cd + managed-CLI composition now ALLOWS');
    // Recognition only — a quoted DIRECT protected read still denies (pre-M4 lock intact).
    const bashQuotedDirect = protectDecision(loadFixture('pretooluse-bash-omp-flow.json', { __SESSION__: claudeSid, __ROOT__: root, __BASH_COMMAND__: `cat "${root}/.omp-flow/tasks/x/task.json"` }));
    assert(bashQuotedDirect.decision === 'deny' && /managed omp_flow\.py/.test(bashQuotedDirect.reason), 'a quoted direct protected-path access still denies');

    // --- Row B-001: full quote-aware segment-policy adversarial matrix ----------
    // interface:bash-guard-segment-policy. Bash fixtures D1-D24 + D26-D29 all DENY;
    // P1-P11 all PASS. This matrix IS the provably-no-weaker acceptance criterion.
    // Fixture ids (D/P) are DISTINCT from the design's decision Dn table (qualify as
    // "fixture Dn"). Fixture D16 = the Write/Edit matrix, asserted above
    // (it is NOT a Bash fixture). P5 is asserted with its ADR citation just above.
    const bashCmd = (command: string) => protectDecision(loadFixture('pretooluse-bash-omp-flow.json', { __SESSION__: claudeSid, __ROOT__: root, __BASH_COMMAND__: command }));
    const scriptAbs = path.join(root, '.omp-flow', 'scripts', 'omp_flow.py');
    const protectedCsvPath = `.omp-flow/tasks/${claude.taskId}/tasks.csv`; // now protected
    const denyMatrix: Array<[string, string, RegExp | null]> = [
      ['D2', 'python .omp-flow/scripts/omp_flow.py task current && rm .omp-flow/config.json', null],
      ['D3', 'cat .omp-flow/tasks/x/task.json', /managed omp_flow\.py/],
      ['D4', 'echo hi > .omp-flow/tasks/t/evidence.csv', /redirect target .* resolves under \.omp-flow/],
      ['D5', 'python .omp-flow/scripts/omp_flow.py evidence submit --reason "$(cat /etc/passwd)"', /shell composition/],
      ['D6', 'python .omp-flow/scripts/omp_flow.py --note "`rm -rf x`"', /shell composition/],
      ['D7', 'cd .omp-flow/tasks/t && cat task.json', null],
      ['D8', "sed -i 's/a/b/' .omp-flow/tasks/t/tasks.csv", null],
      ['D9', 'sort -o .omp-flow/tasks/t/tasks.csv input', null],
      ['D10', 'tee .omp-flow/tasks/t/evidence.csv < x', /read-only allowlisted command|Allowed read-only heads/],
      ['D11', 'python .omp-flow/scripts/omp_flow.py --note "abc', /unterminated/i],
      ['D12', 'bash -c "cat .omp-flow/tasks/x/task.json"', null],
      ['D13', '(cat .omp-flow/tasks/x/tasks.csv)', /Python-owned path|managed omp_flow\.py/],
      ['D14', 'python .omp-flow/scripts/omp_flow.py task current; echo $SID', /shell composition/],
      ['D15', 'ls .omp-flow/tasks/*/task.json', /glob|wildcard/i],
      ['D17', 'cat .omp-flow/tasks/t/tasks.csv & rm -rf .omp-flow/tasks/t', /Python-owned path|managed omp_flow\.py/],
      ['D18', 'grep -r "" .omp-flow/tasks/t', /topology list|task show/],
      ['D19', 'head .omp-flow/tasks/t', /topology list|task show/],
      ['D20', `rm "${scriptAbs}"`, /omp_flow\.py/],
      ['D21', 'cat evil > .omp-flow/scripts/common/gates.py', /redirect target .* resolves under \.omp-flow/],
      ['D22', `cat x > .omp-flow/tasks/${claude.taskId}/tasks.csv`, /redirect target .* resolves under \.omp-flow/],
      ['D23', `cat x >> .omp-flow/tasks/${claude.taskId}/task.json`, /redirect target .* resolves under \.omp-flow/],
      ['D24', `python "${scriptAbs}" task current &> .omp-flow/out.txt`, /redirect target .* resolves under \.omp-flow/],
      ['D25', `cat ${protectedCsvPath}`, /Python-owned path|managed omp_flow\.py/],
      ['D26', `cat <${protectedCsvPath} > out.txt`, /Python-owned path|managed omp_flow\.py/],
      ['D27', `rg pattern ${protectedCsvPath}`, /Python-owned path|managed omp_flow\.py/],
      ['D28', `nl ${protectedCsvPath}`, /Python-owned path|managed omp_flow\.py/],
      ['D29', `diff ${protectedCsvPath} ${protectedCsvPath}`, /Python-owned path|managed omp_flow\.py/],
    ];
    for (const [id, cmd, match] of denyMatrix) {
      const r = bashCmd(cmd);
      assert(r.decision === 'deny', `fixture ${id} denies`);
      if (match) assert(match.test(r.reason), `fixture ${id} deny reason matches ${match}: ${r.reason}`);
    }
    const passMatrix: Array<[string, string]> = [
      ['D1', 'python .omp-flow/scripts/omp_flow.py task current > steal.txt'],
      ['P1', 'python .omp-flow/scripts/omp_flow.py evidence submit --reason "text (with parens)"'],
      ['P2', 'python .omp-flow/scripts/omp_flow.py --note "a; b"'],
      ['P4', 'find . -name "*.md" && ls .omp-flow/tasks'],
      ['P5', `cd "${root}" && python "${scriptAbs}" task current`],
      ['P6', 'ls .omp-flow/tasks; ls .omp-flow/tasks/archive/2026-07'],
      ['P7', "python .omp-flow/scripts/omp_flow.py --note 'a; b (c) $x'"],
      ['P8', `python -X utf8 "${scriptAbs}" --cwd "${root}" task current`],
      ['P9', 'python .omp-flow/scripts/omp_flow.py --cwd . task current | head -100'],
      ['P10', `python "${scriptAbs}" task current 2>&1 | head -5`],
      ['P11', `python "${scriptAbs}" task current 2>/dev/null`],
    ];
    for (const [id, cmd] of passMatrix) {
      const r = bashCmd(cmd);
      assert(r.status === 0 && r.stdout.trim() === '', `fixture ${id} passes`);
    }
    // Teaching content (message-class table). Runs against the git-tracked TEMPLATE
    // mirror (untransformed), so the frozen interpreter set literal is intact.
    const segReason = bashCmd('cd .omp-flow/tasks/t && cat task.json').reason;
    assert(/cat.*head.*tail.*wc.*ls.*stat.*grep/.test(segReason) && /rg.*diff.*nl/.test(segReason) && /omp_flow\.py/.test(segReason) && /python\b.*python3\b.*\bpy\b/.test(segReason), 'M-segment names the full allowlist, the managed CLI, and the frozen interpreter set');
    const hardReason = bashCmd('python .omp-flow/scripts/omp_flow.py task current; echo $SID').reason;
    assert(/shell composition/.test(hardReason) && /quote/i.test(hardReason), 'M-hardmeta retains "shell composition" and teaches quoting');
    const protReason = bashCmd('cat .omp-flow/tasks/x/task.json').reason;
    assert(/managed omp_flow\.py/.test(protReason) && /task show|gate inspect|topology list/.test(protReason), 'M-protected retains "managed omp_flow.py" and names the CLI read verbs');
    const dirReason = bashCmd('head .omp-flow/tasks/t').reason;
    assert(/topology list|task show/.test(dirReason) && /ls/.test(dirReason), 'M-dirtarget names ls/stat and the CLI read verbs');

    // (F) All declared Hook sources exist at their exact managed paths: the five
    // Row-D wrappers plus the shared in-process shim _omp_core.py (B-A001--001).
    for (const script of ['_omp_core.py', 'session-start.py', 'inject-workflow-state.py', 'inject-agent-context.py', 'inject-agent-identity.py', 'protect-python-owned.py']) {
      assert(fs.existsSync(path.join(process.cwd(), 'templates', 'claude', 'hooks', script)), `managed Claude Hook source exists: ${script}`);
    }

    console.log('--- Test 8j: golden subprocess corpus capture/replay (07-22-dispatch-stutter A-001) ---');
    // AC4/AC5 pre-change artifact. Records (capture) or replays (default) the
    // hook wrappers' stdout for a fixed deterministic payload corpus covering
    // all four core kinds x {allow, deny, core-error}, through the TEMPLATE
    // wrappers exactly as Claude invokes them (stdin payload -> stdout). The
    // records were captured from the PRE-CHANGE subprocess implementation; the
    // in-process port (rows C/D/E) must replay them byte-identically (modulo
    // the declared placeholders). Reuses Test 8h/8i state: `claude` (executing
    // task, session claudeSid) and `qbdTask` (qbd1 PREPARED, session qbdSid).
    const goldenCapture = process.env.OMP_GOLDEN_CAPTURE === '1';
    const goldenDir = path.join(process.cwd(), 'tests', 'fixtures', 'claude-hooks', 'golden');
    // A session whose active-task pointer is unreadable JSON drives a real
    // claude-workflow-state core error ([omp-flow] ERROR: Invalid JSON in ...)
    // through the state wrappers on an otherwise valid install. Key derivation
    // mirrors active_task.resolve_context_key's explicit-<sha256[:20]> branch.
    const goldenCorruptSid = 'golden-corrupt-session';
    const goldenCorruptKey = 'explicit-' + crypto.createHash('sha256').update(goldenCorruptSid, 'utf8').digest('hex').slice(0, 20);
    const goldenCorruptPointer = path.join(root, '.omp-flow', '.runtime', 'sessions', goldenCorruptKey + '.json');
    fs.mkdirSync(path.dirname(goldenCorruptPointer), { recursive: true });
    fs.writeFileSync(goldenCorruptPointer, 'not json', 'utf8');
    const goldenEnvFile = path.join(root, 'golden-env-bridge.sh');
    const goldenSubs: Array<[string, string]> = [
      ['__GOLDEN_ROOT__', root],
      ['__GOLDEN_TASK__', claude.taskId],
      ['__GOLDEN_QBD_TASK__', qbdTask.taskId],
      ['__GOLDEN_SESSION__', claudeSid],
      ['__GOLDEN_QBD_SESSION__', qbdSid],
      ['__GOLDEN_REPORT__', prep.report],
      ['__GOLDEN_DIGEST__', prep.evidenceDigest],
      ['__GOLDEN_ENV_FILE__', goldenEnvFile],
    ];
    const goldenExecPrompt = dispatchLine({ version: 1, role: 'executor', taskId: '__GOLDEN_TASK__', rowId: 'A-001' }) + '\nImplement the golden corpus row.';
    const goldenQbdPrompt = dispatchLine({ version: 1, role: 'qbd-auditor', taskId: '__GOLDEN_QBD_TASK__', gate: 'qbd1', report: '__GOLDEN_REPORT__', evidenceDigest: '__GOLDEN_DIGEST__' }) + '\nAudit the prepared gate.';
    const goldenAgentPayload = (prompt: string, session?: string): Record<string, unknown> => ({
      hook_event_name: 'PreToolUse',
      ...(session === undefined ? {} : { session_id: session }),
      cwd: '__GOLDEN_ROOT__',
      tool_name: 'Agent',
      tool_input: { subagent_type: 'omp-flow-implement', description: 'Implement the assigned row', model: 'inherit', prompt },
    });
    const goldenQbdAgentPayload = (prompt: string): Record<string, unknown> => ({
      hook_event_name: 'PreToolUse',
      session_id: '__GOLDEN_QBD_SESSION__',
      cwd: '__GOLDEN_ROOT__',
      tool_name: 'Task',
      tool_input: { subagent_type: 'omp-flow-qbd', description: 'Audit the prepared gate', model: 'inherit', prompt },
    });
    const goldenWritePayload = (agentType: string, filePath: string): Record<string, unknown> => ({
      hook_event_name: 'PreToolUse',
      session_id: '__GOLDEN_QBD_SESSION__',
      cwd: '__GOLDEN_ROOT__',
      agent_id: 'qbd-golden-1',
      agent_type: agentType,
      tool_name: 'Write',
      tool_input: { file_path: filePath, content: '# golden audit body' },
    });
    const goldenCases: GoldenCase[] = [
      // claude-dispatch-context (via inject-agent-context.py)
      { name: 'dispatch-executor-allow', kind: 'claude-dispatch-context', outcome: 'allow', script: 'inject-agent-context.py', payload: goldenAgentPayload(goldenExecPrompt, '__GOLDEN_SESSION__') },
      { name: 'dispatch-role-mismatch-deny', kind: 'claude-dispatch-context', outcome: 'deny', script: 'inject-agent-context.py', payload: goldenAgentPayload(dispatchLine({ version: 1, role: 'researcher', taskId: '__GOLDEN_TASK__', rowId: 'A-001' }) + '\nx', '__GOLDEN_SESSION__') },
      { name: 'dispatch-missing-session-deny', kind: 'claude-dispatch-context', outcome: 'deny', script: 'inject-agent-context.py', payload: goldenAgentPayload(goldenExecPrompt) },
      { name: 'dispatch-task-mismatch-core-error', kind: 'claude-dispatch-context', outcome: 'core-error', script: 'inject-agent-context.py', payload: goldenAgentPayload(dispatchLine({ version: 1, role: 'executor', taskId: 'golden-other-task', rowId: 'A-001' }) + '\nx', '__GOLDEN_SESSION__') },
      // claude-qbd-report (via inject-agent-context.py)
      { name: 'qbd-report-allow', kind: 'claude-qbd-report', outcome: 'allow', script: 'inject-agent-context.py', payload: goldenQbdAgentPayload(goldenQbdPrompt) },
      { name: 'qbd-role-mismatch-deny', kind: 'claude-qbd-report', outcome: 'deny', script: 'inject-agent-context.py', payload: goldenQbdAgentPayload(dispatchLine({ version: 1, role: 'executor', taskId: '__GOLDEN_QBD_TASK__', rowId: 'A-001' }) + '\nx') },
      { name: 'qbd-report-mismatch-core-error', kind: 'claude-qbd-report', outcome: 'core-error', script: 'inject-agent-context.py', payload: goldenQbdAgentPayload(dispatchLine({ version: 1, role: 'qbd-auditor', taskId: '__GOLDEN_QBD_TASK__', gate: 'qbd1', report: 'qbd/qbd-1/audit-999.md', evidenceDigest: '__GOLDEN_DIGEST__' }) + '\nAudit.') },
      { name: 'qbd-digest-mismatch-core-error', kind: 'claude-qbd-report', outcome: 'core-error', script: 'inject-agent-context.py', payload: goldenQbdAgentPayload(dispatchLine({ version: 1, role: 'qbd-auditor', taskId: '__GOLDEN_QBD_TASK__', gate: 'qbd1', report: '__GOLDEN_REPORT__', evidenceDigest: 'sha256:deadbeef' }) + '\nAudit.') },
      // claude-workflow-state (via inject-workflow-state.py and session-start.py)
      { name: 'state-turn-allow', kind: 'claude-workflow-state', outcome: 'allow', script: 'inject-workflow-state.py', payload: { hook_event_name: 'UserPromptSubmit', session_id: '__GOLDEN_SESSION__', cwd: '__GOLDEN_ROOT__', prompt: 'What is the current workflow state?' } },
      { name: 'state-turn-missing-session-deny', kind: 'claude-workflow-state', outcome: 'deny', script: 'inject-workflow-state.py', payload: { hook_event_name: 'UserPromptSubmit', cwd: '__GOLDEN_ROOT__', prompt: 'What is the current workflow state?' } },
      { name: 'state-turn-corrupt-session-core-error', kind: 'claude-workflow-state', outcome: 'core-error', script: 'inject-workflow-state.py', payload: { hook_event_name: 'UserPromptSubmit', session_id: goldenCorruptSid, cwd: '__GOLDEN_ROOT__', prompt: 'What is the current workflow state?' } },
      { name: 'state-session-start-allow', kind: 'claude-workflow-state', outcome: 'allow', script: 'session-start.py', payload: { hook_event_name: 'SessionStart', source: 'startup', session_id: '__GOLDEN_SESSION__', cwd: '__GOLDEN_ROOT__' }, env: { CLAUDE_ENV_FILE: '__GOLDEN_ENV_FILE__' } },
      { name: 'state-session-start-no-task-allow', kind: 'claude-workflow-state', outcome: 'allow', script: 'session-start.py', payload: { hook_event_name: 'SessionStart', source: 'startup', session_id: 'golden-no-task-session', cwd: '__GOLDEN_ROOT__' }, env: { CLAUDE_ENV_FILE: '__GOLDEN_ENV_FILE__' } },
      { name: 'state-session-start-corrupt-core-error', kind: 'claude-workflow-state', outcome: 'core-error', script: 'session-start.py', payload: { hook_event_name: 'SessionStart', source: 'startup', session_id: goldenCorruptSid, cwd: '__GOLDEN_ROOT__' }, env: { CLAUDE_ENV_FILE: '__GOLDEN_ENV_FILE__' } },
      // claude-protect-write (via protect-python-owned.py)
      { name: 'protect-write-allow', kind: 'claude-protect-write', outcome: 'allow', script: 'protect-python-owned.py', payload: goldenWritePayload('omp-flow-qbd', '.omp-flow/tasks/__GOLDEN_QBD_TASK__/__GOLDEN_REPORT__') },
      { name: 'protect-write-wrong-type-deny', kind: 'claude-protect-write', outcome: 'deny', script: 'protect-python-owned.py', payload: goldenWritePayload('omp-flow-implement', '.omp-flow/tasks/__GOLDEN_QBD_TASK__/__GOLDEN_REPORT__') },
      { name: 'protect-write-wrong-path-core-error', kind: 'claude-protect-write', outcome: 'core-error', script: 'protect-python-owned.py', payload: goldenWritePayload('omp-flow-qbd', '.omp-flow/tasks/__GOLDEN_QBD_TASK__/task.json') },
    ];
    // Coverage floor: every kind has at least one allow, one deny, one core-error.
    for (const kind of ['claude-dispatch-context', 'claude-qbd-report', 'claude-workflow-state', 'claude-protect-write'] as const) {
      for (const outcome of ['allow', 'deny', 'core-error'] as const) {
        assert(goldenCases.some(c => c.kind === kind && c.outcome === outcome), `golden corpus covers ${kind} x ${outcome}`);
      }
    }
    assert(new Set(goldenCases.map(c => c.name)).size === goldenCases.length, 'golden case names are unique');
    if (goldenCapture) fs.mkdirSync(goldenDir, { recursive: true });
    const goldenRecords: GoldenRecord[] = [];
    for (const gcase of goldenCases) {
      fs.writeFileSync(goldenEnvFile, '', 'utf8'); // fresh bridge target per case (never reaches stdout)
      let template = gcase.payload;
      let record: GoldenRecord | null = null;
      if (!goldenCapture) {
        const recordPath = path.join(goldenDir, gcase.name + '.json');
        assert(fs.existsSync(recordPath), `golden record exists for ${gcase.name} (re-record with OMP_GOLDEN_CAPTURE=1 npm test)`);
        record = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as GoldenRecord;
        assert(JSON.stringify(record.payload) === JSON.stringify(gcase.payload), `${gcase.name}: in-code payload template matches the recorded corpus payload`);
        assert(JSON.stringify(record.env ?? null) === JSON.stringify(gcase.env ?? null), `${gcase.name}: in-code env template matches the recorded corpus env`);
        template = record.payload; // the committed record is the authoritative replay input
      }
      const filled = goldenFill(template, goldenSubs);
      const extraEnv = gcase.env ? goldenFill(gcase.env, goldenSubs) : {};
      const res = runWrapper(gcase.script, root, filled, extraEnv);
      assert(!res.stdout.includes('__GOLDEN_'), `${gcase.name}: live output contains no placeholder collisions`);
      const normalized = goldenNormalize(res.stdout, goldenSubs);
      const reason = goldenReason(res.stdout);
      // Outcome-class sanity (runs in both modes; independent of byte comparison).
      if (gcase.outcome === 'allow') {
        assert(res.status === 0 && res.stdout.trim().length > 0, `${gcase.name}: allow case exits 0 with output`);
        const hso = (JSON.parse(res.stdout) as { hookSpecificOutput?: { permissionDecision?: string; additionalContext?: string } }).hookSpecificOutput ?? {};
        assert(
          hso.permissionDecision === 'allow' || (typeof hso.additionalContext === 'string' && !hso.additionalContext.includes('STOP:')),
          `${gcase.name}: allow case emits an allow decision or a non-STOP state envelope`,
        );
      } else {
        assert(res.status === 0 && typeof reason === 'string' && reason.length > 0, `${gcase.name}: ${gcase.outcome} case exits 0 with a visible reason`);
        if (gcase.outcome === 'core-error') {
          assert((reason as string).includes('[omp-flow] ERROR: '), `${gcase.name}: core-error reason carries the [omp-flow] ERROR prefix (AC5 reference string)`);
        }
      }
      const built: GoldenRecord = {
        case: gcase.name,
        kind: gcase.kind,
        outcome: gcase.outcome,
        script: gcase.script,
        payload: gcase.payload,
        env: gcase.env ?? null,
        exitCode: res.status,
        stdout: normalized,
        reason: reason === null ? null : goldenNormalize(reason, goldenSubs),
      };
      if (goldenCapture) {
        fs.writeFileSync(path.join(goldenDir, gcase.name + '.json'), JSON.stringify(built, null, 2) + '\n', 'utf8');
      } else {
        // AC4: byte-identical stdout (modulo declared placeholders) + equal exit code.
        assert(res.status === (record as GoldenRecord).exitCode, `${gcase.name}: replay exit code equals the recorded subprocess exit code`);
        assert(normalized === (record as GoldenRecord).stdout, `${gcase.name}: replay stdout is byte-identical to the recorded subprocess stdout (modulo placeholders)`);
        // AC5: the deny/STOP reason string is byte-identical too.
        assert(built.reason === (record as GoldenRecord).reason, `${gcase.name}: replay reason string equals the recorded subprocess reason`);
      }
      goldenRecords.push(built);
    }
    if (goldenCapture) {
      const commitProbe = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' });
      fs.writeFileSync(
        path.join(goldenDir, '_provenance.json'),
        JSON.stringify(
          {
            provenance: 'captured-subprocess-output',
            implementation: 'subprocess',
            note: 'Recorded from the PRE-CHANGE subprocess hook implementation (templates/claude/hooks/*.py spawning omp_flow.py hook <kind>) for task 07-22-dispatch-stutter row A-001. Byte-identity is asserted modulo the declared __GOLDEN_*__ placeholders only. Re-record with OMP_GOLDEN_CAPTURE=1 npm test.',
            capturedAt: new Date().toISOString(),
            capturedCommit: commitProbe.status === 0 ? commitProbe.stdout.trim() : 'unknown',
            platform: process.platform,
            pythonCommand: pythonCommand(),
            placeholders: goldenSubs.map(([placeholder]) => placeholder),
            cases: goldenCases.map(c => ({ name: c.name, kind: c.kind, outcome: c.outcome, script: c.script })),
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );
    } else {
      const goldenProv = JSON.parse(fs.readFileSync(path.join(goldenDir, '_provenance.json'), 'utf8')) as { implementation: string; placeholders: string[] };
      assert(goldenProv.implementation === 'subprocess', 'golden corpus is honestly labelled as recorded from the subprocess implementation');
      assert(JSON.stringify(goldenProv.placeholders) === JSON.stringify(goldenSubs.map(([placeholder]) => placeholder)), 'golden placeholder contract is unchanged');
      const goldenFiles = fs.readdirSync(goldenDir).sort();
      assert(
        JSON.stringify(goldenFiles) === JSON.stringify([...goldenCases.map(c => c.name + '.json'), '_provenance.json'].sort()),
        'golden dir holds exactly the corpus records plus provenance',
      );
    }
    assert(goldenRecords.length === goldenCases.length, 'every golden case produced a record');
    fs.rmSync(goldenCorruptPointer, { force: true }); // do not leak the corrupt pointer into later tests

    console.log('--- Test 8k: Python hook unit drivers (tests/claude-hooks-py) ---');
    // Driver argv contract (07-22-dispatch-stutter B-A001--001). Rows C/D/E add
    // further drivers against this contract WITHOUT editing this file: every
    // tests/claude-hooks-py/test_*.py is discovered and invoked as
    //   python -X utf8 <driver> --root <fixtureRoot> --task <taskId>
    //     --session <sid> --qbd-task <id> --qbd-session <sid>
    // where <fixtureRoot> is the standard executing-task fixture (driveToExecuting
    // task `claude`, rows A-001/B-001 pending, session claudeSid) plus the
    // qbd1-PREPARED task `qbdTask` (session qbdSid). A driver passes iff it exits
    // 0; its combined output is echoed on failure. spawnEnv() strips ambient
    // identity keys, so drivers observe identity only through their own env sets.
    // The drivers exercise the TEMPLATE shim; its live .claude mirror must stay
    // byte-identical (row B done condition).
    const shimTemplate = fs.readFileSync(path.join(process.cwd(), 'templates', 'claude', 'hooks', '_omp_core.py'), 'utf8');
    const shimMirror = fs.readFileSync(path.join(process.cwd(), '.claude', 'hooks', '_omp_core.py'), 'utf8');
    assert(shimTemplate === shimMirror, 'templates/claude/hooks/_omp_core.py and .claude/hooks/_omp_core.py are byte-identical');
    const pyDriverDir = path.join(process.cwd(), 'tests', 'claude-hooks-py');
    const pyDrivers = fs.readdirSync(pyDriverDir).filter(name => /^test_.*\.py$/.test(name)).sort();
    assert(pyDrivers.includes('test_omp_core.py'), 'the shim unit driver test_omp_core.py is present');
    for (const driver of pyDrivers) {
      const res = spawnSync(
        pythonCommand(),
        [
          '-X', 'utf8', path.join(pyDriverDir, driver),
          '--root', root, '--task', claude.taskId, '--session', claudeSid,
          '--qbd-task', qbdTask.taskId, '--qbd-session', qbdSid,
        ],
        { cwd: process.cwd(), encoding: 'utf8', env: spawnEnv() },
      );
      if (res.status !== 0) {
        console.error(`--- ${driver} stdout ---\n${res.stdout}\n--- ${driver} stderr ---\n${res.stderr}`);
      }
      assert(res.status === 0, `Python hook driver ${driver} passes (exit 0)`);
    }

    console.log('--- Test 8l: settings hook-binding parity (07-22-dispatch-stutter AC10 / R6) ---');
    // The in-process port (rows B-E) must leave the Hook wiring semantically
    // unchanged: same events, same matcher sets, same command strings, same
    // timeouts as the recorded PRE-CHANGE settings. The deferred cosmetic
    // matcher consolidation was NOT taken, so the tuples below are the
    // pre-change file verbatim (event, matcher, hook script, timeout), in file
    // order, for BOTH the template source and the live repo deployment.
    const ac10ExpectedBindings: ReadonlyArray<readonly [string, string | null, string, number]> = [
      ['SessionStart', 'startup', 'session-start.py', 30],
      ['SessionStart', 'resume', 'session-start.py', 30],
      ['SessionStart', 'clear', 'session-start.py', 30],
      ['SessionStart', 'compact', 'session-start.py', 30],
      ['UserPromptSubmit', null, 'inject-workflow-state.py', 15],
      ['PreToolUse', 'Agent', 'inject-agent-context.py', 30],
      ['PreToolUse', 'Task', 'inject-agent-context.py', 30],
      ['PreToolUse', 'Write', 'protect-python-owned.py', 15],
      ['PreToolUse', 'Edit', 'protect-python-owned.py', 15],
      ['PreToolUse', 'Bash', 'protect-python-owned.py', 15],
      ['SubagentStart', 'omp-flow-research', 'inject-agent-identity.py', 15],
      ['SubagentStart', 'omp-flow-architect', 'inject-agent-identity.py', 15],
      ['SubagentStart', 'omp-flow-qbd', 'inject-agent-identity.py', 15],
      ['SubagentStart', 'omp-flow-implement', 'inject-agent-identity.py', 15],
      ['SubagentStart', 'omp-flow-check', 'inject-agent-identity.py', 15],
    ];
    const ac10TemplateSettingsPath = path.join(process.cwd(), 'templates', 'claude', 'settings.json');
    const ac10LiveSettingsPath = path.join(process.cwd(), '.claude', 'settings.json');
    let ac10LiveInterpreter = '';
    for (const [ac10Label, ac10File, ac10Interpreter] of [
      ['template', ac10TemplateSettingsPath, '{{PYTHON_CMD}}'],
      ['live', ac10LiveSettingsPath, null],
    ] as ReadonlyArray<readonly [string, string, string | null]>) {
      const ac10Parsed = JSON.parse(fs.readFileSync(ac10File, 'utf8')) as {
        hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout: number }> }>>;
      };
      // Flatten to (event, matcher, command, timeout) in file order; JSON.parse preserves key order.
      const ac10Actual: Array<readonly [string, string | null, string, number]> = [];
      for (const [ac10Event, ac10Entries] of Object.entries(ac10Parsed.hooks)) {
        for (const ac10Entry of ac10Entries) {
          for (const ac10Hook of ac10Entry.hooks) {
            assert(ac10Hook.type === 'command', `AC10 ${ac10Label}: every hook binding is a command hook`);
            ac10Actual.push([ac10Event, ac10Entry.matcher ?? null, ac10Hook.command, ac10Hook.timeout]);
          }
        }
      }
      assert(
        ac10Actual.length === ac10ExpectedBindings.length,
        `AC10 ${ac10Label}: exactly ${ac10ExpectedBindings.length} hook bindings (got ${ac10Actual.length})`,
      );
      // The interpreter token is {{PYTHON_CMD}} in the template and the rendered
      // platform python (python|python3) in the live file; everything after it
      // must be byte-exact per binding.
      const ac10Token = ac10Interpreter ?? (ac10Actual[0][2].split(' ')[0] ?? '');
      if (ac10Interpreter === null) {
        assert(/^python3?$/.test(ac10Token), `AC10 ${ac10Label}: rendered interpreter token is python or python3 (got '${ac10Token}')`);
        ac10LiveInterpreter = ac10Token;
      }
      for (let ac10I = 0; ac10I < ac10ExpectedBindings.length; ac10I += 1) {
        const [ac10Event, ac10Matcher, ac10Script, ac10Timeout] = ac10ExpectedBindings[ac10I];
        const [ac10GotEvent, ac10GotMatcher, ac10GotCommand, ac10GotTimeout] = ac10Actual[ac10I];
        const ac10Where = `AC10 ${ac10Label} binding ${ac10I} (${ac10Event}/${ac10Matcher ?? 'unmatched'})`;
        assert(ac10GotEvent === ac10Event, `${ac10Where}: event unchanged (got ${ac10GotEvent})`);
        assert(ac10GotMatcher === ac10Matcher, `${ac10Where}: matcher unchanged (got ${ac10GotMatcher ?? 'unmatched'})`);
        assert(ac10GotTimeout === ac10Timeout, `${ac10Where}: timeout unchanged (got ${ac10GotTimeout})`);
        const ac10ExpectedCommand = `${ac10Token} -X utf8 "$CLAUDE_PROJECT_DIR/.claude/hooks/${ac10Script}"`;
        assert(ac10GotCommand === ac10ExpectedCommand, `${ac10Where}: command string unchanged (got ${ac10GotCommand})`);
      }
    }
    // Stronger byte-diff (allowed because the cosmetic consolidation was not
    // taken): the live settings file is EXACTLY the template with {{PYTHON_CMD}}
    // rendered — no other byte differs (env, enabledPlugins, ordering, spacing).
    const ac10TemplateRendered = fs
      .readFileSync(ac10TemplateSettingsPath, 'utf8')
      .split('{{PYTHON_CMD}}')
      .join(ac10LiveInterpreter);
    assert(
      ac10TemplateRendered === fs.readFileSync(ac10LiveSettingsPath, 'utf8'),
      'AC10: live .claude/settings.json is byte-identical to the rendered template (R6: no semantic settings change)',
    );

    console.log('--- Test 9: doctor reports legacy state without guessing ---');
    fs.writeFileSync(path.join(root, '.omp-flow', 'tasks', '.active-task'), alpha.taskId, 'utf8');
    const doctor = runPythonJson<{ ok: boolean; findings: Array<{ kind: string }> }>(root, ['doctor']);
    assert(!doctor.ok && doctor.findings.some(item => item.kind === 'legacy-active-task'), 'Doctor reports legacy pointer');

    // A QbD 2 approved before per-row digests existed (no gates.qbd2.rows) is flagged informationally.
    const legacyDir = path.join(root, '.omp-flow', 'tasks', 'legacy-qbd2');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, 'task.json'),
      JSON.stringify({
        schemaVersion: 2,
        taskId: 'legacy-qbd2',
        gates: { qbd2: { status: 'approved', attempt: 1, evidenceDigest: 'sha256:legacy', evidencePaths: [] } },
      }),
      'utf8',
    );
    const legacyDoctor = runPythonJson<{ ok: boolean; findings: Array<{ kind: string; path: string }> }>(root, ['doctor']);
    assert(
      legacyDoctor.findings.some(item => item.kind === 'legacy-qbd2-whole-digest' && item.path.includes('legacy-qbd2')),
      'Doctor flags legacy qbd2 approval lacking per-row digests',
    );

    console.log('--- Test 10: package audit (Claude templates ship; generated pycache does not) ---');
    // Done Condition 5. The npm `files` allowlist admits the whole templates/ tree; the pack must
    // still ship the Claude adapter sources (settings + five agents + five hooks) while excluding
    // generated Python bytecode. The compileall verify step writes real __pycache__ into the source
    // tree, so the audit plants a sentinel .pyc and proves the published pack drops it.
    const repoRoot = process.cwd();
    // The exclusion is declared in package.json's files negation (root .npmignore is bypassed once a
    // files allowlist is present, so the negation must live in the allowlist itself).
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { files: string[] };
    assert(pkg.files.includes('!templates/**/__pycache__') && pkg.files.includes('!templates/**/*.pyc'), 'package.json files allowlist negates generated Python bytecode under templates');
    const sentinelDir = path.join(repoRoot, 'templates', '.omp-flow', 'scripts', '__pycache__');
    const sentinel = path.join(sentinelDir, 'omp_flow_audit_sentinel.cpython-312.pyc');
    fs.mkdirSync(sentinelDir, { recursive: true });
    fs.writeFileSync(sentinel, 'sentinel bytecode\n', 'utf8');
    try {
      const packRes = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'], {
        cwd: repoRoot,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
      assert(packRes.status === 0, 'npm pack --dry-run --json succeeds');
      const packed = JSON.parse(packRes.stdout) as Array<{ files: Array<{ path: string }> }>;
      const packedPaths = packed[0].files.map(entry => entry.path);
      // Claude adapter templates SHIP.
      assert(packedPaths.includes('templates/claude/settings.json'), 'pack ships the Claude settings template');
      for (const name of claudeAgentNames) {
        assert(packedPaths.includes(`templates/claude/agents/${name}.md`), `pack ships the Claude agent card ${name}.md`);
      }
      for (const script of ['_omp_core.py', 'session-start.py', 'inject-workflow-state.py', 'inject-agent-context.py', 'inject-agent-identity.py', 'protect-python-owned.py']) {
        assert(packedPaths.includes(`templates/claude/hooks/${script}`), `pack ships the Claude Hook wrapper ${script}`);
      }
      // The shared Python core .py sources still ship (the negation must not eat real sources).
      assert(packedPaths.includes('templates/.omp-flow/scripts/omp_flow.py'), 'pack ships the shared Python core source');
      // Generated bytecode / __pycache__ do NOT ship, including the planted sentinel.
      assert(!packedPaths.some(entry => entry.includes('__pycache__')), 'pack excludes every __pycache__ directory');
      assert(!packedPaths.some(entry => entry.endsWith('.pyc') || entry.endsWith('.pyo')), 'pack excludes every compiled Python artifact');
      assert(!packedPaths.includes('templates/.omp-flow/scripts/__pycache__/omp_flow_audit_sentinel.cpython-312.pyc'), 'pack excludes the planted bytecode sentinel');
    } finally {
      fs.rmSync(sentinel, { force: true });
    }

    console.log('\nAll portable workflow tests passed.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

runTests().catch(error => {
  console.error(error);
  process.exit(1);
});
