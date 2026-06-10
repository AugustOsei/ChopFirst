"use client";

import { useEffect, useState } from "react";
import RaceGame from "../components/RaceGame";
import GuideModal from "../components/GuideModal";

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

const CAR_COLORS = [
  { id: "#d81f33", label: "Rosso" },
  { id: "#2563eb", label: "Bayside Blue" },
  { id: "#f5b818", label: "Sunburst" },
  { id: "#1f9d55", label: "Ridge Green" },
  { id: "#374151", label: "Midnight" },
  { id: "#e8ecef", label: "Chalk" },
];

export default function Home() {
  const [screen, setScreen] = useState("onboard");
  const [driver, setDriver] = useState({ name: "", photo: "", color: CAR_COLORS[0].id });
  const [challengeId, setChallengeId] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("challenge") || "";
    setChallengeId(id);
    if (id) {
      fetch(`/api/challenges/${id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setChallenge(data));
    }
    try {
      const saved = JSON.parse(localStorage.getItem("chopfirst.driver") || "null");
      if (saved && typeof saved === "object") setDriver((value) => ({ ...value, ...saved }));
    } catch {
      // corrupted storage — start fresh
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
    setResult(null);
    setScreen("race");
  }

  function finishRace(run) {
    setResult(run);
    setScreen("finish");
  }

  async function submitRun() {
    const run = { ...result, message };
    setStatus("Saving run...");
    const endpoint = challengeId ? `/api/challenges/${challengeId}/runs` : "/api/challenges";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(run),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Could not save this run.");
      if (data.challenge) setChallenge(data.challenge);
      return;
    }
    setChallenge(data);
    setChallengeId(data.id);
    window.history.replaceState(null, "", `/?challenge=${data.id}`);
    setScreen("results");
    setStatus("");
  }

  const shareUrl = typeof window === "undefined" || !challengeId ? "" : `${window.location.origin}/?challenge=${challengeId}`;
  const shareText = encodeURIComponent(`I set a time on CHOP FIRST. You have 24 hours to chop my time: ${shareUrl}`);

  return (
    <main className="app-shell">
      <section className="game-stage">
        {screen === "race" ? (
          <RaceGame driver={driver} challenge={challenge} onFinish={finishRace} onQuit={() => setScreen("onboard")} />
        ) : (
          <IntroBackdrop />
        )}

        {screen === "onboard" && (
          <Panel>
            <div className="brand">
              <p className="eyebrow">24-hour touge time attack</p>
              <div className="brand-logo" aria-label="CHOP FIRST">
                <span className="brand-chop">CHOP</span>
                <span className="brand-first">FIRST</span>
              </div>
              <div className="brand-strip" aria-hidden />
            </div>
            <p className="lede">Three laps down the ridge. Set a time, then send the link — your friends have 24 hours to chop it.</p>
            {challenge && (
              <p className="challenge-pill">
                Challenge loaded — beat {formatTime(challenge.runs[0]?.timeMs)} by {challenge.runs[0]?.name || "a rival"}
                <ChallengeCountdown expiresAt={challenge.expiresAt} />
              </p>
            )}
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
            <button className="ghost-button" onClick={() => setShowGuide(true)}>How to play</button>
            <footer className="credits">
              <a href="https://www.augustwheel.com" target="_blank" rel="noopener noreferrer">augustwheel.com</a>
              <span>by <a href="https://www.linkedin.com/in/augustineosei/" target="_blank" rel="noopener noreferrer">Augustine Osei</a></span>
            </footer>
          </Panel>
        )}

        {screen === "finish" && result && (
          <Panel>
            <p className="eyebrow">Run complete</p>
            <h2>{formatTime(result.timeMs)}</h2>
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
            <button className="primary" onClick={submitRun}>Save and share</button>
            {status && <p className="status">{status}</p>}
          </Panel>
        )}

        {screen === "results" && challenge && (
          <Panel wide>
            <p className="eyebrow">24-hour challenge</p>
            <h2>Leaderboard</h2>
            <Leaderboard challenge={challenge} />
            <div className="share-row">
              <a className="primary link-button" href={`https://wa.me/?text=${shareText}`} target="_blank">WhatsApp</a>
              <a className="secondary link-button" href={`sms:?&body=${shareText}`}>SMS</a>
              <button className="secondary" onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy link</button>
            </div>
            <button className="ghost-button" onClick={startRace}>Run it again</button>
          </Panel>
        )}

        {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
      </section>
    </main>
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

function IntroBackdrop() {
  return (
    <div className="intro-backdrop">
      <img src="/cover.jpg" alt="" className="intro-art" />
      <div className="intro-scrim" />
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

