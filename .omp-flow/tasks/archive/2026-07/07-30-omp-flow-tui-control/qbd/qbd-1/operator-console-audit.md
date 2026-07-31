---
type: "QbD Audit"
title: "QbD 1: omp-flow operator console"
---

# QbD 1 audit: omp-flow operator console

> Superseded design audit. The user reframed the product as an embedded status line on 2026-07-30.
> This audit remains evidence for the retired operator-console design only.

## Verdict

**FAIL**

The hybrid operator-console direction is well supported by the linked repository and external
research, and the separation of authored, receipt, and native planes is consistent across the
[selected synthesis](../../research/tui-synthesis.md), [PRD](../../prd.md), and
[design](../../design.md). One interface-level gap blocks safe decomposition and implementation.

## Blocking finding

### The mutation-safety protocol is descriptive rather than normative

The [adapter contract](../../interfaces/operator-console-adapter.md) names handshake, snapshot,
observation, binding, capability, action, and acknowledgement concepts, but it does not define an
implementable v1 message union or state machine. In particular, it leaves unspecified:

- exact message kinds, required/optional field types, identifier scopes, and request/response
  direction;
- the clock domain and comparison rules for observation freshness and capability expiry;
- snapshot scope and completeness when one adapter combines authoritative discovery, hooks,
  replay, and adapter-owned runs;
- capability-revision invalidation across reconnect/snapshot replacement; and
- the ordering rules that decide when reconciliation has closed a sequence gap and controls may
  be re-enabled.

This is material because [PRD R2, R3, R6, and R7](../../prd.md) make provenance, exact binding,
fresh capability proof, and post-reconnect reconciliation prerequisites for native mutation, while
acceptance criterion 12 requires both adapters to reject malformed messages, target mismatches,
expired capabilities, and unknown acknowledgements consistently. The design's action broker
cannot enforce those guarantees if independently implemented adapters may choose different clock,
snapshot, revision, and ordering semantics. The risk is not merely interoperability: a stale or
partial observation could be treated as current control authority.

## Required remediation

Before decomposition, add a linked normative v1 protocol definition that:

1. defines the closed message-kind union and exact required/optional fields for hello, snapshot
   request/result, observation, capability, action request, acknowledgement, and protocol error;
2. defines connection epoch/nonce, sequence, request-ID, native-target-ID, capability-revision,
   and snapshot-scope rules;
3. defines freshness/expiry clocks and skew handling without comparing unrelated process-local
   monotonic clocks;
4. defines snapshot completeness and reconciliation for mixed discovery scopes and reconnects;
   and
5. gives executable positive and negative examples traceable to PRD acceptance criterion 12.

Then rerun QbD 1 with a fresh independent auditor. This model verdict is not human calibration.
