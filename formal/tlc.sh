#!/bin/sh
# Runs the TLC model checker on one TLA+ model with pinned Java and TLC versions.
#
#   formal/tlc.sh formal/<area>/<Spec>.tla [<config>.cfg] [extra TLC flags]
#
# Without a config, it uses <Spec>.cfg beside the spec. The first run installs
# Java and tla2tools.jar with mise and needs the network. The exit code is TLC's:
# 0 when every invariant holds, non-zero on a violation, deadlock or error.
set -eu

TLC_TOOL='http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar,checksum=sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88]@1.7.4'
JAVA_TOOL='java@temurin-25'

if [ $# -lt 1 ]; then
  echo "usage: formal/tlc.sh formal/<area>/<Spec>.tla [<config>.cfg] [TLC flags]" >&2
  exit 2
fi

spec=$1
shift
dir=$(cd "$(dirname "$spec")" && pwd)
base=$(basename "$spec" .tla)
cfg="$dir/$base.cfg"
case ${1:-} in
  *.cfg)
    cfg=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
    shift
    ;;
esac

mise install --quiet "$JAVA_TOOL" "$TLC_TOOL" >/dev/null 2>&1 || mise install "$JAVA_TOOL" "$TLC_TOOL"
jar="$(mise where "$TLC_TOOL")/tla2tools.jar"
java=$(mise which java --tool "$JAVA_TOOL")

meta=$(mktemp -d)
trap 'rm -rf "$meta"' EXIT
cd "$dir"
"$java" -XX:+UseParallelGC -cp "$jar" tlc2.TLC -workers auto -metadir "$meta" -config "$cfg" "$base.tla" "$@"
