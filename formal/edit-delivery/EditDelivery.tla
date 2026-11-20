---------------------------- MODULE EditDelivery ----------------------------
(***************************************************************************)
(* Edit delivery (AD-4, AD-5): one player's pending edits of one block's   *)
(* fields reaching the room through one GM client.                         *)
(*                                                                         *)
(* Player side: src/replica/pending-edits.ts over proposal-queue.ts and    *)
(* src/core/version-minter.ts. GM side: receiveProposal in                 *)
(* room-protocol.ts with checkProposal in core/access.ts, commit-outbox.ts *)
(* and the FIFO send queue of platform/send-queue.ts. Each action names    *)
(* the function it models. The skill .claude/skills/edit-delivery/SKILL.md *)
(* holds the code map, the bounds and what is left out.                    *)
(*                                                                         *)
(* A cell is [v |-> value, c |-> counter, a |-> author, s |-> edit]. Sparse *)
(* proposals use NoCell for untouched fields. `s` is a ghost edit number,  *)
(* 0 for a GM's edit. No action reads it to decide anything.               *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  Fields,         \* fields in this block; old configs use {"str"}
  PlayerValues,   \* values the player can type into the field
  GmValues,       \* values the GM can type into the field
  MaxEdits,       \* player edits accepted by `edit`
  MaxGmEdits,     \* GM edits of the field
  MaxGmFlips,     \* times the GM client leaves or re-enters `live`
  MaxRevokes,     \* 0 or 1: the GM revokes the player's write access
  MaxCatchUps,    \* catch-ups the player enters on its own (party change)
  MaxLosses,      \* room messages lost (a send the queue gives up on)
  AllowTooLarge,  \* whether an edit can make the entry too large
  Mutation        \* "none", or one broken variant of the code (formal/edit-delivery/broken/)

VARIABLES
  \* player client
  entry,      \* active and staged field commands, newest record counter (0 = no record), sent
  armed,      \* proposal-queue `resends` holds the key (a resend timer runs)
  queued,     \* proposal-queue `queued` holds the key (a `propose` waits in the send queue)
  pCell,      \* the player's replica record of the field
  pAllowed,   \* the player's replica gives it write access
  catching,   \* the player client is in catch-up
  pLink,      \* the player's gmLink: "online" or "offline"
  lastMinted, \* version-minter lastMintedByKey for the key
  edits,      \* edits accepted so far; edit n gets seq n
  \* GM client
  gLive,      \* the GM client is live and has persistence (receiveProposal's gate)
  gCell,      \* the GM's replica record of the field
  gAllowed,   \* the GM's replica gives the player write access
  outbox,     \* commit-outbox: held field record, the player's ack, a held revoke, `scheduled`
  gQueue,     \* the GM's send queue: "slot" (the outbox's composed commit) and rejects, FIFO
  committed,  \* room-protocol.ts committedEdits: the player counters the GM committed (TASK-119)
  \* room messages in flight
  toGM,       \* `propose` messages, a set: any order, a copy collapses into one
  toP,        \* messages to the player, FIFO: `commit` and `reject`
  \* ghosts
  applyCount, \* edit seq -> how many times the GM merged a cell of that edit
  reported,   \* edit seqs dropped with a denial notice (its text names the cause)
  noop,       \* edit seqs dropped because the known record already held the value
  proposed,   \* counter and sparse field cells of every version the player sent
  editField,  \* edit seq -> field
  lostCells,  \* <<field, seq>> cells whose committed ACK was actually lost
  gmEditsAfterLost, \* field, seq and player edit count at the GM edit
  oldCellReplay, \* lost cells accepted again beside a later edit of another field
  \* budgets
  gmEdits, gmFlips, revokes, catchUps, losses

vars == <<entry, armed, queued, pCell, pAllowed, catching, pLink, lastMinted, edits,
          gLive, gCell, gAllowed, outbox, gQueue, committed, toGM, toP,
           applyCount, reported, noop, proposed, editField, lostCells,
           gmEditsAfterLost, oldCellReplay,
          gmEdits, gmFlips, revokes, catchUps, losses>>

playerVars == <<entry, armed, queued, pCell, pAllowed, catching, pLink, lastMinted, edits>>
gmVars == <<gLive, gCell, gAllowed, outbox, gQueue, committed>>
ghostVars == <<applyCount, reported, noop, proposed, editField, lostCells,
              gmEditsAfterLost, oldCellReplay>>
budgetVars == <<gmEdits, gmFlips, revokes, catchUps, losses>>

Max(x, y) == IF x >= y THEN x ELSE y
MaxSet(s) == CHOOSE x \in s : \A y \in s : x >= y
CounterOf(cells) == MaxSet({0} \cup {cells[f].c : f \in Fields})

\* compareVersions in core/merge.ts orders authors by connection id. The player's id is
\* taken above the GM's, so a player cell wins every tie on a merge.
Rank(a) == IF a = "P" THEN 2 ELSE 1

\* compareCells in core/merge.ts: counter, then author, then value.
Beats(x, y) ==
  \/ x.c > y.c
  \/ x.c = y.c /\ Rank(x.a) > Rank(y.a)
  \/ x.c = y.c /\ x.a = y.a /\ x.v > y.v

\* mergeBlock in core/merge.ts, pointwise across one block's fields.
MergeCell(x, y) == IF Beats(y, x) THEN y ELSE x
NoCell == [v |-> 0, c |-> 0, a |-> "G", s |-> 0]
MergeCells(x, y) == [f \in Fields |-> MergeCell(x[f], y[f])]
OverlayCells(x, y) ==
  [f \in Fields |-> IF y[f] = NoCell THEN x[f] ELSE y[f]]

NoCells == [f \in Fields |-> NoCell]
NoCommand == [has |-> FALSE, val |-> 0, seq |-> 0]
NoCommands == [f \in Fields |-> NoCommand]
NoEntry == [active |-> NoCommands, later |-> NoCommands, rc |-> 0, sent |-> FALSE]
NoOutbox == [cells |-> NoCells, ack |-> 0, revoke |-> FALSE, scheduled |-> FALSE]
InitCell == [v |-> 0, c |-> 1, a |-> "G", s |-> 0]

Msg(t, cells, c, reason, revoke) ==
  [t |-> t, cells |-> cells, c |-> c, reason |-> reason, revoke |-> revoke]
Slot == Msg("slot", NoCells, 0, "none", FALSE)

CommandFields(commands) == {f \in Fields : commands[f].has}
HasCommands(commands) == CommandFields(commands) # {}
HasEntry(e) == HasCommands(e.active) \/ HasCommands(e.later)
PutCommand(commands, f, command) == [commands EXCEPT ![f] = command]
CombineCommands(first, second) ==
  [f \in Fields |-> IF second[f].has THEN second[f] ELSE first[f]]
CommandChanges(commands, cells) ==
  \E f \in Fields : commands[f].has /\ commands[f].val # cells[f].v
PendingSeqs(e) ==
  {s \in 1..MaxEdits :
    \E f \in Fields :
      \/ e.active[f].has /\ e.active[f].seq = s
      \/ e.later[f].has /\ e.later[f].seq = s}
CommandSeqs(commands) ==
  {s \in 1..MaxEdits :
    \E f \in Fields : commands[f].has /\ commands[f].seq = s}
NoopSeqs(commands, cells) ==
  IF CommandChanges(commands, cells) THEN {} ELSE CommandSeqs(commands)
CellsFor(commands, c) ==
  [f \in Fields |->
    IF commands[f].has
      THEN [v |-> commands[f].val, c |-> c, a |-> "P", s |-> commands[f].seq]
      ELSE NoCell]
ApplyCells(counts, cells) ==
  [s \in 1..MaxEdits |->
    counts[s] + Cardinality({f \in Fields : cells[f] # NoCell /\ cells[f].s = s})]
ProposalHeld(current, proposal) ==
  \A f \in Fields : proposal[f] = NoCell \/ proposal[f] = current[f]
ProposalStale(current, proposal, c) ==
  \E f \in Fields : proposal[f] # NoCell /\ c <= current[f].c
ProposalFor(c) == CHOOSE x \in proposed : x.c = c
ProposalCells(c) == ProposalFor(c).cells
LostAck(m) ==
  m.t = "commit" /\ m.c \in committed /\ \E x \in proposed : x.c = m.c
ReplayWitnesses(cells) ==
  {old \in lostCells :
    \E w \in gmEditsAfterLost :
      /\ w.field = old[1] /\ w.seq = old[2]
      /\ cells[old[1]] # NoCell /\ cells[old[1]].s = old[2]
      /\ \E other \in Fields :
           other # old[1] /\ cells[other] # NoCell /\ cells[other].s > w.after}

\* A message that is already queued is not queued twice. Its second copy would find the
\* entry already moved past it (see the skill), so it changes nothing.
AppendNew(q, m) == IF \E i \in 1..Len(q) : q[i] = m THEN q ELSE Append(q, m)
RemoveAt(q, i) == SubSeq(q, 1, i - 1) \o SubSeq(q, i + 1, Len(q))

\* core/version-minter.ts mint: above the highest known counter and the last one minted.
\* Broken variant "mint-forgets": the minter keeps no last counter per key.
Mint(highest) ==
  IF Mutation = "mint-forgets" THEN highest + 1 ELSE Max(highest, lastMinted) + 1

Applied == {s \in 1..MaxEdits : applyCount[s] > 0}

Init ==
  /\ entry = NoEntry
  /\ armed = FALSE
  /\ queued = FALSE
  /\ pCell = [f \in Fields |-> InitCell]
  /\ pAllowed = TRUE
  /\ catching = FALSE
  /\ pLink = "online"
  /\ lastMinted = 0
  /\ edits = 0
  /\ gLive = TRUE
  /\ gCell = [f \in Fields |-> InitCell]
  /\ gAllowed = TRUE
  /\ outbox = NoOutbox
  /\ gQueue = <<>>
  /\ committed = {}
  /\ toGM = {}
  /\ toP = <<>>
  /\ applyCount = [s \in 1..MaxEdits |-> 0]
  /\ reported = {}
  /\ noop = {}
  /\ proposed = {}
  /\ editField = [s \in 1..MaxEdits |-> CHOOSE f \in Fields : TRUE]
  /\ lostCells = {}
  /\ gmEditsAfterLost = {}
  /\ oldCellReplay = {}
  /\ gmEdits = 0 /\ gmFlips = 0 /\ revokes = 0 /\ catchUps = 0 /\ losses = 0

-----------------------------------------------------------------------------
\* proposal-queue.ts operations on the one block address.

\* drop: the entry, its waiting send and its resend go.
Drop == entry' = NoEntry /\ queued' = FALSE /\ armed' = FALSE

\* put with a minted record: propose = sendNow + armResend.
PutMinted(e) == entry' = e /\ queued' = TRUE /\ armed' = TRUE

\* put with record null: the entry waits for a `c`, its resend stops.
PutWaiting(e) == entry' = [e EXCEPT !.rc = 0] /\ armed' = FALSE /\ UNCHANGED queued

\* hold: replaced, sent on the running backoff (armResend only when none runs).
Hold(e) == entry' = e /\ armed' = TRUE /\ UNCHANGED queued

\* commit-outbox.ts add: a held record merges with the newer one, withAck keeps the
\* newest ack of each author, and the first add since the last take schedules one
\* composed commit at the end of the send queue.
OutboxAdd(cells, ack, revoke) ==
  /\ outbox' = [cells |-> MergeCells(outbox.cells, cells),
                ack |-> Max(outbox.ack, ack),
                revoke |-> outbox.revoke \/ revoke,
                scheduled |-> TRUE]
  /\ gQueue' = IF outbox.scheduled THEN gQueue ELSE Append(gQueue, Slot)

-----------------------------------------------------------------------------
\* Player actions.

\* pending-edits.ts edit: combine unsent cells, but stage a new field only behind a
\* taken, minted version. A replacement of its only sent field takes a new version.
PlayerEdits(f, v, big) ==
  /\ edits < MaxEdits
  /\ f \in Fields
  /\ pAllowed                              \* playerMayEdit; a refused edit is not accepted
  /\ big => AllowTooLarge /\ ~catching     \* no size check runs during catch-up
  /\ LET s == edits + 1
         command == [has |-> TRUE, val |-> v, seq |-> s]
         versionTaken == entry.rc # 0 /\ entry.sent
         directReplacement == versionTaken /\ CommandFields(entry.active) = {f}
         stage == versionTaken /\ ~directReplacement /\ Mutation # "folds-unacked-cells"
         current == IF directReplacement \/ entry.rc = 0 \/
                         Mutation = "folds-unacked-cells"
                      THEN CombineCommands(entry.active, entry.later)
                      ELSE entry.active
         nextActive == IF stage
                         THEN entry.active
                         ELSE PutCommand(current, f, command)
         nextLater == IF stage
                        THEN PutCommand(entry.later, f, command)
                        ELSE NoCommands
         noops == NoopSeqs(nextActive, pCell)
         needsProposal == entry.sent \/ CommandChanges(nextActive, pCell)
         c == Mint(Max(CounterOf(pCell), entry.rc))
     IN /\ edits' = s
        /\ editField' = [editField EXCEPT ![s] = f]
        /\ IF big
             THEN Drop
                  /\ reported' = reported \cup PendingSeqs(entry) \cup {s}
                  /\ UNCHANGED <<lastMinted, noop>>
            ELSE IF stage
              THEN Hold([entry EXCEPT !.later = nextLater])
                   /\ UNCHANGED <<lastMinted, reported, noop>>
            ELSE IF catching
              THEN /\ entry' = [active |-> nextActive, later |-> nextLater,
                                rc |-> 0, sent |-> entry.sent]
                   /\ armed' = FALSE
                   /\ UNCHANGED <<queued, lastMinted, reported, noop>>
            ELSE IF ~needsProposal
              THEN Drop
                  /\ noop' = noop \cup noops \cup {s}
                  /\ UNCHANGED <<lastMinted, reported>>
           ELSE /\ lastMinted' = c
                /\ PutMinted([active |-> nextActive, later |-> NoCommands,
                              rc |-> c, sent |-> entry.sent])
                /\ noop' = noop \cup noops
                /\ UNCHANGED reported
  /\ UNCHANGED <<pCell, pAllowed, catching, pLink>>
  /\ UNCHANGED <<gmVars, toGM, toP, applyCount, proposed, lostCells,
                 gmEditsAfterLost, oldCellReplay, budgetVars>>

\* proposal-queue.ts sendNow: the send queue takes the waiting `propose` and gets the
\* entry's newest stored record, or nothing. Taking it does not compose a new record.
QueueTakesPropose ==
  /\ queued
  /\ queued' = FALSE
  /\ IF HasCommands(entry.active) /\ entry.rc # 0
       THEN /\ entry' = [entry EXCEPT !.sent = TRUE]
            /\ toGM' = toGM \cup {[c |-> entry.rc,
                                    cells |-> CellsFor(entry.active, entry.rc)]}
            /\ proposed' = proposed \cup {[c |-> entry.rc,
                                           cells |-> CellsFor(entry.active, entry.rc)]}
       ELSE UNCHANGED <<entry, toGM, proposed>>
  /\ UNCHANGED <<armed, pCell, pAllowed, catching, pLink, lastMinted, edits>>
  /\ UNCHANGED <<gmVars, toP, applyCount, reported, noop, editField, lostCells,
                  gmEditsAfterLost, oldCellReplay, budgetVars>>

