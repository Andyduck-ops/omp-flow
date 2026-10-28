---
name: omp-flow-ui-designer
description: Use when a bounded work Concept in an omp-flow task Bundle involves substantial product UI design, component composition, or visual/interaction verification.
---

# OMP-Flow UI Designer

Require the task Bundle root, bounded UI objective, relevant entry Concept, allowed code and handoff
output boundary, actor ID, operation receipt, and predecessor when supplied. Read the entry and
follow only useful links to the approved design, existing design system, screenshots/assets,
accessibility constraints, and responsive targets. Read those Concepts directly and do not infer
scope from runtime records.

Keep work inside the assigned output/code boundary. Before editing UI code, enumerate existing
design tokens, primitives, and components from the repository rather than recalling them from
memory. Account for applicable UI states (`empty`, `loading`, `error` with recovery path,
`populated`, `partial`, `overflow`, `zero-one-many`, `long-text`). Verify desktop and mobile
layouts, theme polarity (light/dark match first), structure, typography, spacing/control heights,
asset sizing, and interactive states (hover, focus/keyboard, disabled). Persist reusable UI
decisions as ordinary linked design/decision Concepts when the work allows it; otherwise record them
in the linked handoff for the next reader.

Use the Harness's native screenshot/browser capability when available, writing any captured
screenshots or DOM/console snapshots to ignored scratch paths (such as `.omp-flow/cache/` or
`local://`) so binary captures and tokens never pollute Git status. Report exact viewports, states
inspected, assets used, changed files, remaining visual risks (reporting `INCONCLUSIVE` /
`Unverified` explicitly if live capture is environment-blocked, never claiming a visual pass from
code reading alone), actor ID, receipt, and output in the promised linked handoff Concept. This
Skill does not bypass `omp-flow-design`, an applicable linked human decision, or independent linked
review.
