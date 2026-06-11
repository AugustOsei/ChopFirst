"use client";

export default function GuideModal({ onClose }) {
  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-card" onClick={(event) => event.stopPropagation()}>
        <button className="guide-close" aria-label="Close guide" onClick={onClose}>×</button>

        <p className="eyebrow">How to play</p>
        <h2 className="guide-title">CHOP FIRST</h2>
        <p className="guide-lede">
          A 24-hour touge time attack. Race three laps of the mountain sprint, set your time,
          then send the challenge link to friends — they have 24 hours to chop it.
        </p>

        <section className="guide-section">
          <h3>Controls</h3>
          <div className="guide-controls">
            <div>
              <h4>Keyboard</h4>
              <ul>
                <li><kbd>W</kbd> / <kbd>↑</kbd> Accelerate</li>
                <li><kbd>S</kbd> / <kbd>↓</kbd> Brake, then reverse</li>
                <li><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd> Steer</li>
                <li><kbd>Shift</kbd> Handbrake / drift</li>
                <li><kbd>Space</kbd> Boost</li>
                <li><kbd>Esc</kbd> / <kbd>P</kbd> Pause</li>
              </ul>
            </div>
            <div>
              <h4>Touch (phones &amp; tablets)</h4>
              <ul>
                <li><b>Auto-throttle</b> — the car accelerates by itself</li>
                <li><b>‹ ›</b> bottom-left — steer</li>
                <li><b>BRAKE</b> — slow down, hold to reverse</li>
                <li><b>DRIFT</b> — handbrake slide</li>
                <li><b>BOOST</b> — fire a boost charge</li>
                <li><b>❚❚</b> top-left — pause</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="guide-section">
          <h3>On the mountain</h3>
          <ul className="guide-tips">
            <li><b>Boost</b> — 3 charges per run. Best on straights; the pips above the controls show charges and cooldown.</li>
            <li><b>Drift</b> — hold the handbrake into a corner to slide and build drift score. Counter-steer to recover.</li>
            <li><b>Coins</b> — placed off the racing line. Risk the detour or keep your pace.</li>
            <li><b>Rails</b> — glancing hits scrape speed off; head-on hits stop you. Steer away from the rail (or reverse out) to recover.</li>
            <li><b>Reverse</b> — stop, then keep holding brake. The car backs and steers like a real car.</li>
            <li><b>Ghosts</b> — a gold ghost races your personal best on every run; on a challenge link, blue and purple ghosts replay your rivals&apos; best runs.</li>
            <li><b>Road messages</b> — after a run you can leave a note; it pops up for the next drivers mid-race.</li>
          </ul>
        </section>

        <footer className="guide-credits">
          <a href="https://www.augustwheel.com" target="_blank" rel="noopener noreferrer">augustwheel.com</a>
          <span>Created by <a href="https://www.linkedin.com/in/augustineosei/" target="_blank" rel="noopener noreferrer">Augustine Osei</a></span>
        </footer>
      </div>
    </div>
  );
}
