import * as fs from 'fs';
import * as path from 'path';
import { UnifiedWorkspaceManager } from '../core/state.js';
import type { Artifact, TaskDefinition } from '../core/state.js';
import { buildWavePrompt } from '../core/wave-prompt.js';
import { RalphFSMEngine } from '../core/fsm.js';
import { ContextPackageBuilder } from '../core/context-package.js';
import { HarvestManager } from '../core/harvest.js';
import { EventBus } from '../core/events.js';
import { MemoryEngine } from '../core/memory.js';
import { OMPFlowInstaller } from '../omp/installer.js';
import { executeMaestroBoundaryCheck } from '../tools/drift-check-tool.js';
import { generateWavePlan } from '../core/wave-planner.js';
import { checkConvergence, checkAllConvergence } from '../core/convergence-checker.js';
import { createTaskSeed } from '../core/task-seed.js';
import { auditTaskPlan } from '../core/qbd-advisor.js';

export async function runCLI(args: string[] = process.argv): Promise<void> {
  const command = args[2] || 'status';

  const parseOption = (flag: string, defaultValue: string): string => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
    return defaultValue;
  };

  const hasFlag = (flag: string): boolean => args.includes(flag);

  switch (command) {
    case 'init': {
      const stateMgr = new UnifiedWorkspaceManager();
      stateMgr.initWorkspace();
      console.log('✅ Successfully initialized .omp-flow/ workspace directory.');
      break;
    }

    case 'brainstorm': {
      // Parse flags first
      const isDynamic = hasFlag('--dynamic') || hasFlag('-d');
      const customRoles = parseOption('--roles', '');
      const taskId = parseOption('--task', `TASK-${Date.now()}`);
      // Build topic from non-flag args after 'brainstorm' command (skip --dynamic/-d/--roles/--task and their values)
      const topicParts: string[] = [];
      for (let i = 3; i < args.length; i++) {
        const a = args[i];
        if (a === '--dynamic' || a === '-d') {
          // boolean flag — no value to skip
          continue;
        }
        if (a === '--roles' || a === '--task') {
          i++; // skip the value
          continue;
        }
        topicParts.push(a);
      }
      const topic = topicParts.join(' ') || 'General Architecture Brainstorm';

      const stateMgr = new UnifiedWorkspaceManager();
      stateMgr.initWorkspace();
      stateMgr.setActiveTask(taskId);

      // Dynamic Role Inference based on topic keywords
      let inferredRoles: string[] = [];
      if (customRoles) {
        inferredRoles = customRoles.split(',').map((r) => r.trim()).filter(Boolean);
      } else {
        const topicLower = topic.toLowerCase();
        if (topicLower.includes('ui') || topicLower.includes('layout') || topicLower.includes('tui') || topicLower.includes('frontend')) {
          inferredRoles = ['ui-ux-designer', 'performance-architect', 'accessibility-expert'];
        } else if (topicLower.includes('auth') || topicLower.includes('sec') || topicLower.includes('jwt') || topicLower.includes('token')) {
          inferredRoles = ['security-architect', 'api-designer', 'compliance-expert'];
        } else if (topicLower.includes('db') || topicLower.includes('data') || topicLower.includes('storage') || topicLower.includes('sql')) {
          inferredRoles = ['data-architect', 'storage-engine-expert', 'reliability-engineer'];
        } else if (topicLower.includes('event') || topicLower.includes('bus') || topicLower.includes('fsm') || topicLower.includes('state')) {
          inferredRoles = ['systems-architect', 'event-engine-expert', 'fsm-designer'];
        } else {
          inferredRoles = ['system-architect', 'domain-expert', 'product-manager'];
        }
      }

      const taskDir = path.join(process.cwd(), '.omp-flow', 'tasks', taskId);
      fs.mkdirSync(taskDir, { recursive: true });
      const brainstormPath = path.join(taskDir, 'brainstorm.md');

      const initialContent = `# Brainstorm Session: ${topic}

Task ID: ${taskId}
Date: ${new Date().toISOString()}
Mode: ${isDynamic ? 'Dynamic Multi-Agent Debate' : 'Socratic Inquiry'}
Inferred Roles: ${inferredRoles.join(', ')}

---

## Stage 1: Socratic Inquiry & First-Principles Problem Decomposition

### 1.1 Problem Restatement
> Restate the problem in 1 sentence without implementation details.

### 1.2 Fundamental Physical & Business Truths
- [Physical] Network latency, memory allocation, CPU overhead limits.
- [Business] Core user value and mandatory business constraints.
- [Technical] Consistency, state invariants, failure modes.

### 1.3 Confirmed Repository Evidence
- Checked codebase, configs, and spec rules prior to asking.

### 1.4 Socratic Question & Decision Log
1. **Decision Needed**: 
   - **Why it matters**: 
   - **Recommended Answer**: 
   - **Trade-off if different**: 

---

## Stage 2: Dynamic Subagent Debate (${inferredRoles.join(' vs ')})

${inferredRoles.map((role) => `### Role Perspective: ${role}\n- **Analysis**: \n- **Key Trade-offs**: \n- **Proposed Route**: \n`).join('\n')}

### Cross-Agent Debate & Conflict Resolution
- **Consensus Items**: 
- **Resolved Conflicts**: 
- **Deferred Choices**: 

---

## Stage 3: Lossless Convergence Pass

### Confirmed Requirements & Non-Goals
- **MUST**: 
- **SHOULD**: 
- **NON-GOAL**: 

### Next Step
Run \`omp-flow plan "intent" --task ${taskId}\` to generate PRD and Context Package.
`;

      fs.writeFileSync(brainstormPath, initialContent, 'utf-8');

      // --- Gap 1+5: Generate guidance-specification.md (machine-readable structured contract) ---
      const guidancePath = path.join(taskDir, 'guidance-specification.md');

      // Gap 5: Feature ID generation — simple keyword extraction from topic
      const topicWords = topic.toLowerCase().split(/[\s\-_]+/).filter(Boolean).map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
      const featureSlugs: string[] = [];
      if (topicWords.length <= 1) {
        const base = topicWords[0] || 'feature';
        featureSlugs.push(`${base}-core`, `${base}-flow`, `${base}-ext`);
      } else {
        // Adjacent bigrams: word[i]-word[i+1]
        for (let i = 0; i < topicWords.length - 1 && featureSlugs.length < 4; i++) {
          featureSlugs.push(`${topicWords[i]}-${topicWords[i + 1]}`);
        }
        // Ensure at least 2 features
        while (featureSlugs.length < 2) {
          featureSlugs.push(`${topicWords[0]}-core`);
        }
        // For 3+ word topics, synthesize a third feature (first+last word combo)
        // to better decompose the domain, mirroring spec examples.
        if (topicWords.length >= 3 && featureSlugs.length < 3) {
          featureSlugs.push(`${topicWords[0]}-${topicWords[topicWords.length - 1]}-core`);
        }
        // For 2-word topics, add a flow variant as a third feature
        if (topicWords.length === 2 && featureSlugs.length < 3) {
          featureSlugs.push(`${topicWords[1]}-${topicWords[0]}-flow`);
        }
      }

      const slugToTitle = (slug: string): string =>
        slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      const features = featureSlugs.map((slug, idx) => ({
        id: `F-${String(idx + 1).padStart(3, '0')}`,
        slug,
        title: slugToTitle(slug),
        priority: idx === 0 ? 'high' : 'medium',
        role: inferredRoles[idx % inferredRoles.length] || 'system-architect',
      }));

      const featureRows = features.map((f) => `| ${f.id} | ${f.slug} | ${f.title} | ${f.priority} | ${f.role} |`).join('\n');
      const roleDecisionBlocks = inferredRoles.map((role) =>
        `### ${role} Decisions\n- MUST: (to be filled)\n- SHOULD: (to be filled)\n- MAY: (to be filled)`
      ).join('\n\n');

      const guidanceContent = `# Guidance Specification: ${topic}

## §1 Problem Statement
> ${topic} — restate as a concrete problem to be solved.

## §2 Terminology
| Term | Definition |
|------|------------|
| (to be filled) | |

## §3 Non-Goals
- (to be filled)

## §4 Feature Decomposition
| ID | Slug | Title | Priority | Related Roles |
|----|------|-------|----------|---------------|
${featureRows}

## §5-§N Role Decisions
${roleDecisionBlocks}

## §12 Cross-Role Resolutions
(initially empty — populated by cross-role review)
`;

      fs.writeFileSync(guidancePath, guidanceContent, 'utf-8');

      const featureIds = features.map((f) => f.id).join(', ');

      const eventBus = new EventBus();
      eventBus.append('task_started', { topic, roles: inferredRoles, mode: isDynamic ? 'dynamic' : 'socratic' }, { taskId });

      console.log(`💡 Brainstorm session initiated for [${topic}] under ${taskId}.`);
      console.log(`   Mode: ${isDynamic ? 'Dynamic Multi-Agent Debate' : 'Socratic Inquiry'}`);
      console.log(`   Inferred Roles: ${inferredRoles.join(', ')}`);
      console.log(`   Brainstorm Artifact: .omp-flow/tasks/${taskId}/brainstorm.md`);
      console.log(`   Guidance Specification: .omp-flow/tasks/${taskId}/guidance-specification.md`);
      console.log(`   Feature List: ${featureIds}`);
      break;
    }

    case 'plan': {
      const intent = args[3] || 'Default task intent';
      const taskId = parseOption('--task', `TASK-${Date.now()}`);

      const stateMgr = new UnifiedWorkspaceManager();
      stateMgr.initWorkspace();
      stateMgr.setActiveTask(taskId);

      const pkgBuilder = new ContextPackageBuilder();
      pkgBuilder.buildPackage(taskId);

      console.log(`✅ Planning complete for ${taskId}.`);
      console.log(`   Context package created at .omp-flow/scratch/${taskId}/context-package.json`);
      console.log(`   PRD generated at .omp-flow/tasks/${taskId}/prd.md`);
      break;
    }

    case 'execute': {
      const fsm = new RalphFSMEngine();
      const stepInfo = fsm.advanceNextStep();

      if (stepInfo.isComplete) {
        console.log('🎉 All Ralph FSM execution steps are completed!');
      } else {
        console.log(`🚀 Advanced Ralph FSM to Step ${stepInfo.stepIdx}:`);
        console.log(`   Prompt: ${stepInfo.prompt}`);
      }
      break;
    }

    case 'continue':
    case 'resume': {
      const stateMgr = new UnifiedWorkspaceManager();
      const state = stateMgr.getUnifiedState();
      const fsm = new RalphFSMEngine();
      const ralph = fsm.getStatus();

      if (!state.activeTask) {
        console.log('⚠️ No active task found in .omp-flow/tasks/.active-task.');
        console.log('   Run "omp-flow plan <intent> --task <taskId>" to initialize a task first.');
        break;
      }

      console.log(`⏩ Resuming active session for task [${state.activeTask}]...`);
      console.log(`   Phase: ${state.phase} | FSM State: ${ralph.fsmState} | Current Step: ${ralph.currentStepIndex}/${ralph.steps.length}`);

      const stepInfo = fsm.advanceNextStep();
      if (stepInfo.isComplete) {
        console.log('🎉 Active task FSM execution is already complete!');
      } else {
        console.log(`🚀 Resumed at Step ${stepInfo.stepIdx} (${stepInfo.step?.skill}):`);
        console.log(`   Prompt: ${stepInfo.prompt}`);
      }
      break;
    }

    case 'grill': {
      const fsm = new RalphFSMEngine();
      const stepIdx = parseInt(parseOption('--step', '1'), 10);
      const rawStatus = parseOption('--status', 'DONE');
      const summary = parseOption('--summary', 'Passed quality audit');

      const validStatuses = ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_RETRY', 'BLOCKED'] as const;
      const status = validStatuses.includes(rawStatus as any) ? (rawStatus as any) : 'DONE';

      const updatedStatus = fsm.completeStep(stepIdx, status, summary);
      console.log(`✅ Step ${stepIdx} reviewed with status [${status}].`);
      console.log(`   Current FSM state: ${updatedStatus.fsmState} | Total completed: ${updatedStatus.steps.filter((s) => s.status === 'completed').length}/${updatedStatus.steps.length}`);
      break;
    }

    case 'harvest': {
      const harvester = new HarvestManager();
      const result = harvester.harvestLearnings();
      console.log(`🌾 Harvest complete! Excerpted ${result.harvestedCount} knowledge gotchas.`);
      console.log(`   Updated specs in .omp-flow/knowhow/ and .omp-flow/specs/`);
      break;
    }

    // --- NEW: gaps command (Maestro Issue Gaps analysis) ---
    case 'gaps': {
      const taskId = parseOption('--task', '');
      const stateMgr = new UnifiedWorkspaceManager();
      const state = stateMgr.getUnifiedState();
      const activeTaskId = taskId || state.activeTask || 'TASK-DEFAULT';

      const driftResult = executeMaestroBoundaryCheck(activeTaskId, [], process.cwd());

      console.log('----------------------------------------------------');
      console.log(`🔍 Gap Analysis for ${activeTaskId}`);
      console.log('----------------------------------------------------');

      if (driftResult.readiness) {
        const r = driftResult.readiness;
        console.log(`Readiness Score: ${r.totalScore}% [${r.gateStatus}]`);
        console.log(`  Completeness:  ${r.completeness}/25`);
        console.log(`  Consistency:   ${r.consistency}/25`);
        console.log(`  Traceability:  ${r.traceability}/25`);
        console.log(`  Depth:         ${r.depth}/25`);
      }

      if (driftResult.violations.length > 0) {
        console.log('\n⚠️ Boundary Violations:');
        for (const v of driftResult.violations) {
          console.log(`  - ${v}`);
        }
      } else {
        console.log('\n✅ No boundary violations detected.');
      }

      if (driftResult.passedCriteria.length > 0) {
        console.log('\n✓ Passed Criteria:');
        for (const c of driftResult.passedCriteria) {
          console.log(`  - ${c}`);
        }
      }
      console.log('----------------------------------------------------');
      break;
    }

    // --- NEW: events command (Event Bus tail) ---
    case 'events': {
      const count = parseInt(parseOption('--count', '20'), 10);
      const filterKind = parseOption('--kind', '') || undefined;
      const eventBus = new EventBus();

      const events = filterKind
        ? eventBus.readAll({ kind: filterKind as any })
        : eventBus.tail(count);

      console.log('----------------------------------------------------');
      console.log(`📊 Event Bus (${events.length} events)`);
      console.log('----------------------------------------------------');

      for (const evt of events) {
        const ts = evt.timestamp.slice(0, 19).replace('T', ' ');
        console.log(`  [${evt.seq}] ${ts} ${evt.kind}${evt.taskId ? ` task:${evt.taskId}` : ''}${evt.agentId ? ` agent:${evt.agentId}` : ''}`);
      }
      console.log('----------------------------------------------------');
      break;
    }

    // --- NEW: search command (Memory Engine knowhow search) ---
    case 'search': {
      const query = args.slice(3).join(' ') || '';
      if (!query) {
        console.log('Usage: omp-flow search <query>');
        break;
      }

      const memory = new MemoryEngine();
      const results = memory.searchKnowhow(query);

      console.log('----------------------------------------------------');
      console.log(`🔎 Knowhow Search: "${query}" (${results.length} results)`);
      console.log('----------------------------------------------------');

      for (const r of results.slice(0, 10)) {
        console.log(`  [${r.score}] ${r.category}: ${r.filePath}`);
        for (const m of r.matchedLines.slice(0, 3)) {
          console.log(`      ${m}`);
        }
      }
      console.log('----------------------------------------------------');
      break;
    }

    case 'status': {
      const stateMgr = new UnifiedWorkspaceManager();
      const state = stateMgr.getUnifiedState();
      const fsm = new RalphFSMEngine();
      const ralph = fsm.getStatus();
      const eventBus = new EventBus();

      console.log('----------------------------------------------------');
      console.log('📌 OMP-Flow Status Summary');
      console.log('----------------------------------------------------');
      console.log(`Milestone:    ${state.milestone}`);
      console.log(`Phase:        ${state.phase}`);
      console.log(`FSM State:    ${ralph.fsmState}`);
      console.log(`Active Task:  ${state.activeTask || 'None'}`);
      console.log(`Ralph Status: ${ralph.status} (Step ${ralph.currentStepIndex}/${ralph.steps.length})`);
      console.log(`Event Count:  ${eventBus.currentSeq()}`);

      if (ralph.autoFixIterations && ralph.autoFixIterations > 0) {
        console.log(`Auto-Fix:     Iteration ${ralph.autoFixIterations}/${ralph.maxAutoFixIterations || 3}`);
      }

      console.log('----------------------------------------------------');
      for (const step of ralph.steps) {
        const mark = step.status === 'completed' ? '[✓]' :
                     step.status === 'running' ? '[▶]' :
                     step.status === 'skipped' ? '[⊘]' :
                     step.status === 'failed' ? '[✗]' : '[ ]';
        const retryInfo = step.retry_count && step.retry_count > 0 ? ` (retry ${step.retry_count})` : '';
        console.log(`  ${mark} Step ${step.index}: ${step.skill} (${step.stage}) -> Status: ${step.status}${retryInfo}`);
      }
      console.log('----------------------------------------------------');
      break;
    }

    case 'install': {
      const installer = new OMPFlowInstaller();
      installer.install();
      console.log('✅ Successfully installed omp-flow extension and skills into .omp/');
      break;
    }

    // --- NEW: archive command (move completed task to monthly archive) ---
    case 'archive': {
      const taskId = args[3];
      if (!taskId) {
        console.log('Usage: omp-flow archive <taskId>');
        break;
      }
      const stateMgr = new UnifiedWorkspaceManager();
      try {
        const result = stateMgr.archiveTask(taskId);
        console.log(`📦 Archived task ${taskId} to ${result.archivedTo}`);
      } catch (e) {
        console.log(`❌ Archive failed: ${(e as Error).message}`);
      }
      break;
    }

    // --- NEW: prune command (prune accumulated context + rotate events) ---
    case 'prune': {
      const stateMgr = new UnifiedWorkspaceManager();
      const ctxResult = stateMgr.pruneAccumulatedContext();
      const eventBus = new EventBus();
      const rotResult = eventBus.prune();

      console.log('----------------------------------------------------');
      console.log('🧹 Prune Summary');
      console.log('----------------------------------------------------');
      console.log(`Context Pruned:`);
      console.log(`  Key Decisions: ${ctxResult.prunedDecisions} removed`);
      console.log(`  Deferred: ${ctxResult.prunedDeferred} removed`);
      console.log(`  Blockers: ${ctxResult.prunedBlockers} removed`);
      console.log(`Events Rotated: ${rotResult.eventsRotated ? 'Yes' : 'No (under limit)'}`);
      console.log(`Discoveries Rotated: ${rotResult.discoveriesRotated ? 'Yes' : 'No (under limit)'}`);
      console.log(`Active Events: ${rotResult.eventStats.totalEvents}`);
      console.log(`Active Discoveries: ${rotResult.eventStats.totalDiscoveries}`);
      console.log(`Active Size: ${rotResult.eventStats.activeSizeKB} KB`);
      console.log('----------------------------------------------------');
      break;
    }

    // --- NEW: milestone command (archive or list milestones) ---
    case 'milestone': {
      const action = args[3] || 'list';
      const stateMgr = new UnifiedWorkspaceManager();

      if (action === 'complete') {
        const milestoneId = args[4];
        if (!milestoneId) {
          console.log('Usage: omp-flow milestone complete <milestoneId>');
          break;
        }
        const result = stateMgr.archiveMilestone(milestoneId);
        console.log(`🏁 Milestone ${milestoneId} archived. ${result.archivedArtifacts} artifacts graduated.`);
      } else if (action === 'list') {
        const state = stateMgr.getUnifiedState();
        if (state.artifactArchive.length === 0) {
          console.log('No archived milestones.');
        } else {
          console.log('----------------------------------------------------');
          console.log('🏁 Archived Milestones');
          console.log('----------------------------------------------------');
          const milestones = new Map<string, number>();
          for (const a of state.artifactArchive) {
            milestones.set(a.milestone, (milestones.get(a.milestone) || 0) + 1);
          }
          for (const [m, count] of milestones) {
            console.log(`  ${m}: ${count} artifacts`);
          }
          console.log('----------------------------------------------------');
        }
      } else {
        console.log(`Unknown milestone action: ${action}. Use 'complete' or 'list'.`);
      }
      break;
    }

    // --- NEW: artifacts command (list registered artifacts) ---
    case 'artifacts': {
      const stateMgr = new UnifiedWorkspaceManager();
      const taskFilter = parseOption('--task', '') || undefined;
      const statusFilter = parseOption('--status', '') || undefined;

      const filter: { type?: Artifact['type']; taskId?: string; status?: Artifact['status']; harvested?: boolean } = {};
      if (taskFilter) filter.taskId = taskFilter;
      if (statusFilter) filter.status = statusFilter as Artifact['status'];

      const artifacts = stateMgr.getArtifacts(Object.keys(filter).length > 0 ? filter : undefined);

      console.log('----------------------------------------------------');
      console.log(`📋 Artifacts (${artifacts.length})`);
      console.log('----------------------------------------------------');
      for (const a of artifacts) {
        const mark = a.harvested ? '[🌾]' : a.status === 'completed' ? '[✓]' : a.status === 'failed' ? '[✗]' : '[ ]';
        console.log(`  ${mark} ${a.id} | ${a.type} | task:${a.taskId} | ${a.status}`);
      }
      console.log('----------------------------------------------------');
      break;
    }

    // --- NEW: task command (unified task lifecycle management) ---
    case 'task': {
      const subcommand = args[3] || 'list';
      const stateMgr = new UnifiedWorkspaceManager();

      switch (subcommand) {
        case 'create': {
          // Parse flags first
          const parentId = parseOption('--parent', '') || undefined;
          const slug = parseOption('--slug', '') || undefined;
          // Build title from non-flag args after 'create' (skip --parent/--slug and their values)
          const titleParts: string[] = [];
          for (let i = 4; i < args.length; i++) {
            if (args[i] === '--parent' || args[i] === '--slug') {
              i++; // skip the value
              continue;
            }
            titleParts.push(args[i]);
          }
          const title = titleParts.join(' ') || 'Untitled Task';
          // Generate MM-DD-slug
          const now = new Date();
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const dd = String(now.getDate()).padStart(2, '0');
          const slugBase = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
          const taskId = `${mm}-${dd}-${slugBase}`;
          stateMgr.createTask(taskId, title, parentId);

          // Generate seed files (prd.md + design.md + tasks.csv skeleton)
          createTaskSeed(taskId, { workspaceDir: process.cwd() });

          // Create subdirs
          const taskDir = path.join(process.cwd(), '.omp-flow', 'tasks', taskId);
          fs.mkdirSync(path.join(taskDir, '.task'), { recursive: true });
          fs.mkdirSync(path.join(taskDir, '.summaries'), { recursive: true });

          // Run QbD pre-review audit
          const qbdVerdict = await auditTaskPlan(taskId, process.cwd());

          if (!qbdVerdict.passed) {
            console.log(`⚠️ QbD Pre-Review found issues:`);
            for (const finding of qbdVerdict.findings) {
              console.log(`   [${finding.severity}] ${finding.detail}`);
            }
            console.log(`\n   Fix the plan files, then run: omp-flow task start ${taskId}`);
            stateMgr.setActiveTask(taskId);
            break;
          }

          // QbD passed — activate task
          stateMgr.setActiveTask(taskId);
          console.log(`✅ Created task: ${taskId}`);
          console.log(`   Title: ${title}`);
          if (parentId) console.log(`   Parent: ${parentId}`);
          console.log(`   Dir: .omp-flow/tasks/${taskId}/`);
          console.log(`   QbD: PASS`);
          break;
        }
        case 'list': {
          const records = stateMgr.listTaskTree();
          console.log('----------------------------------------------------');
          console.log(`📋 Tasks (${records.length})`);
          console.log('----------------------------------------------------');
          for (const r of records) {
            const mark = r.status === 'completed' ? '[✓]' : r.status === 'in_progress' ? '[▶]' : '[ ]';
            const childInfo = r.children.length > 0 ? ` (${r.children.length} children)` : '';
            console.log(`  ${mark} ${r.id}: ${r.title}${childInfo}`);
          }
          console.log('----------------------------------------------------');
          break;
        }
        case 'start': {
          const taskId = args[4];
          if (!taskId) { console.log('Usage: omp-flow task start <taskId>'); break; }
          stateMgr.transitionTask(taskId, 'in_progress');
          console.log(`🚀 Task ${taskId} started (status: in_progress)`);
          break;
        }
        case 'finish': {
          const taskId = args[4];
          if (!taskId) { console.log('Usage: omp-flow task finish <taskId>'); break; }

          // ── Step 1: Spec Sync Preamble ──
          const harvester = new HarvestManager();
          const syncResult = harvester.syncSpecsBeforeCommit();
          if (syncResult.isDirty) {
            console.log('📋 Spec Sync:');
            for (const f of syncResult.newSpecs) {
              console.log(`   [NEW]     ${f}`);
            }
            for (const f of syncResult.modifiedSpecs) {
              console.log(`   [MODIFIED] ${f.file} (est. ${f.changes} line(s) changed)`);
            }
            for (const f of syncResult.removedSpecs) {
              console.log(`   [REMOVED] ${f}`);
            }
            console.log(`   ${syncResult.unchanged} spec(s) unchanged, ${syncResult.totalSpecs} total`);
          } else {
            console.log(`📋 Spec Sync: ${syncResult.totalSpecs} spec(s) all up to date`);
          }

          // ── Step 2: Batched Finish-Work Commit (work → archive → journal) ──
          console.log('📦 Finishing task...');

          // 2a: Work commits — harvest learnings + persist spec state
          const harvestResult = harvester.harvestLearnings();
          harvester.commitSpecState();
          console.log(`   [WORK]   Harvested ${harvestResult.harvestedCount} gotcha(s), ${harvestResult.findingsCount} finding(s)`);
          console.log(`   [WORK]   Spec state committed`);

          // 2b: Archive — move task directory to archive
          let archiveInfo: { archivedTo: string } | null = null;
          try {
            archiveInfo = stateMgr.archiveTask(taskId);
            console.log(`   [ARCHIVE] Archived to ${archiveInfo.archivedTo}`);
          } catch (e) {
            console.log(`   [ARCHIVE] Skipped (${(e as Error).message})`);
          }

          // 2c: Journal — write completion entry to session journal
          const journalDir = path.join(process.cwd(), '.omp-flow', 'workspace');
          fs.mkdirSync(journalDir, { recursive: true });
          const journalFiles = fs.existsSync(journalDir) ? fs.readdirSync(journalDir).filter((f) => f.startsWith('journal-')).sort() : [];
          const lastIdx = journalFiles.length > 0 ? parseInt(journalFiles[journalFiles.length - 1].replace('journal-', '').replace('.md', ''), 10) || 1 : 0;
          const journalPath = path.join(journalDir, `journal-${lastIdx + 1}.md`);
          const journalEntry = [
            `# Journal Entry — ${taskId}`,
            `**Date**: ${new Date().toISOString()}`,
            `**Status**: completed`,
            `**Specs**: ${syncResult.totalSpecs} total (${syncResult.isDirty ? 'dirty' : 'clean'})`,
            `**Harvest**: ${harvestResult.harvestedCount} gotchas, ${harvestResult.findingsCount} findings`,
            `**Archive**: ${archiveInfo ? archiveInfo.archivedTo : '(skipped)'}`,
            '',
            '## Summary',
            `Completed task ${taskId}.`,
            '',
          ].join('\n');
          fs.writeFileSync(journalPath, journalEntry, 'utf-8');
          console.log(`   [JOURNAL] ${journalPath}`);

          // Transition to completed
          stateMgr.transitionTask(taskId, 'completed');
          console.log(`✅ Task ${taskId} finished (status: completed)`);
          break;
        }
        case 'archive': {
          const taskId = args[4];
          if (!taskId) { console.log('Usage: omp-flow task archive <taskId>'); break; }
          try {
            const result = stateMgr.archiveTask(taskId);
            console.log(`📦 Archived task ${taskId} to ${result.archivedTo}`);
          } catch (e) {
            console.log(`❌ Archive failed: ${(e as Error).message}`);
          }
          break;
        }
        case 'tree': {
          const records = stateMgr.listTaskTree();
          console.log('----------------------------------------------------');
          console.log('🌳 Task Tree');
          console.log('----------------------------------------------------');
          // Build tree: roots are tasks with no parent
          const roots = records.filter(r => !r.parent);
          const printTree = (task: typeof records[0], indent: string): void => {
            const mark = task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▶' : '○';
            console.log(`${indent}${mark} ${task.id}: ${task.title} [${task.status}]`);
            const children = records.filter(r => r.parent === task.id);
            for (const c of children) printTree(c, indent + '  ');
          };
          for (const r of roots) printTree(r, '');
          console.log('----------------------------------------------------');
          break;
        }
        case 'add-subtask': {
          const parentId = args[4];
          const childId = args[5];
          if (!parentId || !childId) { console.log('Usage: omp-flow task add-subtask <parent> <child>'); break; }
          const parent = stateMgr.loadTaskRecord(parentId);
          const child = stateMgr.loadTaskRecord(childId);
          if (!parent) { console.log(`❌ Parent task not found: ${parentId}`); break; }
          if (!child) { console.log(`❌ Child task not found: ${childId}`); break; }
          if (!parent.subtasks.includes(childId)) parent.subtasks.push(childId);
          if (!parent.children.includes(childId)) parent.children.push(childId);
          child.parent = parentId;
          stateMgr.writeTaskRecord(parentId, parent);
          stateMgr.writeTaskRecord(childId, child);
          console.log(`🔗 Linked ${childId} as child of ${parentId}`);
          break;
        }
        default:
          console.log(`Unknown task subcommand: ${subcommand}. Use create|list|start|finish|archive|tree|add-subtask`);
      }
      break;
    }

    // --- plan-waves command: generate real wave plan from prd.md + guidance-specification.md ---
    case 'plan-waves': {
      const taskId = args[3];
      if (!taskId) { console.log('Usage: omp-flow plan-waves <taskId>'); break; }
      const taskDir = path.join(process.cwd(), '.omp-flow', 'tasks', taskId);
      if (!fs.existsSync(taskDir)) { console.log(`❌ Task not found: ${taskId}`); break; }
      const plan = generateWavePlan(taskId, process.cwd());
      console.log(`📋 Wave plan generated for ${taskId}`);
      console.log(`   Plan: .omp-flow/tasks/${taskId}/plan.json`);
      console.log(`   Tasks: ${plan.taskIds.join(', ') || '(none)'}`);
      console.log(`   Waves: ${plan.waveCount}`);
      for (const w of plan.waves) {
        console.log(`   Wave ${w.wave}: ${w.tasks.join(', ') || '(empty)'} (${w.parallel ? 'parallel' : 'sequential'})`);
      }
      console.log(`   Task definitions: .omp-flow/tasks/${taskId}/.task/TASK-NNN.json`);
      break;
    }

    // --- execute-wave command: dispatch next wave task with structured prompt ---
    case 'execute-wave': {
      const taskId = args[3] || new UnifiedWorkspaceManager().getUnifiedState().activeTask;
      if (!taskId) {
        console.log('Usage: omp-flow execute-wave <taskId>');
        console.log('   Or set an active task first with: omp-flow task start <taskId>');
        break;
      }
      const fsm = new RalphFSMEngine();
      const result = fsm.advanceWaveStep(process.cwd());
      if (!result.taskDef) {
        if (result.isWaveComplete) {
          console.log(`✅ Wave ${result.waveNum} complete!`);
          console.log('   All tasks in this wave are done.');
        } else {
          console.log('🎉 All waves completed! No pending tasks.');
        }
        break;
      }
      // Construct a full TaskDefinition from the locally-shaped WaveTaskInfo.
      // WaveTaskInfo (fsm.ts) mirrors TaskDefinition (state.ts) but omits some
      // required fields; we fill those with safe defaults so no cast is needed.
      const raw = result.taskDef;
      const taskDef: TaskDefinition = {
        id: raw.id,
        title: raw.title,
        description: raw.description ?? '',
        scope: raw.scope,
        action: raw.action,
        files: (raw.files ?? []).map((f) => ({ path: f.path, target: f.target, change: f.change })),
        readFirst: raw.readFirst ?? [],
        implementation: raw.implementation ?? [],
        convergence: raw.convergence ?? { criteria: [] },
        dependsOn: raw.dependsOn ?? [],
        wave: raw.wave,
        executor: raw.executor ?? 'agent',
        type: raw.type ?? 'feature',
        status: raw.status,
        summaryPath: raw.summaryPath,
        commitHash: raw.commitHash,
      };
      const prompt = buildWavePrompt(taskDef, result.priorSummaries, '', undefined);
      console.log('----------------------------------------------------');
      console.log(`🌊 Wave ${result.waveNum} | Task: ${result.taskDef.id}`);
      console.log('----------------------------------------------------');
      console.log(`   Title: ${result.taskDef.title}`);
      console.log(`   Scope: ${result.taskDef.scope}`);
      console.log(`   Status: ${result.taskDef.status}`);
      console.log(`   Prior Summaries: ${result.priorSummaries?.length || 0}`);
      console.log('----------------------------------------------------');
      console.log(prompt);
      console.log('----------------------------------------------------');
      break;
    }

    // --- check command: run convergence criteria verification ---
    case 'check': {
      const taskId = args[3];
      if (!taskId) { console.log('Usage: omp-flow check <taskId> [--subtask <id>]'); break; }
      const subtask = parseOption('--subtask', '') || undefined;
      const taskDir = path.join(process.cwd(), '.omp-flow', 'tasks', taskId);
      if (!fs.existsSync(taskDir)) { console.log(`❌ Task not found: ${taskId}`); break; }
      const taskDefDir = path.join(taskDir, '.task');
      if (!fs.existsSync(taskDefDir)) {
        console.log(`ℹ️  No .task/ directory for ${taskId}. Run "omp-flow plan-waves ${taskId}" first.`);
        break;
      }
      if (subtask) {
        const result = checkConvergence(taskId, subtask, process.cwd());
        console.log(`\n📋 ${result.subTaskId}: ${result.passed ? 'PASS' : 'FAIL'}`);
        for (const r of result.results) {
          console.log(`  ${r.passed ? '[✓]' : '[✗]'} ${r.criterion}`);
          if (r.evidence) console.log(`      ${r.evidence}`);
        }
        console.log(`\n${result.passed ? '✅ Convergence checks passed!' : '❌ Some checks failed.'}`);
      } else {
        const results = checkAllConvergence(taskId, process.cwd());
        if (results.length === 0) {
          console.log(`ℹ️  No task definitions found in .omp-flow/tasks/${taskId}/.task/`);
          break;
        }
        let allPassed = true;
        for (const result of results) {
          console.log(`\n📋 ${result.subTaskId}: ${result.passed ? 'PASS' : 'FAIL'}`);
          for (const r of result.results) {
            console.log(`  ${r.passed ? '[✓]' : '[✗]'} ${r.criterion}`);
            if (r.evidence) console.log(`      ${r.evidence}`);
            if (!r.passed) allPassed = false;
          }
        }
        console.log(`\n${allPassed ? '✅ All convergence checks passed!' : '❌ Some checks failed.'}`);
      }
      break;
    }

    case 'export-csv': {
      const taskId = args[3] || new UnifiedWorkspaceManager().getUnifiedState().activeTask;
      if (!taskId) {
        console.log('Usage: omp-flow export-csv <taskId>');
        break;
      }
      // Dynamic import for CLI command lazy loading
      const { exportPlanToCSV } = await import('../core/csv-adapter.js');
      try {
        const result = exportPlanToCSV(taskId, process.cwd());
        console.log(`📊 Exported ${result.rowCount} tasks to ${result.csvPath}`);
      } catch (e) {
        console.log(`❌ Export failed: ${(e as Error).message}`);
      }
      break;
    }

    case 'import-csv': {
      const taskId = args[3] || new UnifiedWorkspaceManager().getUnifiedState().activeTask;
      if (!taskId) {
        console.log('Usage: omp-flow import-csv <taskId>');
        break;
      }
      // Dynamic import for CLI command lazy loading
      const { importCSVToPlan } = await import('../core/csv-adapter.js');
      try {
        const result = importCSVToPlan(taskId, process.cwd());
        console.log(`📥 Imported ${result.updatedTasks} task updates from tasks.csv`);
      } catch (e) {
        console.log(`❌ Import failed: ${(e as Error).message}`);
      }
      break;
    }
    // --- NEW: index command (Layered Index System overview / refresh) ---
    case 'index': {
      const shouldRefresh = hasFlag('--refresh') || hasFlag('-r');
      const stateMgr = new UnifiedWorkspaceManager();

      if (shouldRefresh) {
        // Regenerate index files
        stateMgr.refreshSpecIndex();
        stateMgr.refreshKnowhowIndex();
        stateMgr.refreshTaskIndex();
        console.log('✅ Index files refreshed.');
        break;
      }

      // Display layered index
      console.log('----------------------------------------------------');
      console.log('📚 OMP-Flow Layered Index');
      console.log('----------------------------------------------------');

      // L0: state.json registry
      const state = stateMgr.getUnifiedState();
      console.log('\n## L0: Registry (state.json)');
      console.log(`  Milestone: ${state.milestone} | Phase: ${state.phase}`);
      console.log(`  Active Task: ${state.activeTask || 'None'}`);
      console.log(`  FSM State: ${state.fsmState}`);
      console.log(`  Artifacts: ${state.artifacts?.length || 0} registered`);
      console.log(`  Goals: ${state.goals?.length || 0} tracked`);
      console.log(`  Features: ${state.features?.length || 0} tracked`);

      // L1: specs/
      const specsDir = path.join(process.cwd(), '.omp-flow', 'specs');
      if (fs.existsSync(specsDir)) {
        const specFiles = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
        console.log('\n## L1: Specs');
        for (const f of specFiles) {
          console.log(`  📄 ${f}`);
        }
      }

      // L2: knowhow/
      const knowhowDir = path.join(process.cwd(), '.omp-flow', 'knowhow');
      if (fs.existsSync(knowhowDir)) {
        const knowhowFiles = fs.readdirSync(knowhowDir).filter(f => f.endsWith('.md'));
        console.log('\n## L2: Knowhow');
        for (const f of knowhowFiles) {
          console.log(`  💡 ${f}`);
        }
      }

      // L3: tasks/
      const tasks = stateMgr.listTaskTree();
      console.log('\n## L3: Active Tasks');
      if (tasks.length === 0) {
        console.log('  (none)');
      } else {
        for (const t of tasks) {
          const mark = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▶' : '○';
          console.log(`  ${mark} ${t.id}: ${t.title} [${t.status}]`);
        }
      }

      // Events
      const eventBus = new EventBus();
      const stats = eventBus.getEventStats();
      console.log('\n## Event Bus');
      console.log(`  Events: ${stats.totalEvents} | Discoveries: ${stats.totalDiscoveries} | Size: ${stats.activeSizeKB} KB`);

      console.log('\n----------------------------------------------------');
      console.log('Use --refresh to regenerate index files.');
      console.log('----------------------------------------------------');
      break;
    }

    case '--help':
    case '-h':
    case 'help': {
      console.log(`
omp-flow CLI Usage:
  omp-flow init                       Initialize .omp-flow/ workspace directory
  omp-flow install                    Install OMP extensions & skills into .omp/
  omp-flow brainstorm [topic]         3-Stage Socratic & Dynamic Debate (--dynamic, --roles r1,r2)
  omp-flow plan [intent] --task [id]  Generate task PRD & Context Package
  omp-flow execute                    Advance Ralph FSM step loop
  omp-flow continue                   Resume active task session & continue execution
  omp-flow grill --step [n] --status  Review step (DONE|NEEDS_RETRY|BLOCKED)
  omp-flow harvest                    Extract gotchas to knowhow & specs
  omp-flow gaps --task [id]           Run gap analysis & readiness score
  omp-flow events --count [n]         Tail event bus log
  omp-flow search <query>             Search knowhow & specs
  omp-flow status                     Display milestone, phase & FSM status
  omp-flow task <create|list|start|finish|archive|tree|add-subtask>  Task lifecycle management
  omp-flow plan-waves <taskId>        Generate wave plan from prd.md + guidance-specification.md
  omp-flow execute-wave [taskId]          Dispatch next wave task with structured prompt
  omp-flow check <taskId> [--subtask <id>]  Run convergence criteria checks
  omp-flow export-csv [taskId]          Export wave plan to tasks.csv (Token-efficient)
  omp-flow import-csv [taskId]          Import tasks.csv updates back to plan.json
  omp-flow prune                      Prune accumulated context + rotate event logs
  omp-flow milestone <complete|list>  Archive or list milestones
  omp-flow artifacts [--task] [--status] List registered artifacts
  omp-flow index [--refresh]              Display layered index or regenerate index files
`);
      break;
    }

    default:
      console.log(`Unknown command: ${command}. Run "omp-flow help" for usage.`);
      break;
  }
}
