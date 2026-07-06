# How To: Change Task Lifecycle

Modify task metadata (meta field), manage active task switching, or change the archive flow.

**Platform**: OMP native (all platforms)

---

## Files to Read First

| File | Purpose |
|------|---------|
| `src/core/state.ts` | `TaskRecord`, `UnifiedWorkspaceManager` — task metadata and lifecycle |
| `.omp-flow/tasks/` | Task directory structure |
| `.omp-flow/tasks/.active-task` | Pointer to the currently active task slug |
| `.omp-flow/state.json` | OMPFlowWorkspaceState — activeTask, tasks array |
| `src/core/fsm.ts` | RalphFSMEngine — session lifecycle tied to active task |

---

## Task Storage Layout

```
.omp-flow/tasks/
├── .active-task              # Contains the active task slug, e.g. "TASK-001"
├── TASK-001/
│   ├── task.json             # TaskRecord serialized
│   ├── prd.md                # Product requirements doc
│   ├── plan.json             # WavePlan (if decomposed)
│   ├── implement.jsonl       # Context manifest for executors
│   ├── check.jsonl           # Context manifest for reviewers
│   ├── brainstorm.md         # Brainstorming output
│   ├── .task/                # Atomic task definitions
│   │   ├── t-001.json
│   │   └── t-002.json
│   └── .summaries/           # Completion summaries
│       ├── t-001-summary.md
│       └── t-002-summary.md
├── TASK-002/
│   └── ...
└── ARCHIVE/                  # Archived tasks
    └── TASK-000/
```

---

## TaskRecord Interface

Tasks are stored as `TaskRecord` in `src/core/state.ts`:

```typescript
export interface TaskRecord {
  id: string;
  title: string;
  status: 'planning' | 'in_progress' | 'review' | 'completed' | 'archived';
  parent?: string;
  subtasks: string[];
  children: string[];
  relatedFiles: string[];
  createdAt: string;
  completedAt?: string;
  notes: string;
  meta: Record<string, unknown>;       // Free-form metadata
  // Maestro-style unified fields:
  scope?: string;
  devType?: string;
  priority?: string;
  assignee?: string;
  branch?: string;
  baseBranch?: string;
  milestone?: string;
  phase?: string;
}
```

---

## Common Needs

| Scenario | What to Change | Files |
|----------|---------------|-------|
| Add custom metadata to a task | Set fields in `task.json` `meta` object | `.omp-flow/tasks/{id}/task.json` |
| Change active task | Edit `.active-task` file or call `UnifiedWorkspaceManager` | `.omp-flow/tasks/.active-task` |
| Archive a completed task | Move to `.omp-flow/tasks/ARCHIVE/` | `UnifiedWorkspaceManager.archiveTask()` |
| Add a new task status | Add to `TaskRecord.status` union + update lifecycle logic | `state.ts` |
| Change task creation defaults | Modify `createTask()` in `UnifiedWorkspaceManager` | `state.ts` |
| Add phase/milestone tracking | Set `phase` and `milestone` fields on TaskRecord | `task.json` + state.json |
| Mark task completed | Set `status: 'completed'` and `completedAt` | `task.json` |
| Track parent/child tasks | Set `parent` and add to `children` array | Multiple `task.json` files |

---

## Step-by-Step Modification Procedure

### Step 1: Add or Modify Custom Metadata

Edit `task.json` in the task directory:

```json
{
  "id": "TASK-001",
  "title": "Implement user authentication",
  "status": "in_progress",
  "meta": {
    "jira": "PROJ-123",
    "sprint": "S25",
    "risk": "high",
    "reviewer": "alice@example.com"
  },
  "scope": "backend",
  "devType": "feature",
  "priority": "P1",
  "milestone": "M2",
  "phase": "implementation"
}
```

All fields in `meta` are free-form. The type is `Record<string, unknown>` — no schema is enforced at runtime.

---

### Step 2: Change the Active Task

