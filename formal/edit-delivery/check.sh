#!/bin/sh
# Checks the edit-delivery model: each config against the result it must give.
#
#   formal/edit-delivery/check.sh            from the repo root
#
# A baseline config must pass, except DoubleApply.cfg, which must break NoDoubleApply
# while finding F1 stays in the code. Each broken/ config models a broken variant of
# the code and must break its rule, or the rule cannot fail. Exit 0 when every result
# matches; TLC's full output for each config is in $OUT (default: a temporary folder).
set -u

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
spec="$here/EditDelivery.tla"
OUT=${OUT:-$(mktemp -d)}
mismatch=0

# config  expected   ("pass", an invariant name, "temporal" or "deadlock")
while read -r cfg expected; do
  log="$OUT/$(echo "$cfg" | tr '/' '-').out"
  "$root/formal/tlc.sh" "$spec" "$here/$cfg" >"$log" 2>&1
  if grep -q "No error has been found" "$log"; then
    got=pass
  elif grep -q "Temporal properties were violated" "$log"; then
    got=temporal
  elif grep -q "Error: Deadlock reached" "$log"; then
    got=deadlock
  else
    got=$(sed -n 's/^Error: Invariant \([A-Za-z]*\) is violated.*/\1/p' "$log" | head -n 1)
    [ -n "$got" ] || got="error (see $log)"
  fi
  if [ "$got" = "$expected" ]; then
    echo "ok        $cfg: $got"
  else
    echo "MISMATCH  $cfg: expected $expected, got $got"
    mismatch=1
  fi
done <<'EOF'
EditDelivery.cfg pass
Refusals.cfg pass
Liveness.cfg pass
DoubleApply.cfg NoDoubleApply
broken/MintForgets.cfg OneVersionOneEdit
broken/GmOverwrites.cfg OwnOrderKept
broken/AckAny.cfg NoSilentLoss
broken/DeniedSilent.cfg NoSilentLoss
broken/ResendOnce.cfg NeverStranded
broken/ResendOnceLive.cfg deadlock
EOF

echo "TLC output: $OUT"
exit $mismatch