\* proposal-queue.ts armResend's timer. Broken variant "resend-once": it does not re-arm.
ResendFires ==
  /\ armed
  /\ IF HasCommands(entry.active) /\ entry.rc # 0
       THEN queued' = TRUE /\ armed' = (Mutation # "resend-once")
       ELSE armed' = FALSE /\ UNCHANGED queued
  /\ UNCHANGED <<entry, pCell, pAllowed, catching, pLink, lastMinted, edits>>
  /\ UNCHANGED <<gmVars, toGM, toP, ghostVars, budgetVars>>

\* catch-up-table.ts livenessFired on 'gm-silence': no GM-origin message for the timeout
\* and none since a ping (silenceAnswered), so the liveness phase goes offline.
GmLinkLost ==
  /\ pLink = "online"
  /\ ~gLive
  /\ pLink' = "offline"
  /\ UNCHANGED <<entry, armed, queued, pCell, pAllowed, catching, lastMinted, edits>>
  /\ UNCHANGED <<gmVars, toGM, toP, ghostVars, budgetVars>>

\* A GM-origin message heard while offline (catch-up.ts heard): catch-up-table.ts
\* livenessHeard emits `gm-back`, which catch-up-effects.ts runs as pending-edits gmBack =
\* resendAll, and catchUpHeard makes a live player enter catch-up ('gm-return'). Both run in
\* one synchronous catch-up-effects.ts run.
GmBack ==
  /\ pLink = "offline"
  /\ gLive
  /\ pLink' = "online"
  /\ IF HasCommands(entry.active) /\ entry.rc # 0
       THEN queued' = TRUE /\ armed' = TRUE
       ELSE UNCHANGED <<queued, armed>>
  /\ catching' = TRUE
  /\ UNCHANGED <<entry, pCell, pAllowed, lastMinted, edits>>
  /\ UNCHANGED <<gmVars, toGM, toP, ghostVars, budgetVars>>

\* engine.ts enterCatchUp on a role change or a page return -> catch-up-table.ts
\* catchUpEnter.
CatchUpStarts ==
  /\ ~catching
  /\ catchUps < MaxCatchUps
  /\ catching' = TRUE
  /\ catchUps' = catchUps + 1
  /\ UNCHANGED <<entry, armed, queued, pCell, pAllowed, pLink, lastMinted, edits>>
  /\ UNCHANGED <<gmVars, toGM, toP, ghostVars, gmEdits, gmFlips, revokes, losses>>

\* catch-up-table.ts leave emits `caught-up` -> catch-up-effects.ts -> engine.ts
\* performCaughtUp -> pending-edits.ts caughtUp. With the GM live, its `state` answer
\* merged first in the same handler (room-protocol.ts receiveState: receiveRecords ->
\* recordsChanged, then stateMerged -> leave); without it, the 'catch-up' timer's exit.
CatchUpEnds ==
  /\ catching
  /\ catching' = FALSE
  /\ LET base == IF gLive THEN MergeCells(pCell, gCell) ELSE pCell
         allowed == IF gLive THEN gAllowed ELSE pAllowed
         ready == IF HasCommands(entry.later) THEN entry.later ELSE entry.active
         force == IF HasCommands(entry.later) THEN FALSE ELSE entry.sent
         needsProposal == force \/ CommandChanges(ready, base)
         noops == NoopSeqs(ready, base)
         c == Mint(CounterOf(base))
      IN /\ pCell' = base
         /\ pAllowed' = allowed
         /\ IF HasEntry(entry) /\ ~allowed
              THEN Drop
                   /\ reported' = reported \cup PendingSeqs(entry)
                   /\ UNCHANGED <<noop, lastMinted>>
            ELSE IF HasEntry(entry) /\ entry.rc = 0
              THEN IF ~needsProposal
                     THEN Drop
                          /\ noop' = noop \cup noops
                          /\ UNCHANGED <<reported, lastMinted>>
                     ELSE /\ lastMinted' = c
                          /\ PutMinted([active |-> ready, later |-> NoCommands,
                                        rc |-> c, sent |-> FALSE])
                          /\ noop' = noop \cup noops
                          /\ UNCHANGED reported
            ELSE UNCHANGED <<entry, queued, armed, reported, noop, lastMinted>>
  /\ UNCHANGED <<pLink, edits, gmVars, toGM, toP, applyCount, proposed,
                 editField, lostCells, gmEditsAfterLost, oldCellReplay, budgetVars>>

\* room-protocol.ts dispatchRoomMessage on the player, for the oldest message: `commit`
\* (answered, then receiveRecords -> recordsChanged for a revoke it carries) or `reject`
\* (receiveReject -> rejected, then receiveRecords of its current record).
PlayerReceives ==
  /\ Len(toP) > 0
  /\ toP' = Tail(toP)
  /\ LET m == Head(toP)
         base == MergeCells(pCell, m.cells)
         cleared == HasEntry(entry) /\ entry.rc # 0 /\
                    (entry.rc = m.c \/ (Mutation = "ack-any" /\ m.c # 0))
         retry == IF Mutation = "stale-loses-active" /\ HasCommands(entry.later)
                    THEN entry.later
                    ELSE CombineCommands(entry.active, entry.later)
         retryNoops == NoopSeqs(retry, base)
         nextC == Mint(Max(CounterOf(base), entry.rc))
         hold == entry.rc > CounterOf(m.cells)
         retryNeedsProposal == hold \/ CommandChanges(retry, base)
         retrySent == IF HasCommands(entry.later) THEN FALSE ELSE entry.sent
     IN
      IF m.t = "commit"
        THEN /\ pCell' = base
            /\ pAllowed' = (pAllowed /\ ~m.revoke)
            /\ IF cleared
                 THEN IF HasCommands(entry.later)
                        THEN IF m.revoke
                               THEN Drop
                                    /\ reported' = reported \cup CommandSeqs(entry.later)
                                    /\ UNCHANGED <<lastMinted, noop>>
                             ELSE IF catching
                               THEN /\ entry' = [active |-> entry.later,
                                                 later |-> NoCommands,
                                                 rc |-> 0, sent |-> FALSE]
                                    /\ armed' = FALSE
                                    /\ UNCHANGED <<queued, lastMinted, reported, noop>>
                             ELSE IF ~CommandChanges(entry.later, base)
                               THEN Drop
                                    /\ noop' = noop \cup NoopSeqs(entry.later, base)
                                    /\ UNCHANGED <<lastMinted, reported>>
                               ELSE /\ lastMinted' = nextC
                                    /\ PutMinted([active |-> entry.later,
                                                  later |-> NoCommands,
                                                  rc |-> nextC, sent |-> FALSE])
                                    /\ noop' = noop \cup NoopSeqs(entry.later, base)
                                    /\ UNCHANGED reported
                      ELSE Drop
                           /\ UNCHANGED <<lastMinted, reported, noop>>
               ELSE IF m.revoke /\ HasEntry(entry)
                 THEN Drop
                      /\ reported' = reported \cup PendingSeqs(entry)
                      /\ UNCHANGED <<lastMinted, noop>>
               ELSE /\ UNCHANGED <<entry, queued, armed, reported, lastMinted, noop>>
      ELSE IF ~(HasCommands(entry.active) /\ entry.rc # 0 /\ entry.rc = m.c)
        THEN UNCHANGED <<entry, queued, armed, pCell, pAllowed,
                         lastMinted, reported, noop>>
      ELSE IF m.reason = "denied"    \* broken variant "denied-silent": no notice
        THEN /\ Drop
             /\ reported' = (IF Mutation = "denied-silent"
                               THEN reported ELSE reported \cup PendingSeqs(entry))
             /\ UNCHANGED <<pCell, pAllowed, lastMinted, noop>>
      ELSE /\ pCell' = base
           /\ pAllowed' = pAllowed
           /\ IF catching
                THEN /\ entry' = [active |-> retry, later |-> NoCommands,
                                  rc |-> 0, sent |-> retrySent]
                     /\ armed' = FALSE
                     /\ UNCHANGED <<queued, lastMinted, reported, noop>>
              ELSE IF ~retryNeedsProposal
                THEN Drop
                     /\ noop' = noop \cup retryNoops
                     /\ UNCHANGED <<lastMinted, reported>>
                ELSE /\ lastMinted' = nextC
                     /\ entry' = [active |-> retry, later |-> NoCommands,
                                  rc |-> nextC, sent |-> retrySent]
                     /\ armed' = TRUE
                     /\ IF hold
                          THEN UNCHANGED queued
                          ELSE queued' = TRUE
                     /\ noop' = noop \cup retryNoops
                     /\ UNCHANGED reported
  /\ UNCHANGED <<catching, pLink, edits, gmVars, toGM, applyCount, proposed,
                 editField, lostCells, gmEditsAfterLost, oldCellReplay, budgetVars>>

