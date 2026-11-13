---
name: omp-flow-ui-designer
description: Use when work creates or changes how a product UI looks — a new screen or component, a restyle, or a visual identity — to choose a direction from real content and references, fix it as tokens, and verify it from screenshots.
---

# OMP-Flow UI Designer

Design the way a working designer does: start from the product's real content and references,
choose one direction, fix it as tokens, build, and judge screenshots against the objective. Styles
go out of date; this method does not. The generic "AI look" is not a style to ban but the default a
model falls back to wherever the brief leaves a choice open, so close every open choice with a
reason taken from the subject.

When dispatched, stay within the assignment's Bundle root, entry Concept, output boundary, and
operation receipt; the role Skill holds the assignment rules.

## 1. Read what already decides

Read the existing design system, tokens, components, brand, screenshots, Wiki decisions, and the
real content the screen will show. Enumerate tokens and components from the repository, not from
memory. When they already fix the direction, follow them and go to step 4.

## 2. Frame

State the subject, the audience, the job the screen does, and 4–5 adjectives for how it should
feel. Take them from the brief. When the brief does not state them, confirm them in the step 3
message if there is one; otherwise infer them and record a `Decision:`.

## 3. Choose a direction only when it is open

When the work sets or changes a visual identity and nothing in step 1 fixes it, make 3 direction
tiles (2 when the space is narrow): palette with roles, type roles, and a few components on real
content, without full layouts. Each tile names its references and adjectives. Send them in one
message with your recommendation; the human may combine palette and type across tiles. A
dispatched agent puts the tiles in its handoff and returns `NEEDS_CONTEXT`, and Main asks. Comparing
alternatives gives better results and more honest critique than refining one, and no evidence
shows an agent escapes its default look alone. In every other case decide yourself and record
`Decision: <choice> — <rationale> — <consequence if wrong>` in the handoff.

## 4. Fix the direction as tokens

Before UI code, name every value:

- **Color:** each role paired with the color of text on it; one dominant color and a small accent;
  steps built by lightness in a perceptual space such as OKLCH; contrast at least 4.5:1 for text and
  3:1 for large text and UI components (WCAG 2.2); when the product has light and dark themes,
  design both together.
- **Type:** sizes from one ratio scale; body lines at most about 80 characters (40 for CJK) with line
  height at least 1.5.
- **Spacing:** a small fixed set of multiples.

Then ask: would a similar brief produce the same tokens? If so, the choice came from the default,
not the subject; revise it with a reason from the content or references. Keep boldness to one
element.

## 5. Build

Use existing primitives. Cover the states that apply: empty, loading, error with a recovery path,
populated, partial, overflow, long text, and zero/one/many; hover, keyboard focus, and disabled;
desktop and mobile.

## 6. Critique from screenshots

Capture screenshots with the Harness browser or screenshot tool into ignored scratch paths. Judge
them against the job, the adjectives, and the tokens, not taste; fix and capture again. Without a
live capture report `Unverified`: reading code is never a visual pass.

## 7. Hand off

Record the direction, tokens, viewports and states inspected, and remaining visual risks in the
linked handoff; keep reusable decisions as design or decision Concepts. Independent review still
applies.

## Red Flags

- A value appears in code without a token or a reason.
- The style was chosen before the content and references were read.
- The human is asked about style when the brief, brand, or design system already decides it.
- A ban list of styles replaces the "similar brief, same result?" check.
- A visual pass is claimed without a screenshot.
