---
type: Working Philosophy
title: Semantic knowledge, mechanical control
description: Let documents and links carry meaning, let agents interpret it, and reserve code for irreducible mechanical guarantees.
---

# Rich documents are an architecture

Markdown is not merely an inconvenient serialization format. Headings, prose, lists, document
placement, and links form a flexible semantic medium. A document can explain an idea, qualify it,
connect it to evidence, point to related work, and evolve without first fitting every future
relationship into a closed schema.

Treat a coherent document as a knowledge unit and a link as a first-class relationship. Use an
index as an authored map for progressive disclosure: a reader sees what is relevant, follows the
useful links, and opens detail only when needed. The index helps navigation; it does not need to
prove complete membership or encode a database.

# Put understanding in the capable layer

Agents can read normal Markdown and interpret its meaning directly. Do not pre-decide every
semantic relationship for them through filename grammars, enumerated columns, duplicated status
fields, or rigid intermediate manifests. Those mechanisms were often compensations for consumers
that could not understand the source material.

Avoid turning Markdown back into a hidden programming language. Regular-expression extraction,
fixed heading contracts, special list syntax, and frontmatter fields that secretly drive a state
machine discard Markdown's flexibility while retaining the fragility of an ad hoc parser. If a
consumer claims to need such extraction, first ask whether that consumer should understand the
document, follow its links, or be removed.

# Separate knowledge from mechanics

Knowledge and runtime coordination have different owners:

- documents express reasoning, context, evidence, alternatives, relationships, and decisions;
- links and indexes expose paths through that knowledge;
- agents interpret semantic content and choose what to read next;
- code handles only irreducible mechanical guarantees such as process identity, locking,
  atomic side effects, and whether an external action actually occurred.

Do not make the runtime duplicate knowledge merely so it can claim authority over it. When a fact
is already visible in the durable artifacts, prefer reading or following that artifact over
maintaining a synchronized projection. Keep a separate machine fact only when failure to do so
would make an inherently mechanical guarantee ambiguous.

# Preserve context instead of translating it

Repeatedly converting knowledge between conversations, summaries, slices, tables, manifests, and
state objects loses relationships and spends tokens rebuilding context. Prefer one connected
knowledge space that different activities enrich over time. Distinct reasoning activities can
remain distinct without requiring separate physical copies or a one-way sequence between them.

This makes knowledge portable: ordinary files and relative links can be copied, versioned,
archived, reviewed, and migrated without carrying a bespoke runtime or reconstructing an external
database.

# Add structure only after a demonstrated need

Start with a readable knowledge unit and useful links. Add directories when they improve
navigation, indexes when they improve discovery, and small metadata signals when they improve
recognition. Do not introduce a schema, parser, identifier grammar, or validation rule because a
future consumer might conceivably need one.

The useful question is not “Can this be formalized?” but “Which real failure does formalization
prevent?” If the answer is only that the result looks more rigorous, keep the semantics in the
documents and let the capable reader understand them.
