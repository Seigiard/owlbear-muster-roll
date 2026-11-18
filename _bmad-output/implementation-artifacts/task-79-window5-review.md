# TASK-79 confirming review

## Current result

Runtime repairs are integrated at `3d0c96a`, but TASK-79 remains blocked.
Round `03-after-fix` reviewed that commit against fixed base `3b779818`.
Both reviewers reported; no source was degraded.

The two repaired flows now pass their public owner tests:

- A duplicated nested child accepts its first edit independently of its source.
- The token picker lists nested targets with their complete paths.

Format, lint, typecheck and full unit checks passed at clean `3d0c96a`:
3432 unit tests passed, with one environment skip.
Browser and build passed at clean `bc92efb`: 579 browser tests passed.
The only later change names existing test fixture objects directly; runtime,
browser tests and build inputs are unchanged.
The parent read all terminal verdicts and raw counts.

| Round 03 finding | Decision |
| --- | --- |
| Root and nested scopes share an id and resolve the wrong fields | Optional TASK-108, Low. Source-confirmed constructed input, with no recorded user occurrence. The parent-local id contract remains unchanged. |
| A copied nested child's token reveals the source child on a plain tab | Remaining owned blocker TASK-109, High. Duplication automatically preserves the child id; the navigation state discards its parent path. |

For TASK-109, the parent executed the real navigation reducer with
`group:g1:move:m1` and `group:g2:move:m1`. Both produced the same reveal value:
`{sheet:"s",instanceId:"m1",cellId:"token",focus:true}`.
The DOM consumer also selects by `instanceId`.
This proves the lost identity in navigation; browser reproduction remains open.

The review loop ended after two fix rounds and their confirmations.
No third repair was attempted. TASK-88 and TASK-77 AC2 remain open.
TASK-79 AC5 still requires the owner in a live Owlbear room under TASK-86.

## Round 02 history

Round `02-after-fix` reviewed `428d1f8` against `3b779818`.
Both reviewers reported; no source was degraded.

The first repair passed 3431 unit tests, with one environment skip, and 579
browser tests. Six protected assertions failed under faithful mutations.
Mainline merged only agent settings after those checks.

Two normal-use defects were assigned to the final repair round:

- A copied nested child retains source cell versions. Its first edit can lose
  against those copied versions. This belongs to TASK-79 AC3.
- The token picker enumerates only immediate repeat blocks. A nested child is
  absent from the linking menu. This belongs to retained nested token linking.

The owner asked to keep rare combinations outside mandatory completion.
TASK-105 tracks the two invalid-local-input dice findings. TASK-106 tracks
snapshot loss accounting for descendants of deleted parents. Both are Low
priority, optional and do not block TASK-79/80/88/77.

TASK-99/100/101/102/103 also remain deferred. TASK-86 still requires the owner
in a live Owlbear room. No mock-based live acceptance is claimed.
