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
