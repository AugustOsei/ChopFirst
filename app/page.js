"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import RaceGame from "../components/RaceGame";
import GuideModal from "../components/GuideModal";
import FeedbackModal from "../components/FeedbackModal";
import ChangelogModal from "../components/ChangelogModal";
import { CURRENT_VERSION } from "../lib/changelog";
import { logEvent } from "../lib/log-event";
import { TRACK, listTracks, setActiveTrack } from "../game/track";
import { listVehicles, vehicleStats, DEFAULT_VEHICLE } from "../game/vehicle";

// Live 3D garage preview is client-only (R3F Canvas can't server-render).
const GaragePreview = dynamic(() => import("../components/GaragePreview"), { ssr: false });

// Baked into this bundle at build time; /api/version reports the live deploy's
// id. If they differ, this tab is running pre-deploy code and should refresh.
const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

const SPEC_ROWS = [
  ["speed", "Top Speed"],
  ["accel", "Acceleration"],
  ["grip", "Grip"],
  ["agility", "Agility"],
];
const TOD_OPTIONS = [
  ["day", "Day", "☀", "/feature-day.webp"],
  ["dusk", "Dusk", "🌅", "/feature-dusk.webp"],
  ["night", "Night", "🌙", "/feature-night.webp"],
];

// Build a top-down circuit-map SVG path from a track's [x,y,z] control points.
function trackMapPath(controlPoints) {
  if (!controlPoints || controlPoints.length < 2) return "";
  const xs = controlPoints.map((p) => p[0]);
  const zs = controlPoints.map((p) => p[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const span = Math.max(maxX - minX, maxZ - minZ) || 1;
  const pad = 12;
  const scale = (100 - pad * 2) / span;
  const ox = pad + ((100 - pad * 2) - (maxX - minX) * scale) / 2;
  const oz = pad + ((100 - pad * 2) - (maxZ - minZ) * scale) / 2;
  const pts = controlPoints.map((p) => [ox + (p[0] - minX) * scale, oz + (p[2] - minZ) * scale]);
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
}

function TrackCard({ track, selected, onSelect }) {
  const km = (track.totalLength / 1000).toFixed(2);
  const icon = track.environment === "city" ? "🏙" : "⛰";
  return (
    <button type="button" className={`track-card${selected ? " selected" : ""} ${track.environment}`} onClick={onSelect}>
      <div className="track-map">
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <path d={trackMapPath(track.controlPoints)} className="track-line-bg" />
          <path d={trackMapPath(track.controlPoints)} className="track-line" />
        </svg>
        <span className="track-env">{icon}</span>
        <span className="track-diff">{track.difficulty}</span>
      </div>
      <div className="track-info">
        <h4>{track.name}</h4>
        <p>{track.blurb}</p>
        <div className="track-meta">
          <span>{track.laps} laps</span>
          <span>{km} km</span>
          {track.medals?.gold ? <span>Gold {formatTime(track.medals.gold)}</span> : null}
        </div>
      </div>
    </button>
  );
}

function formatTime(ms) {
  const total = Math.max(0, ms || 0);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000).toString().padStart(2, "0");
  const millis = Math.floor((total % 1000) / 10).toString().padStart(2, "0");
  return `${minutes}:${seconds}.${millis}`;
}

function compressPhoto(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 120;
        canvas.height = 120;
        const ctx = canvas.getContext("2d");
        const size = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 120, 120);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const TRACK_LIST = listTracks();
const VEHICLE_LIST = listVehicles();
// PB is per-track; the key follows whichever track is currently active.
const pbKey = () => `chopfirst.pb.${TRACK.id}`;
const DEVICE_KEY = "chopfirst.device";
const TRACKED_KEY = "chopfirst.challenges";

// Data written before multi-track support has no trackId and is all this track.
function onThisTrack(challenge) {
  return !challenge || (challenge.trackId || TRACK.id) === TRACK.id;
}

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function loadTracked() {
  try {
    const list = JSON.parse(localStorage.getItem(TRACKED_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveTracked(list) {
  localStorage.setItem(TRACKED_KEY, JSON.stringify(list.slice(0, 8)));
}

function upsertTracked(entry) {
  const list = loadTracked().filter((item) => item.id !== entry.id);
  list.unshift({ ...entry, at: Date.now() });
  saveTracked(list);
}

const CAR_COLORS = [
  { id: "#d81f33", label: "Rosso" },
  { id: "#2563eb", label: "Bayside Blue" },
  { id: "#f5b818", label: "Sunburst" },
  { id: "#1f9d55", label: "Ridge Green" },
  { id: "#374151", label: "Midnight" },
  { id: "#e8ecef", label: "Chalk" },
];

export default function Home() {
  const [screen, setScreen] = useState("title");
  const [driver, setDriver] = useState({ name: "", photo: "", color: CAR_COLORS[0].id, vehicle: DEFAULT_VEHICLE, track: "akina-ridge" });
  const [raceKey, setRaceKey] = useState(0);
  // Race start can stall for a beat while the (heavy) scene geometry assembles — show
  // a loading overlay first, mount the race a frame later so the overlay paints, then
  // drop the overlay once RaceScene's first frame signals it's drawing (onReady).
  const [mountRace, setMountRace] = useState(false);
  const [raceReady, setRaceReady] = useState(false);
  const [timeOfDay, setTimeOfDayState] = useState("day");
  const [challengeId, setChallengeId] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogSeen, setChangelogSeen] = useState(true);
  const [pb, setPb] = useState(null);
  const [pbRun, setPbRun] = useState(null);
  const [shareMessage, setShareMessage] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [saveRevived, setSaveRevived] = useState(false);
  // True once we detect this tab is running pre-deploy code (see CLIENT_BUILD_ID).
  // A stale tab can post a run the new server rejects, so we nudge a refresh.
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const savePromiseRef = useRef(null);
  const messagePostedRef = useRef(false);

  // Activate the selected track during render so TRACK (and everything derived
  // from it — medals, PB key, challenge matching, run tagging) reflects it.
  const selectedTrack = driver.track || "akina-ridge";
  setActiveTrack(selectedTrack);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("challenge") || "";
    setChallengeId(id);
    if (id) {
      logEvent("link_opened");
      fetch(`/api/challenges/${id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          setChallenge(data);
          // visiting the link counts as "seen" for the title-screen inbox
          const list = loadTracked();
          const entry = list.find((item) => item.id === data.id);
          if (entry) {
            entry.lastSeenRuns = data.runs.length;
            saveTracked(list);
          }
        });
    }
    try {
      const saved = JSON.parse(localStorage.getItem("chopfirst.driver") || "null");
      if (saved && typeof saved === "object") setDriver((value) => ({ ...value, ...saved }));
    } catch {
      // corrupted storage — start fresh
    }
    setChangelogSeen(localStorage.getItem("chopfirst.seenVersion") === CURRENT_VERSION);
    const savedTime = localStorage.getItem("chopfirst.timeOfDay");
    if (savedTime === "day" || savedTime === "dusk" || savedTime === "night") setTimeOfDayState(savedTime);
  }, []);

  // Detect a stale tab: ask the live server for its build id and compare to the
  // one baked into this bundle. Checked on mount and whenever the tab regains
  // focus (a phone tab left open across a redeploy is the common case), so a
  // player is nudged to refresh before a race rather than losing the run to it.
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/version", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data?.buildId) return;
          if (CLIENT_BUILD_ID !== "dev" && data.buildId !== "dev" && data.buildId !== CLIENT_BUILD_ID) {
            setUpdateAvailable(true);
          }
        })
        .catch(() => {});
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", check); };
  }, []);

  function setTimeOfDay(value) {
    setTimeOfDayState(value);
    localStorage.setItem("chopfirst.timeOfDay", value);
  }

  function setTrack(value) {
    setActiveTrack(value);
    setDriver((current) => ({ ...current, track: value }));
  }

  // Load the personal-best ghost for whichever track is selected.
  useEffect(() => {
    try {
      const best = JSON.parse(localStorage.getItem(`chopfirst.pb.${selectedTrack}`) || "null");
      setPbRun(best?.ghost?.length ? { timeMs: best.timeMs, ghost: best.ghost } : null);
    } catch {
      setPbRun(null);
    }
  }, [selectedTrack]);

  function openChangelog() {
    localStorage.setItem("chopfirst.seenVersion", CURRENT_VERSION);
    setChangelogSeen(true);
    setShowChangelog(true);
  }

  useEffect(() => {
    if (driver.name || driver.photo || driver.color !== CAR_COLORS[0].id || (driver.vehicle && driver.vehicle !== DEFAULT_VEHICLE)) {
      localStorage.setItem("chopfirst.driver", JSON.stringify(driver));
    }
  }, [driver]);

  async function handlePhoto(event) {
    const photo = await compressPhoto(event.target.files?.[0]);
    setDriver((value) => ({ ...value, photo }));
  }

  function startRace() {
    logEvent("race_started");
    setResult(null);
    setRaceReady(false);
    setMountRace(false);
    setScreen("race");
  }

  // When (re)entering a race, paint the loading overlay first, then mount the heavy
  // RaceGame two frames later so the overlay is on screen during the scene build.
  useEffect(() => {
    if (screen !== "race") {
      setMountRace(false);
      setRaceReady(false);
      return;
    }
    setRaceReady(false);
    setMountRace(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setMountRace(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [screen, raceKey]);

  function finishRace(run) {
    logEvent("race_finished");
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(pbKey()) || "null");
    } catch {
      stored = null;
    }
    const isNew = !stored || run.timeMs < stored.timeMs;
    if (isNew) {
      try {
        localStorage.setItem(pbKey(), JSON.stringify({ trackId: TRACK.id, timeMs: run.timeMs, at: Date.now(), ghost: run.ghost }));
      } catch {
        // quota exceeded — keep the time without the ghost trace
        localStorage.setItem(pbKey(), JSON.stringify({ trackId: TRACK.id, timeMs: run.timeMs, at: Date.now() }));
      }
      setPbRun({ timeMs: run.timeMs, ghost: run.ghost });
    }
    setPb({ isNew, previous: stored?.timeMs ?? null });
    setResult(run);
    setScreen("finish");
    setMessage("");
    messagePostedRef.current = false;
    saveRun(run);
  }

  // Post the run to its leaderboard. Auto-runs on finish so a closed tab can't
  // lose the score; can also be retried from the finish screen if it fails.
  function saveRun(run) {
    setSaveState("saving");
    setSaveRevived(false);
    setStatus("");
    const target = onThisTrack(challenge) ? challenge?.runs?.[0] ?? null : null;
    const payload = JSON.stringify({ ...run, trackId: TRACK.id, deviceId: getDeviceId(), buildId: CLIENT_BUILD_ID });
    // A run on an existing same-track challenge always posts to its board —
    // even a lapsed one, which the server revives. Only a brand-new run, or a
    // challenge from another track, starts a fresh board.
    const joinId = challengeId && onThisTrack(challenge) ? challengeId : null;
    const post = (url) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
    savePromiseRef.current = (async () => {
      try {
        let res = joinId ? await post(`/api/challenges/${joinId}/runs`) : await post("/api/challenges");
        // the challenge aged out and was pruned — don't lose the run, open a fresh one
        if (joinId && res.status === 404) res = await post("/api/challenges");
        const data = await res.json();
        if (!res.ok) {
          setStatus(data.error || "Could not save this run.");
          if (data.challenge) setChallenge(data.challenge);
          setSaveState("error");
          return null;
        }
        setChallenge(data);
        setChallengeId(data.id);
        window.history.replaceState(null, "", `/?challenge=${data.id}`);
        upsertTracked({ id: data.id, myTimeMs: run.timeMs, lastSeenRuns: data.runs.length });
        setShareMessage(buildShareMessage(run, target, data.id));
        setSaveRevived(!!data.revived);
        setSaveState("saved");
        logEvent("run_saved");
        return data;
      } catch {
        setSaveState("error");
        setStatus("Could not save this run — check your connection.");
        return null;
      }
    })();
  }

  // Road messages need the saved challenge id, so flush once the save resolves.
  // Fire-and-forget from share/nav actions; idempotent via messagePostedRef.
  async function flushMessage() {
    const text = message.trim();
    if (messagePostedRef.current || !text) return;
    const saved = savePromiseRef.current ? await savePromiseRef.current : null;
    const id = saved?.id || (onThisTrack(challenge) ? challengeId : null);
    if (messagePostedRef.current || !id) return;
    messagePostedRef.current = true;
    try {
      const res = await fetch(`/api/challenges/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: driver.name || "Street Driver", photo: driver.photo, message: text }),
      });
      if (res.ok) setChallenge(await res.json());
    } catch {
      // message is a nice-to-have; don't block the flow
    }
  }

  // Smart share: native share sheet on mobile, WhatsApp fallback elsewhere.
  async function shareChallenge() {
    if (saveState !== "saved") return;
    flushMessage();
    logEvent("share_primary");
    const text = shareMessage || `🏁 CHOP FIRST — beat my time within 24 hours: ${shareUrl}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "CHOP FIRST", text, url: shareUrl });
        return;
      } catch {
        // user dismissed the sheet — fall through to WhatsApp
      }
    }
    window.open(`https://wa.me/?text=${shareText}`, "_blank");
  }

  async function viewLeaderboard() {
    flushMessage();
    const saved = savePromiseRef.current ? await savePromiseRef.current : null;
    if (saved || challenge) setScreen("results");
  }

  function runAgain() {
    flushMessage();
    startRace();
  }

  function goHome() {
    // the auto-save kicked off in finishRace keeps running in the background
    flushMessage();
    setMessage("");
    setStatus("");
    setScreen("title");
  }

  const shareUrl = typeof window === "undefined" || !challengeId ? "" : `${window.location.origin}/?challenge=${challengeId}`;
  const shareText = encodeURIComponent(
    shareMessage || `🏁 CHOP FIRST — a racing game by August Osei. Beat my time within 24 hours if you can: ${shareUrl}`,
  );

  return (
    <>
      {updateAvailable && (
        <div className="update-banner" role="status">
          <span>A new version of CHOP FIRST is ready.</span>
          <button className="update-refresh" onClick={() => window.location.reload()}>Refresh</button>
          <button className="update-dismiss" aria-label="Dismiss" onClick={() => setUpdateAvailable(false)}>✕</button>
        </div>
      )}
      {screen === "title" ? (
        <LandingPage
          challenge={challenge}
          onStart={() => setScreen("setup")}
          onGuide={() => setShowGuide(true)}
          onBoard={() => setShowBoard(true)}
          onFeedback={() => setShowFeedback(true)}
          onChangelog={openChangelog}
          changelogSeen={changelogSeen}
          overlayOpen={showGuide || showBoard || showFeedback || showChangelog}
        />
      ) : (
      <main className="app-shell">
        <section className={`game-stage${screen !== "race" ? " panel-stage" : ""}${screen === "setup" ? " setup-stage" : ""}`}>
        {screen === "race" ? (
          <>
            {mountRace && (
              <RaceGame
                key={raceKey}
                driver={driver}
                challenge={onThisTrack(challenge) ? challenge : null}
                pbRun={pbRun}
                timeOfDay={timeOfDay}
                trackId={selectedTrack}
                onFinish={finishRace}
                onQuit={() => setScreen("title")}
                onReady={() => setRaceReady(true)}
                onRestart={() => {
                  logEvent("race_started");
                  setRaceKey((value) => value + 1);
                }}
              />
            )}
            {!raceReady && <RaceLoading />}
          </>
        ) : screen === "setup" ? null : (
          <IntroBackdrop variant="panel" />
        )}

        {screen === "setup" && (() => {
          const curVeh = driver.vehicle || DEFAULT_VEHICLE;
          const stats = vehicleStats(curVeh);
          const curTrack = TRACK_LIST.find((t) => t.id === selectedTrack) || TRACK_LIST[0];
          const todLabel = (TOD_OPTIONS.find((o) => o[0] === timeOfDay) || TOD_OPTIONS[0])[1];
          return (
          <div className="garage-screen">
            <div className="garage-inner">
            <header className="garage-head">
              <div>
                <p className="eyebrow">Driver setup</p>
                <h2 className="setup-title">Choose your machine</h2>
                <p className="setup-lede">
                  {challenge ? `Chop ${challenge.runs?.[0]?.name || "the leader"}'s time. Make it yours.` : "Pick your ride, your circuit and your sky."}
                </p>
              </div>
              <button className="ghost-button garage-back" onClick={() => setScreen("title")}>‹ Back</button>
            </header>
            {challenge?.messages?.length > 0 && (
              <div className="road-notes">
                <small>Notes left on the road</small>
                {challenge.messages.slice(-3).map((note) => (
                  <p key={note.id}>
                    {note.photo && <img src={note.photo} alt="" />}
                    <b>{note.name}</b> {note.message}
                  </p>
                ))}
              </div>
            )}

            <div className="garage-main">
            <div className="g-left">
            <div className={`garage hero-${curVeh}`}>
              <div className="garage-hero">
                <GaragePreview vehicle={curVeh} paint={driver.color} />
                <span className="drag-hint">drag to rotate</span>
              </div>
              <div className="garage-stats">
                <span className="veh-class">{stats.klass}</span>
                <h3>{stats.name}</h3>
                <div className="veh-top"><b>{stats.topSpeedKmh}</b><span>km/h top</span></div>
                <div className="spec-bars">
                  {SPEC_ROWS.map(([k, label]) => (
                    <div className="spec-row" key={k}>
                      <span>{label}</span>
                      <div className="spec-track"><div className="spec-fill" style={{ width: `${stats.bars[k]}%` }} /></div>
                    </div>
                  ))}
                </div>
                <p className="veh-blurb">{stats.blurb}</p>
              </div>
            </div>

            <div className="car-cards">
              {VEHICLE_LIST.map((v) => {
                const vs = vehicleStats(v.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`car-card${curVeh === v.id ? " selected" : ""}`}
                    onClick={() => setDriver({ ...driver, vehicle: v.id })}
                  >
                    <span className="cc-name">{v.name}</span>
                    <span className="cc-class">{v.klass}</span>
                    <div className="cc-bar"><div style={{ width: `${vs.bars.speed}%` }} /></div>
                    <span className="cc-top">{vs.topSpeedKmh} km/h</span>
                  </button>
                );
              })}
            </div>

            {curVeh === "street" && (
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
                      onClick={() => setDriver({ ...driver, color: color.id })}
                    />
                  ))}
                </div>
              </div>
            )}

            </div>
            <div className="g-right">
            <div className="identity-card">
              <span className="section-label">Your driver</span>
              <div className="identity-row">
                <label className="photo-pick">
                  {driver.photo
                    ? <img src={driver.photo} alt="Your profile" />
                    : <span className="photo-empty">＋<i>Photo</i></span>}
                  <input type="file" accept="image/*" onChange={handlePhoto} />
                </label>
                <label className="field name-field">
                  Racing name
                  <input value={driver.name} onChange={(event) => setDriver({ ...driver, name: event.target.value })} placeholder="Your racing name" />
                </label>
              </div>
            </div>

            <div className="track-select">
              <span className="section-label">Circuit</span>
              <div className="track-cards">
                {TRACK_LIST.map((t) => (
                  <TrackCard key={t.id} track={t} selected={selectedTrack === t.id} onSelect={() => setTrack(t.id)} />
                ))}
              </div>
            </div>

            <div className="tod-select">
              <span className="section-label">Time of day</span>
              <div className="tod-row">
                {TOD_OPTIONS.map(([id, label, icon, img]) => (
                  <button
                    key={id}
                    type="button"
                    className={`tod-card${timeOfDay === id ? " selected" : ""}`}
                    onClick={() => setTimeOfDay(id)}
                  >
                    <img src={img} alt="" />
                    <span>{icon} {label}</span>
                  </button>
                ))}
              </div>
            </div>

            </div>
            </div>
            <div className="start-bar">
              <div className="start-summary">
                <b>{stats.name}</b><i>·</i><b>{curTrack?.name}</b><i>·</i><b>{todLabel}</b>
              </div>
              <button className="primary start-cta" onClick={startRace}>Start {curTrack?.laps || TRACK.laps} laps</button>
            </div>
            </div>
          </div>
          );
        })()}

        {screen === "finish" && result && (() => {
          const total = challenge?.runs?.length ?? 0;
          const rank = challenge ? challenge.runs.filter((r) => r.timeMs < result.timeMs).length + 1 : null;
          const shareReady = saveState === "saved";
          return (
          <Panel>
            <p className="eyebrow">Run complete</p>
            <h2>{formatTime(result.timeMs)}</h2>
            <MedalVerdict timeMs={result.timeMs} />
            <FinishVerdict result={result} challenge={challenge} pb={pb} />
            <div className="stats-grid">
              <span>Coins <b>{result.coins}</b></span>
              <span>Drift <b>{result.driftScore}</b></span>
              <span>Boosts used <b>{result.boostUses}</b></span>
            </div>

            <div className={`save-bar ${saveState}`} aria-live="polite">
              {saveState === "saving" && (
                <>
                  <span className="save-spinner" aria-hidden="true" />
                  <div className="save-text"><b>Posting your run…</b></div>
                </>
              )}
              {saveState === "saved" && (
                <>
                  <span className="save-check" aria-hidden="true">✓</span>
                  <div className="save-text">
                    <b>{saveRevived ? "Challenge revived — send it again" : "Live on the leaderboard"}</b>
                    {rank && <span>P{rank} of {total} · open for 24 hours</span>}
                  </div>
                </>
              )}
              {saveState === "error" && (
                <>
                  <span className="save-x" aria-hidden="true">!</span>
                  <div className="save-text">
                    <b>Couldn’t save your run</b>
                    <span>{updateAvailable ? "A new version is available — refresh to save your run." : status || "Check your connection."}</span>
                  </div>
                  {updateAvailable
                    ? <button className="save-retry" onClick={() => window.location.reload()}>Refresh</button>
                    : <button className="save-retry" onClick={() => saveRun(result)}>Retry</button>}
                </>
              )}
            </div>

            <label className="field">
              Road message for the next drivers
              <input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={100} placeholder="e.g. brake before the ridge hairpin" />
            </label>
            <div className="message-prompts">
              {MESSAGE_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" className="message-prompt" onClick={() => setMessage(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>

            <p className="share-nudge">Send the link — whoever opens it gets a fresh 24 hours to chop your time.</p>
            <button className="primary share-hero" disabled={!shareReady} onClick={shareChallenge}>
              {saveState === "saved" ? "Send the challenge" : saveState === "error" ? "Run not saved yet" : "Saving your run…"}
            </button>
            <div className="share-row share-quick">
              <a
                className={`secondary link-button share-wa${shareReady ? "" : " is-disabled"}`}
                href={shareReady ? `https://wa.me/?text=${shareText}` : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!shareReady}
                onClick={(event) => { if (!shareReady) { event.preventDefault(); return; } flushMessage(); logEvent("share_whatsapp"); }}
              >
                WhatsApp
              </a>
              <a
                className={`secondary link-button${shareReady ? "" : " is-disabled"}`}
                href={shareReady ? `sms:?&body=${shareText}` : undefined}
                aria-disabled={!shareReady}
                onClick={(event) => { if (!shareReady) { event.preventDefault(); return; } flushMessage(); logEvent("share_sms"); }}
              >
                SMS
              </a>
              <button
                className="secondary"
                disabled={!shareReady}
                onClick={() => { navigator.clipboard.writeText(shareUrl); flushMessage(); logEvent("share_copy"); }}
              >
                Copy
              </button>
            </div>

            <div className="finish-nav">
              <button className="finish-nav-link" onClick={runAgain}>↻ Run it again</button>
              {challenge && <button className="finish-nav-link" onClick={viewLeaderboard}>≣ Leaderboard</button>}
              <button className="finish-nav-link muted" onClick={goHome}>⌂ Home</button>
            </div>
            <button className="feedback-link" onClick={() => setShowFeedback(true)}>🐞 Report a bug or suggest a feature</button>
          </Panel>
          );
        })()}

        {screen === "results" && challenge && (
          <Panel wide>
            <p className="eyebrow">24-hour challenge</p>
            <h2>Leaderboard</h2>
            <Leaderboard challenge={challenge} />
            <p className="share-nudge">Send the link — whoever opens it gets a fresh 24 hours to chop your time.</p>
            <div className="share-row">
              <a className="primary link-button" href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer" onClick={() => { flushMessage(); logEvent("share_whatsapp"); }}>WhatsApp</a>
              <a className="secondary link-button" href={`sms:?&body=${shareText}`} onClick={() => { flushMessage(); logEvent("share_sms"); }}>SMS</a>
              <button className="secondary" onClick={() => { navigator.clipboard.writeText(shareUrl); flushMessage(); logEvent("share_copy"); }}>Copy link</button>
            </div>
            <div className="button-row">
              {result && <button className="ghost-button" onClick={() => setScreen("finish")}>‹ Back</button>}
              <button className="ghost-button" onClick={runAgain}>Run it again</button>
              <button className="ghost-button" onClick={goHome}>Home</button>
            </div>
            <button className="feedback-link" onClick={() => setShowFeedback(true)}>🐞 Report a bug or suggest a feature</button>
          </Panel>
        )}

        </section>
      </main>
      )}

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
      {showBoard && <GlobalBoard onClose={() => setShowBoard(false)} />}
      {showFeedback && <FeedbackModal driverName={driver.name} onClose={() => setShowFeedback(false)} />}
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
    </>
  );
}

