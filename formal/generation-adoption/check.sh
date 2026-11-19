#!/bin/sh
# Runs every TLC config of the generation-adoption model and compares each
# outcome with the expected one. Exit 0 when every config ends as expected.
#
#   formal/generation-adoption/check.sh            all configs
#   formal/generation-adoption/check.sh <name>.cfg one config, with TLC's output
#
# Expected outcomes:
#   GenerationAdoption, TwoImports, Liveness, LivenessCopyFails  pass
#   finding-*  fail: open findings in the code, see the skill
#   bug-*      fail: broken variants that show each rule can fail
set -u

dir=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$dir/../.." && pwd)
spec="$dir/GenerationAdoption.tla"
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

if [ $# -gt 0 ]; then
  exec "$root/formal/tlc.sh" "$spec" "$dir/$(basename "$1")"
fi

status=0
for cfg in "$dir"/*.cfg; do
  name=$(basename "$cfg" .cfg)
  case $name in
    finding-* | bug-*) expect=fail ;;
    *) expect=pass ;;
  esac

  if "$root/formal/tlc.sh" "$spec" "$cfg" >"$out/$name.txt" 2>&1; then
    got=pass
  else
    got=fail
  fi

  broken=$(sed -n 's/^Error: Invariant \(.*\) is violated\.$/\1/p; s/^Error: Temporal properties were violated\.$/temporal property/p' "$out/$name.txt" | head -n 1)
  states=$(sed -n 's/.* \([0-9]*\) distinct states found.*/\1/p' "$out/$name.txt" | tail -n 1)

  if [ "$got" = "$expect" ]; then
    verdict=ok
  else
    verdict=UNEXPECTED
    status=1
  fi

  printf '%-34s %-10s expected %-4s got %-4s %s states %s\n' \
    "$name" "$verdict" "$expect" "$got" "${states:-?}" "${broken:+broken: $broken}"

  if [ "$verdict" = UNEXPECTED ]; then
    tail -n 40 "$out/$name.txt"
  fi
done

exit $status
