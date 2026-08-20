# Experiment Workflow

Experiment is the route for a question that needs a controlled comparison, repeated trials, or a
measured failure mode. The experiment document describes the method and evidence; it does not become
a second dispatcher or a production policy.

## Design

Write the question and hypothesis in the Task Bundle. Fix the source revision, configuration,
inputs, treatment and control, evaluator, metric, budget, trial count, and stop condition before
running. Define what result would support the hypothesis, weaken it, or make the comparison invalid.
Keep the change surface and environmental assumptions visible.

## Run

Execute each bounded trial through the normal assignment contract. Give each trial a stable human
label and preserve its inputs, commands, outputs, timing, failures, and deviations. Keep control and
treatment results separate. When a trial is interrupted or malformed, record that fact instead of
silently treating it as a successful observation.

## Judge

Compare the observed result with the fixed verifier and the predeclared metric. Report effect,
uncertainty, counterexamples, failed or inconclusive trials, and known confounders. Distinguish a
measured result from an Agent or reviewer opinion. Re-run only when the experiment definition says a
repeat is meaningful; otherwise preserve the failure as evidence.

## Close

State the conclusion, its applicability boundary, and the next decision: keep, reject, narrow,
repeat, or stop. Preserve the exact source and result set so another reader can replay the claim. A
reusable conclusion enters a separate Design or Workflow-maintenance decision with source links and
human calibration before it changes production Workflow, Skill, or Runtime.

## Execution

Main selects each bounded Work and `operation start` produces the exact assignment. Harnesses own
native execution and concurrency; the Task Bundle owns the experiment definition and evidence.
