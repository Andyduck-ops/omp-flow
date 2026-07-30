---
type: Product Requirements
title: Agent-native task knowledge as an OKF Bundle
description: Replace duplicated task schemas and context transfers with linked semantic documents and a minimal mechanical runtime.
---

# Goal

Make each OmpFlow task a portable, versioned Open Knowledge Format Bundle that humans and agents
can understand by reading normal Markdown and following links. Remove the duplicated schemas,
encoded identifiers, context manifests, and source-copy machinery that currently mediate this
knowledge.

# Problem

The current task scaffold splits one body of knowledge and workflow evidence across authored
Markdown, `task.json`, `tasks.csv`, `evidence.csv`, two JSONL manifests, `context/index.json`,
paired Reference content/metadata files, and custom rendered context. The same event is often
written to several stores. Brainstorming and research are also presented as a one-way sequence
even though evidence must be able to reframe the problem.

This makes the workflow harder to inspect, migrate, version, and change. It also spends tokens
reconstructing relationships that were visible before the knowledge was sliced and projected.

# Required outcomes

## One semantic task Bundle

Each new task MUST be one OKF v0.2 Bundle rooted at the task directory. Its root `index.md` MUST
declare `okf_version: "0.2"` and provide useful navigation. Every non-reserved Markdown Concept
MUST have a non-empty descriptive `type`; its body remains free-form Markdown.

The Bundle MUST be understandable and portable without OmpFlow's Python runtime. Existing useful
names such as `research/`, `reference/`, `context/`, `qbd/`, `prd.md`, and `design.md` MAY remain
when they help navigation; they MUST NOT imply a mandatory tier or schema.

## Semantic navigation

Indexes, headings, prose, lists, relative links, and document placement MUST carry knowledge
relationships. An index is an authored map for progressive disclosure, not a complete manifest or
database.

Agents MUST receive a useful entry document and follow normal links for additional context. The
runtime MUST NOT reconstruct document semantics through regular expressions, fixed headings,
special list syntax, filename grammars, or arbitrary frontmatter fields.

## Connected Explore

Brainstorm and research MUST remain distinct reasoning operations, but MUST be able to alternate
inside one Explore process. Questions, evidence, source provenance, interpretations, and selected
synthesis MUST live in the same linked Bundle without requiring serial copy steps.

External repository clones MUST be treated as an ignored acquisition cache rather than task
knowledge. A task Reference Concept SHOULD link the exact upstream revision and explain its local
meaning. Exact attachments MAY be retained only when a link is insufficient.

## Minimal mechanical runtime

Code MUST own only facts that require mechanical enforcement: active-session identity, safe path
confinement, process/agent identity, locks, atomic external side effects, and native dispatch
receipts. Runtime representation MUST live outside the portable knowledge plane.

Phase meaning, task relationships, work intent, evidence interpretation, and design decisions
MUST NOT be duplicated into a machine-owned task database. A machine record MUST NOT be introduced
merely because the old schema had a field.

## Work and review as Concepts

Work items, implementation handoffs, reviews, gate audits, and human decisions MUST be linked
Concepts. Persistent paths SHOULD be descriptive and MUST NOT be required to encode dependency
IDs such as `A-001` or `C-A001B001--001`.

Authored index ordering and grouping SHOULD express normal waves and parallel work. A stronger
dependency representation MAY be introduced only after demonstrating a real execution case that
cannot be communicated this way.

Independent review and correlation with the implementation being reviewed MUST remain visible.
Native runtime identity MAY supply an opaque dispatch receipt, but that receipt MUST NOT determine
the Concept filename or knowledge organization.

## Versioning and portability

New task Bundles MUST be tracked by normal repository Git so edits have history, attribution, and
diffs. Runtime data and acquisition caches MUST remain ignored. Relative links MUST continue to
work when a Bundle is copied or archived.

Legacy task archives MUST NOT be translated one-for-one or supported by a permanent compatibility
reader. They may remain immutable historical files outside the new runtime contract.

## Direct cutover

New scaffolding and all active consumers MUST switch to the Bundle model together. The committed
result MUST NOT dual-write old JSON/CSV/JSONL stores and new Concepts, or add an OKF facade over the
old system.

Consumer removal MUST precede deletion of the corresponding legacy artifact. Missing new
knowledge MUST fail visibly at its natural entry point; the runtime MUST NOT silently fall back to
legacy files.

# Non-goals

- Defining a closed project taxonomy or typed knowledge graph.
- Building a general Markdown, YAML, link-closure, or OKF conformance validator.
- Parsing authored Markdown into deterministic workflow topology.
- Preserving every field, command, or historical storage format.
- Bulk-rewriting historical task archives.
- Moving temporary task investigation into the durable project Wiki.
- Replacing native Harness process, concurrency, or agent identity management.
- Adding permanent tests for visibly inspectable one-time structure.

# Constraints

- The accepted format anchor is Google Open Knowledge Format v0.2 at
  `knowledge-catalog` commit `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`.
- Unknown Concept types, optional fields, missing indexes, and broken links remain tolerable under
  OKF's best-effort model.
- The design MUST preserve useful outcomes rather than current mechanisms.
- Verification effort MUST be proportional to the failure: semantic structure is reviewed
  directly; retained mechanical guarantees receive focused executable checks.

# Acceptance criteria

1. A newly created task contains a root OKF index and readable Concepts, and does not generate
   `task.json`, `tasks.csv`, `evidence.csv`, `implement.jsonl`, `check.jsonl`,
   `context/index.json`, paired Reference metadata, `.task/`, or `.summaries/`.
2. From the root index, a human or agent can navigate framing, investigation, selected decisions,
   work, and review through ordinary relative links without a generated context package.
3. One real dogfood task alternates brainstorm and research, reaches design, dispatches linked
   work, records an independent linked review, and archives successfully using the new model.
4. The dogfood flow does not depend on fixed Markdown headings, list shapes, encoded filenames, or
   regular-expression extraction.
5. Two work Concepts can be visibly grouped as parallel work in an index without persistent
   topology IDs; implementation and review can still be correlated through the native dispatch
   receipt and linked artifacts.
6. OmpFlow's retained machine state is documented and limited to the mechanical ownership boundary
   in this PRD. No retained field duplicates semantic knowledge.
7. New task Bundle edits appear in normal repository Git history while runtime/session data and
   external clone caches remain ignored.
8. No active Python, Hook, Skill, agent, template, or test consumer requires the retired strong
   task formats after cutover, and no compatibility fallback reads them.
9. Missing entry documents, unsafe paths, invalid session ownership, dispatch failures, and failed
   external side effects stop visibly without manufacturing semantic state.
10. The resulting workflow documentation explains the Bundle entry model and the semantic versus
    mechanical ownership boundary without prescribing a Markdown DSL.
