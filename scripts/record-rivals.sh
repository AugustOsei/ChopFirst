#!/bin/sh
# Regenerates game/rivals.js: drives the real vehicle model headless with three
# bot personalities and records their ghost traces. Rerun after track layout or
# vehicle handling changes so rival pace stays honest.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$DIR/.qa-sim-rivals"
mkdir -p "$TMP/game"
cp "$DIR/game/vehicle.js" "$DIR/game/track.js" "$TMP/game/"
cp "$DIR/scripts/record-rivals.mjs" "$TMP/sim.mjs"
printf '{"type":"module"}' > "$TMP/package.json"
node "$TMP/sim.mjs"
STATUS=$?
if [ $STATUS -eq 0 ]; then
  cp "$TMP/game/rivals.js" "$DIR/game/rivals.js"
fi
rm -rf "$TMP"
exit $STATUS
