# How To: Add Spec Category

Add a new spec category (e.g., `api-design`, `database`) with spec entry types and XML injection format.

**Platform**: OMP native (all platforms)

---

## Files to Read First

| File | Purpose |
|------|---------|
| `src/core/context-package.ts` | `SpecLayer`, `SpecCategory` type unions; `SpecEntry` interface; `ContextPackage.specLayers`/`specCategories` |
| `.omp-flow/specs/index.md` | Existing spec directory index |
| `.omp-flow/specs/{category}/*.md` | Example spec files by category |
| `.omp-flow/tasks/*/implement.jsonl` | Context manifests referencing spec files |

---

## Spec Architecture

### SpecLayer

Specs are organized by scope layer in `SpecLayer` (from `context-package.ts`):

```typescript
export type SpecLayer = 'project' | 'global' | 'team' | 'personal';
```

| Layer | Scope | Example |
|-------|-------|---------|
| `project` | This project only | `my-project-coding-conventions.md` |
| `global` | All projects in the org | `org-security-policy.md` |
| `team` | This team's conventions | `team-api-design.md` |
| `personal` | Individual preference | `my-editor-settings.md` |

### SpecCategory

Current categories in `SpecCategory` (from `context-package.ts`):

```typescript
export type SpecCategory =
  | 'coding-conventions'
  | 'architecture'
  | 'error-handling'
  | 'testing'
  | 'performance'
  | 'security'
  | 'ui-ux'
  | 'documentation';
```

### SpecEntry

```typescript
export interface SpecEntry {
  category: SpecCategory;
  scope: SpecLayer;
  content: string;
}
```

### ContextPackage Spec Fields

Spec entries are loaded into `ContextPackage`:

```typescript
interface ContextPackage {
  specRules: string[];                           // Flat list of spec file paths
  specLayers: Record<SpecLayer, string[]>;       // Grouped by layer
  specCategories: Record<SpecCategory, string[]>; // Grouped by category
  // ...
}
```

---

## Common Needs

| Scenario | What to Change | Files |
|----------|---------------|-------|
| Add a new spec category | Add to `SpecCategory` union + create spec files | `context-package.ts`, `.omp-flow/specs/{category}/` |
| Add spec files to an existing category | Create `.md` files in the category directory | `.omp-flow/specs/{category}/*.md` |
| Add a spec to the context manifest | Add JSONL entry to `implement.jsonl` or `check.jsonl` | `.omp-flow/tasks/*/{implement,check}.jsonl` |
| Change spec layer for a file | Set `scope` field in SpecEntry or file header | `.omp-flow/specs/*.md` |
| Remove a spec category | Delete from `SpecCategory` union + archive spec dir | `context-package.ts`, `.omp-flow/specs/{category}/` |

---

## Step-by-Step Modification Procedure

### Step 1: Add the New Category Type

Add the new category name to the `SpecCategory` union in `src/core/context-package.ts`:

```typescript
export type SpecCategory =
  | 'coding-conventions'
  | 'architecture'
  | 'error-handling'
  | 'testing'
  | 'performance'
  | 'security'
  | 'ui-ux'
  | 'documentation'
  | 'api-design';  // NEW
```

### Step 2: Create the Spec Directory and Index

```bash
mkdir -p .omp-flow/specs/api-design
```

Create `.omp-flow/specs/api-design/index.md`:

```markdown
# API Design Specifications

Guidelines for REST and GraphQL API design.

## Quick Reference

| Topic | Guideline |
|-------|-----------|
| URL structure | `/api/v1/{resource}` |
| Authentication | Bearer JWT tokens |
| Error format | RFC 7807 Problem Details |

## Specification Files

1. [URL Conventions](./url-conventions.md)
2. [Authentication](./authentication.md)
3. [Error Responses](./error-responses.md)

## Key Principles

- Consistency over convenience
- Versioned endpoints
- Idempotent mutation operations
```

### Step 3: Create Spec Files

Each spec file follows a standard pattern:

```markdown
# URL Conventions

## Overview

API URL structure and naming conventions.

## Guidelines

### 1. Use Plural Resource Names

**Do:**
```
GET /api/v1/users
POST /api/v1/users
```

**Don't:**
```
GET /api/v1/user
POST /api/v1/user
```

### 2. Version in URL Path

Always prefix with `/api/v{major-version}`:

```
GET /api/v1/users/123
```

## Related Specs

- [Authentication](./authentication.md)
- [Error Responses](./error-responses.md)
```

### Step 4: Add Specs to Context Manifests

Add entries to the relevant JSONL manifest files:

**`implement.jsonl` (for executor agents):**

```jsonl
{"file": ".omp-flow/specs/api-design/index.md", "reason": "API design guidelines"}
{"file": ".omp-flow/specs/api-design/url-conventions.md", "reason": "URL structure conventions"}
```

**`check.jsonl` (for reviewer agents):**

```jsonl
{"file": ".omp-flow/specs/api-design/index.md", "reason": "API design review checklist"}
```

### Step 5: Verify Spec Injection

The `ContextPackageBuilder` processes spec files when building a package. Verify:

1. Run `packageBuilder.buildPackage(taskId, role)` and inspect `pkg.specCategories`
2. Confirm the new category appears in the record: `pkg.specCategories['api-design']`
3. Confirm spec files are listed under the new category key

---

## `<spec-entry>` XML Format

When specs are injected into agent prompts, they appear as XML blocks:

```xml
<spec-entry category="api-design" layer="project">
## URL Conventions

### 1. Use Plural Resource Names

**Do:**
GET /api/v1/users

**Don't:**
GET /api/v1/user
</spec-entry>
```

Each spec file becomes a `<spec-entry>` with:
- `category` — the SpecCategory identifier (kebab-case)
- `layer` — the SpecLayer (project, global, team, personal)
- Content — the markdown body of the spec file

---

## Spec File Best Practices

### Structure

```markdown
# [Spec Title]

## Overview
Brief description.

## Guidelines

### 1. [Guideline Name]
Explanation with do/don't examples.

## Related Specs
- [Related Category](./related-file.md)
```

### Naming

- Use kebab-case: `url-conventions.md` not `urlConventions.md`
- Be descriptive: `error-responses.md` not `errors.md`

### Cross-References

Link between specs within a category and across categories:

```markdown
See [URL Conventions](./url-conventions.md) for URL structure rules.
See [Authentication](../security/authentication.md) for auth patterns.
```

---

## Testing

1. Add new spec files and verify index links work
2. Build a ContextPackage and inspect `specCategories` record
3. Run a subagent with the new specs in the manifest
4. Verify `<spec-entry>` XML blocks appear in the agent prompt
5. Verify cross-category references resolve correctly

---

## Checklist

- [ ] New `SpecCategory` added to the type union in `context-package.ts`
- [ ] Spec directory created under `.omp-flow/specs/{category}/`
- [ ] `index.md` created with overview and file listing
- [ ] Individual spec files created with proper format (do/don't examples)
- [ ] JSONL manifests updated (`implement.jsonl` and/or `check.jsonl`)
- [ ] TypeScript compiles without errors
- [ ] `ContextPackage.specCategories` record includes the new category
- [ ] Spec files follow naming conventions (kebab-case)
- [ ] Cross-references verified
