---
name: omp-flow-ui-designer
description: 6-phase impeccable UI pipeline — teach, shape, craft, refine, QA, live — with a 5-dimension rubric for pixel-perfect, accessible, performant interfaces.
---

# OMP-Flow UI Designer Skill

A UI designer skill inspired by Maestro's impeccable pipeline: a 6-phase loop (teach → shape → craft → refine → QA → live) guided by a 5-dimension audit rubric with threshold-based quality gating. This skill produces production-grade interfaces that are accessible, performant, visually coherent, responsive, and cleanly authored.

## Trigger

- Activates when task intent contains keywords: "UI", "interface", "design", "component", "layout", "page", "screen", "form", "modal", "dialog", "responsive", "user interface", or "frontend".
- Activates when the orchestrator (`omp-flow`) dispatches a step with `stage: 'ui-design'`.
- Activates on `/omp-flow:design [target]` or `/omp-flow:ui [target]` commands.
- Recommended model tier: `slow` — visual and accessibility assessment benefits from stronger reasoning.

## Inputs

- **Product context**: Brand guidelines, design tokens (colors, typography scale, spacing), user personas, target audience, tone of voice. Injected via `<product-context>` block.
- **Specification**: `.omp-flow/specs/*.md` filtered by UI-relevant rules (UX, visual, layout constraints). Read via `ContextPackageBuilder.readContextManifest`.
- **Wireframe / IA input**: `.omp-flow/tasks/{taskId}/wireframe.md` or wireframe notes from a prior `brainstorm` or `architect` step.
- **Component library reference**: Existing component patterns in the project (glob `src/**/components/**/*.tsx` or equivalent for the stack). Read structural summaries only — never full-file unless a specific pattern is needed.
- **User intent context**: `<prior-step-context>` from `buildPriorContext(status, 5)` — last 5 completed steps with decisions, caveats, and deferred items.
- **Prior-wave designs**: `<wave-context>` from `buildWaveContext(activeWave)` — designs and rubrics from earlier waves for consistency.
- **Boundary contract block**: `<boundary-contract>` with in-scope UI files, out-of-scope areas (e.g. backend, business logic), and constraints.

## 6-Phase Impeccable UI Pipeline

Each phase has a clear entry criterion, process, output, and phase-validation gate. Iteration is internal — never ship unvalidated work to a downstream phase.

### Phase 1: Teach — Absorb Brand & Product Context

**Entry**: Task assigned. Product/brand context available.

**Process**:
1. **Read brand inputs**: Consume brand guidelines, design tokens, tone-of-voice documents. Extract color palette (primary, secondary, accent, neutral, semantic), typography (typeface family, weights, scale steps), spacing grid (4/8/12/16/24/32/48/64 base), border radius scale, shadow elevation tokens, and icon style.
2. **Understand the user**: Identify primary personas, user goals, task flows, and the emotional target (professional, playful, trustworthy, minimal).
3. **Map platform conventions**: Note platform-specific patterns (OS-native controls, responsive breakpoints, input paradigms — keyboard, touch, pointer).
4. **Compile constraints**: Accessibility target (WCAG 2.1 AA/AAA), performance budget (load time, bundle size, layout shift), responsive breakpoints, supported screen sizes, legacy browser support.
5. **Identify patterns**: Search the project for existing UI conventions — component patterns, CSS/utility patterns, common layouts, animation speeds/easings. Register what must NOT be introduced as a second convention.

**Output**: `<product-context-summary>` block with tokens, constraints, and existing pattern references.

**Gate**: Can you articulate the design direction and constraints in one paragraph, referencing specific tokens and personas? If not, re-read inputs.

### Phase 2: Shape — Structure & Wireframe

**Entry**: Product context compiled. Interface structure not yet defined.

**Process**:
1. **Define information architecture**: Inventory content elements (headings, body, data, images, actions, status). Group by priority and user goal. Determine navigation hierarchy (primary, secondary, tertiary) and page-level layout zones (header, sidebar, main, footer, overlays).
2. **Sketch wireframe layout**: Describe the structural layout in text or ASCII — positioning of major zones, content regions, and interactive elements. Avoid visual styling decisions (color, typeface). Use standard layout patterns when they fit (sidebar-nav, stacked-card, dashboard-grid, wizard-stepper, master-detail); avoid inventing a new layout pattern when a standard one works.
3. **Define interaction states**: Map out: default, hover, focus, active, disabled, error, loading, empty, success. For each interactive element, define what changes (color, elevation, cursor, animation).
4. **Responsive behavior**: Define how each zone reflows at breakpoints (typically: mobile <640px, tablet 640-1024px, desktop >1024px). Use a single-column collapse for mobile. Document which elements hide, stack, or become collapsible.
5. **Accessibility structure**: Define semantic HTML structure (`<nav>`, `<main>`, `<article>`, `<aside>`, `<header>`, `<footer>`, `<section>`). Plan heading hierarchy (h1 → h2 → h3, no skips). Plan focus order (tab order matches visual order). Plan ARIA landmarks and labels where native semantics are insufficient.