-----------------------------------------------------------------------------
\* GM actions.

\* room-protocol.ts receiveProposal with core/access.ts checkProposal. A proposal whose
\* counter the GM committed before is answered with the held record and its echo, ahead of
\* checkProposal (committedEdits, TASK-119); Mutation "forgets-committed" removes that.
GmReceives(m) ==
  /\ m \in toGM
  /\ toGM' = toGM \ {m}
  /\ LET pc == m.cells
     IN
      IF ~gLive                                                   \* dropped, no answer
        THEN UNCHANGED <<gCell, outbox, gQueue, applyCount, committed, oldCellReplay>>
      ELSE IF m.c \in committed /\ Mutation # "forgets-committed"  \* committed before
        THEN OutboxAdd(gCell, m.c, FALSE)
             /\ UNCHANGED <<gCell, applyCount, committed, oldCellReplay>>
      ELSE IF ~gAllowed                                           \* denied
        THEN gQueue' = AppendNew(gQueue, Msg("reject", NoCells, m.c, "denied", FALSE))
             /\ UNCHANGED <<gCell, outbox, applyCount, committed, oldCellReplay>>
      ELSE IF Mutation = "gm-overwrites"     \* broken variant: no counter check, no merge
        THEN /\ gCell' = OverlayCells(gCell, pc)
             /\ applyCount' = ApplyCells(applyCount, pc)
             /\ OutboxAdd(OverlayCells(gCell, pc), m.c, FALSE)
             /\ oldCellReplay' = oldCellReplay \cup ReplayWitnesses(pc)
             /\ UNCHANGED committed
      ELSE IF ProposalHeld(gCell, pc)                             \* commit-existing
        THEN /\ OutboxAdd(gCell, m.c, FALSE)
             /\ committed' = committed \cup {m.c}
             /\ UNCHANGED <<gCell, applyCount, oldCellReplay>>
      ELSE IF ProposalStale(gCell, pc, m.c)                       \* stale on an edited cell
        THEN gQueue' = AppendNew(gQueue, Msg("reject", gCell, m.c, "stale", FALSE))
             /\ UNCHANGED <<gCell, outbox, applyCount, committed, oldCellReplay>>
      ELSE /\ gCell' = MergeCells(gCell, pc)                      \* commit
           /\ applyCount' = ApplyCells(applyCount, pc)
           /\ OutboxAdd(MergeCells(gCell, pc), m.c, FALSE)
           /\ committed' = committed \cup {m.c}
           /\ oldCellReplay' = oldCellReplay \cup ReplayWitnesses(pc)
  /\ UNCHANGED <<playerVars, gLive, gAllowed, toP, reported, noop, proposed,
                 editField, lostCells, gmEditsAfterLost, budgetVars>>

