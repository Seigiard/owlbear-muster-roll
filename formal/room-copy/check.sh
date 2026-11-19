#!/bin/sh
# Runs every config of the room-copy model and compares each result with what it
# expects. Run from the repo root:
#
#   formal/room-copy/check.sh
#
# Exit 0 when every result matches: the gates pass, each finding and each broken
# variant fails on its own property. A mismatch prints MISMATCH and the TLC log.
set -u

root=$(cd "$(dirname "$0")/../.." && pwd)
spec="$root/formal/room-copy/RoomCopy.tla"
dir="$root/formal/room-copy"
log=$(mktemp)
trap 'rm -f "$log"' EXIT
mismatches=0

# expect <config> pass | <property that must be violated>
expect() {
  cfg=$1
  want=$2
  "$root/formal/tlc.sh" "$spec" "$dir/$cfg" >"$log" 2>&1
  code=$?

  if [ "$want" = pass ]; then
    if [ $code -eq 0 ]; then
      echo "ok        $cfg: every property holds"
      return
    fi
  elif [ $code -ne 0 ]; then
    if [ "$want" = WriteRunEnds ]; then
      grep -q 'Temporal properties were violated' "$log" && {
        echo "ok        $cfg: $want fails, as expected"
        return
      }
    elif grep -q "Invariant $want is violated" "$log"; then
      echo "ok        $cfg: $want fails, as expected"
      return
    fi
  fi

  mismatches=$((mismatches + 1))
  echo "MISMATCH  $cfg: expected '$want', TLC exit $code"
  grep -E '^(Error|State [0-9]+:)' "$log"
}

expect RoomCopy.cfg pass
expect liveness.cfg pass
expect finding-overwrite.cfg RoomKeepsEdits
expect finding-silent-loss.cfg NoSilentLossAtRest
expect finding-lost-for-good.cfg NoLossForGood
expect broken-no-read-back.cfg NoFalseSaved
expect broken-stop-keeps-timer.cfg StopEndsWork
expect broken-no-gate-check.cfg StopEndsWork
expect broken-no-finally.cfg WriteRunEnds

[ $mismatches -eq 0 ]
