const GAUGE_MAX_KMH = 240;
const GAUGE_SWEEP_DEG = 264;

export default function RaceHud({ race, driver, muted, onToggleMute, onPause }) {
  const kmh = Math.round(Math.abs(race.speed) * 3.6);
  const gaugeRatio = Math.min(1, kmh / GAUGE_MAX_KMH);
  const boosting = race.boostTimer > 0;
  const speedHeat = Math.min(1, Math.max(0, kmh - 110) / 110);

  return (
    <>
      <div className={`speed-fx${boosting ? " on" : ""}`} aria-hidden />
      <div className="speed-vignette" style={{ opacity: speedHeat * 0.5 + (boosting ? 0.25 : 0) }} aria-hidden />

      <div className="hud-corner">
        <button className="hud-pause" aria-label="Pause" onClick={onPause}>❚❚</button>
        <button className="hud-pause hud-mute" aria-label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>{muted ? "🔇" : "🔊"}</button>
        {(driver?.name || driver?.photo) && (
          <div className="driver-chip">
            {driver.photo ? <img src={driver.photo} alt="" /> : <span>{(driver.name || "?").slice(0, 1).toUpperCase()}</span>}
            {driver.name && <b>{driver.name}</b>}
          </div>
        )}
      </div>

      <div className="hud-top">
        <div className="hud-chip lap-chip">
          <small>LAP</small>
          <b>{Math.min(3, race.lap + 1)}<i>/3</i></b>
        </div>
        <div className="hud-chip time-chip">
          <small>TIME</small>
          <b>{formatTime(race.timeMs)}</b>
        </div>
        <div className="hud-chip">
          <small>COINS</small>
          <b key={race.coins} className={race.coins > 0 ? "pop-in" : ""}>{race.coins}</b>
        </div>
        <div className="hud-chip">
          <small>DRIFT</small>
          <b className={race.drifting ? "drift-live" : ""}>{race.driftScore}</b>
        </div>
      </div>

      {race.banner && (
        <div className="lap-banner" key={race.banner.id}>{race.banner.text}</div>
      )}

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

      <div className="progress-map">
        <div className="progress-track">
          <span style={{ left: `${race.progress * 100}%` }} />
        </div>
      </div>

      <div className="speedo">
        <div
          className={`speedo-ring${boosting ? " boosting" : ""}`}
          style={{
            background: `conic-gradient(from ${-GAUGE_SWEEP_DEG / 2}deg, ${
              boosting ? "#ffb12e" : "#ff3b4e"
            } ${gaugeRatio * GAUGE_SWEEP_DEG}deg, rgba(255,255,255,.13) ${gaugeRatio * GAUGE_SWEEP_DEG}deg ${GAUGE_SWEEP_DEG}deg, transparent ${GAUGE_SWEEP_DEG}deg 360deg)`,
          }}
        />
        <div className="speedo-core">
          <b>{kmh}</b>
          <small>km/h</small>
          <span className={`gear${race.reversing ? " rev" : ""}`}>{race.reversing ? "R" : kmh < 2 ? "N" : "D"}</span>
        </div>
      </div>

      <div className="boost-meter">
        <small>BOOST</small>
        <div className="boost-pips">
          {[0, 1, 2].map((index) => (
            <span key={index} className={`pip${index < race.boosts ? " full" : ""}${boosting && index === race.boosts ? " firing" : ""}`} />
          ))}
        </div>
        {race.boostCooldown > 0 && race.boosts > 0 && (
          <div className="boost-cooldown">
            <span style={{ width: `${(1 - race.boostCooldown / 2.2) * 100}%` }} />
          </div>
        )}
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
