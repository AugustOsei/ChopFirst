import { SITE_URL } from "../../lib/site";
import { buildArcadeShareText, parseArcadeShareParams, formatShareTime, SKILL_LABELS } from "../../lib/arcade-share";
import VsRedirect from "./VsRedirect";

// Share target for Arcade results.
//
// This exists as its own route purely so the Open Graph card can vary with the
// result: app/page.js is a client component and cannot export generateMetadata,
// so tags on "/" are fixed for every visitor. Here they are per-result.
//
// Chat apps scrape the head and never run JS, so they get the card below while
// a real person is bounced straight into the arcade by VsRedirect. Anyone with
// JS disabled still gets a working link in the markup.

export async function generateMetadata({ searchParams }) {
  const result = parseArcadeShareParams(await searchParams);
  const time = formatShareTime(result.timeMs);
  const tier = SKILL_LABELS[result.skill];

  const title = result.won
    ? `I beat Ananse${tier ? ` on ${tier}` : ""} — CHOP FIRST`
    : `Ananse won${tier ? ` on ${tier}` : ""} — can you beat him? — CHOP FIRST`;

  const description = result.won
    ? `${time ? `${time}. ` : ""}Race Ananse, the trash-talking AI driver, in CHOP FIRST — a free browser racing game. Think you can do better?`
    : `${time ? `${time}. ` : ""}Ananse is still talking. Take him on in CHOP FIRST — a free browser racing game.`;

  // Query string is forwarded so the image route renders the same result.
  const params = new URLSearchParams();
  if (result.won) params.set("w", "1");
  if (result.timeMs) params.set("t", String(result.timeMs));
  if (result.skill) params.set("d", result.skill);
  const image = `${SITE_URL}/vs/og?${params.toString()}`;

  return {
    title,
    description,
    alternates: { canonical: "/vs" },
    // A share target is not a page worth indexing — it only ever redirects.
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/vs`,
      siteName: "CHOP FIRST",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function VsPage({ searchParams }) {
  const result = parseArcadeShareParams(await searchParams);
  const text = buildArcadeShareText(result, `${SITE_URL}/vs`);

  return (
    <main className="vs-fallback">
      <h1>CHOP FIRST — race Ananse</h1>
      <p>{text}</p>
      <a href="/?arcade=1">Open the game</a>
      <VsRedirect />
    </main>
  );
}
