------------------------------- MODULE RoomCopy -------------------------------
(***************************************************************************)
(* The AD-8 room copy write loop of src/replica/room-copy-table.ts and its *)
(* shell src/replica/room-copy.ts, as wired by src/replica/engine.ts and    *)
(* src/replica/background-main.ts, for several GM clients that share one    *)
(* room metadata key.                                                       *)
(*                                                                          *)
(* A record is an edit id. Merging is set union, because records carry      *)
(* versions and the merge keeps the newer one. The room copy is the set of  *)
(* edits under `app.muster-roll/snapshot`. Owlbear room metadata has no     *)
(* compare-and-set: the last write that lands wins.                         *)
(*                                                                          *)
(* Each GM client keeps the room-copy state of its page: the table Phase   *)
(* (`kind`, `owed`, `rerun`, and the `pageChanges` test of an ordinary      *)
(* read), plus the shell's `cancelPause` and `notSaved`. A `stopped` phase  *)
(* keeps the active write as `active`; here `stopped` is a flag beside the  *)
(* phase. One dispatch of the table, with every effect it runs at once, is  *)
(* one step. The engine gate `canWriteRoomCopy` is `~stopped /\ live`: the *)
(* role is GM and persistence is present in the whole model.                *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  GMs,        \* GM clients of one room
  Editors,    \* GMs that edit; the others write only what they hold
  MaxEdits,   \* edits each editor makes
  Break       \* "none" is the code; any other value is a broken variant

Edits == Editors \X (1..MaxEdits)

VARIABLES
  room,       \* edits in the room copy
  replica,    \* replica[g]: edits GM g holds (its localStorage keeps them across a reopen)
  made,       \* made[g]: how many edits GM g made
  msgs,       \* msgs[g]: commits broadcast to GM g that it has not received yet
  gm,         \* gm[g]: the room-copy state of GM g's current page
  everInRoom, \* ghost: every edit the room copy ever held
  falseSaved, \* ghost: a write was counted as verified while the room lacked it
  wroteAfterStop \* ghost: a stopped page sent a metadata write

vars == <<room, replica, made, msgs, gm, everInRoom, falseSaved, wroteAfterStop>>

Phases == {"idle", "reading", "writing", "verifying"}

\* createRoomCopy and startReplicaEngine on a page that opens: catch-up runs first.
Fresh(liveAtStart) ==
  [phase |-> "idle", run |-> FALSE, encoded |-> {}, scheduled |-> FALSE,
   owed |-> FALSE, rerun |-> FALSE, notSaved |-> FALSE, pageMoved |-> FALSE,
   live |-> liveAtStart, hidden |-> FALSE, stopped |-> FALSE]

TypeOK ==
  /\ room \subseteq Edits
  /\ \A g \in GMs :
       /\ replica[g] \subseteq Edits
       /\ made[g] \in 0..MaxEdits
       /\ msgs[g] \subseteq Edits
       /\ gm[g].phase \in Phases
       /\ gm[g].encoded \subseteq Edits

Init ==
  /\ room = {}
  /\ replica = [g \in GMs |-> {}]
  /\ made = [g \in GMs |-> 0]
  /\ msgs = [g \in GMs |-> {}]
  /\ gm = [g \in GMs |-> Fresh(TRUE)]
  /\ everInRoom = {}
  /\ falseSaved = FALSE
  /\ wroteAfterStop = FALSE

-----------------------------------------------------------------------------
(* Helpers. Each takes one GM's state record and returns the new one.     *)

\* engine.ts canWriteRoomCopy: `!signal.aborted` is `~stopped`.
Writable(s) == ~s.stopped /\ s.live

\* room-copy-table.ts `pause` (the `edited` row and `caughtUp`): disarm, then arm.
\* The stopped row ignores `edited` and `caught-up`, so it arms nothing.
Schedule(s) == [s EXCEPT !.scheduled = ~s.stopped]

\* room-copy-table.ts `trigger` (the `fired` and `page-hidden` rows): disarm,
\* `owed`, then `rerun` or a read. The stopped row ignores both events. A read that
\* starts takes the current `pageChanges`, so `pageMoved` resets.
WriteRoomCopy(s) ==
  IF s.stopped THEN s
  ELSE LET t == [s EXCEPT !.scheduled = FALSE, !.owed = TRUE] IN
       IF t.phase # "idle" THEN [t EXCEPT !.rerun = TRUE]
       ELSE IF Writable(t)
            THEN [t EXCEPT !.phase = "reading", !.run = ~t.run, !.pageMoved = FALSE]
            ELSE t

\* room-copy-table.ts `failed` (or a read-back that does not hold) with the
\* gate open: `publish-status` failed, which sets the shell's `notSaved`, and
\* `owed: true`.
Fail(s) == [s EXCEPT !.notSaved = TRUE, !.owed = TRUE]

\* room-copy-table.ts `finish`: idle, then the rerun tail, which runs `trigger`.
\* On a stopped page it is `drain`: the rerun tail meets a stopped page and
\* starts nothing. An idle page keeps no `encoded`, `pageMoved` or `run`, so
\* equal pages are one state.
Finish(s) ==
  LET t == [s EXCEPT !.phase = "idle", !.encoded = {}, !.pageMoved = FALSE]
      u == IF t.rerun THEN WriteRoomCopy([t EXCEPT !.rerun = FALSE]) ELSE t
  IN IF u.phase = "idle" THEN [u EXCEPT !.run = FALSE] ELSE u

Others(g) == GMs \ {g}
Made == UNION {{<<g, n>> : n \in 1..made[g]} : g \in Editors}

-----------------------------------------------------------------------------
(* Environment steps: what the GM and the browser do.                     *)

\* A GM's command applies (command-routing.ts composeCommand -> roomCopyEdited
\* -> room-copy `edited`).
\* The commit goes to every other client.
Edit(g) ==
  LET s == gm[g] IN
  /\ g \in Editors /\ ~s.stopped /\ s.live /\ ~s.hidden /\ made[g] < MaxEdits
  /\ LET e == <<g, made[g] + 1>> IN
     /\ made' = [made EXCEPT ![g] = @ + 1]
     /\ replica' = [replica EXCEPT ![g] = @ \cup {e}]
     /\ msgs' = [h \in GMs |-> IF h = g \/ gm[h].stopped THEN msgs[h] ELSE msgs[h] \cup {e}]
  /\ gm' = [gm EXCEPT ![g] = Schedule(s)]
  /\ UNCHANGED <<room, everInRoom, falseSaved, wroteAfterStop>>

\* visibilitychange to hidden: engine.pageHidden -> room-copy `page-hidden` row
\* (`hidden`: `pageChanges + 1`, then `trigger`).
PageHidden(g) ==
  LET s == gm[g] IN
  /\ ~s.stopped /\ ~s.hidden
  \* `pageChanges += 1` matters only to a write that is reading.
  /\ gm' = [gm EXCEPT ![g] =
              WriteRoomCopy([s EXCEPT !.hidden = TRUE, !.pageMoved = (s.phase = "reading")])]
  /\ UNCHANGED <<room, replica, made, msgs, everInRoom, falseSaved, wroteAfterStop>>

\* visibilitychange to visible, `resume` or `online`: engine.catchUp ->
\* room-copy `page-returned` row (`pageChanges + 1`), then
\* enterCatchUp('page-return'), whose `catchUpEnter` leaves `live` at once.
PageReturned(g) ==
  LET s == gm[g] IN
  /\ ~s.stopped
  /\ gm' = [gm EXCEPT ![g] =
              [s EXCEPT !.hidden = FALSE, !.pageMoved = (s.phase = "reading"), !.live = FALSE]]
  /\ UNCHANGED <<room, replica, made, msgs, everInRoom, falseSaved, wroteAfterStop>>

