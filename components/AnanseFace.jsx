"use client";

// Ananse the AI — static illustrated portraits. The earlier CSS blink/smile
// overlay was dropped: the eye/mouth rectangles never lined up with a generated
// face and read as glitches. A clean, well-drawn still reads better than a
// mistimed twitch, so we simply show the right crop for the context.
//
// variant:
//   "portrait" — the sly head-and-shoulders shot. Used in cards and the in-race
//                HUD bubble. A circular crop is available via `size="small"`.
//   "hero"     — the full-body standing-by-the-car pose for lobby / track screens.
//
// size (portrait only): "large" (default framed card) or "small" (HUD avatar).

export default function AnanseFace({ variant = "portrait", size = "large", className = "" }) {
  if (variant === "hero") {
    return (
      <img
        src="/ananse-standing.png"
        alt="Ananse the AI, leaning on his purple race car"
        className={`ananse-hero-img ${className}`}
        draggable={false}
      />
    );
  }

  const isSmall = size === "small";
  const containerStyle = isSmall
    ? {
        width: 52,
        height: 52,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        border: "2px solid #a06bff",
        position: "relative",
        background: "#1a1030",
      }
    : {
        width: "100%",
        aspectRatio: "1 / 1",
        overflow: "hidden",
        borderRadius: 14,
        position: "relative",
        background: "#1a1030",
      };

  // The portrait is a square 1:1 image with the face centred in the upper half.
  // small: zoom to the face; large: show the framed head-and-shoulders as-is.
  const imgStyle = isSmall
    ? { position: "absolute", width: "150%", top: "-6%", left: "-25%", display: "block" }
    : { width: "100%", height: "100%", objectFit: "cover", display: "block" };

  return (
    <div style={containerStyle} className={className} aria-label="Ananse the AI">
      <img src="/ananse-portrait.png" alt="Ananse the AI" style={imgStyle} draggable={false} />
    </div>
  );
}
