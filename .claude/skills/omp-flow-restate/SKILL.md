---
name: omp-flow-restate
description: Use when a request is non-trivial or open to more than one reading, when the human corrects your understanding, when work resumes after a gap, or before you commit to a direction, to restate in your own words the purpose, end state, and limits of what the human wants.
---

# OMP-Flow Restate

Restate the human's intent in your own words so the human can check it before work starts. This is
the receiver-led check used in teach-back (healthcare) and readback/hearback (aviation), applied to
meaning rather than wording: a model does not mis-copy words, so repeating them proves nothing,
while restating the intent exposes a misreading. The restatement aligns; it does not ask permission.

## How much

Build shared understanding only as far as the task needs (grounding, Clark and Brennan 1991). Skip
the restatement for a simple, unambiguous request. Keep it short for ordinary work, and make it
complete before work that is costly to redo.

## Look first

Read the request, the material it points to, the repository, and any Task or Wiki Concept that bears
on it. Restate what you understand after looking, and do not ask what the material already answers.

## What to restate

Use the three parts of commander's intent (US joint planning doctrine, JP 5-0), in the human's
language:

- **Purpose:** what the human wants to achieve, and why.
- **End state:** what "done" looks like.
- **Limits:** what must not happen, or how much risk is acceptable.

Put the most likely misreading and your guesses first, and mark each guess as a guess. Add a fact
you found only when it changes the purpose, the end state, or the limits, and say plainly when it
conflicts with what the human asked for. Then say what you will do next.

Ask at most one question, and only when its answer changes the work; say what it would change.
Agents that may ask about an underspecified task do markedly better, and failing to ask is a
recurring cause of multi-agent failure.

## Use standard terms

Follow the term rule in the `omp-flow` router Skill. In a restatement, when the human uses another
word for a concept, map it in one sentence, such as "what you call X is Y here", instead of
correcting them. This is the preferred-term mapping of ISO 25964 and W3C SKOS.

## Then continue

When there is no open question, continue with the work in the same message. When there is one, state
the assumption you will work on and continue; stop for the answer only when a wrong assumption would
waste real work. When the human corrects the purpose, end state, or limits and a Task exists, update
its framing Concept, because chat does not survive compaction.

## Red Flags

- The restatement repeats the request word for word instead of interpreting it.
- It asks several questions, or one that the material already answers.
- It agrees with the request while a fact it found contradicts the request.
- It waits for approval when nothing is open.
- It uses a mnemonic or field label the human does not know, such as SBAR.
- It grows into a plan or design document.
