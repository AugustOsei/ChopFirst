"use client";

import { useEffect, useRef, useState } from "react";
import RaceGame from "../components/RaceGame";
import GuideModal from "../components/GuideModal";
import FeedbackModal from "../components/FeedbackModal";
import { logEvent } from "../lib/log-event";

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

const PB_KEY = "chopfirst.pb.akina-ridge";
const DEVICE_KEY = "chopfirst.device";
const TRACKED_KEY = "chopfirst.challenges";

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
  const [driver, setDriver] = useState({ name: "", photo: "", color: CAR_COLORS[0].id });
  const [challengeId, setChallengeId] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [pb, setPb] = useState(null);
  const [pbRun, setPbRun] = useState(null);
  const [shareMessage, setShareMessage] = useState("");
  const savePromiseRef = useRef(null);

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
    try {
      const best = JSON.parse(localStorage.getItem(PB_KEY) || "null");
      if (best?.ghost?.length) setPbRun({ timeMs: best.timeMs, ghost: best.ghost });
    } catch {
      // no PB ghost yet
    }
  }, []);

  useEffect(() => {
    if (driver.name || driver.photo || driver.color !== CAR_COLORS[0].id) {
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
    setScreen("race");
  }

  function finishRace(run) {
    logEvent("race_finished");
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(PB_KEY) || "null");
    } catch {
      stored = null;
    }
    const isNew = !stored || run.timeMs < stored.timeMs;
    if (isNew) {
      try {
        localStorage.setItem(PB_KEY, JSON.stringify({ timeMs: run.timeMs, at: Date.now(), ghost: run.ghost }));
      } catch {
        // quota exceeded — keep the time without the ghost trace
        localStorage.setItem(PB_KEY, JSON.stringify({ timeMs: run.timeMs, at: Date.now() }));
      }
      setPbRun({ timeMs: run.timeMs, ghost: run.ghost });
    }
    setPb({ isNew, previous: stored?.timeMs ?? null });
    setResult(run);
    setScreen("finish");

    // auto-save so a closed tab can't lose the score; the message is optional and added after
    const target = challenge?.runs?.[0] ?? null;
    setStatus("Saving your run…");
    const endpoint = challengeId ? `/api/challenges/${challengeId}/runs` : "/api/challenges";
    savePromiseRef.current = fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...run, deviceId: getDeviceId() }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatus(data.error || "Could not save this run.");
          if (data.challenge) setChallenge(data.challenge);
          return null;
        }
        setChallenge(data);
        setChallengeId(data.id);
        window.history.replaceState(null, "", `/?challenge=${data.id}`);
        upsertTracked({ id: data.id, myTimeMs: run.timeMs, lastSeenRuns: data.runs.length });
        setShareMessage(buildShareMessage(run, target, data.id));
        setStatus("Saved to the leaderboard ✓");
        logEvent("run_saved");
        return data;
      })
      .catch(() => {
        setStatus("Could not save this run — check your connection.");
        return null;
      });
  }

  async function continueToResults() {
    const saved = savePromiseRef.current ? await savePromiseRef.current : null;
    if (saved && message.trim()) {
      try {
        const res = await fetch(`/api/challenges/${saved.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: driver.name || "Street Driver", photo: driver.photo, message: message.trim() }),
        });
        if (res.ok) setChallenge(await res.json());
      } catch {
        // message is a nice-to-have; don't block the flow
      }
    }
    setMessage("");
    setStatus("");
    setScreen(saved || challenge ? "results" : "title");
  }

  function goHome() {
    // the auto-save kicked off in finishRace keeps running in the background
    setMessage("");
    setStatus("");
    setScreen("title");
  }

  const shareUrl = typeof window === "undefined" || !challengeId ? "" : `${window.location.origin}/?challenge=${challengeId}`;
  const shareText = encodeURIComponent(
    shareMessage || `🏁 CHOP FIRST — a mountain racing game by August Osei. Beat my time within 24 hours if you can: ${shareUrl}`,
  );

  return (
    <main className="app-shell">
      <section className="game-stage">
        {screen === "race" ? (
          <RaceGame driver={driver} challenge={challenge} pbRun={pbRun} onFinish={finishRace} onQuit={() => setScreen("title")} />
        ) : (
          <IntroBackdrop variant={screen === "title" ? "title" : "panel"} />
        )}

        {screen === "title" && (
          <TitleScreen
            challenge={challenge}
            onStart={() => setScreen("setup")}
            onGuide={() => setShowGuide(true)}
            onBoard={() => setShowBoard(true)}
            onFeedback={() => setShowFeedback(true)}
            overlayOpen={showGuide || showBoard || showFeedback}
          />
        )}

        {screen === "setup" && (
          <Panel>
            <p className="eyebrow">Driver setup</p>
            <h2 className="setup-title">Ready to run?</h2>
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
            <label className="field">
              Driver name
              <input value={driver.name} onChange={(event) => setDriver({ ...driver, name: event.target.value })} placeholder="Your racing name" />
            </label>
            <label className="photo-field">
              <span>{driver.photo ? "Change profile photo" : "Upload profile photo"}</span>
              <input type="file" accept="image/*" onChange={handlePhoto} />
              {driver.photo && <img src={driver.photo} alt="" />}
            </label>
            <div className="field swatch-field">
              Paint
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
            <button className="primary" onClick={startRace}>Start 3 laps</button>
            <button className="ghost-button back-button" onClick={() => setScreen("title")}>‹ Back</button>
          </Panel>
        )}

        {screen === "finish" && result && (
          <Panel>
            <p className="eyebrow">Run complete</p>
            <h2>{formatTime(result.timeMs)}</h2>
            <FinishVerdict result={result} challenge={challenge} pb={pb} />
            <div className="stats-grid">
              <span>Coins <b>{result.coins}</b></span>
              <span>Drift <b>{result.driftScore}</b></span>
              <span>Boosts used <b>{result.boostUses}</b></span>
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
            <button className="primary" onClick={continueToResults}>Continue to leaderboard</button>
            <button className="ghost-button back-button" onClick={goHome}>‹ Home</button>
            {status && <p className="status">{status}</p>}
          </Panel>
        )}

        {screen === "results" && challenge && (
          <Panel wide>
            <p className="eyebrow">24-hour challenge</p>
            <h2>Leaderboard</h2>
            <Leaderboard challenge={challenge} />
            <div className="share-row">
              <a className="primary link-button" href={`https://wa.me/?text=${shareText}`} target="_blank" onClick={() => logEvent("share_whatsapp")}>WhatsApp</a>
              <a className="secondary link-button" href={`sms:?&body=${shareText}`} onClick={() => logEvent("share_sms")}>SMS</a>
              <button className="secondary" onClick={() => { navigator.clipboard.writeText(shareUrl); logEvent("share_copy"); }}>Copy link</button>
            </div>
            <div className="button-row">
              <button className="ghost-button" onClick={startRace}>Run it again</button>
              <button className="ghost-button" onClick={goHome}>Home</button>
            </div>
            <button className="feedback-link" onClick={() => setShowFeedback(true)}>🐞 Report a bug or suggest a feature</button>
          </Panel>
        )}

        {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
        {showBoard && <GlobalBoard onClose={() => setShowBoard(false)} />}
        {showFeedback && <FeedbackModal driverName={driver.name} onClose={() => setShowFeedback(false)} />}
      </section>
    </main>
  );
}

function GlobalBoard({ onClose }) {
  const [board, setBoard] = useState(null);
  useEffect(() => {
    fetch("/api/leaderboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBoard(data || { top: [], totalRuns: 0, totalPlayers: 0 }))
      .catch(() => setBoard({ top: [], totalRuns: 0, totalPlayers: 0 }));
  }, []);
  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-card" onClick={(event) => event.stopPropagation()}>
        <button className="guide-close" aria-label="Close leaderboard" onClick={onClose}>×</button>
        <p className="eyebrow">All-time</p>
        <h2 className="guide-title">Global leaderboard</h2>
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

function ChallengeInbox() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    const tracked = loadTracked().slice(0, 3);
    if (!tracked.length) return;
    Promise.all(
      tracked.map(async (entry) => {
        try {
          const res = await fetch(`/api/challenges/${entry.id}`);
          if (!res.ok) return null;
          const data = await res.json();
          const leader = data.runs[0];
          if (!leader) return null;
          return {
            id: entry.id,
            leader,
            myTimeMs: entry.myTimeMs,
            newRuns: Math.max(0, data.runs.length - (entry.lastSeenRuns || 0)),
            chopped: entry.myTimeMs != null && leader.timeMs < entry.myTimeMs,
            runCount: data.runs.length,
            expired: data.expired,
          };
        } catch {
          return null;
        }
      }),
    ).then((results) => setItems(results.filter(Boolean)));
  }, []);

  if (!items?.length) return null;
  return (
    <div className="challenge-inbox title-fade" style={{ animationDelay: ".95s" }}>
      <small>Your challenges</small>
      {items.map((item) => (
        <a key={item.id} className="inbox-row" href={`/?challenge=${item.id}`}>
          <span className={`inbox-dot${item.newRuns > 0 ? " live" : ""}`} />
          <span className="inbox-text">
            {item.chopped
              ? `${item.leader.name} chopped you by ${formatGap(item.myTimeMs - item.leader.timeMs)}`
              : `You lead at ${formatTime(item.myTimeMs)}`}
            {item.newRuns > 0 && <b> · {item.newRuns} new run{item.newRuns > 1 ? "s" : ""}</b>}
          </span>
          <span className="inbox-meta">{item.expired ? "ended" : `${item.runCount} run${item.runCount === 1 ? "" : "s"}`}</span>
        </a>
      ))}
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
  if (msLeft <= 0) return <span className="countdown expired">challenge expired</span>;
  const hours = Math.floor(msLeft / 3600000);
  const minutes = Math.floor((msLeft % 3600000) / 60000);
  return <span className="countdown">{hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`} left to chop it</span>;
}

function formatGap(ms) {
  return `${(Math.abs(ms) / 1000).toFixed(2)}s`;
}

function buildShareMessage(run, target, id) {
  const url = `${window.location.origin}/?challenge=${id}`;
  const credit = "🏁 CHOP FIRST — a mountain racing game by August Osei.";
  if (!target) {
    return `${credit} I just raced 3 laps down the ridge in ${formatTime(run.timeMs)}. You have 24 hours to chop my time: ${url}`;
  }
  const delta = run.timeMs - target.timeMs;
  if (delta < 0) {
    return `🪓 CHOPPED! I beat ${target.name}'s ${formatTime(target.timeMs)} with a ${formatTime(run.timeMs)} in CHOP FIRST, the 24-hour mountain racing challenge by August Osei. Your move: ${url}`;
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

function TitleScreen({ challenge, onStart, onGuide, onBoard, onFeedback, overlayOpen }) {
  const [bestTime, setBestTime] = useState(null);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PB_KEY) || "null");
      if (stored?.timeMs) setBestTime(stored.timeMs);
    } catch {
      // ignore corrupted storage
    }
  }, []);
  useEffect(() => {
    const onKey = (event) => {
      if (overlayOpen) return;
      if (event.key === "Enter" || event.key === " ") onStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart, overlayOpen]);

  return (
    <div className="title-screen">
      <div className="title-center">
        <p className="eyebrow title-fade" style={{ animationDelay: ".55s" }}>24-hour touge time attack</p>
        <div className="brand-logo title-logo" aria-label="CHOP FIRST">
          <span className="brand-chop logo-pop">CHOP</span>
          <span className="brand-first logo-pop" style={{ animationDelay: ".14s" }}>FIRST</span>
        </div>
        <div className="brand-strip title-strip" aria-hidden />
        <p className="title-tagline title-fade" style={{ animationDelay: ".7s" }}>
          Set a time. Send the link. They get 24 hours to chop it.
        </p>
        {challenge ? (
          <p className="challenge-pill title-pill title-fade" style={{ animationDelay: ".85s" }}>
            Beat {formatTime(challenge.runs[0]?.timeMs)} by {challenge.runs[0]?.name || "a rival"}
            <ChallengeCountdown expiresAt={challenge.expiresAt} />
          </p>
        ) : (
          bestTime != null && (
            <p className="challenge-pill title-pill title-fade" style={{ animationDelay: ".85s" }}>
              Your best — {formatTime(bestTime)}. Chop it.
            </p>
          )
        )}
        <ChallengeInbox />
        <button className="primary title-start title-fade" style={{ animationDelay: "1s" }} onClick={onStart}>
          START
        </button>
        <div className="title-links title-fade" style={{ animationDelay: "1.15s" }}>
          <button className="title-guide" onClick={onGuide}>How to play</button>
          <button className="title-guide" onClick={onBoard}>🏆 Global leaderboard</button>
          <button className="title-guide" onClick={onFeedback}>💬 Feedback</button>
        </div>
      </div>
      <footer className="title-credits title-fade" style={{ animationDelay: "1.3s" }}>
        <a href="https://www.augustwheel.com" target="_blank" rel="noopener noreferrer">augustwheel.com</a>
        <span>·</span>
        <span>by <a href="https://www.linkedin.com/in/augustineosei/" target="_blank" rel="noopener noreferrer">Augustine Osei</a></span>
      </footer>
    </div>
  );
}

function IntroBackdrop({ variant = "panel" }) {
  return (
    <div className="intro-backdrop">
      <img src="/cover.jpg" alt="" className="intro-art" />
      <div className={`intro-scrim ${variant}`} />
    </div>
  );
}

function Panel({ children, wide }) {
  return <section className={wide ? "panel wide" : "panel"}>{children}</section>;
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