**Method A — Direct file write:**

```bash
echo "TASK-002" > .omp-flow/tasks/.active-task
```

**Method B — Using `UnifiedWorkspaceManager`:**

```typescript
const mgr = new UnifiedWorkspaceManager(workspaceDir);
mgr.setActiveTask('TASK-002');
// Updates .active-task file and state.json
```

**Method C — Via `/omp-flow:init` or equivalent command:**

Invoke a command that accepts a task ID parameter and calls `setActiveTask()`.

---

### Step 3: Archive a Task

The archive flow moves completed tasks to `.omp-flow/tasks/ARCHIVE/`:

**Manual archive:**

```typescript
public archiveTask(taskId: string): void {
  const taskDir = path.join(this.tasksDir, taskId);
  const archiveDir = path.join(this.tasksDir, 'ARCHIVE');
  fs.mkdirSync(archiveDir, { recursive: true });

  // Update status
  const record = this.loadTaskRecord(taskId);
  record.status = 'archived';
  record.completedAt = new Date().toISOString();
  this.saveTaskRecord(taskId, record);

  // Move directory
  fs.renameSync(taskDir, path.join(archiveDir, taskId));

  // Update workspace state
  const state = this.getUnifiedState();
  state.tasks = state.tasks.filter((t) => t !== taskId);
  this.saveState(state);
}
```

**Archive conditions:**
- Task must be in `completed` status
- All child tasks must be completed or already archived
- FSM session for this task should be stopped first

---

### Step 4: Add a New Task Status

1. Add the new status to `TaskRecord.status` union:

```typescript
status: 'planning' | 'in_progress' | 'review' | 'completed' | 'archived' | 'blocked';
```

2. Update lifecycle transitions in `UnifiedWorkspaceManager`:

```typescript
if (record.status === 'blocked') {
  // Skip in advanceNextStep, flag for human attention
}
```

3. Update any validation that enumerates valid statuses.

---

### Step 5: Link Parent/Child Tasks

For task decomposition with subtasks:

**Parent task (`task.json`):**

```json
{
  "id": "TASK-001",
  "title": "Implement user auth",
  "subtasks": ["T-001", "T-002"],
  "children": ["TASK-001-A", "TASK-001-B"]
}
```

**Subtasks use `parent` field:**

```json
{
  "id": "T-001",
  "title": "Implement login endpoint",
  "parent": "TASK-001",
  "status": "completed"
}
```

**Child tasks reference parent:**

```json
{
  "id": "TASK-001-A",
  "title": "OAuth integration",
  "parent": "TASK-001",
  "status": "in_progress"
}
```

The distinction:
- `subtasks` = atomic work units within this task (defined in `.task/` directory)
- `children` = sub-tasks that are full task directories themselves

---

## Task-to-FSM Mapping

The active task determines which FSM session is used:

```
.active-task = "TASK-001"
  → FSM session path: .omp-flow/fsm/ralph-TASK-001/status.json
  → FSM session ID: "ralph-TASK-001"
```

Changing the active task switches the FSM context. A new session is created if none exists for that task ID.

---

## Testing

1. Create a task with custom `meta` fields → inspect `task.json`
2. Set active task → verify `.active-task` file content and `state.json.activeTask`
3. Archive a completed task → verify it moves to `ARCHIVE/` and status changes
4. Verify task status transitions (planning → in_progress → review → completed → archived)
5. Test parent/child linkage by reading `parent` and `children` fields

---

## Checklist

- [ ] `task.json` meta fields set correctly (`Record<string, unknown>`)
- [ ] Active task switched via `.active-task` or `setActiveTask()`
- [ ] Archived task moved to `ARCHIVE/` directory
- [ ] Task status updated to `archived` in metadata
- [ ] All child tasks completed before archiving parent
- [ ] FSM session stopped before task archive (if applicable)
- [ ] New task status added to type union (if applicable)
- [ ] Lifecycle transitions updated for new status
