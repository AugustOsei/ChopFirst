// Arcade share links. Shared by the finish screen (which builds the message and
// the URL) and the /vs route (which reads the same params back to render the
// Open Graph card), so the two can never drift apart.
//
// Why a separate route rather than "/?arcade=1": app/page.js is a client
// component, so it cannot export generateMetadata, and Open Graph tags on "/"
// cannot vary per result. /vs is a server component that renders the card for
// crawlers and bounces humans into the arcade.
//
// Nothing user-entered goes in the URL — only the outcome, the time and the
// difficulty. The driver's name stays out of a link that gets forwarded around.

export const ARCADE_SHARE_PATH = "/vs";

export const SKILL_LABELS = {
  easy: "Cruising",
  medium: "Race pace",
  hard: "Full trickster",
  legend: "Unleashed",
};

export function formatShareTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = ms / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = (total - minutes * 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${seconds}`;
}

// { won, timeMs, marginMeters, skill } -> "/vs?w=1&t=101530&d=hard"
export function buildArcadeShareUrl(origin, { won, timeMs, marginMeters, skill }) {
  const params = new URLSearchParams();
  params.set("w", won ? "1" : "0");
  if (Number.isFinite(timeMs) && timeMs > 0) params.set("t", String(Math.round(timeMs)));
  if (Number.isFinite(marginMeters) && marginMeters > 0) params.set("m", String(Math.round(marginMeters)));
  if (SKILL_LABELS[skill]) params.set("d", skill);
  return `${origin}${ARCADE_SHARE_PATH}?${params.toString()}`;
}

export function parseArcadeShareParams(searchParams = {}) {
  const get = (key) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const timeMs = Number(get("t"));
  const marginMeters = Number(get("m"));
  const skill = get("d");
  return {
    won: get("w") === "1",
    timeMs: Number.isFinite(timeMs) && timeMs > 0 ? timeMs : null,
    marginMeters: Number.isFinite(marginMeters) && marginMeters > 0 ? marginMeters : null,
    skill: SKILL_LABELS[skill] ? skill : null,
  };
}

// The message that actually gets sent. A brag with a number in it travels; a
// neutral "this was fun" does not. Losing gets its own hook — "come help me beat
// him" is a better invitation than a recommendation.
export function buildArcadeShareText({ won, timeMs, marginMeters, skill }, url) {
  const time = formatShareTime(timeMs);
  const tier = SKILL_LABELS[skill];
  const tail = `Take him on: ${url}`;

  if (won) {
    if (skill === "legend") {
      return `🏁 I beat Ananse on UNLEASHED — his fastest setting — in CHOP FIRST${time ? ` (${time})` : ""}. The trash talk has gone very quiet. ${tail}`;
    }
    const by = marginMeters ? ` by ${marginMeters}m` : "";
    const on = tier ? ` on ${tier}` : "";
    return `🏁 I just chopped Ananse${by}${on} in CHOP FIRST${time ? ` — ${time}` : ""}. He has not stopped talking about it. ${tail}`;
  }

  const on = tier ? ` on ${tier}` : "";
  return `🏁 Ananse just beat me${on} in CHOP FIRST${time ? ` (${time})` : ""} and he will NOT shut up about it. Somebody go and humble him. ${tail}`;
}
