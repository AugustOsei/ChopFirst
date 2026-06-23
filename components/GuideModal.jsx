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
                <li><b>‹ ›</b> bottom corners — steer, one thumb each</li>
                <li><b>DRIFT</b> — above each arrow; hold with your free thumb</li>
                <li><b>Tank</b> — tap to boost; the fill shows charges left</li>
                <li><b>BRAKE</b> — slow down, hold to reverse</li>
                <li><b>❚❚</b> top-left — pause</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="guide-section">
          <h3>On the mountain</h3>
          <ul className="guide-tips">
            <li><b>Boost</b> — start with 3 charges; every 15 coins banks another (max 5 stocked). Best on straights; the pips show charges and cooldown.</li>
            <li><b>Drift</b> — hold the handbrake into a corner to slide and build drift score. Counter-steer to recover.</li>
            <li><b>Coins</b> — lines and arcs trace the fast line, clusters sit off it; they return every lap. Collect 15 for an extra boost.</li>
            <li><b>Rails</b> — glancing hits scrape speed off; head-on hits stop you. Steer away from the rail (or reverse out) to recover.</li>
            <li><b>Reverse</b> — stop, then keep holding brake. The car backs and steers like a real car.</li>
            <li><b>Ghosts</b> — a gold ghost races your personal best on every run; on a challenge link, blue and purple ghosts replay your rivals&apos; best runs. Name tags show who&apos;s who (toggle in pause), and the gap timer shows live how far ahead or behind you are.</li>
            <li><b>Medals</b> — bronze, silver, and gold target times on every run. Press <kbd>R</kbd> anytime for an instant restart.</li>
            <li><b>Road messages</b> — after a run you can leave a note; it pops up for the next drivers mid-race.</li>
          </ul>
        </section>

        <footer className="guide-credits">
          <div className="guide-credits-row">
            <a href="https://www.augustwheel.com" target="_blank" rel="noopener noreferrer">augustwheel.com</a>
            <span>Created by <a href="https://www.linkedin.com/in/augustineosei/" target="_blank" rel="noopener noreferrer">Augustine Osei</a></span>
          </div>
          <p className="guide-attribution">
            Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors (ODbL).
            Vehicle models via <a href="https://sketchfab.com" target="_blank" rel="noopener noreferrer">Sketchfab</a> (CC BY / CC BY-SA).
            Key art via <a href="https://higgsfield.ai" target="_blank" rel="noopener noreferrer">Higgsfield</a> and Nano Banana.
          </p>
        </footer>
      </div>
    </div>
  );
}
