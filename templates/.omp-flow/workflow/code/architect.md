# Architect: Design a Code Boundary

Use this optional code layout with `omp-flow-design` when a selected synthesis needs a concrete
code interface, data model, or ownership boundary. The Skill, linked decisions, and native
assignment remain authoritative. Reuse the assigned Design/interface output Concept; the headings
below are suggestions, not a mandatory schema or a separate Concept per invocation.

This is design, not implementation. Keep sketches in prose or Concept code blocks. Do not commit
source stubs, placeholder implementations, or an API merely to make the design look executable.
The layout supplies neither automatic sign-off nor permission to bypass human/QbD approval.

## Show callers and data shapes before signatures

1. Ground the problem in existing behavior and rationale first (`how` and `why` when modifying or
   integrating with an existing subsystem). Restate the observable problem, binding requirements,
   non-goals, and concrete consequence from the selected synthesis.
2. Write realistic caller usage first—where the call happens, what inputs exist, what result comes
   back, and which failure the caller handles—then derive the data structures and signatures from
   that usage. Reconcile signatures to caller usage, not the reverse.
3. Prefer a **deep module** (substantial capability and policy hidden behind a small, simple public
   interface) over a **deep call chain** (understanding scattered across pass-through layers). If
   tracing a normal call needs more than three files or one-caller wrappers, flatten the boundary.

## Screen for agent-contributor red flags

Assume the next contributor is an agent that sees only the files it opened, copies the nearest
example, and takes the shortest path that compiles. Design so a change that looks right from one
file is right for the whole repository:

- **Single owner per state:** give each mutable state one writer; if concurrent actors can write,
  eliminate the sharing or isolate per-actor state before reaching for locks.
- **Domain ownership over temporal decomposition:** group code by the domain knowledge and
  invariants it owns rather than splitting `load / validate / transform / save` stages that repeat
  the same representation across files.
- **No information leakage:** parse external/wire/storage formats into domain types at the
  boundary; keep transport and storage schemas out of public interfaces.
- **One way to do one task & derived lists:** never leave two active patterns for the same job or
  two hand-synced lists an agent can update partially; derive secondary lists from one source of
  truth or fail the build when they diverge.
- **Unimportable internals:** keep private helpers unexported so the shortest compiling path is the
  intended boundary.

## Compare material alternatives and name scrap signals

- Compare structurally distinct candidates only when the boundary, data model, or trade-off is open;
  do not manufacture dummy alternatives for a mechanical choice.
- Map observable requirements and invariants to concrete verification checks.
- Name the **scrap / redesign signals** that mean implementation must return to Design rather than
  bolting on point fixes: the same workaround shape appearing repeatedly, types requiring casts or
  always-set optional escape hatches, needing a lock where state was assumed unshared, or callers
  having to know internal rules to use the interface safely.

## Suggested output navigation

Adapt or omit sections as useful:

- **Problem and caller usage:** observable requirements, caller examples, constraints, and non-goals.
- **Data model and deep boundary:** authoritative types, state owner, public signatures, and invariants.
- **Behavior, errors, and cleanup:** normal flow, boundary validation, cancellation, and surviving effects.
- **Trade-offs, verification, and scrap signals:** material alternatives, acceptance checks, and
  design-return triggers for Main.