\* A GM's own edit: engine command -> apply -> sendCommits.
GmEdits(f, v) ==
  /\ gmEdits < MaxGmEdits
  /\ gLive
  /\ f \in Fields
  /\ gmEdits' = gmEdits + 1
  /\ LET c == CounterOf(gCell) + 1
         cell == [x \in Fields |->
                    IF x = f THEN [v |-> v, c |-> c, a |-> "G", s |-> 0]
                    ELSE NoCell]
         witnesses ==
           { [field |-> f, seq |-> s, after |-> edits] :
               s \in {n \in 1..MaxEdits : <<f, n>> \in lostCells} }
     IN /\ gCell' = MergeCells(gCell, cell)
        /\ OutboxAdd(cell, 0, FALSE)
        /\ gmEditsAfterLost' = gmEditsAfterLost \cup witnesses
  /\ UNCHANGED <<playerVars, gLive, gAllowed, committed, toGM, toP,
                 applyCount, reported, noop, proposed, editField, lostCells,
                 oldCellReplay>>
  /\ UNCHANGED <<gmFlips, revokes, catchUps, losses>>

\* The GM revokes write access; its access record goes out in the outbox's next commit.
GmRevokes ==
  /\ revokes < MaxRevokes
  /\ gLive
  /\ gAllowed
  /\ revokes' = revokes + 1
  /\ gAllowed' = FALSE
  /\ OutboxAdd(NoCells, 0, TRUE)
  /\ UNCHANGED <<playerVars, gLive, gCell, committed, toGM, toP, ghostVars>>
  /\ UNCHANGED <<gmEdits, gmFlips, catchUps, losses>>