**Output**: Wireframe/IA document (`wireframe.md`) with zone layout, responsive behavior map, interaction state table, and semantic structure plan.

**Gate**: Can you trace the user's primary and secondary task flows through the wireframe without contradictions? Does the semantic structure pass a screen reader logic check? If not, revise the wireframe.

### Phase 3: Craft — Build the Interface

**Entry**: Wireframe approved. Design tokens and component patterns known.

**Process**:
1. **Implement structure**: Build the semantic HTML/JSX structure first — no styling beyond layout scaffolding. Use native elements, proper heading hierarchy, landmarks. This ensures the interface works (readably) before it looks good.
2. **Apply design foundation**: Apply design tokens as CSS custom properties or theme variables. Set the base layer: background, text color, link color, font-family, base spacing. No element-specific styling yet.
3. **Compose layout**: Apply the zone layout using the project's layout system (CSS Grid, flexbox, or framework primitives). Add responsive reflow rules. Avoid magic numbers — use spacing tokens.
4. **Style components**: Layer on component-level styling: typography scale, spacing, borders, shadows, backgrounds, color fill. Use the project's existing component conventions.
5. **Add interaction states**: Implement hover, focus, active, disabled, and other interaction states. Ensure focus indicators are visible (minimum 2px offset ring, contrast ratio >= 3:1 against adjacent).
6. **Wire up micro-interactions**: Add transition properties for states that change: `transition: background-color 200ms ease, box-shadow 200ms ease, transform 150ms ease`. Use consistent durations (50/100/150/200/300/400/500ms scale). No `all` transitions — be specific.
7. **Integrate real content**: Replace filler/lorem-ipsum with representative content. Verify type scale works with real text lengths. Verify container overflow handling for edge lengths.

**Output**: Built UI components with semantic structure, design tokens, layout, interaction states, and micro-interactions.

**Gate**: Does the built interface match the wireframe structure? Are all interaction states implemented? Do layout and typography match the design tokens? Reject if structure doesn't match wireframe or if any component lacks interaction states.

### Phase 4: Refine — Polish & Elevate

**Entry**: Interface built and structurally complete. Polish pass needed.

**Process**:
1. **Visual balance audit**: Scan for optical alignment issues — elements that are mathematically aligned but look off. Adjust with optical corrections (a centered icon may need 1-2px offset). Check spacing consistency — is the gap between every sibling pair drawn from the spacing scale?
2. **Typography refinement**: Check type rhythm (vertical spacing between headings, paragraphs, lists). Ensure leading (line-height) is relaxed for body text (1.5-1.7) and tight for headings (1.1-1.3). Verify that measure (line-length) is constrained (45-75 characters ideal; max 80ch).
3. **Hierarchy and emphasis**: Check that visual weight matches information hierarchy. Primary actions should be visually dominant; secondary actions should recede (outline, lower contrast, smaller). Text hierarchy should be readable at a glance — the user should find the most important content without scanning.
4. **Color and contrast**: Verify all text meets WCAG AA contrast: body text >= 4.5:1, large text >= 3:1, UI components and graphical objects >= 3:1. Check that semantic colors (error, success, warning, info) are distinct and carry appropriate gravity.
5. **Motion verification**: Check that animations are not too fast (unreadable) or too slow (frustrating). Verify `prefers-reduced-motion` is respected: replace animations with fade transitions or static state. Verify no animation violates vestibular safety (no parallax, no rapid flashing, no large-scale movement).
6. **Empty / error / edge states**: Verify every data-dependent component handles: loading (skeleton/spinner), empty (helpful illustration + message), error (actionable message + retry), and overflow (long text truncation/expansion). These are NOT optional — every dynamic component must render each state.
7. **Typography rhythm pass**:
   ```
   Check: vertical spacing between consecutive elements
     heading → paragraph     = spacing scale step * 1
     paragraph → paragraph   = spacing scale step * 0.5
     paragraph → heading     = spacing scale step * 1.5
     list → paragraph        = spacing scale step * 1
   ```

**Output**: Polished interface with refined visual balance, verified contrast, respectful animation, and complete edge state coverage.