\* The tab closes. A closing tab is hidden first. Production never calls
\* engine.stop(); the page dies, so no later step of this page writes, as
\* after `controller.abort()`: the room copy's abort listener dispatches `stop`
\* (phase `stopped`, `disarm`), and the clock's `schedule` cancels on abort
\* too. A request already sent may still land. Break "stop-keeps-timer" removes
\* both cancels.
Stop(g) ==
  LET s == gm[g] IN
  /\ ~s.stopped /\ s.hidden
  /\ gm' = [gm EXCEPT ![g] =
              [s EXCEPT !.stopped = TRUE,
                        !.scheduled = IF Break = "stop-keeps-timer" THEN s.scheduled ELSE FALSE]]
  \* The engine's abort listener unsubscribes from the room: commits on their way are lost.
  /\ msgs' = [msgs EXCEPT ![g] = {}]
  /\ UNCHANGED <<room, replica, made, everInRoom, falseSaved, wroteAfterStop>>

\* The GM opens the room again: a new page, a new createRoomCopy, the same
\* localStorage. Its catch-up runs first.
Reopen(g) ==
  /\ gm[g].stopped /\ gm[g].phase = "idle"
  /\ gm' = [gm EXCEPT ![g] = Fresh(FALSE)]
  /\ UNCHANGED <<room, replica, made, msgs, everInRoom, falseSaved, wroteAfterStop>>

