// Loading-screen sponsor slots. Add entries here to rotate creatives —
// pickAd() draws one at random per impression. Creatives are portrait
// (4:5-ish); the loading card letterboxes them on a solid fill, so one
// asset serves both mobile and desktop.
export const AD_SECONDS = 5;

const ADS = [
  {
    id: "explorer233",
    image: "/ads/explorer233.jpg",
    url: "https://www.explorer233.com/",
    domain: "explorer233.com",
    alt: "Explorer 233 — Ghanaian astronauts on the moon, earthrise behind them",
  },
];

export function pickAd() {
  return ADS[Math.floor(Math.random() * ADS.length)];
}

// Roadside boards along the mountain course. Same creatives, different job: the
// loading card can let an image speak for itself because the reader is sitting
// still, but a board passed at 140km/h has about two seconds of legibility, so
// each one carries its own headline and domain drawn as type rather than
// relying on whatever is baked into the artwork. Creatives are portrait, so the
// board composes them into a landscape panel instead of stretching them —
// see makeAdBoardTexture in RaceGame.
//
// To add a sponsor: drop the image in /public/ads and add an entry here. `image`
// is optional — leave it out and the board sets the type across the full panel
// instead of reserving a picture block, which is how the house ads below work.
//
// Order matters: boards are handed out around the lap in sequence, so keep a
// paying creative between the house ads rather than letting the two of them sit
// on consecutive boards.
export const TRACKSIDE_ADS = [
  {
    id: "explorer233",
    image: "/ads/explorer233.jpg",
    headline: ["EXPLORER", "233"],
    tagline: "GHANA IS GOING UP",
    domain: "explorer233.com",
    bg: "#0a1030",
    fg: "#ffffff",
    accent: "#f4c430",
  },
  {
    id: "house-challenge",
    headline: ["24 HOURS", "TO CHOP IT"],
    tagline: "SET A TIME · SHARE THE LINK",
    domain: "CHOP FIRST",
    bg: "#141018",
    fg: "#f7f4ec",
    accent: "#ff8a3d",
  },
  {
    id: "house-ananse",
    headline: ["ANANSE", "IS WAITING"],
    tagline: "HE BRAKES LATE. HE TALKS.",
    domain: "ARCADE MODE",
    bg: "#1b1030",
    fg: "#f2ecff",
    accent: "#c178ff",
  },
];
