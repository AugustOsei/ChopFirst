#!/bin/sh
# Headless anti-cheat QA: a bot races the real vehicle model to a finish, then
# validateRun must accept the legit run and reject forged variants.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$DIR/.qa-sim-validate"
mkdir -p "$TMP/game" "$TMP/lib"
cp "$DIR/game/vehicle.js" "$DIR/game/track.js" "$TMP/game/"
cp "$DIR/lib/challenges.js" "$TMP/lib/"
cp "$DIR/scripts/validate-sim.mjs" "$TMP/sim.mjs"
printf '{"type":"module"}' > "$TMP/package.json"
node "$TMP/sim.mjs"
STATUS=$?
rm -rf "$TMP"
exit $STATUS
