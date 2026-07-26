import { useEffect, useRef, useState } from "react";
import { MINIMAP, TRACK } from "../game/track";

const GAUGE_MAX_KMH = 240;
const BOOST_MAX = 5;

// --- instrument cluster ------------------------------------------------------
// A frosted dial with dark numerals, a printed redline, and a segmented LCD in
// the lower half. The LCD is drawn as real seven-segment geometry rather than
// set in a font: the unlit segments have to be visible as ghosts behind the lit
// ones, and that ghosting is most of what makes a display read as a display
// rather than as numbers in a rectangle.
const TACH_SWEEP = 250;
const TACH_START = -TACH_SWEEP / 2; // degrees clockwise from 12 o'clock
const TACH_STEPS = 12; // 13 ticks, one per 20 km/h
const TACH_ARC_R = 88;
const TACH_ARC_C = 2 * Math.PI * TACH_ARC_R;
const TACH_ARC_SWEEP = (TACH_SWEEP / 360) * TACH_ARC_C;
// SVG strokes start at 3 o'clock; the sweep begins 145° round from there
const TACH_ROTATION = TACH_START + 270;
const TACH_REDLINE_FROM = 0.82;

const TACH_TICKS = Array.from({ length: TACH_STEPS + 1 }, (_, i) => {
  const fraction = i / TACH_STEPS;
  const rad = ((TACH_START + fraction * TACH_SWEEP) * Math.PI) / 180;
  const major = i % 2 === 0; // labelled every 40 km/h
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const inner = major ? 66 : 72;
  return {
    key: i,
    fraction,
    major,
    x1: 100 + sin * inner,
    y1: 100 - cos * inner,
    x2: 100 + sin * 79,
    y2: 100 - cos * 79,
    labelX: 100 + sin * 61,
    labelY: 100 - cos * 61,
    // the face is numbered in tens, so every label is one or two characters —
    // three-digit labels are what made the dial look cramped. The exact figure
    // lives in the LCD; the ring only has to give you the ballpark at a glance.
    label: major ? String((i * (GAUGE_MAX_KMH / TACH_STEPS)) / 10) : null,
  };
});

// --- seven-segment display ---------------------------------------------------
// Segment order: a top, b upper-right, c lower-right, d bottom, e lower-left,
// f upper-left, g middle.
const SEG_W = 13;
const SEG_H = 22;
const SEG_T = 2.7;
const SEG_M = 1.4;

const segH = (x, y, len) => {
  const h = SEG_T / 2;
  return `${x + h},${y - h} ${x + len - h},${y - h} ${x + len},${y} ${x + len - h},${y + h} ${x + h},${y + h} ${x},${y}`;
};
const segV = (x, y, len) => {
  const h = SEG_T / 2;
  return `${x - h},${y + h} ${x - h},${y + len - h} ${x},${y + len} ${x + h},${y + len - h} ${x + h},${y + h} ${x},${y}`;
};

const SEG_SPAN = SEG_W - SEG_M * 2;
const SEG_HALF = (SEG_H - SEG_M * 2) / 2;
const SEG_SHAPES = {
  a: segH(SEG_M, SEG_M, SEG_SPAN),
  g: segH(SEG_M, SEG_H / 2, SEG_SPAN),
  d: segH(SEG_M, SEG_H - SEG_M, SEG_SPAN),
  f: segV(SEG_M, SEG_M, SEG_HALF),
  b: segV(SEG_W - SEG_M, SEG_M, SEG_HALF),
  e: segV(SEG_M, SEG_H / 2, SEG_HALF),
  c: segV(SEG_W - SEG_M, SEG_H / 2, SEG_HALF),
};
const SEG_DIGITS = {
  0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg",
  5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg",
};
const SEG_KEYS = Object.keys(SEG_SHAPES);

