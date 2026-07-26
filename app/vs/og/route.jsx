import { ImageResponse } from "next/og";
import { parseArcadeShareParams, formatShareTime, SKILL_LABELS } from "../../../lib/arcade-share";

const size = { width: 1200, height: 630 };

// The card that lands in the chat. Rendered per result, so a share is a
// personal scoreline rather than a generic banner — that is the whole reason
// this route exists.
//
// Everything is drawn with CSS gradients and type: satori (what next/og runs on)
// supports a deliberately small subset of CSS, and pulling the arcade JPEG in
// over the network would add a fetch that can fail on a cold serverless start
// and leave the preview blank. A blank card is worse than a drawn one.
// A route handler, not the file-based `opengraph-image` convention: that
// convention only ever receives route `params`, never the query string, so it
// rendered every share as a loss regardless of the actual result. Reading
// request.url here is the only way to keep the result in a query string.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const result = parseArcadeShareParams(Object.fromEntries(searchParams));
  const time = formatShareTime(result.timeMs);
  const tier = SKILL_LABELS[result.skill];

  const headline = result.won ? "I BEAT ANANSE" : "ANANSE WON";
  const accent = result.won ? "#3ddc84" : "#ff7a2e";
  const kicker = result.won
    ? "Think you can do better?"
    : "Somebody go and humble him.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "68px 76px",
          background: "linear-gradient(135deg, #1a1030 0%, #0b1219 55%, #2a1440 100%)",
          color: "#f4f7fa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* display:flex is not decorative here — satori rejects any div with
              more than one child unless the display is stated explicitly. */}
          <div style={{ display: "flex", fontSize: 34, fontWeight: 900, letterSpacing: -1, fontStyle: "italic" }}>
            <span>CHOP</span>
            <span style={{ color: "#ffd15c" }}>FIRST</span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "6px 14px",
              borderRadius: 999,
              background: "rgba(124,58,237,.35)",
              border: "1px solid rgba(212,160,23,.5)",
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: 2,
              color: "#ffd15c",
            }}
          >
            ARCADE · VS ANANSE
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 108,
              fontWeight: 900,
              fontStyle: "italic",
              letterSpacing: -3,
              lineHeight: 1,
              color: accent,
            }}
          >
            {headline}
          </div>
          {(time || tier) && (
            <div style={{ display: "flex", gap: 18, marginTop: 26 }}>
              {time && (
                <div
                  style={{
                    display: "flex",
                    padding: "12px 24px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,.08)",
                    border: "1px solid rgba(255,255,255,.18)",
                    fontSize: 40,
                    fontWeight: 900,
                  }}
                >
                  {time}
                </div>
              )}
              {tier && (
                <div
                  style={{
                    display: "flex",
                    padding: "12px 24px",
                    borderRadius: 12,
                    background: "rgba(255,209,92,.14)",
                    border: "1px solid rgba(255,209,92,.45)",
                    fontSize: 40,
                    fontWeight: 900,
                    color: "#ffe8a1",
                  }}
                >
                  {tier}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 30, color: "rgba(213,222,234,.85)" }}>{kicker}</div>
          <div style={{ fontSize: 24, color: "rgba(213,222,234,.6)" }}>
            Free browser racing game
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        // Immutable per result, and chat scrapers hammer this on every paste.
        "cache-control": "public, max-age=31536000, immutable",
      },
    },
  );
}
