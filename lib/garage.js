// Garage + arcade constants shared by the Time Attack setup screen (app/page.js)
// and the arcade setup flow (components/ArcadeSetup.jsx), so the two can agree
// on paint, spec rows and Ananse's pace tiers without importing each other.

export const CAR_COLORS = [
  { id: "#d81f33", label: "Rosso" },
  { id: "#2563eb", label: "Bayside Blue" },
  { id: "#f5b818", label: "Sunburst" },
  { id: "#1f9d55", label: "Ridge Green" },
  { id: "#374151", label: "Midnight" },
  { id: "#e8ecef", label: "Chalk" },
];

export const SPEC_ROWS = [
  ["speed", "Top Speed"],
  ["accel", "Acceleration"],
  ["grip", "Grip"],
  ["agility", "Agility"],
];

// Ananse's pace tiers, in order. `paceSeconds` is his measured solo three-lap
// Akina time from scripts/ai-sim.sh — printed on the picker so "how hard is
// hard?" has a number behind it instead of an adjective. Keep in step with
// ANANSE_DIFFICULTIES in game/ai-driver.js.
export const ANANSE_SKILLS = [
  {
    id: "easy",
    label: "Cruising",
    blurb: "He hangs back and rarely boosts. Room to learn the ridge.",
    paceSeconds: 147,
  },
  {
    id: "medium",
    label: "Race pace",
    blurb: "He races your pace and keeps it close. Beatable, never free.",
    paceSeconds: 133,
  },
  {
    id: "hard",
    label: "Full trickster",
    blurb: "No mercy. Late braking, boosts on sight, gold-medal pace.",
    paceSeconds: 104,
  },
  {
    id: "legend",
    label: "Unleashed",
    blurb: "He stops racing you and races the clock. No rubber band.",
    paceSeconds: 99,
  },
];

export const ANANSE_SKILL_IDS = ANANSE_SKILLS.map((s) => s.id);
export const ANANSE_SKILL_LABELS = Object.fromEntries(ANANSE_SKILLS.map((s) => [s.id, s.label]));
export const ANANSE_SKILL_MAP = Object.fromEntries(ANANSE_SKILLS.map((s) => [s.id, s]));

// 147 -> "2:27". Race times, not lap times — three laps of Akina.
export function paceClock(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}