-----------------------------------------------------------------------------
(* Internal steps: timers and port answers.                               *)

\* room-protocol.ts 'commit': receiveRecords changed the replica -> roomCopyEdited.
\* A stopped page is unsubscribed; its `edited` row would ignore it anyway.
Deliver(g) ==
  \E e \in msgs[g] :
    /\ msgs' = [msgs EXCEPT ![g] = @ \ {e}]
    /\ IF gm[g].stopped \/ e \in replica[g]
       THEN UNCHANGED <<replica, gm>>
       ELSE /\ replica' = [replica EXCEPT ![g] = @ \cup {e}]
            /\ gm' = [gm EXCEPT ![g] = Schedule(gm[g])]
    /\ UNCHANGED <<room, made, everInRoom, falseSaved, wroteAfterStop>>

\* The pause timer armed by `pause` fires: the shell dispatches `fired`.
TimerFires(g) ==
  /\ gm[g].scheduled
  /\ gm' = [gm EXCEPT ![g] = WriteRoomCopy([gm[g] EXCEPT !.scheduled = FALSE])]
  /\ UNCHANGED <<room, replica, made, msgs, everInRoom, falseSaved, wroteAfterStop>>

\* Catch-up ends: the catch-up table goes `live` and emits `caught-up`, and
\* catch-up-effects.ts `run` calls engine.ts performCaughtUp in the same
\* synchronous run, which calls room-copy `caughtUp(applied)`. It merged the
\* room copy and the state of the online GMs. No command waited, so `applied`
\* is false.
CatchUpEnds(g) ==
  LET s == gm[g]
      t == [s EXCEPT !.live = TRUE]
  IN
  /\ ~s.stopped /\ ~s.live
  /\ replica' = [replica EXCEPT ![g] =
                   @ \cup room \cup UNION {replica[h] : h \in {h \in Others(g) : ~gm[h].stopped}}]
  /\ gm' = [gm EXCEPT ![g] = IF t.owed THEN Schedule(t) ELSE t]
  /\ UNCHANGED <<room, made, msgs, everInRoom, falseSaved, wroteAfterStop>>

\* The ordinary read answers: room-copy.ts runPortEffect dispatches `read-done`,
\* or `failed` for a failed read. `ok` FALSE covers a failed read, a copy this
\* build cannot read (readDone's `!current.isOk()`), and a copy over
\* ROOM_METADATA_BYTE_LIMIT (encodeWrite). On success the `receive` effect merges
\* the copy, dispatches `read-done` `merged`, which tests the gate again and runs
\* encodeWrite, all in this one step; setMetadata is sent.
\* Two guards stop a closed page from writing here: the stopped row's
\* `read-done` and `failed` cells drain the write, and readDone's
\* `!env.writable` holds `!signal.aborted`. Break "no-gate-check" removes both.
ReadDone(g) ==
  LET s == gm[g]
      guards == Break # "no-gate-check"
      gateOpen == IF guards THEN Writable(s) ELSE s.live
  IN
  /\ s.phase = "reading"
  /\ \E ok \in BOOLEAN :
       \* The stopped row drains; readDone and `failed` test
       \* `!env.writable || work.pageChanges !== phase.pageChanges`.
       IF (s.stopped /\ guards) \/ ~gateOpen \/ s.pageMoved
       THEN /\ gm' = [gm EXCEPT ![g] = Finish(s)]
            /\ UNCHANGED <<replica, wroteAfterStop>>
       ELSE IF ~ok
       THEN /\ gm' = [gm EXCEPT ![g] =
                        IF Break = "no-finally"
                        \* The reading row ignores `failed`: no read is pending.
                        THEN [Fail(s) EXCEPT !.phase = "stuck"]
                        ELSE Finish(Fail(s))]
            /\ UNCHANGED <<replica, wroteAfterStop>>
       ELSE LET merged == replica[g] \cup room IN
            /\ replica' = [replica EXCEPT ![g] = merged]
            /\ gm' = [gm EXCEPT ![g] = [s EXCEPT !.phase = "writing", !.encoded = merged]]
            /\ wroteAfterStop' = (wroteAfterStop \/ s.stopped)
  /\ UNCHANGED <<room, made, msgs, everInRoom, falseSaved>>

