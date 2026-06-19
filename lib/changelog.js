// Player-facing release notes. The top entry is the current version: to ship a
// release, add a new entry here (and keep the wording about what players feel,
// not implementation details). The title-screen chip shows a "new" dot to
// anyone who hasn't seen the latest version yet.
export const CHANGELOG = [
  {
    version: "1.9",
    date: "June 19, 2026",
    title: "Boost stars, and a board for your rivalries",
    items: [
      "Glowing boost stars now sit on the road — grab one to instantly refill your boost to full. The Accra City Run has twice as many.",
      "New Rivals board: every friend you're racing in one place — who's leading, who chopped you, and which duels are about to expire, with a badge for how many need an answer.",
      "The global leaderboard now switches between the Akina and Accra boards, so your city times finally show up.",
      "Your racing name and photo are front and centre in the garage now, so no one misses them.",
      "Tidied up the driver-setup header on phones.",
    ],
  },
  {
    version: "1.8",
    date: "June 18, 2026",
    title: "A real garage — pick your ride in 3D",
    items: [
      "Driver setup is now a full-screen garage: your chosen car spins in 3D on a turntable, with live stat bars for top speed, acceleration, grip and agility.",
      "Four proper 3D cars to choose from — a sleek Street Coupe, a yellow Ghana Taxi, a Toyota-style Trotro minibus, and a futuristic Hover Bike — each with its own handling.",
      "Choose your circuit from track-map cards that show the layout, length, laps and gold target, then pick your sky: day, dusk or night.",
      "The Street Coupe still takes your paint colour; the taxi, trotro and hover bike wear their own liveries.",
      "More coins on the Accra City Run so boost recharges faster, and steering eases in even more gently so a quick tap no longer darts the car sideways.",
      "A quick loading screen now covers the moment the track is built, so starting a race no longer looks frozen.",
    ],
  },
  {
    version: "1.7",
    date: "June 15, 2026",
    title: "Calmer steering, cleaner setup on phones",
    items: [
      "Steering eases into the turn now — a quick tap nudges the car instead of snapping it sideways, but a full-lock corner is just as sharp when you hold it.",
      "Driver setup on small and landscape phone screens no longer gets cut off at the top: the card centers and scrolls so you can always reach every option.",
    ],
  },
  {
    version: "1.6",
    date: "June 13, 2026",
    title: "A whole new front door",
    items: [
      "Brand-new landing page that actually shows what the game is — scroll through the challenge loop, the times of day, the gap timer, and medals.",
      "Redesigned driver setup: cleaner layout, glossier paint chips, and your time-of-day pick built right in.",
      "Refreshed buttons and polish throughout.",
    ],
  },
  {
    version: "1.5",
    date: "June 12, 2026",
    title: "A mountain with more character",
    items: [
      "Braking boards count you down into the sharpest corners — learn the brake points, carry more speed.",
      "Richer forest: taller pines, mixed greens, and the odd autumn tree along the road.",
      "Side mirrors and finer detailing on your car.",
    ],
  },
  {
    version: "1.4",
    date: "June 12, 2026",
    title: "Race the mountain at dusk and midnight",
    items: [
      "Pick your time of day in driver setup: bright Day, golden Dusk, or moonlit Night.",
      "Night runs light up the road with real headlights, glowing tail lights, and a starfield over the peaks.",
      "Your choice sticks for next time.",
    ],
  },
  {
    version: "1.3",
    date: "June 12, 2026",
    title: "Challenges that don't die",
    items: [
      "Every new run resets the 24-hour clock, so a back-and-forth rivalry never times out mid-battle.",
      "A friend replied late? A link went quiet? Just race it — any run revives a dormant challenge for another 24 hours.",
      "Your challenges list now flags who chopped you and nudges you to revive the quiet ones.",
      "Clearer prompt to send the link after every run.",
    ],
  },
  {
    version: "1.2",
    date: "June 12, 2026",
    title: "Chase the gap",
    items: [
      "Live gap timer — green when you're up on your best run, red when you're down, updating all the way around the mountain.",
      "Ghosts now wear name tags with their times, so you always know who you're hunting. Toggle them in the pause menu.",
      "Ghosts fade out as you close in — race through them, not into them. Their brake lights work now too.",
      "Bronze, silver, and gold medal times on every run — see exactly how far the next medal is.",
      "Instant restart: press R or hit Restart in the pause menu. No more menu round trips.",
    ],
  },
  {
    version: "1.1",
    date: "June 11, 2026",
    title: "New touch controls: steer from the corners",
    items: [
      "Steering moved to the bottom corners — one thumb per direction, marked with big fading arrows.",
      "DRIFT now sits above both arrows: hold it with whichever thumb isn't steering.",
      "Boost is a tank in the middle — the fill shows charges left, tap to fire.",
      "BRAKE is a wide bar at the bottom; come to a stop and keep holding to reverse.",
      "Your thumb can slide between controls without lifting — no more stuck steering.",
      "Phones held sideways no longer get a cut-off screen that scrolls mid-race.",
    ],
  },
  {
    version: "1.0",
    date: "June 11, 2026",
    title: "Coins, ghosts, and a smoother ride on phones",
    items: [
      "Coin runs — coins now form lines and arcs that trace the racing line, and they come back every lap.",
      "Every 15 coins banks an extra boost charge (you can stock up to 5).",
      "A gold ghost races your personal best on every run — chop yourself first.",
      "Phone controls reworked: the car accelerates by itself, you steer, brake, drift, and boost. No more thumb cramp.",
      "Fixed iPhone taps triggering the magnifier bubble or zooming the page.",
      "Leaderboard times are now verified server-side — no more fake records.",
      "Report a bug or suggest a feature right from the title screen.",
    ],
  },
  {
    version: "0.9",
    date: "June 10, 2026",
    title: "The 24-hour challenge",
    items: [
      "Set a time, send the link — friends get 24 hours to chop it.",
      "Challenge leaderboards with rival ghost cars and road messages.",
      "Global all-time leaderboard.",
      "Animated title screen, driver setup with paint colors and profile photos.",
      "New mountain course with a summit hairpin and S-chicane.",
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