\* GmFlips models an interruption with memory intact. GmReload also clears the
\* in-memory committed-proposal history and transient outbox/queue, while saved
\* records remain. Flush, startup and persistence failures are outside the model.
GmChanges(reload) ==
  /\ gmFlips < MaxGmFlips
  /\ gmFlips' = gmFlips + 1
  /\ gLive' = ~gLive
  /\ IF reload /\ gLive
       THEN /\ outbox' = NoOutbox /\ gQueue' = <<>> /\ committed' = {}
       ELSE UNCHANGED <<outbox, gQueue, committed>>
  /\ UNCHANGED <<playerVars, gCell, gAllowed, toGM, toP, ghostVars>>
  /\ UNCHANGED <<gmEdits, revokes, catchUps, losses>>

GmFlips == GmChanges(FALSE)
GmReload == GmChanges(TRUE)

\* send-queue.ts drain takes the oldest item. The outbox's slot composes its commit now
\* (commit-outbox.ts take), with what is held at this moment.
GmQueueSends ==
  /\ Len(gQueue) > 0
  /\ gQueue' = Tail(gQueue)
  /\ LET item == Head(gQueue) IN
     IF item.t = "slot"
       THEN /\ outbox' = NoOutbox
             /\ toP' = IF outbox.cells = NoCells /\ ~outbox.revoke
                         THEN toP
                         ELSE AppendNew(toP, Msg("commit", outbox.cells, outbox.ack, "none",
                                                 outbox.revoke))
       ELSE toP' = AppendNew(toP, item) /\ UNCHANGED outbox
  /\ UNCHANGED <<playerVars, gLive, gCell, gAllowed, committed, toGM, ghostVars, budgetVars>>

