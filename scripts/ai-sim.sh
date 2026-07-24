#!/bin/sh
# Headless Ananse AI driving QA: laps Akina with the real ai-driver/vehicle/track
# modules and reports pace + smoothness. Run after any ai-driver or handling change.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$DIR/.ai-sim"
mkdir -p "$TMP"
cp "$DIR/game/vehicle.js" "$DIR/game/track.js" "$DIR/game/ai-driver.js" "$DIR/scripts/ai-sim.mjs" "$TMP/"
printf '{"type":"module"}' > "$TMP/package.json"
mv "$TMP/ai-sim.mjs" "$TMP/sim.mjs"
node "$TMP/sim.mjs"
rm -rf "$TMP"
