// Player-facing release notes. The top entry is the current version: to ship a
// release, add a new entry here (and keep the wording about what players feel,
// not implementation details). The title-screen chip shows a "new" dot to
// anyone who hasn't seen the latest version yet.
export const CHANGELOG = [
  {
    version: "1.2",
    date: "June 11, 2026",
    title: "Race the mountain pack",
    items: [
      "Three computer rivals now share the road: Tofu Taxi, Drift Cat, and Kaido King — slow to fast.",
      "Live position tracker in the HUD and a finishing order when you cross the line.",
      "Rivals ease off a little when they're ahead and push when they're behind, so every run stays a race.",
      "Prefer the old quiet mountain? Switch to a solo run in driver setup.",
      "Challenge links are unchanged — there your friends' ghosts are the rivals.",
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
