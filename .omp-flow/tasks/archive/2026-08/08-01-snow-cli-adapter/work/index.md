---
type: "WorkMap"
title: "Snow and Cursor adapter implementation map"
---

# Snow and Cursor adapter implementation map

This map decomposes the human-approved [PRD](../prd.md) and [Design](../design.md), including the
accepted advisory checks in the [QbD 1 audit](../qbd/design-audit-2.md) and
[human decision](../qbd/design-decision.md). It adds no adapter framework, dispatcher, lifecycle
state, generated context, or duplicate Skill tree.

## Canonical adapter work

The following work is intentionally separated by native Harness surface and can normally proceed
in parallel. Each produces canonical templates and focused tests without editing the live deployed
Python runtime that is coordinating this Bundle.

- [Snow native resources and session isolation](snow-native-resources.md) owns Snow agent/Hook
  templates, `SNOW_SESSION_ID` recognition in the portable template, and direct Snow fixtures.
- [Cursor native resources and session bridge](cursor-native-resources.md) owns Cursor agent/Hook
  templates, the documented `conversation_id` bridge, and direct Cursor fixtures.
- [Flow Status host parity](flow-status-host-parity.md) extends the closed existing host contract
  and makes combined-install host choice depend on runtime evidence rather than config order.

## Shared installation integration

[CLI, managed-resource, update, and documentation integration](cli-managed-resource-integration.md)
follows the canonical adapter resources. It registers both resource groups through the existing
Harness seams, connects the focused tests to the normal suite, proves hash-ownership behavior,
and documents only capabilities supported by the resulting adapter. This work also reconciles the
small, intentional `src/cli/index.ts` edit surface shared with Flow Status host parity.

## Native compatibility evidence

[Released-Harness compatibility verification](released-harness-verification.md) follows an
installed build. It captures the Cursor lifecycle boundaries required by the accepted QbD advice
and the available Snow cross-platform/identity behavior. Unsupported paths remain visibly
unavailable; evidence must not be replaced by an alias, a rewritten receipt, or an inferred
support claim.

## Requirement coverage

| Approved requirement | Work that realizes and verifies it |
|---|---|
| PRD 1: CLI flags, stable config, interactive/help, fail-before-write | [CLI integration](cli-managed-resource-integration.md) |
| PRD 2: shared `.agents/skills` only | Both native-resource items plus [CLI integration](cli-managed-resource-integration.md) |
| PRD 3: Snow agents and project Hooks | [Snow resources](snow-native-resources.md) |
| PRD 4: Cursor agents and one project Hook file, no duplicate rule | [Cursor resources](cursor-native-resources.md) |
| PRD 5: Snow and Cursor concurrent-session isolation | Both native-resource items and [released verification](released-harness-verification.md) |
| PRD 6: bounded native Hook translation, no semantic inference | Both native-resource items and [released verification](released-harness-verification.md) |
| PRD 7: exact actor/native-item binding or visible unavailability | Both native-resource items and [released verification](released-harness-verification.md) |
| PRD 8: unchanged managed-resource ownership/conflicts | [CLI integration](cli-managed-resource-integration.md) |
| PRD 9: truthful package/README guidance | [CLI integration](cli-managed-resource-integration.md), calibrated by [released verification](released-harness-verification.md) |
| Design Flow Status host extension and combined-install selection | [Flow Status parity](flow-status-host-parity.md) |

The focused commands in each Concept are required for that bounded handoff. The final integrated
suite remains the Design's `compileall`, build, test, pack dry-run, and `git diff --check` set.
