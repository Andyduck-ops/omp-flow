# Lite Workflow

Lite is the short path for a local, reversible change whose intended behavior and verifier are
already known. It keeps the Task Bundle, assignment, and evidence contract while reducing the amount
of framing and review needed for a small change.

## Route cues

- **Use when:** the change is local and reversible, has a known verifier, and has a small decision
  surface.
- **Do not use when:** it changes a public contract, identity/authorization, persistent data,
  architecture, release behavior, or an irreversible effect; choose Full Delivery instead.
- **Entry evidence:** Task `index.md` identifies the affected surface, consequence, output boundary,
  and focused verifier. Read Wiki topics only when the change touches durable project knowledge.
- **Expected output:** the bounded change, verifier evidence, and a linked handoff; add independent
  Review when the consequence or acceptance contract warrants it.
- **Verifier and approval:** the named focused verifier must run and its result is recorded; a green
  test or operation receipt is not human approval.
- **Return/escalation:** a repeated failure or widened consequence returns to Research/Design or
  escalates to Full Delivery rather than shortening the process further.

## Method

1. **Open the Task.** Reuse the existing Bundle or create a new one with `task create`, then read
   `workflow/index.md` and this document.
2. **Frame the work.** Record the objective, affected surface, output boundary, done condition, and
   focused verifier in the Task Bundle. Note the one consequence that would make Lite inappropriate.
3. **Inspect the baseline.** Read the relevant code and nearby tests or usage. Reproduce the current
   behavior when the change fixes a bug. Keep the change local and understandable.
4. **Make the smallest change.** Preserve existing interfaces and conventions. Remove temporary
   debugging or experiment residue before verification.
5. **Verify the contract.** Run the focused verifier and exercise the changed path. Check the
   boundary cases named in the Work Concept. Record command, result, and any remaining limitation.
6. **Hand off.** Write a linked handoff with changed files, evidence, and caveats. Use an independent
   Review when the surface, consequence, or acceptance contract warrants another actor.

## Choose another path

Use Research when the goal or evidence is unclear. Use Full Delivery when the change affects a public
contract, identity or authorization boundary, persistent data, architecture, or an irreversible
operation. A repeated failed verifier is evidence that the work needs a design decision, not a reason
to keep shortening the process.

## Execution

Main selects the bounded Work and `operation start` produces its exact assignment. The Harness owns
native execution, concurrency, progress, cancellation, and actor identity; the Work and handoff own
the meaning and evidence.
