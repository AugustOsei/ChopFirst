#!/bin/sh
# Headless driving QA: runs the real vehicle/track modules through scripted
# scenarios (gas-only rail hit, recovery, reverse steering, braking, boost, drift).
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$DIR/.qa-sim"
mkdir -p "$TMP"
cp "$DIR/game/vehicle.js" "$DIR/game/track.js" "$DIR/scripts/qa-sim.mjs" "$TMP/"
printf '{"type":"module"}' > "$TMP/package.json"
mv "$TMP/qa-sim.mjs" "$TMP/sim.mjs"
node "$TMP/sim.mjs"
rm -rf "$TMP"