\* setMetadata settles: `write-done` (writeDone), or `failed` when it throws (the
\* writing row, or the stopped row on a closed page). Owlbear may drop a write
\* and still report success. A closed page fails the `!env.writable` test and
\* drains.
WriteDone(g) ==
  LET s == gm[g] IN
  /\ s.phase = "writing"
  /\ \E outcome \in {"landed", "dropped", "rejected"} :
       /\ room' = IF outcome = "landed" THEN s.encoded ELSE room
       /\ everInRoom' = everInRoom \cup room'
       /\ gm' = [gm EXCEPT ![g] =
                   IF outcome = "rejected" THEN Finish(IF Writable(s) THEN Fail(s) ELSE s)
                   ELSE IF ~Writable(s) THEN Finish(s)
                   ELSE [s EXCEPT !.phase = "verifying"]]
  /\ UNCHANGED <<replica, made, msgs, falseSaved, wroteAfterStop>>

\* The read-back answers: `verify-done` (verifyDone, or stoppedVerifyDone on a
\* closed page), or `failed` for a failed read. readBackHolds(written, readBack)
\* passes when the room copy covers every written record.
VerifyDone(g) ==
  LET s == gm[g] IN
  /\ s.phase = "verifying"
  /\ \E ok \in BOOLEAN :
       IF ~Writable(s) THEN /\ gm' = [gm EXCEPT ![g] = Finish(s)]
                            /\ UNCHANGED falseSaved
       ELSE IF ~ok THEN /\ gm' = [gm EXCEPT ![g] = Finish(Fail(s))]
                        /\ UNCHANGED falseSaved
       ELSE IF s.encoded \subseteq room \/ Break = "no-read-back"
       THEN /\ gm' = [gm EXCEPT ![g] = Finish([s EXCEPT !.owed = FALSE, !.notSaved = FALSE])]
            /\ falseSaved' = (falseSaved \/ ~(s.encoded \subseteq room))
       ELSE /\ gm' = [gm EXCEPT ![g] = Finish(Fail(s))]
            /\ UNCHANGED falseSaved
  /\ UNCHANGED <<room, replica, made, msgs, everInRoom, wroteAfterStop>>

-----------------------------------------------------------------------------

Next ==
  \E g \in GMs :
    \/ Edit(g) \/ PageHidden(g) \/ PageReturned(g) \/ Stop(g) \/ Reopen(g)
    \/ Deliver(g) \/ TimerFires(g) \/ CatchUpEnds(g)
    \/ ReadDone(g) \/ WriteDone(g) \/ VerifyDone(g)

\* Ports answer and timers fire in the end. The GM and the browser owe nothing.
Fairness ==
  \A g \in GMs :
    /\ WF_vars(Deliver(g)) /\ WF_vars(TimerFires(g)) /\ WF_vars(CatchUpEnds(g))
    /\ WF_vars(ReadDone(g)) /\ WF_vars(WriteDone(g)) /\ WF_vars(VerifyDone(g))

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
(* Properties                                                             *)

\* No timer, no write, no commit in flight and no catch-up open: nothing will
\* write the room copy until the GM edits, hides the page or catches up again.
AtRest ==
  \A g \in GMs :
    /\ gm[g].phase = "idle"
    /\ ~gm[g].scheduled
    /\ msgs[g] = {}
    /\ (gm[g].stopped \/ gm[g].live)

\* A write counts as saved only when the room copy holds what it wrote.
NoFalseSaved == ~falseSaved

\* A closed page arms no timer and sends no metadata write.
StopEndsWork ==
  /\ ~wroteAfterStop
  /\ \A g \in GMs : gm[g].stopped => ~gm[g].scheduled

\* The room copy never loses an edit it held.
RoomKeepsEdits == everInRoom \subseteq room

Open == {g \in GMs : ~gm[g].stopped}

\* At rest, an edit an open GM holds is in the room copy, or an open GM that
\* holds it shows the not-saved notice and owes a write.
NoSilentLossAtRest ==
  AtRest => \A e \in UNION {replica[g] : g \in Open} :
              \/ e \in room
              \/ \E g \in Open : gm[g].notSaved /\ gm[g].owed /\ e \in replica[g]

\* At rest, every edit made is in the room copy, or an open GM that holds it owes a write.
NoLossForGood ==
  AtRest => \A e \in Made :
              \/ e \in room
              \/ \E g \in Open : gm[g].owed /\ e \in replica[g]

\* Every write run ends: its page reaches idle, or a new run starts.
WriteRunEnds ==
  \A g \in GMs, b \in BOOLEAN :
    [](gm[g].phase # "idle" /\ gm[g].run = b => <>(gm[g].phase = "idle" \/ gm[g].run # b))

=============================================================================