**Gate**: Are all edge states covered (loading, empty, error, overflow)? Does `prefers-reduced-motion` degrade gracefully? Reject if any data component lacks all four state variations or if animations lack a reduced-motion alternative.

### Phase 5: QA — Audit & Critique (5-Dimension Rubric)

**Entry**: Interface built and polished. Ready for formal quality audit.

**Process**:
1. **Run the 5-dimension rubric** (see section below). Score each dimension on a 0-10 scale.
2. **Compute composite score**: Weighted average — accessibility 25%, performance 20%, visual 25%, responsive 15%, code 15%.
3. **Apply quality threshold**:
   - **Pass** (composite >= 8.0): Approve. Optionally note minor improvements for a follow-up wave.
   - **Needs Revision** (composite 5.0-7.9): Return to Phase 4 (Refine) or Phase 3 (Craft) depending on which dimension(s) failed. Provide specific remediation items mapped to rubric dimensions.
   - **Reject** (composite < 5.0 or any single dimension < 4.0): Return to Phase 2 (Shape) or Phase 1 (Teach). Root cause indicates a fundamental misunderstanding of constraints, user needs, or structural approach.
4. **Document audit results**: Write `.omp-flow/tasks/{taskId}/ui-audit.md` with per-dimension scores, evidence, and remediation items.

**Output**: Audit report with per-dimension scores, composite score, quality verdict, and remediation items.

**Gate**: Verdict must be `Pass` to proceed to Phase 6. If `Needs Revision`, all remediation items must be resolved and the rubric re-run before re-entry. If `Reject`, start from the specified phase.

### Phase 6: Live — Interactive Iteration

**Entry**: QA verdict is `Pass`. Interface is ready for real-world validation.

**Process**:
1. **Establish live environment**: Open the interface in a real browser (use `browser` tool with `app` set to a headed Chromium). Navigate through every route/view the task covers.
2. **Interactive check — keyboard navigation**: Tab through every interactive element. Verify: visible focus ring on every element, logical tab order, no focus traps, no skipped tab stops. Verify Escape closes overlays/modals/dialogs. Verify Enter/Space activates buttons and links.
3. **Interactive check — screen reader**: Run the page through a screen reader (aria-snapshot via `browser` tool). Verify: all content is announced, headings are navigable, images have alt text or `role="presentation"` with empty alt for decorative, form elements have associated labels, status messages use `aria-live` regions.
4. **Interactive check — responsive**: Resize the viewport to each breakpoint. Verify: no content overflow, no horizontal scrollbar on the body, touch targets are >= 44x44px on mobile, font sizes are legible (>= 16px to prevent iOS zoom). Verify the layout reflow is correct at each breakpoint.
5. **Interactive check — performance**: Take a performance trace or use `lighthouse` (via the browser) on the production build. Check: no layout thrash, no render-blocking resources, images have explicit dimensions (prevent CLS), no jank during interaction, bundle contains only used code.
6. **Interactive check — error handling**: Trigger error states (network failure, invalid input, missing data). Verify: user-visible error messages, no unhandled console errors, graceful degradation.
7. **Capture screenshots**: Save screenshots of each view and each state at desktop and mobile breakpoints. Attach to the audit report as evidence.
8. **Decide**: 
   - **Ship** — all checks pass with `Pass` verdict. Mark the step as `DONE`.
   - **Iterate** — minor issues found. Return to Phase 4 (Refine) or Phase 3 (Craft) with specific items.
   - **Punt** — issues require a design/UX rethink. Escalate to the orchestrator with a structured summary.

**Output**: Screenshot evidence, live interaction log, final verdict (`Ship` / `Iterate` / `Punt`). If `Ship`, the completed UI with all audit artifacts.

**Gate**: All interactive checks pass. No console errors. Screen reader announces all content. No layout breakage at any breakpoint. Reject if any check fails with a `critical` severity.

## 5-Dimension Audit Rubric

Each dimension is scored 0-10. The composite score weights dimensions to reflect their relative impact on user experience.

### Dimension 1: Accessibility (weight 25%)

| Criteria | 0-3 Fail | 4-6 Needs Work | 7-9 Good | 10 Excellent |
|---|---|---|---|---|
| Semantic HTML | Div soup, no landmarks | Mixed semantics, some `<div>` for interactive | Semantic elements used throughout | Perfect semantic structure + ARIA augmentation |
| Color contrast | Any body text < 3:1 | Most >= 3:1, some body < 4.5:1 | Body >= 4.5:1, large >= 3:1 | All text >= 4.5:1, UI elements >= 3:1, enhanced for AAA targets |
| Keyboard navigation | Not navigable by keyboard | Partially navigable, some traps | Full tab order, visible focus indicators | Full keyboard support + skip links + logical tab order + focus management |
| Screen reader | Unlabeled elements, no alt text | Some labels, partial alt text | All interactive labeled, meaningful alt | ARIA live regions, status announcements, full a11y tree |
| Reduced motion | No `prefers-reduced-motion` support | Some animations degrade, some don't | All animations degrade gracefully | Respects reduced motion, vestibular-safe |