// Medal targets come from TRACK.medals (calibrated bot runs). Shows what was
// earned and how far the next one is — instant "one more run" bait.
function MedalVerdict({ timeMs }) {
  const medals = TRACK.medals;
  if (!medals || !timeMs) return null;
  const earned = timeMs <= medals.gold ? "gold" : timeMs <= medals.silver ? "silver" : timeMs <= medals.bronze ? "bronze" : null;
  const nextName = earned === "gold" ? null : earned === "silver" ? "gold" : earned === "bronze" ? "silver" : "bronze";
  const icons = { gold: "🥇 GOLD", silver: "🥈 SILVER", bronze: "🥉 BRONZE" };
  return (
    <div className={`medal-verdict${earned ? ` ${earned}` : ""}`}>
      <b>{earned ? `${icons[earned]} medal` : "No medal yet"}</b>
      {nextName && <span>{((timeMs - medals[nextName]) / 1000).toFixed(1)}s off {icons[nextName]}</span>}
    </div>
  );
}

function GlobalBoard({ onClose }) {
  const [boardTrack, setBoardTrack] = useState(TRACK_LIST[0].id);
  const [board, setBoard] = useState(null);
  useEffect(() => {
    let live = true;
    setBoard(null);
    fetch(`/api/leaderboard?track=${encodeURIComponent(boardTrack)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => live && setBoard(data || { top: [], totalRuns: 0, totalPlayers: 0 }))
      .catch(() => live && setBoard({ top: [], totalRuns: 0, totalPlayers: 0 }));
    return () => { live = false; };
  }, [boardTrack]);
  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-card" onClick={(event) => event.stopPropagation()}>
        <button className="guide-close" aria-label="Close leaderboard" onClick={onClose}>×</button>
        <p className="eyebrow">All-time</p>
        <h2 className="guide-title">Global leaderboard</h2>
        {TRACK_LIST.length > 1 && (
          <div className="board-tabs">
            {TRACK_LIST.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`board-tab${boardTrack === t.id ? " active" : ""}`}
                onClick={() => setBoardTrack(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
        {!board ? (
          <p className="guide-lede">Loading…</p>
        ) : (
          <>
            <p className="board-meta">
              <b>{board.totalRuns}</b> run{board.totalRuns === 1 ? "" : "s"} by <b>{board.totalPlayers}</b> driver{board.totalPlayers === 1 ? "" : "s"}
            </p>
            {board.top.length === 0 ? (
              <p className="guide-lede">No times yet — set the first one.</p>
            ) : (
              <ol className="leaderboard">
                {board.top.map((player, index) => (
                  <li key={`${player.name}-${index}`}>
                    {player.photo ? <img src={player.photo} alt="" /> : <span className="avatar">{(player.name || "?").slice(0, 1).toUpperCase()}</span>}
                    <strong>{index + 1}. {player.name}</strong>
                    <span>{formatTime(player.timeMs)}</span>
                    <small>{player.coins} coins · {player.driftScore} drift</small>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Each tracked challenge is one head-to-head "rivalry": your time vs the current
// leader's. Shared by the title-screen teaser and the full Rivals board — both
// run on data we already store (chopfirst.challenges) and serve, no accounts.
function useRivals() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    const tracked = loadTracked();
    if (!tracked.length) {
      setItems([]);
      return;
    }
    let live = true;
    Promise.all(
      tracked.map(async (entry) => {
        try {
          const res = await fetch(`/api/challenges/${entry.id}`);
          if (!res.ok) return null;
          const data = await res.json();
          const leader = data.runs?.[0];
          if (!leader) return null;
          const hoursLeft = data.expiresAt ? (new Date(data.expiresAt).getTime() - Date.now()) / 3600000 : null;
          return {
            id: entry.id,
            leader,
            myTimeMs: entry.myTimeMs,
            runnerUpMs: data.runs[1]?.timeMs ?? null,
            chopped: entry.myTimeMs != null && leader.timeMs < entry.myTimeMs,
            newRuns: Math.max(0, data.runs.length - (entry.lastSeenRuns || 0)),
            runCount: data.runs.length,
            expired: data.expired,
            hoursLeft,
            trackName: TRACK_LIST.find((t) => t.id === (data.trackId || TRACK_LIST[0].id))?.name || "",
          };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (live) setItems(results.filter(Boolean).sort((a, b) => rivalPriority(a) - rivalPriority(b) || (a.hoursLeft ?? 99) - (b.hoursLeft ?? 99)));
    });
    return () => {
      live = false;
    };
  }, []);
  // The badge counts only rivalries that want a response: you've been chopped,
  // or a friend posted a new run since you last looked (and it's still live).
  const pendingCount = (items || []).filter((it) => !it.expired && (it.chopped || it.newRuns > 0)).length;
  return { items, pendingCount };
}

// Lower number = more urgent = higher on the board.
function rivalPriority(it) {
  if (it.expired) return 5;
  if (it.chopped) return 0;
  if (it.newRuns > 0) return 1;
  if (it.hoursLeft != null && it.hoursLeft < 6) return 2;
  return 3;
}

function rivalState(it) {
  if (it.expired) return "dormant";
  if (it.chopped) return "chopped";
  if (it.hoursLeft != null && it.hoursLeft < 6) return "expiring";
  return "leading";
}

// Condensed teaser on the hero — top 3 rivalries plus a link into the full board.
function ChallengeInbox({ items, onSeeAll }) {
  if (!items?.length) return null;
  return (
    <div className="challenge-inbox title-fade" style={{ animationDelay: ".95s" }}>
      <small>Your rivals</small>
      {items.slice(0, 3).map((item) => (
        <a key={item.id} className={`inbox-row${item.expired ? " dormant" : ""}`} href={`/?challenge=${item.id}`}>
          <span className={`inbox-dot${item.newRuns > 0 ? " live" : ""}${item.chopped ? " chopped" : ""}`} />
          <span className="inbox-text">
            {item.chopped
              ? `${item.leader.name} chopped you by ${formatGap(item.myTimeMs - item.leader.timeMs)}`
              : `You lead at ${formatTime(item.myTimeMs)}`}
            {item.newRuns > 0 && <b> · {item.newRuns} new run{item.newRuns > 1 ? "s" : ""}</b>}
          </span>
          <span className="inbox-meta">{item.expired ? "↻ revive" : `${item.runCount} run${item.runCount === 1 ? "" : "s"}`}</span>
        </a>
      ))}
      {items.length > 3 && (
        <button type="button" className="inbox-seeall" onClick={onSeeAll}>See all {items.length} rivals →</button>
      )}
    </div>
  );
}

// Full Rivals board: every active duel, sorted by who needs an answer first.
function RivalsBoard({ items, onClose }) {
  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-card" onClick={(event) => event.stopPropagation()}>
        <button className="guide-close" aria-label="Close rivals" onClick={onClose}>×</button>
        <p className="eyebrow">Head to head</p>
        <h2 className="guide-title">Your rivals</h2>
        {!items ? (
          <p className="guide-lede">Loading…</p>
        ) : items.length === 0 ? (
          <p className="guide-lede">No rivalries yet — set a time and send the link to start one.</p>
        ) : (
          <ol className="rivals-list">
            {items.map((it) => {
              const state = rivalState(it);
              const margin = !it.chopped && it.runnerUpMs != null ? it.runnerUpMs - it.leader.timeMs : null;
              const meta = [
                it.trackName,
                it.newRuns > 0 ? `${it.newRuns} new run${it.newRuns > 1 ? "s" : ""}` : null,
                it.expired ? "dormant" : it.hoursLeft != null && it.hoursLeft < 6 ? `${Math.max(1, Math.round(it.hoursLeft))}h left` : `${it.runCount} run${it.runCount === 1 ? "" : "s"}`,
              ].filter(Boolean).join(" · ");
              return (
                <li key={it.id} className={`rival-row ${state}`}>
                  <a href={`/?challenge=${it.id}`}>
                    <span className={`rival-dot ${state}`} />
                    <span className="rival-main">
                      <strong>{it.chopped ? `${it.leader.name} leads` : "You lead"}</strong>
                      <small>{meta}</small>
                    </span>
                    <span className={`rival-gap ${it.chopped ? "down" : "up"}`}>
                      {it.chopped ? `−${formatGap(it.myTimeMs - it.leader.timeMs)}` : margin != null ? `+${formatGap(margin)}` : "1st"}
                    </span>
                    <span className="rival-cta">{it.expired ? "Revive" : it.chopped ? "Your move" : "Defend"} →</span>
                  </a>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

const MESSAGE_PROMPTS = [
  "Brake hard before the summit hairpin",
  "Drift the S-bends, trust the rails",
  "Save a boost for the back straight",
];

function ChallengeCountdown({ expiresAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);
  const msLeft = new Date(expiresAt).getTime() - now;
  if (msLeft <= 0) return <span className="countdown expired">dormant — race to revive it</span>;
  const hours = Math.floor(msLeft / 3600000);
  const minutes = Math.floor((msLeft % 3600000) / 60000);
  return <span className="countdown">{hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`} left to chop it</span>;
}

function formatGap(ms) {
  return `${(Math.abs(ms) / 1000).toFixed(2)}s`;
}

function buildShareMessage(run, target, id) {
  const url = `${window.location.origin}/?challenge=${id}`;
  const credit = "🏁 CHOP FIRST — a racing game by August Osei.";
  if (!target) {
    return `${credit} I set ${formatTime(run.timeMs)}. You have 24 hours to chop my time: ${url}`;
  }
  const delta = run.timeMs - target.timeMs;
  if (delta < 0) {
    return `🪓 CHOPPED! I beat ${target.name}'s ${formatTime(target.timeMs)} with a ${formatTime(run.timeMs)} in CHOP FIRST by August Osei. Your move: ${url}`;
  }
  return `${credit} I ran ${formatTime(run.timeMs)} chasing ${target.name}'s time — still ${formatGap(delta)} behind. Race us both: ${url}`;
}

function FinishVerdict({ result, challenge, pb }) {
  const target = challenge?.runs?.[0];
  const delta = target ? result.timeMs - target.timeMs : null;
  return (
    <div className="verdict-stack">
      {target && (
        delta < 0 ? (
          <div className="verdict chopped">
            YOU CHOPPED IT
            <span>−{formatGap(delta)} vs {target.name}</span>
          </div>
        ) : (
          <div className="verdict missed">
            NOT CHOPPED
            <span>+{formatGap(delta)} behind {target.name}</span>
          </div>
        )
      )}
      {pb?.isNew ? (
        <div className="verdict pb">
          NEW PERSONAL BEST
          {pb.previous != null && <span>previous {formatTime(pb.previous)}</span>}
        </div>
      ) : (
        pb?.previous != null && <p className="pb-line">Personal best {formatTime(pb.previous)}</p>
      )}
    </div>
  );
}

// Reveals children with a fade-up the first time they scroll into view.
function useReveal() {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.18, root: el.closest(".landing") },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  return [ref, shown];
}

function FeatureRow({ flip, eyebrow, title, body, media, foot }) {
  const [ref, shown] = useReveal();
  return (
    <div ref={ref} className={`feature-row${flip ? " flip" : ""}${shown ? " in" : ""}`}>
      <div className="feature-copy">
        <p className="feature-eyebrow">{eyebrow}</p>
        <h3 className="feature-title">{title}</h3>
        <p className="feature-body">{body}</p>
        {foot}
      </div>
      <div className="feature-media">{media}</div>
    </div>
  );
}

function LandingPage({ challenge, onStart, onGuide, onBoard, onFeedback, onChangelog, changelogSeen, overlayOpen }) {
  const [bestTime, setBestTime] = useState(null);
  const [showRivals, setShowRivals] = useState(false);
  const { items: rivals, pendingCount } = useRivals();
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(pbKey()) || "null");
      if (stored?.timeMs) setBestTime(stored.timeMs);
    } catch {
      // ignore corrupted storage
    }
  }, []);
  useEffect(() => {
    const onKey = (event) => {
      if (overlayOpen) return;
      if (event.key === "Enter") onStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart, overlayOpen]);

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="nav-mark">CHOP<i>FIRST</i></span>
        <div className="nav-links">
          <button className="rivals-link" onClick={() => setShowRivals(true)}>
            Rivals{pendingCount > 0 && <span className="rivals-badge">{pendingCount}</span>}
          </button>
          <button onClick={onBoard}>Leaderboard</button>
          <button onClick={onGuide}>How to play</button>
          <button className="nav-cta" onClick={onStart}>Play</button>
        </div>
      </header>

      {/* hero */}
      <section className="hero">
        <img src="/cover.jpg" alt="" className="hero-art" />
        <div className="hero-scrim" />
        <div className="hero-inner">
          <p className="eyebrow title-fade" style={{ animationDelay: ".15s" }}>24-hour touge time attack</p>
          <div className="brand-logo hero-logo" aria-label="CHOP FIRST">
            <span className="brand-chop logo-pop">CHOP</span>
            <span className="brand-first logo-pop" style={{ animationDelay: ".12s" }}>FIRST</span>
          </div>
          <div className="brand-strip hero-strip" aria-hidden />
          <p className="hero-tagline title-fade" style={{ animationDelay: ".5s" }}>
            Pick your ride. Set a blistering time on the mountain or through Accra. Send the link — your friends get 24 hours to chop it, or admit you were faster.
          </p>
          {challenge ? (
            <p className="challenge-pill hero-pill title-fade" style={{ animationDelay: ".65s" }}>
              Beat {formatTime(challenge.runs[0]?.timeMs)} by {challenge.runs[0]?.name || "a rival"}
              <ChallengeCountdown expiresAt={challenge.expiresAt} />
            </p>
          ) : (
            bestTime != null && (
              <p className="challenge-pill hero-pill title-fade" style={{ animationDelay: ".65s" }}>
                Your best — {formatTime(bestTime)}. Chop it.
              </p>
            )
          )}
          <div className="hero-cta title-fade" style={{ animationDelay: ".8s" }}>
            <button className="primary hero-start" onClick={onStart}>
              {challenge ? "Take the challenge" : "Start racing"}
            </button>
            <button className="secondary hero-secondary" onClick={onGuide}>How to play</button>
          </div>
          <ChallengeInbox items={rivals} onSeeAll={() => setShowRivals(true)} />
        </div>
        <button className="scroll-cue" onClick={() => document.querySelector(".landing")?.scrollBy({ top: window.innerHeight * 0.82, behavior: "smooth" })} aria-label="See more">
          <span>see the game</span>
          <i>↓</i>
        </button>
      </section>

      {/* quick value strip */}
      <div className="value-strip">
        <span><b>4 cars</b> to master</span>
        <span><b>2 circuits</b> · mountain & city</span>
        <span><b>Day · Dusk · Night</b></span>
        <span><b>Real drift physics</b></span>
        <span><b>Ghosts with names</b></span>
      </div>

      <section className="features">
        <FeatureRow
          eyebrow="The 24-hour duel"
          title="Send it. They've got a day to answer."
          body="Every run becomes a private leaderboard you share with one tap. Friends race your ghost, leave a message on the road, and try to chop your time. Reply late and the challenge revives — a good rivalry never expires."
          media={
            <div className="mock-card mock-inbox">
              <small>Your challenges</small>
              <div className="mock-row"><span className="d chopped" /><span>Kwame chopped you by 0.62s</span><b>↻</b></div>
              <div className="mock-row"><span className="d live" /><span>You lead at 2:11.4 <i>· 2 new</i></span><b>3</b></div>
              <div className="mock-share"><span>WhatsApp</span><span>SMS</span><span>Copy link</span></div>
            </div>
          }
        />
        <FeatureRow
          flip
          eyebrow="Pick your ride"
          title="Four machines. Each one drives its own way."
          body="Line up the Street Coupe against a yellow Ghana Taxi, a high-roof Trotro that wallows like a real bus, and a hover speeder that floats on blue flame. Spin each one in 3D in the garage and read its stats before you commit."
          media={
            <div className="mock-card mock-garage">
              {VEHICLE_LIST.map((v) => {
                const vs = vehicleStats(v.id);
                return (
                  <div className="mg-row" key={v.id}>
                    <b>{v.name}</b>
                    <span>{v.klass}</span>
                    <div className="mg-bar"><i style={{ width: `${vs.bars.speed}%` }} /></div>
                  </div>
                );
              })}
            </div>
          }
        />
        <FeatureRow
          eyebrow="Two circuits"
          title="A mountain touge and a run through Accra."
          body="Carve the alpine Akina Ridge with its summit hairpin and drift chicane, or thread the Accra City Run past flyovers and city landmarks. Same chase-the-ghost rules, two completely different rhythms."
          media={
            <div className="mock-card mock-circuits">
              {TRACK_LIST.map((t) => (
                <div className="mc-track" key={t.id}>
                  <svg viewBox="0 0 100 100" aria-hidden="true"><path d={trackMapPath(t.controlPoints)} className="mc-line" /></svg>
                  <span>{t.name}<i>{t.laps} laps</i></span>
                </div>
              ))}
            </div>
          }
        />
        <FeatureRow
          flip
          eyebrow="Time of day"
          title="Bright noon, golden dusk, or midnight."
          body="Pick your mood before you launch. Night flips on real headlights that pool across the asphalt, glowing tail lights, and a sky full of stars. The same circuit, three completely different drives."
          media={
            <div className="mock-trio">
              <img src="/feature-day.webp" alt="Daytime mountain race" />
              <img src="/feature-dusk.webp" alt="Dusk mountain race" />
              <img src="/feature-night.webp" alt="Night mountain race with headlights" />
            </div>
          }
        />
        <FeatureRow
          eyebrow="Chase the gap"
          title="Every corner, measured against your best."
          body="A live gap timer ticks green when you're up and red when you're down — the exact feedback loop that makes 'one more run' irresistible. Cross the line and a medal tells you how close you are to gold."
          media={
            <div className="mock-card mock-gap">
              <div className="gap-pill ahead">−0.87</div>
              <div className="medal-row">
                <span className="m bronze">Bronze 3:05</span>
                <span className="m silver">Silver 2:15</span>
                <span className="m gold">Gold 2:09</span>
              </div>
            </div>
          }
        />
        <FeatureRow
          flip
          eyebrow="Learn the line"
          title="Braking boards, ghosts, and a living mountain."
          body="Countdown boards mark every braking point so you carry more speed each lap. Rival ghosts wear their names and times. Forests thicken, the road climbs to a summit hairpin and drops through an S-chicane built to be drifted."
          media={
            <div className="mock-media-img">
              <img src="/feature-night.webp" alt="Night drifting with headlights" />
              <span className="ghost-tag">Kaido King · 2:09.4</span>
            </div>
          }
        />
      </section>

      {/* final CTA */}
      <section className="closer">
        <div className="brand-logo closer-logo" aria-label="CHOP FIRST">
          <span className="brand-chop">CHOP</span>
          <span className="brand-first">FIRST</span>
        </div>
        <p>Free. No install. Set a time in the next two minutes.</p>
        <button className="primary hero-start" onClick={onStart}>{challenge ? "Take the challenge" : "Start racing"}</button>
        <div className="closer-links">
          <button onClick={() => setShowRivals(true)}>
            ⚔️ Your rivals{pendingCount > 0 && <span className="rivals-badge">{pendingCount}</span>}
          </button>
          <button onClick={onBoard}>🏆 Global leaderboard</button>
          <button onClick={onFeedback}>💬 Feedback</button>
        </div>
      </section>

      <footer className="landing-footer">
        <a href="https://www.augustwheel.com" target="_blank" rel="noopener noreferrer">augustwheel.com</a>
        <span>·</span>
        <span>by <a href="https://www.linkedin.com/in/augustineosei/" target="_blank" rel="noopener noreferrer">Augustine Osei</a></span>
        <span>·</span>
        <button className="version-chip" onClick={onChangelog} aria-label="What's new">
          v{CURRENT_VERSION}
          {!changelogSeen && <span className="version-dot" aria-hidden />}
        </button>
      </footer>
      {showRivals && <RivalsBoard items={rivals} onClose={() => setShowRivals(false)} />}
    </div>
  );
}

function IntroBackdrop({ variant = "panel" }) {
  return (
    <div className="intro-backdrop">
      <img src="/cover.jpg" alt="" className="intro-art" />
      <div className={`intro-scrim intro-scrim--${variant}`} />
    </div>
  );
}

function Panel({ children, wide }) {
  return <section className={wide ? "panel wide" : "panel"}>{children}</section>;
}

// Covers the stage while the race scene assembles (geometry build + first paint).
function RaceLoading() {
  return (
    <div className="race-loading" role="status" aria-live="polite">
      <div className="race-loading-mark">CHOP<span>FIRST</span></div>
      <div className="race-loading-bar"><span /></div>
      <p>Building the track…</p>
    </div>
  );
}

function Leaderboard({ challenge }) {
  return (
    <ol className="leaderboard">
      {challenge.runs.map((run, index) => (
        <li key={run.id}>
          {run.photo ? <img src={run.photo} alt="" /> : <span className="avatar">{run.name.slice(0, 1).toUpperCase()}</span>}
          <strong>{index + 1}. {run.name}</strong>
          <span>{formatTime(run.timeMs)}</span>
          <small>{run.coins} coins · {run.driftScore} drift</small>
        </li>
      ))}
    </ol>
  );
}
