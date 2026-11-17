---
title: 'TASK-81 repair: Bounded fragmented player edits'
type: 'bugfix'
created: '2026-11-17'
status: 'ready-for-dev'
route: 'dispatch'
---

# TASK-81 repair: Bounded fragmented player edits

## Intent

Repair the rejected TASK-81 candidate from the accepted integration baseline. A stale player edit must remain rebaseable when its valid current read-back needs more than one room message. Projection parts must fit their actual party envelope. Incomplete proposal assemblies must have finite admission and expiry bounds.

## Corrected stale-reply contract

The ordinary stale-reply owner is authoritative for per-cell behavior. A stale response contains only the cells in the player's proposal. After a stale response, the player re-proposes only its edited field values at the new counter. An untouched GM `note` cell keeps its GM tuple and is not re-proposed. Fragmented stale replies carry that same contract; they do not introduce `preserveReadBack` or `preserveCells` semantics.

## Bounds

- Each room message remains strictly below `MESSAGE_BYTE_LIMIT` (15,000 bytes).
- An incomplete proposal allows at most 32 parts and 480,000 serialized record bytes.
- The incomplete-assembly cache holds at most 32 entries.
- An incomplete assembly expires when a later proposal enters more than 60 seconds after its first part. No background timer is added.

## Acceptance

1. A supported stale multi-part edit receives a fragmented stale result and rebases without a denial caused only by the read-back size.
2. A large accepted block reaches a window through projection messages that each fit the real party/header envelope.
3. Excessive proposal parts, bytes, retained assemblies, or ingress age do not persist or acknowledge a proposal.
4. A two-part proposal neither persists nor acknowledges before unique valid completion; a forbidden completed proposal is denied.

## Non-goals

Do not change `MESSAGE_BYTE_LIMIT`, room-message admission policy, player access policy, compatibility formats, TASK-79/80, or owner-only TASK-86. Do not claim a measured memory incident.

## Verification

- `bun test src/replica/engine-propose.test.ts src/replica/window-publisher.test.ts`
- Full source checks selected by `CLAUDE.md` after the source state is stable.