-----------------------------------------------------------------------------
\* The send queue gives up on a message (send-queue.ts: a non-rate-limit error).

ProposeLost(m) ==
  /\ m \in toGM /\ losses < MaxLosses
  /\ toGM' = toGM \ {m} /\ losses' = losses + 1
  /\ UNCHANGED <<playerVars, gmVars, toP, ghostVars, gmEdits, gmFlips, revokes, catchUps>>

AnswerLost(i) ==
  /\ i \in 1..Len(toP) /\ losses < MaxLosses
  /\ toP' = RemoveAt(toP, i) /\ losses' = losses + 1
  /\ LET m == toP[i]
         lost == IF LostAck(m)
                   THEN {<<f, ProposalCells(m.c)[f].s>> :
                           f \in {x \in Fields :
                                    ProposalCells(m.c)[x] # NoCell /\
                                    ProposalCells(m.c)[x].a = "P"}}
                   ELSE {}
     IN lostCells' = lostCells \cup lost
  /\ UNCHANGED <<playerVars, gmVars, toGM, applyCount, reported, noop, proposed,
                 editField, gmEditsAfterLost, oldCellReplay,
                 gmEdits, gmFlips, revokes, catchUps>>

\* Nothing is left to deliver: no entry, no queued send, no message in flight.
Done ==
  /\ ~HasEntry(entry) /\ ~queued /\ gQueue = <<>> /\ toGM = {} /\ toP = <<>>
  /\ UNCHANGED vars