// `places` keeps the readout a fixed width so the digits never shuffle sideways
// as the speed crosses 10 or 100 — a display that reflows is a display you
// cannot read at a glance.
function SevenSegment({ value, places = 3 }) {
  const text = String(Math.min(value, 10 ** places - 1)).padStart(places, " ");
  return (
    <svg className="lcd" viewBox={`0 0 ${places * (SEG_W + 3)} ${SEG_H}`} aria-hidden>
      {text.split("").map((char, index) => {
        const on = SEG_DIGITS[char] || "";
        return (
          <g key={index} transform={`translate(${index * (SEG_W + 3)} 0)`}>
            {SEG_KEYS.map((key) => (
              <polygon key={key} className={on.includes(key) ? "seg on" : "seg"} points={SEG_SHAPES[key]} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

const MAP_RING_R = 46;
const MAP_RING_C = 2 * Math.PI * MAP_RING_R;

// Touch has no reverse button — surface the hold-brake gesture the first time
// the car sits stopped mid-race (usually pinned against a rail).
function useReverseHint(race) {
  const [show, setShow] = useState(false);
  const shownRef = useRef(false);
  const stillSince = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (shownRef.current) return;
    if (!window.matchMedia("(hover: none)").matches) return;
    const racing = race.countdown <= 0 && race.timeMs > 4000;
    const stopped = Math.abs(race.speed) < 1.5;
    if (!racing || !stopped || race.reversing) {
      stillSince.current = null;
      return;
    }
    if (stillSince.current === null) stillSince.current = race.timeMs;
    if (race.timeMs - stillSince.current > 1600) {
      shownRef.current = true;
      setShow(true);
      timerRef.current = setTimeout(() => setShow(false), 4000);
    }
  }, [race]);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  return show;
}

export default function RaceHud({ race, driver, muted, onToggleMute, onPause }) {
  const kmh = Math.round(Math.abs(race.speed) * 3.6);
  const reverseHint = useReverseHint(race);
  const gaugeRatio = Math.min(1, kmh / GAUGE_MAX_KMH);
  const boosting = race.boostTimer > 0;
  const speedHeat = Math.min(1, Math.max(0, kmh - 110) / 110);
  const gear = race.reversing ? "R" : kmh < 2 ? "N" : "D";

  return (
    <>
      <div className={`speed-fx${boosting ? " on" : ""}`} aria-hidden />
      <div className="speed-vignette" style={{ opacity: speedHeat * 0.5 + (boosting ? 0.25 : 0) }} aria-hidden />
      {/* Broadcast scrim. With no panels behind the readings, white type has to
          survive a bright sky and a snowline — so the corners the HUD occupies
          get a soft darkening instead, which you stop seeing after one corner. */}
      <div className="hud-scrim" aria-hidden />

      <div className="hud-corner">
        <button className="hud-icon" aria-label="Pause" onClick={onPause}>
          <svg viewBox="0 0 16 16" aria-hidden>
            <rect x="3.4" y="2.6" width="3.4" height="10.8" rx="1.2" />
            <rect x="9.2" y="2.6" width="3.4" height="10.8" rx="1.2" />
          </svg>
        </button>
        <button className="hud-icon" aria-label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M3 6h2.4L9 3v10L5.4 10H3z" />
            {muted ? (
              <path className="stroke" d="M11 6l3.4 4M14.4 6L11 10" />
            ) : (
              <path className="stroke" d="M11.4 5.6a3.4 3.4 0 0 1 0 4.8" />
            )}
          </svg>
        </button>
        {(driver?.name || driver?.photo) && (
          <div className="hud-driver">
            {driver.photo ? <img src={driver.photo} alt="" /> : <span>{(driver.name || "?").slice(0, 1).toUpperCase()}</span>}
            {driver.name && <b>{driver.name}</b>}
          </div>
        )}
      </div>

      {/* The run, set as type on the scene rather than boxed in a panel. Time is
          the thing being chased, so it is the only display-sized number up here;
          lap is its eyebrow and the rest are footnotes. */}
      <div className="hud-run">
        <div className="run-lap">
          LAP <b>{Math.min(TRACK.laps, race.lap + 1)}</b><i>/{TRACK.laps}</i>
        </div>
        <div className="run-time">{formatTime(race.timeMs)}</div>
        <div className="run-tail">
          <span className="run-coins" key={race.coins}>
            <i aria-hidden />{race.coins}
          </span>
          <span className={`run-drift${race.drifting ? " live" : ""}`}>DRIFT {race.driftScore}</span>
        </div>
      </div>

      {race.delta !== null && race.countdown <= 0 && (
        <div className={`delta-timer${race.delta < -50 ? " ahead" : race.delta > 50 ? " behind" : ""}`}>
          {race.delta >= 0 ? "+" : "−"}{(Math.abs(race.delta) / 1000).toFixed(2)}
        </div>
      )}

      {race.banner && <div className="lap-banner" key={race.banner.id}>{race.banner.text}</div>}

      {race.roadMessage && (
        <div className="road-toast" key={race.roadMessage.id}>
          {race.roadMessage.photo ? (
            <img className="road-toast-avatar" src={race.roadMessage.photo} alt="" />
          ) : (
            <span className="road-toast-avatar">{(race.roadMessage.name || "?").slice(0, 1).toUpperCase()}</span>
          )}
          <div className="road-toast-body">
            <b>{race.roadMessage.name}</b>
            <p>{race.roadMessage.message}</p>
          </div>
        </div>
      )}

      {/* Round map with the lap running round its rim — the old card carried a
          separate progress bar underneath, which said the same thing twice. */}
      <div className="hud-map">
        <svg className="map-ring" viewBox="0 0 100 100" aria-hidden>
          <circle className="ring-base" cx="50" cy="50" r={MAP_RING_R} />
          <circle
            className="ring-run"
            cx="50"
            cy="50"
            r={MAP_RING_R}
            strokeDasharray={`${race.progress * MAP_RING_C} ${MAP_RING_C}`}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <svg className="map-face" viewBox="0 0 100 100" aria-hidden>
          <polyline points={MINIMAP.points} className="minimap-road-casing" />
          <polyline points={MINIMAP.points} className="minimap-road" />
          <circle cx={MINIMAP.start.x} cy={MINIMAP.start.y} r="2.6" className="minimap-start" />
          {race.ananseMapPos && <circle cx={race.ananseMapPos.x} cy={race.ananseMapPos.y} r="3.2" className="minimap-ananse" />}
          {race.mapPos && <circle cx={race.mapPos.x} cy={race.mapPos.y} r="3.4" className="minimap-car" />}
        </svg>
      </div>

      {race.wrongWay && <div className="wrong-way">WRONG WAY</div>}

      {reverseHint && <div className="reverse-hint">Hold <b>BRAKE</b> to reverse out</div>}

      <div className={`tacho${boosting ? " boosting" : ""}`} style={{ "--heat": speedHeat }}>
        <svg className="tacho-face" viewBox="0 0 200 200" aria-hidden>
          <g transform={`rotate(${TACH_ROTATION} 100 100)`}>
            <circle className="arc-base" cx="100" cy="100" r={TACH_ARC_R} strokeDasharray={`${TACH_ARC_SWEEP} ${TACH_ARC_C}`} />
            {/* the redline is printed on the face, the way it is on a real dial —
                it marks where the car will be, not where it is */}
            <circle
              className="arc-redline"
              cx="100"
              cy="100"
              r={TACH_ARC_R}
              strokeDasharray={`${(1 - TACH_REDLINE_FROM) * TACH_ARC_SWEEP} ${TACH_ARC_C}`}
              strokeDashoffset={-TACH_REDLINE_FROM * TACH_ARC_SWEEP}
            />
            <circle className="arc-value" cx="100" cy="100" r={TACH_ARC_R} strokeDasharray={`${gaugeRatio * TACH_ARC_SWEEP} ${TACH_ARC_C}`} />
          </g>
          {TACH_TICKS.map((tick) => (
            <line
              key={tick.key}
              className={`tk${tick.major ? " mj" : ""}${tick.fraction >= TACH_REDLINE_FROM ? " red" : ""}`}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
            />
          ))}
          {TACH_TICKS.filter((tick) => tick.label !== null).map((tick) => (
            <text key={`n${tick.key}`} className="tn" x={tick.labelX} y={tick.labelY} textAnchor="middle" dominantBaseline="central">
              {tick.label}
            </text>
          ))}
          <g className="tacho-needle" transform={`rotate(${TACH_START + gaugeRatio * TACH_SWEEP} 100 100)`}>
            <polygon points="100,19 103.4,104 96.6,104" />
            <polygon className="counter" points="100,118 101.9,104 98.1,104" />
          </g>
          <circle className="tacho-hub" cx="100" cy="100" r="6" />
        </svg>
        <span className="tacho-cap">x10 km/h</span>
        {/* the readout sits over the lower face, so the needle passes behind it */}
        <div className="tacho-lcd">
          <span className={`lcd-gear${race.reversing ? " rev" : ""}`}>{gear}</span>
          <SevenSegment value={kmh} places={3} />
        </div>
      </div>

      {/* Nitrous: a bottle and a level, the way every racer since Underground has
          drawn it. Five notches keep it countable; the level keeps it glanceable. */}
      <div
        className={`nitro${boosting ? " firing" : ""}${race.boosts >= BOOST_MAX ? " full" : ""}`}
        style={{ "--fill": race.boosts / BOOST_MAX }}
      >
        <span className="nitro-bottle" aria-hidden>
          <svg viewBox="0 0 14 26">
            <rect x="5" y="1" width="4" height="4.5" rx="1.2" />
            <rect x="0.9" y="5" width="12.2" height="20" rx="5.4" />
          </svg>
        </span>
        <div className="nitro-bar">
          <div className="nitro-fill" />
          <div className="nitro-notches" aria-hidden />
          {race.boostCooldown > 0 && race.boosts > 0 && (
            <div className="nitro-cool" style={{ transform: `scaleX(${1 - race.boostCooldown / 2.2})` }} />
          )}
        </div>
        <b className="nitro-count">{race.boosts}</b>
      </div>

      {race.debug && <DebugPanel debug={race.debug} />}
      {race.countdown > 0 && (
        <div className="race-countdown">
          <span key={Math.ceil(race.countdown)}>{Math.ceil(race.countdown)}</span>
        </div>
      )}
      {race.countdown <= 0 && race.countdown > -0.9 && <div className="race-countdown go">GO</div>}
    </>
  );
}

function DebugPanel({ debug }) {
  return (
    <div className="vehicle-debug">
      <span>speed <b>{debug.speed.toFixed(1)}</b></span>
      <span>side <b>{debug.sideSpeed.toFixed(1)}</b></span>
      <span>yaw <b>{debug.yaw.toFixed(2)}</b></span>
      <span>lat <b>{debug.lateral.toFixed(2)}</b></span>
      <span>head <b>{debug.headingError.toFixed(2)}</b></span>
      <span>rail <b>{debug.railSide}</b></span>
      <span>proj <b>{debug.projectionDistance.toFixed(1)}</b></span>
    </div>
  );
}

function formatTime(ms) {
  const total = Math.max(0, ms || 0);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000).toString().padStart(2, "0");
  const millis = Math.floor((total % 1000) / 10).toString().padStart(2, "0");
  return `${minutes}:${seconds}.${millis}`;
}
