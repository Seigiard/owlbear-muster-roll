#!/bin/sh
# Fails when code that a formal model describes changed after the model's sync
# commit, so a model cannot keep passing on code that no longer exists. Run from
# anywhere in the repo:
#
#   formal/drift.sh [<area> ...]
#
# Each formal/<area>/coverage.txt holds one `sync <commit>` line and the files
# the model describes. Without arguments, every area is checked. The check reads
# commits only: it compares the sync commit with HEAD and ignores the working
# tree. It needs no Java.
#
# On drift, bring the model in line with the code (the area's skill, or
# /maintain-formal-verification-skill), then move `sync` to the checked commit.
set -u

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root" || exit 2

if [ $# -eq 0 ]; then
  set --
  for coverage in formal/*/coverage.txt; do
    [ -f "$coverage" ] || continue
    area=${coverage#formal/}
    set -- "$@" "${area%/coverage.txt}"
  done
fi

drifted=0

for area in "$@"; do
  coverage="formal/$area/coverage.txt"
  if [ ! -f "$coverage" ]; then
    echo "ERROR     $area: no $coverage"
    drifted=1
    continue
  fi

  sync=$(sed -n 's/^sync[[:space:]]\{1,\}\([0-9a-f]\{1,\}\)[[:space:]]*$/\1/p' "$coverage")
  files=$(grep -v -e '^#' -e '^sync[[:space:]]' -e '^[[:space:]]*$' "$coverage")

  if [ -z "$sync" ] || [ -z "$files" ]; then
    echo "ERROR     $area: $coverage needs one 'sync <commit>' line and at least one file"
    drifted=1
    continue
  fi

  if ! git merge-base --is-ancestor "$sync" HEAD 2>/dev/null; then
    echo "ERROR     $area: sync commit $sync is not in the history of HEAD (shallow clone, or rewritten history)"
    drifted=1
    continue
  fi

  missing=$(echo "$files" | while IFS= read -r file; do
    git cat-file -e "HEAD:$file" 2>/dev/null || echo "$file"
  done)
  if [ -n "$missing" ]; then
    echo "DRIFT     $area: covered files no longer exist at HEAD (moved or deleted):"
    echo "$missing" | sed 's/^/            /'
    drifted=1
    continue
  fi

  # The file list is one path per line and paths hold no spaces, so word
  # splitting passes each path as one argument.
  # shellcheck disable=SC2086
  changed=$(git diff --name-only "$sync" HEAD -- $files)
  if [ -n "$changed" ]; then
    echo "DRIFT     $area: covered files changed after sync commit $sync:"
    echo "$changed" | sed 's/^/            /'
    echo "            Bring formal/$area in line with the code, then move 'sync' in $coverage."
    drifted=1
    continue
  fi

  echo "ok        $area: no covered file changed after $sync"
done

exit $drifted
