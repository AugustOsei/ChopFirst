// Player-facing release notes. The top entry is the current version: to ship a
// release, add a new entry here (and keep the wording about what players feel,
// not implementation details). The title-screen chip shows a "new" dot to
// anyone who hasn't seen the latest version yet.
export const CHANGELOG = [
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
