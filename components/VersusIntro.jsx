"use client";

// The fight card. Tapping "Race Ananse" used to hand you straight to a sponsor
// countdown, which is a strange reply to "I want to race this guy" — you named
// yourself, picked a car and chose his pace, and got a progress bar. This is the
// beat that pays that off: two portraits slam in from the edges, hit in the
// middle, and the VS stamps over the seam.
//
// It has to finish before the race mounts. RaceGame starts its 3-2-1 on the
// scene's first rendered frame (see the useFrame in RaceScene), so anything
// overlaying that moment eats the lights — the sequence is slam, then ad, then
// mount. That costs ~1.8s, so: skippable by tapping anywhere, and short enough
// that most people won't want to.

import { useEffect, useRef } from "react";
import AnanseFace from "./AnanseFace";

// Keep in step with the animation delays in styles.css (.vs-* keyframes).
const FULL_MS = 1800;
const REDUCED_MS = 900;

// A short impact to land the hit — noise burst through a falling lowpass over a
// low sine thump. Synthesised rather than shipped as an asset: it's 20 lines and
// no download. Silent if the player has muted the game (the race HUD's toggle
// persists to the same key).
function playImpact() {
  try {
    if (localStorage.getItem("chopfirst.muted") === "1") return null;
  } catch {
    // private mode — treat as unmuted
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const now = ctx.currentTime;

  const noise = ctx.createBufferSource();
  const frames = Math.floor(ctx.sampleRate * 0.22);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "lowpass";
  band.frequency.setValueAtTime(2600, now);
  band.frequency.exponentialRampToValueAtTime(320, now + 0.2);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.34, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  noise.connect(band).connect(noiseGain).connect(ctx.destination);

  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(120, now);
  thump.frequency.exponentialRampToValueAtTime(38, now + 0.18);
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.5, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
  thump.connect(thumpGain).connect(ctx.destination);

  noise.start(now);
  thump.start(now);
  thump.stop(now + 0.28);
  return ctx;
}

export default function VersusIntro({ driver, carName, paceLabel, onDone }) {
  const doneRef = useRef(false);
  const name = (driver?.name || "").trim() || "Street Driver";
  const initial = name.slice(0, 1).toUpperCase();
  const paint = driver?.color || "#ffcf42";

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    };

    // The hit lands ~0.38s in, when the two plates meet.
    let ctx = null;
    const hit = reduced ? null : setTimeout(() => { ctx = playImpact(); }, 380);
    const end = setTimeout(finish, reduced ? REDUCED_MS : FULL_MS);

    const onKey = (e) => {
      // Enter/Space are how you'd dismiss the focused Skip button anyway; any
      // other key is an impatient player, and they get the same answer.
      if (e.key === "Tab") return;
      finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(hit);
      clearTimeout(end);
      window.removeEventListener("keydown", onKey);
      if (ctx) ctx.close().catch(() => {});
    };
  }, [onDone]);

  const skip = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  return (
    <div className="vs-intro" onClick={skip} role="status" aria-live="polite">
      <span className="sr-only">{name} versus Ananse. Starting the race.</span>

      <div className="vs-shake">
        <p className="vs-eyebrow">Arcade mode</p>

        {/* Two diagonal plates that meet on a shared seam. clip-path rather
            than skewing the halves, so the portraits and type stay upright. */}
        <div className="vs-side vs-side-player" style={{ "--accent": paint }}>
          <div className="vs-side-inner">
            <div className="vs-portrait" style={{ borderColor: paint }}>
              {driver?.photo
                ? <img src={driver.photo} alt="" />
                : <span className="vs-initial" style={{ color: paint }}>{initial}</span>}
            </div>
            <div className="vs-plate">
              <b>{name}</b>
              <span>The challenger</span>
              {carName && <i>{carName}</i>}
            </div>
          </div>
        </div>

        <div className="vs-side vs-side-ananse">
          <div className="vs-side-inner">
            <div className="vs-portrait vs-portrait-ananse">
              <AnanseFace variant="portrait" />
            </div>
            <div className="vs-plate">
              <b>Ananse</b>
              <span>The AI trickster</span>
              {paceLabel && <i>{paceLabel}</i>}
            </div>
          </div>
        </div>

        <div className="vs-seam" aria-hidden="true" />
        <div className="vs-mark" aria-hidden="true">VS</div>
        <div className="vs-flash" aria-hidden="true" />
      </div>

      <button type="button" className="vs-skip" onClick={skip}>Skip ›</button>
    </div>
  );
}
