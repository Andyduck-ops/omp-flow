---
name: omp-flow-adr
description: Use when work, a Task Bundle, a Review, or an archived Task holds an intent decision — an architectural choice or a small non-obvious design idea — whose reasoning would be expensive to rediscover, or when an existing decision record needs revision or supersession.
---

# OMP-Flow ADR

ADR here means Any Decision Record, as in MADR (Markdown Any Decision Records): the durable why
behind how something is shaped. Records live in `.omp-flow/wiki/decisions/`. This Skill contains
procedure only; decisions belong in the Wiki.

## What deserves a record

Record a decision when its reasoning would be lost without it: a choice among real alternatives,
an obvious approach that was rejected, a constraint, or a small design idea that a future agent
would otherwise "simplify" back into a defect. Size does not matter; rediscovery cost does. Ask:
if someone removed this tomorrow, would they know why it was there? A rejected idea also deserves
a record, so it is not proposed again without new evidence.

Do not record restated code, Task progress, or an unconfirmed hypothesis.

## Placement

```text
.omp-flow/wiki/decisions/<context>--<question>--<YYYY-MM-DD>.md
```

`<context>` is the domain or bounded context and `<question>` is the stable problem the decision
answers, both in kebab-case. The date comes last, so every record that has answered the same
question sorts together. Do not number records; parallel branches would collide on the next
number. Reuse an existing context and question name before inventing a new one.

## Record

Write one decision per record. The four sections below are required, and each may be a single
sentence. For a small decision, write in the spirit of a Y-Statement: in the context of <situation>,
facing <concern>, we chose <option> over <alternatives> to achieve <benefit>, accepting <cost>.

```markdown
---
type: "ADR"
title: "<question>: <choice>"
description: "<one sentence: under which constraint we chose what>"
tags: ["<context>", "<keyword>"]
status: "proposed"
date: "YYYY-MM-DD"
---

# <question>: <choice>

## Context and Problem Statement

## Considered Options

## Decision Outcome

Chosen option: "<option>", because <reason>.

## Confirmation

<The test, gate, or review that shows the decision still holds; write "none — relies on review"
when no mechanical check exists.>
```

The filename date is when the question was answered; frontmatter `date` is when the record last
changed. Add Decision Drivers, Consequences (`Good, because …` / `Bad, because …`), Pros and Cons of the
Options, and More Information only when they carry information. Link source Concepts with ordinary
relative links.

Template source: MADR 4.0.0 `template/adr-template-minimal.md` and `template/adr-template.md`
(https://github.com/adr/madr, revision `ba75bb1b20d42af5746b246ad348c202419ae681`), with
Confirmation promoted to required.

## Status

- `proposed` — written down, not yet settled.
- `accepted` — settled, with the basis linked in More Information. An agent may accept a decision
  itself when the consequence is reversible and the record links evidence that settles it: an
  industry standard, repository evidence, or an independent Review that passed. A human must
  confirm, through a linked record such as a QbD decision, a recorded chat instruction, or a Finish
  confirmation, when the decision is high-risk (public contract, identity or authorization,
  persistent data, release, or an irreversible effect), when the evidence leaves a real choice
  between options or rests on a value judgment, or when it overturns a human-confirmed record.
- `rejected` — the option was considered and declined; keep the reasoning.
- `superseded` — a newer record for the same question replaces it. Link both records to each
  other. Do not rewrite the reasoning of an accepted record; supersede it. Fixing typos and links
  is fine.
- `deprecated` — the question itself no longer matters.

## Extract from a Task

Read the Bundle for decisions: brainstorm reframing, rejected design alternatives, QbD and human
decisions, handoff `Decision:` lines, and Review findings that changed direction. For each one,
list the existing records for that context and question first. Then revise a proposed record,
supersede an accepted record, or create a new one, and link back to the source Concepts. The same
procedure backfills archived Tasks and Sleep Candidates; apply the same acceptance rule to them, and
present only the records that need a human, as one batch.

After writing, run `python3 -X utf8 .omp-flow/scripts/omp_flow.py index wiki`.

## Red Flags

- A record is `accepted` without a linked basis, or an agent accepts a high-risk or value-laden
  decision itself.
- Two records answer the same question without a supersession link.
- A record copies the Task narrative instead of stating the decision and why.
- A superseded record is moved to the archive; it stays in place, because the chain is the history.