### Dimension 2: Performance (weight 20%)

| Criteria | 0-3 Fail | 4-6 Needs Work | 7-9 Good | 10 Excellent |
|---|---|---|---|---|
| Layout (CLS) | Layout shift > 0.25 | CLS 0.1-0.25 | CLS < 0.1 | CLS < 0.05, explicit dimensions on all media |
| Interaction (INP) | INP > 500ms | INP 200-500ms | INP < 200ms | INP < 100ms, input debounced/throttled |
| Load (LCP) | LCP > 4s | LCP 2.5-4s | LCP < 2.5s | LCP < 1.8s, lazy loading, critical CSS inline |
| Bundle | No code splitting | Some split, large chunks | Good code splitting, tree-shaking | Tiny critical bundle, route-based splitting, dynamic imports |
| Rendering | Unnecessary re-renders, layout thrash | Some optimization | Proper memoization, stable keys | Predictable renders, CSS containment, GPU-accelerated layers |

### Dimension 3: Visual Design (weight 25%)

| Criteria | 0-3 Fail | 4-6 Needs Work | 7-9 Good | 10 Excellent |
|---|---|---|---|---|
| Consistency | No design system, random values | Some tokens, inconsistent application | Design tokens used consistently | Systematic, every value from token scale |
| Typography | Wrong typefaces, no rhythm | Mixed type scales, decent pairings | Proper type scale, good rhythm (+/- 4px) | Perfect rhythm, readable measure (45-75ch), typographic hierarchy |
| Spacing & alignment | Uneven spacing, misaligned | Mostly aligned, some inconsistency | Consistent spacing scale, optical alignment | Perfect optical alignment, generous breathing room |
| Hierarchy | Flat, no information priority | Some hierarchy, visually noisy | Clear hierarchy, visual weight matches content | Effortless scanning, primary action immediately obvious |
| Polish | No micro-interactions, flat | Basic transitions, no personality | Smooth micro-interactions, character | Delightful details, cohesive voice, meaningful animation |

### Dimension 4: Responsive (weight 15%)

| Criteria | 0-3 Fail | 4-6 Needs Work | 7-9 Good | 10 Excellent |
|---|---|---|---|---|
| Reflow | Breaks on most screens | Correct at some breakpoints | Correct at all defined breakpoints | Fluid across ALL widths, no breakpoint gaps |
| Touch targets | Targets < 44px, too close together | Mostly >= 44px, some overlap | All >= 44px, 8px minimum gaps | Comfortable targets, thumb-zone aware placement |
| Content overflow | Horizontal scroll, clipped text | Occasional overflow | No overflow at any breakpoint | Smart overflow handling (scrolling tables, truncated with ellipsis) |
| Font scaling | Fixed px values block zoom | Some relative units | All font sizes in relative units (`rem`) | Fluid type (`clamp()`), no text truncation at any size |
| Navigation | Unusable navigation on mobile | Mobile nav works but feels cramped | Responsive nav (hamburger/tabs/sidebar adapts) | Touch-optimized nav, reachable menus, bottom bars |

### Dimension 5: Code Quality (weight 15%)

| Criteria | 0-3 Fail | 4-6 Needs Work | 7-9 Good | 10 Excellent |
|---|---|---|---|---|
| Maintainability | No reuse, 500+ line files | Some reuse, messy organization | Small focused components, clear naming | Composable, single-responsibility, self-documenting |
| CSS/Style architecture | Inline styles, `!important` | Some structure, some overrides | Systematic CSS/CSS-in-JS, utility composition | Zero specificity issues, dead-code-free, consistent conventions |
| State handling | No loading/error/empty states | Some states covered | All states covered (loading, empty, error, success, overflow) | Predictable state machines, error boundaries, graceful degradation |
| Error boundaries | Uncaught exceptions crash UI | Try/catch around some effects | Error boundaries at route level | Error boundaries with fallback UI, recovery action, monitoring hooks |
| Accessibility in code | No ARIA, no semantic HTML | Some ARIA, some HTML | Proper ARIA + semantic HTML + focus management | Screen-reader-optimized code, a11y test coverage |

