"use client";

// Arcade setup — the screen between "Race Ananse" and the start lights.
//
// It asks for three things: a car, a driver, and how hard Ananse should race.
// The old version asked for the same three but arrived with all of them already
// answered (a default car, a persisted pace, a locked track), which made the
// "Next" button the only live control on every step — so players tapped it
// three times and raced a setup they never chose. Two rules fix that:
//
//   1. Nothing is pre-selected for a first-timer. The advance control is
//      disabled until the step's question is answered, and while it is disabled
//      it says what is missing ("Pick a car to continue") rather than just
//      dimming. Returning players get their last choices back, tagged as
//      remembered, so the flow stays one tap deep for them.
//   2. The loud gradient CTA appears exactly once, on the final grid screen.
//      Every advance before it is a quiet bar, so nothing outranks the choices.
//
// Phones get one question per screen; desktops get all three side by side with
// a single gated start, because a wizard on a 1440px canvas is mostly wasted
// space. Both layouts run off the same state and the same pickers below.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AnanseFace from "./AnanseFace";
import { listVehicles, vehicleStats, DEFAULT_VEHICLE } from "../game/vehicle";
import { TRACK } from "../game/track";
import { CAR_COLORS, SPEC_ROWS, ANANSE_SKILLS, ANANSE_SKILL_MAP, paceClock } from "../lib/garage";
import { logEvent } from "../lib/log-event";

const GaragePreview = dynamic(() => import("./GaragePreview"), { ssr: false });

const VEHICLE_LIST = listVehicles();

const STEP_IDS = ["ride", "driver", "pace", "grid"];
const STEP_TITLES = {
  ride: "Choose your ride",
  driver: "Who's racing?",
  pace: "How hard should he race?",
  grid: "On the grid",
};

const RIDE_LINES = {
  hoverbike: "Ooh, the hover bike? Bold choice. Doesn't mean you'll beat me.",
  trotro: "A trotro?! Ha! This will be entertaining.",
  taxi: "The taxi, eh? At least it has… character.",
};
const RIDE_LINE_FALLBACK = "Solid choice. Mine is better.";

const PACE_LINES = {
  easy: "Cruising? Fine. I'll drive with one hand.",
  medium: "Race pace. Now we're talking.",
  hard: "Full trickster?! Chale… remember, you asked for this.",
  legend: "Unleashed. No more games. I will not wait for you.",
};

// He says something on arrival at each step, so the strip is never quoting a
// reaction to a choice two screens back. `ride` can only be arrived at by going
// backwards — the first visit uses the opening line below.
const STEP_ENTRY_LINES = {
  ride: "Changed your mind? Smart. Take your time.",
  driver: "A name, please. I like to know who I am beating.",
  pace: "Now the real question — how much of me can you handle?",
  grid: "Akina Ridge. Every hairpin is mine. Come and try.",
};

// Desktop gets the single-board layout; anything narrower gets the stepper.
// 1000px is where three columns stop being cramped.
function useWideLayout(minWidth = 1000) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [minWidth]);
  return wide;
}

// What this device already knows about the player. Drives the "your last race"
// tags and lets a returning player through without re-answering — but only for
// answers genuinely given before, never for the code defaults.
const PICKS_KEY = "chopfirst.arcadePicks";

function readRemembered() {
  const blank = { ride: false, driver: false, pace: false };
  if (typeof window === "undefined") return blank;
  try {
    // Written on the way to the grid. It is the reliable record: a player who
    // chose the Street Coupe and raced anonymously leaves nothing behind in
    // chopfirst.driver, because those are also the code defaults.
    const picks = JSON.parse(localStorage.getItem(PICKS_KEY) || "null");
    if (picks && typeof picks === "object") {
      return { ride: !!picks.ride, driver: !!picks.driver, pace: !!picks.pace };
    }
    // Fallback for players who last raced before that key existed.
    const saved = JSON.parse(localStorage.getItem("chopfirst.driver") || "null");
    return {
      ride: !!saved?.vehicle,
      driver: !!saved?.name,
      pace: !!localStorage.getItem("chopfirst.ananseSkill"),
    };
  } catch {
    return blank;
  }
}

/* ---------------------------------------------------------------- pickers -- */

