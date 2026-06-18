#!/bin/sh
# Headless drive of the Accra City Run track (completion + lap time).
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$DIR/.accra-sim"
mkdir -p "$TMP"
cp "$DIR/game/vehicle.js" "$DIR/game/track.js" "$DIR/scripts/accra-sim.mjs" "$TMP/"
printf '{"type":"module"}' > "$TMP/package.json"
mv "$TMP/accra-sim.mjs" "$TMP/sim.mjs"
node "$TMP/sim.mjs"
STATUS=$?
rm -rf "$TMP"
exit $STATUS