## Quality Gate Thresholds

The quality gate is enforced at the end of Phase 5 (QA). The reviewer computes the weighted composite score and applies the threshold:

```
composite = (a11y_score * 0.25) + (perf_score * 0.20) + (visual_score * 0.25) + (responsive_score * 0.15) + (code_score * 0.15)
```

| Verdict | Composite | Single-Dimension Floor | Action |
|---|---|---|---|
| **Pass** | >= 8.0 | All >= 5.0 | Approve and proceed to Phase 6 (Live) |
| **Needs Revision** | 5.0-7.9 | All >= 4.0 | Return to Phase 4 (Refine); provide dimension-specific remediation |
| **Reject** | < 5.0 | Any < 4.0 | Return to Phase 2 (Shape) or Phase 1 (Teach); fundamental failure |

If a single dimension scores below 4.0, the composite is overridden to **Reject** regardless of other scores — a catastrophic failure in one area invalidates the whole design.

### Remediation Mapping

When a dimension fails, map to the correct phase:

| Failing Dimension | Return to Phase | Focus |
|---|---|---|
| Accessibility | Phase 4 | Contrast re-audit, keyboard pass, ARIA review |
| Performance | Phase 3 | Bundle audit, lazy loading, dimension locking |
| Visual Design | Phase 4 | Typography pass, spacing audit, micro-interactions |
| Responsive | Phase 3 | Media query audit, touch targets, fluid type |
| Code Quality | Phase 3 | Refactor components, add state coverage, error boundaries |

## Outputs

- **Built UI**: Source code in the project's component files, within `boundary.in_scope`.
- **Wireframe/IA**: `.omp-flow/tasks/{taskId}/wireframe.md` — structural layout, interaction states, responsive behavior, semantic structure plan.
- **Product context summary**: `<product-context-summary>` — design tokens, constraints, existing patterns.
- **QA audit report**: `.omp-flow/tasks/{taskId}/ui-audit.md` — per-dimension scores, evidence, remediation items, quality verdict.
- **Screenshots**: Evidence screenshots from the Live phase at multiple breakpoints.
- **Discoveries**: `discoveries.ndjson` entries for patterns, gotchas, and UI conventions discovered during implementation.
- **Return format**: Structured JSON `{ phase: string, filesCreated: string[], filesModified: string[], audit: { scores: { a11y, perf, visual, responsive, code }, composite: number, verdict: string }, decisions: string[], caveats: string[], deferred: string[], screenshots: string[] }`.

## Boundary Contract

- **In-scope**: UI source files matching `boundary.in_scope` glob patterns (component files, style files, CSS/SCSS/CSS-in-JS modules). The task's scratch directory for design artifacts. `.omp-flow/tasks/{taskId}/` for wireframe and audit documents.
- **Out-of-scope**: Backend business logic, database schemas, API route handlers, authentication logic, state management stores (unless the UI needs visual state wiring), test files. Existing design tokens and theme files — read-only unless the task spec explicitly includes theme modification.
- **Forbidden**: Introducing new CSS values outside the established token system — every radius, spacing, color, shadow, and font-size MUST come from the project's token scale. Modifying design tokens without explicit spec rule permission. Writing inline styles as a shortcut. Creating a second component pattern when one already exists in the project.

## FSM Integration

- Primary state: `S_DISPATCH` (execution stage) during Craft, Refine phases.
- Planning/design phases: `S_PLANNING` or routed via `S_DECISION_EVAL` for wireframe approval gating.
- QA phase routes through `S_DECISION_EVAL` at quality gate: verdict `pass` → proceed to Phase 6; `needs_revision` → return to Craft or Refine; `reject` → escalate with structured failure report.
- Cross-wave propagation: UI patterns and decisions are written to `discoveries.ndjson` for downstream waves (e.g., a harvest wave codifies UI patterns into spec rules).
- Model tier: `slow` for design/QA work; `default` for craft/implementation.

## Coordination

- **IRC**: Coordinate with `omp-flow-executor` siblings sharing component files. Message before modifying shared UI modules. Coordinate with `omp-flow-architect` when the wireframe reveals structural questions.
- **Discoveries**: Write UI patterns (`.class_name` conventions, color usage gotchas, responsive breakpoint behaviors) as `pattern` entries in `discoveries.ndjson` for downstream consumers.
- **Cross-wave**: A finished design wave produces `implementation_note` discoveries consumed by subsequent waves for consistency.
- **Spec rules**: When the audit reveals a missing project convention (e.g., "no consistent focus ring style"), propose a spec rule update via the `omp-flow-harvester` channel rather than patching ad-hoc.