\* Named, so TLC and the chart name each step by its action.
PlayerEdit == \E f \in Fields, v \in PlayerValues, big \in BOOLEAN :
                PlayerEdits(f, v, big)
GmAnswers == \E m \in toGM : GmReceives(m)
GmEdit == \E f \in Fields, v \in GmValues : GmEdits(f, v)
ProposeLoss == \E m \in toGM : ProposeLost(m)
AnswerLoss == \E i \in 1..Len(toP) : AnswerLost(i)

Next ==
  \/ PlayerEdit
  \/ QueueTakesPropose
  \/ ResendFires
  \/ GmLinkLost
  \/ GmBack
  \/ CatchUpStarts
  \/ CatchUpEnds
  \/ PlayerReceives
  \/ GmAnswers
  \/ GmEdit
  \/ GmRevokes
  \/ GmFlips
  \/ GmQueueSends
  \/ ProposeLoss
  \/ AnswerLoss
  \/ Done

\* Every step the code takes on its own happens: timers fire, send queues drain,
\* messages arrive, catch-up ends, a lost GM link comes back. Losses, flips and edits are
\* bounded, never forced.
Fairness ==
  /\ WF_vars(QueueTakesPropose)
  /\ WF_vars(ResendFires)
  /\ WF_vars(GmBack)
  /\ WF_vars(CatchUpEnds)
  /\ WF_vars(GmQueueSends)
  /\ WF_vars(PlayerReceives)
  /\ WF_vars(GmAnswers)

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ Fairness

