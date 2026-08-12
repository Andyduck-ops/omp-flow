---
name: omp-flow-sleep
description: Consolidate one exact archived OKF Task into reviewable cross-task knowledge candidates after Finish, without machine clustering or direct Wiki promotion.
---

# OMP-Flow Sleep

Use this Skill only with a complete assignment whose first non-blank line is an exact
`{"ompFlowSleep":{...}}` descriptor produced by `.omp-flow/scripts/omp_flow.py sleep start`.
Do not reconstruct, summarize, or guess a descriptor from an archived path.

## Descriptor contract

Require `version`, `sourceReceipt`, `sourceTask`, `sourceCommit`, `sourceTree`, `entry`,
`sleepIndex`, `runOutput`, `candidateRoot`, `actorId`, `receipt`, and `harvesterRevision`.
Require `version` exactly `1`, the assignment actor to match `actorId`, and every supplied path to
remain within the repository. Treat `sourceReceipt`, `sourceCommit`, `sourceTree`, `receipt`, and
`harvesterRevision` as opaque mechanical identity, not semantic evidence.

## Method

1. Read the archived Task `entry` and follow only the Task Concepts needed to understand accepted
   outcomes, independent Review, verification, repeated findings, counterexamples, and expensive
   reasoning. Do not read raw Harness transcripts.
2. Read `sleepIndex`. Use authored links, ordinary filenames, repository text search, and direct
   understanding of the smallest relevant Candidate/Wiki topics. Do not use embedding, vector
   retrieval, similarity thresholds, automatic taxonomy, a knowledge graph, or a fixed evidence
   schema.
3. Decide whether the Task supports zero, one, or several durable candidates. A Task-local fact,
   unverified explanation, generic lesson, or restatement of the Task is a valid zero-candidate
   result.
4. For each useful topic, revise an existing Markdown Candidate beneath `candidateRoot` or create a
   self-contained one. Preserve ordinary links to the source Task and distinguish supporting
   evidence, contrary evidence, applicability boundaries, unresolved questions, and possible Wiki
   or Skill consequences. Never average a conflict into false consensus.
5. Write one OKF Run handoff at the exact `runOutput`. State what was read, which Candidates were
   created or revised, why other observations were not promoted, and what review or experiment is
   still required. This handoff is authored knowledge; runtime state remains under `.runtime`.
6. Finish the mechanical run with:

   ```text
   python -X utf8 .omp-flow/scripts/omp_flow.py sleep finish <receipt> \
     --state completed --actor-id <actorId> [--candidate <path-relative-to-candidateRoot> ...]
   ```

   Zero `--candidate` arguments is valid. On failure, call `sleep finish` with `--state failed` and
   report the exact blocker; do not manufacture a Candidate or completion claim.

## Promotion boundary

Sleep ends with reviewable Candidates, not Wiki authority. Do not edit `.omp-flow/wiki/`, Harness
Skills, or workflow policy from this assignment. A different actor should independently challenge
material Candidates. Facts may use proportional Wiki Review; architecture, methodology, or Agent
behavior changes require a new Task framing and the applicable Research, Design, QbD, paired
benchmark, and human decision. An Agent or Reviewer `PASS` is not human approval.

## Red flags

- Do not accept an archived path without the runtime-produced source receipt and Git checkpoint.
- Do not force one Candidate per Task or duplicate one Candidate per Run.
- Do not parse authored Markdown into lifecycle state or mandatory fields.
- Do not claim source stability after the runtime reports source drift.
- Do not auto-adopt, auto-merge, auto-promote, or silently overwrite concurrent Candidate work.