function RidePicker({ driver, chosen, onPick, onPaint }) {
  const current = driver.vehicle || DEFAULT_VEHICLE;
  const stats = vehicleStats(current);
  return (
    <div className="pick-ride">
      <div className="car-cards">
        {VEHICLE_LIST.map((v) => {
          const vs = vehicleStats(v.id);
          return (
            <button
              key={v.id}
              type="button"
              className={`car-card${chosen && current === v.id ? " selected" : ""}`}
              onClick={() => onPick(v.id)}
            >
              <span className="cc-name">{v.name}</span>
              <span className="cc-class">{v.klass}</span>
              <div className="cc-bar"><div style={{ width: `${vs.bars.speed}%` }} /></div>
              <span className="cc-top">{vs.topSpeedKmh} km/h</span>
            </button>
          );
        })}
      </div>

      {/* Before a pick there is nothing honest to show in the garage bay, and a
          preview of a car the player has not chosen is exactly what made the
          old default look like a decision already made. */}
      {chosen ? (
        <div className="ride-preview">
          <div className="ride-preview-stage">
            <GaragePreview vehicle={current} paint={driver.color} />
          </div>
          <div className="ride-preview-info">
            <span className="veh-class">{stats.klass}</span>
            <h4>{stats.name}</h4>
            <div className="spec-bars">
              {SPEC_ROWS.map(([k, label]) => (
                <div className="spec-row" key={k}>
                  <span>{label}</span>
                  <div className="spec-track"><div className="spec-fill" style={{ width: `${stats.bars[k]}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="ride-empty">
          <span className="ride-empty-mark" aria-hidden="true">◍</span>
          <p>Pick a car and it rolls into the light.</p>
        </div>
      )}

      {chosen && current === "street" && (
        <div className="paint-row">
          <span className="section-label">Paint</span>
          <div className="swatch-row">
            {CAR_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                title={color.label}
                aria-label={`Paint: ${color.label}`}
                className={`swatch${driver.color === color.id ? " selected" : ""}`}
                style={{ background: color.id }}
                onClick={() => onPaint(color.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DriverPicker({ driver, onName, onPhoto, autoFocus = false }) {
  return (
    <div className="identity-card">
      <div className="identity-row">
        <label className="photo-pick">
          {driver.photo
            ? <img src={driver.photo} alt="Your profile" />
            : <span className="photo-empty">＋<i>Photo</i></span>}
          <input type="file" accept="image/*" onChange={onPhoto} />
        </label>
        <label className="field name-field">
          Your racing name
          <input
            value={driver.name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Enter your name"
            maxLength={32}
            autoFocus={autoFocus}
          />
        </label>
      </div>
      <p className="arcade-step-hint">
        This is the name on the leaderboard and the one Ananse taunts. Your photo rides on the results card
        and never leaves this device.
      </p>
    </div>
  );
}

function PacePicker({ value, chosen, remembered, onPick }) {
  return (
    <div className="pace-rows">
      {ANANSE_SKILLS.map((skill) => {
        const selected = chosen && value === skill.id;
        return (
          <button
            key={skill.id}
            type="button"
            className={`pace-row${selected ? " selected" : ""}`}
            onClick={() => onPick(skill.id)}
            aria-pressed={selected}
          >
            <span className="pace-row-main">
              <b>
                {skill.label}
                {remembered && value === skill.id && <i className="pace-tag">your last race</i>}
              </b>
              <span>{skill.blurb}</span>
            </span>
            <span className="pace-row-clock">
              <b>{paceClock(skill.paceSeconds)}</b>
              <i>his 3 laps</i>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ screen -- */

export default function ArcadeSetup({
  driver,
  setDriver,
  ananseSkill,
  setAnanseSkill,
  onBack,
  onStart,
  onPhoto,
}) {
  const wide = useWideLayout();
  const [remembered] = useState(readRemembered);
  // Which questions the player has actually answered. Seeded from storage so a
  // returning player is not made to re-pick what this device already knows.
  const [picked, setPicked] = useState(() => ({ ...remembered }));
  // How far this device's memory already carries the player: the first step
  // they still have to answer, or the grid if they answered everything last
  // time. A returning player lands on the grid with one tap left to race and
  // every choice still one tap away via the dots and the grid's edit links.
  const answeredThrough = (() => {
    let i = 0;
    while (i < 3 && remembered[STEP_IDS[i]]) i += 1;
    return i;
  })();
  const [step, setStep] = useState(STEP_IDS[answeredThrough]);
  const [reached, setReached] = useState(answeredThrough);
  const [line, setLine] = useState("I have been waiting. Are you ready… or just browsing?");

  const stepIndex = Math.max(0, STEP_IDS.indexOf(step));
  const stats = vehicleStats(driver.vehicle || DEFAULT_VEHICLE);
  const displayName = driver.name.trim() || "Street Driver";
  const pace = ANANSE_SKILL_MAP[ananseSkill] || ANANSE_SKILL_MAP.medium;
  const allPicked = picked.ride && picked.driver && picked.pace;
  const laps = TRACK.laps;

  function goTo(id) {
    setStep(id);
    setReached((r) => Math.max(r, STEP_IDS.indexOf(id)));
    if (STEP_ENTRY_LINES[id]) setLine(STEP_ENTRY_LINES[id]);
    // Without this the step changes while the viewport stays deep in the
    // previous step's content.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pickRide(id) {
    setDriver({ ...driver, vehicle: id });
    setPicked((p) => ({ ...p, ride: true }));
    setLine(RIDE_LINES[id] || RIDE_LINE_FALLBACK);
  }

  function pickPace(id) {
    setAnanseSkill(id);
    setPicked((p) => ({ ...p, pace: true }));
    setLine(PACE_LINES[id] || PACE_LINES.medium);
    logEvent("arcade_pace_chosen");
  }

  function setName(value) {
    setDriver({ ...driver, name: value });
    setPicked((p) => ({ ...p, driver: value.trim().length > 0 }));
  }

  function race() {
    logEvent(driver.name.trim() ? "arcade_setup_named" : "arcade_setup_anon");
    try { localStorage.setItem(PICKS_KEY, JSON.stringify(picked)); } catch { /* private mode */ }
    onStart();
  }

  const opponent = (
    <div className="ananse-strip">
      <AnanseFace variant="portrait" size="small" />
      <div className="ananse-strip-text">
        <b>Ananse</b>
        <span>{line}</span>
      </div>
    </div>
  );

  /* ---- desktop: one board, three questions, one gated start ---- */
  if (wide) {
    return (
      <div className="garage-screen arcade-lobby-screen">
        <div className="garage-inner arcade-desk-inner">
          <header className="garage-head">
            <div>
              <p className="eyebrow">Arcade</p>
              <h2 className="setup-title">Race Ananse</h2>
            </div>
            <button className="ghost-button garage-back" onClick={onBack}>‹ Back</button>
          </header>

          <div className="arcade-desk">
            <aside className="ad-opponent">
              <p className="arcade-side-label">Your opponent</p>
              <div className="ananse-hero-wrap">
                <AnanseFace variant="hero" />
                <div className="ananse-hero-plate">
                  <span className="ananse-name">Ananse</span>
                  <span className="ananse-sub">The trickster AI · purple &amp; gold coupe</span>
                </div>
              </div>
              <div className="ananse-speech-bubble ananse-lobby-bubble"><span>{line}</span></div>
            </aside>

            <section className="ad-col">
              <p className="ad-q"><i>1</i> Your ride</p>
              <RidePicker
                driver={driver}
                chosen={picked.ride}
                onPick={pickRide}
                onPaint={(color) => setDriver({ ...driver, color })}
              />
            </section>

            <section className="ad-col">
              <p className="ad-q"><i>2</i> Your driver</p>
              <DriverPicker driver={driver} onName={setName} onPhoto={onPhoto} />
              <p className="ad-q"><i>3</i> Ananse&apos;s pace</p>
              <PacePicker
                value={ananseSkill}
                chosen={picked.pace}
                remembered={remembered.pace}
                onPick={pickPace}
              />
              <p className="arcade-track-note">
                Akina Ridge · {laps} laps — the only circuit Ananse races for now.
              </p>
            </section>
          </div>

          <div className="start-bar arcade-desk-bar">
            <ul className="ad-check">
              <li className={picked.ride ? "on" : ""}>
                <b>{picked.ride ? "✓" : "○"}</b> {picked.ride ? stats.name : "Car"}
              </li>
              <li className={picked.driver ? "on" : ""}>
                <b>{picked.driver ? "✓" : "○"}</b> {picked.driver ? displayName : "Driver"}
              </li>
              <li className={picked.pace ? "on" : ""}>
                <b>{picked.pace ? "✓" : "○"}</b> {picked.pace ? pace.label : "His pace"}
              </li>
            </ul>
            <button
              className="primary start-cta arcade-start-cta"
              onClick={race}
              disabled={!allPicked}
            >
              {allPicked ? `Race Ananse — ${laps} laps` : "Answer all three to race"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- phones: one question per screen, gated advance ---- */
  const nextLabel =
    step === "ride"
      ? picked.ride ? `Next — you're in the ${stats.name} ›` : "Pick a car to continue"
      : step === "driver"
        ? picked.driver ? `Next — good luck, ${displayName} ›` : "Add your name to continue"
        : picked.pace ? `Next — ${pace.label} it is ›` : "Pick his pace to continue";
  const canAdvance = step === "ride" ? picked.ride : step === "driver" ? picked.driver : picked.pace;

  return (
    <div className="garage-screen arcade-lobby-screen">
      <div className="garage-inner">
        <header className="garage-head">
          <div>
            <p className="eyebrow">Arcade</p>
            <h2 className="setup-title">Race Ananse</h2>
          </div>
          <button
            className="ghost-button garage-back"
            onClick={() => (stepIndex === 0 ? onBack() : goTo(STEP_IDS[stepIndex - 1]))}
          >
            ‹ Back
          </button>
        </header>

        {/* Ananse rides along as a strip while you're deciding — a phone-height
            hero band here is what used to push the actual question off the
            fold. On the grid he steps out of the strip and into the VS card,
            which is a better frame for him anyway. */}
        {step !== "grid" && (
          <section className="arcade-opponent compact">
            <p className="arcade-side-label">Your opponent</p>
            {opponent}
          </section>
        )}

        <section className="arcade-step">
          <div className="arcade-step-head">
            <p className="arcade-step-count">
              Step {stepIndex + 1} of {STEP_IDS.length}
              <span className="arcade-step-dots">
                {STEP_IDS.map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    className={i === stepIndex ? "on" : i < stepIndex ? "done" : ""}
                    disabled={i > reached}
                    aria-label={`Step ${i + 1}: ${STEP_TITLES[id]}`}
                    onClick={() => goTo(id)}
                  />
                ))}
              </span>
            </p>
            <h3 className="arcade-step-title">{STEP_TITLES[step]}</h3>
          </div>

          {step === "ride" && (
            <RidePicker
              driver={driver}
              chosen={picked.ride}
              onPick={pickRide}
              onPaint={(color) => setDriver({ ...driver, color })}
            />
          )}

          {step === "driver" && (
            <DriverPicker driver={driver} onName={setName} onPhoto={onPhoto} autoFocus />
          )}

          {step === "pace" && (
            <>
              <PacePicker
                value={ananseSkill}
                chosen={picked.pace}
                remembered={remembered.pace}
                onPick={pickPace}
              />
              <p className="arcade-step-hint">
                Times are his, driving Akina alone. Gold on this circuit is 2:09.
              </p>
            </>
          )}

          {step === "grid" && (
            <div className="grid-card">
              <div className="grid-vs">
                <div className="grid-side">
                  {driver.photo
                    ? <img className="grid-avatar" src={driver.photo} alt="" />
                    : <span className="grid-avatar grid-avatar-blank">{displayName.slice(0, 1).toUpperCase()}</span>}
                  <b>{displayName}</b>
                  <span>{stats.name}</span>
                </div>
                <span className="grid-vs-mark">VS</span>
                <div className="grid-side">
                  <AnanseFace variant="portrait" size="small" className="grid-avatar-ananse" />
                  <b>Ananse</b>
                  <span>{pace.label}</span>
                </div>
              </div>
              <ul className="grid-lines">
                <li>
                  <span>Circuit</span><b>{TRACK.name} · {laps} laps</b>
                </li>
                <li>
                  <span>His pace</span><b>{paceClock(pace.paceSeconds)} solo</b>
                </li>
                <li className="grid-edit">
                  <button type="button" onClick={() => goTo("ride")}>Change car</button>
                  <button type="button" onClick={() => goTo("pace")}>Change his pace</button>
                </li>
              </ul>
              <div className="ananse-speech-bubble ananse-lobby-bubble">
                <span>{line}</span>
              </div>
            </div>
          )}
        </section>

        <div className="start-bar">
          {step === "grid" ? (
            <button className="primary start-cta arcade-start-cta" onClick={race}>
              Race Ananse — {laps} laps
            </button>
          ) : (
            <>
              <button
                className="primary step-next"
                disabled={!canAdvance}
                onClick={() => goTo(STEP_IDS[stepIndex + 1])}
              >
                {nextLabel}
              </button>
              {step === "driver" && !picked.driver && (
                <button
                  type="button"
                  className="step-skip"
                  onClick={() => {
                    setPicked((p) => ({ ...p, driver: true }));
                    goTo("pace");
                  }}
                >
                  Skip — race as &ldquo;Street Driver&rdquo;
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