-----------------------------------------------------------------------------
\* Properties.

ValueSet == PlayerValues \cup GmValues \cup {0}
CommandType == {NoCommand} \cup [has : {TRUE}, val : PlayerValues, seq : 1..MaxEdits]
CellType == [v : ValueSet, c : Nat, a : {"G", "P"}, s : 0..MaxEdits]
CellMapType == [Fields -> ({NoCell} \cup CellType)]
ProposalType == [c : Nat, cells : CellMapType]
LostCellType == {<<f, s>> : f \in Fields, s \in 1..MaxEdits}
GmAfterLostType ==
  [field : Fields, seq : 1..MaxEdits, after : 0..MaxEdits]

TypeOK ==
  /\ entry.active \in [Fields -> CommandType]
  /\ entry.later \in [Fields -> CommandType]
  /\ entry.rc \in Nat /\ entry.sent \in BOOLEAN
  /\ armed \in BOOLEAN /\ queued \in BOOLEAN
  /\ pCell \in [Fields -> CellType]
  /\ gCell \in [Fields -> CellType]
  /\ outbox.cells \in CellMapType
  /\ toGM \subseteq ProposalType
  /\ proposed \subseteq ProposalType
  /\ editField \in [1..MaxEdits -> Fields]
  /\ lostCells \subseteq LostCellType
  /\ gmEditsAfterLost \subseteq GmAfterLostType
  /\ oldCellReplay \subseteq LostCellType
  /\ applyCount \in [1..MaxEdits -> Nat]
  /\ reported \subseteq 1..MaxEdits
  /\ noop \subseteq 1..MaxEdits
  /\ catching \in BOOLEAN /\ gLive \in BOOLEAN
  /\ committed \subseteq Nat
  /\ pLink \in {"online", "offline"}
  /\ edits \in 0..MaxEdits

\* An accepted edit is never lost: it is still pending (alone or folded into a newer
\* edit), the GM merged it or a newer edit, the player was told it is refused, or the
\* record the player knows already held its value.
NoSilentLoss ==
  \A s \in 1..edits :
    LET f == editField[s] IN
      \/ entry.active[f].has /\ entry.active[f].seq >= s
      \/ entry.later[f].has /\ entry.later[f].seq >= s
      \/ \E m \in toGM : m.cells[f] # NoCell /\ m.cells[f].s >= s
      \/ \E t \in Applied \cup reported \cup noop : t >= s /\ editField[t] = f

\* The GM merges each player field edit into the room at most once.
NoDoubleApply == \A s \in 1..MaxEdits : applyCount[s] <= 1

\* Once the GM merged a newer edit of this player, the room never shows an older one.
OwnOrderKept ==
  \A s \in Applied :
    LET f == editField[s]
    IN gCell[f].a = "P" => gCell[f].s >= s

\* AD-3: the player never sends two different edits under one (k, c, a).
OneVersionOneEdit == \A x, y \in proposed : x.c = y.c => x.cells = y.cells

\* A committed cell whose ACK was really lost must not return beside a later field edit
\* after the GM has changed that cell. NoDoubleApply checks the effect without this condition.
NoOldCellReplayAfterLostAck == oldCellReplay = {}

\* A pending edit always has something that sends it again: a minted version has a
\* running resend timer, and an entry with no version exists only during a catch-up,
\* whose end mints it.
NeverStranded ==
  HasEntry(entry) => \/ entry.rc # 0 /\ armed
                     \/ entry.rc = 0 /\ catching

\* After the GM is back for good, every pending edit is answered.
EntryResolves == (<>[]gLive) => (HasEntry(entry) ~> ~HasEntry(entry))

=============================================================================
