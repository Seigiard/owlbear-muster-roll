#!/bin/sh
# Runs every TLC configuration of the catch-up model and checks each outcome.
#
#   formal/catch-up/check.sh            # all: holds, findings, mutations
#   formal/catch-up/check.sh holds      # only the configurations that must hold
#
# A configuration in this folder must hold (TLC exit 0). One in findings/ or
# mutations/ must fail on the invariant its `INVARIANT` line names. The script
# exits non-zero when any outcome differs, and keeps each TLC log in $OUT.
set -u

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
OUT=${OUT:-$(mktemp -d)}
mkdir -p "$OUT"
which=${1:-all}
failed=0

run() {
  cfg=$1
  log="$OUT/$(basename "$(dirname "$cfg")")-$(basename "$cfg" .cfg).log"
  start=$(date +%s)
  (cd "$repo" && formal/tlc.sh formal/catch-up/CatchUp.tla "$cfg") >"$log" 2>&1
  code=$?
  secs=$(($(date +%s) - start))
  states=$(grep -Eo '[0-9]+ distinct states found' "$log" | tail -1)
  echo "$code|$secs|$states|$log"
}

for cfg in "$here"/*.cfg; do
  result=$(run "$cfg")
  code=${result%%|*}
  if [ "$code" = 0 ]; then
    echo "holds     $(basename "$cfg"): ok (${result#*|})"
  else
    echo "holds     $(basename "$cfg"): FAILED, exit $code (${result#*|})"
    grep -E 'Error:|is violated' "${result##*|}" | head -3
    failed=1
  fi
done

if [ "$which" = all ]; then
  for cfg in "$here"/findings/*.cfg "$here"/mutations/*.cfg; do
    inv=$(sed -n 's/^INVARIANT \([A-Za-z]*\).*/\1/p' "$cfg")
    result=$(run "$cfg")
    log=${result##*|}
    kind=$(basename "$(dirname "$cfg")")
    if grep -q "Invariant $inv is violated" "$log"; then
      echo "$kind  $(basename "$cfg"): fails on $inv as expected"
    else
      echo "$kind  $(basename "$cfg"): DID NOT FAIL on $inv (${result#*|})"
      failed=1
    fi
  done
fi

echo "logs: $OUT"
exit $failed
