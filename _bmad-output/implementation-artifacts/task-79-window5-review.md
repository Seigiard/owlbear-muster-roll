# TASK-79 confirming review

Round `02-after-fix` reviewed `428d1f8` against `3b779818`.
Both reviewers reported; no source was degraded.

The first repair passed 3431 unit tests, with one environment skip, and 579
browser tests. Six protected assertions failed under faithful mutations.
Mainline merged only agent settings after those checks.

Two normal-use defects remain for the final repair round:

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
