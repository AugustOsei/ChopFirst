"use client";

export default function GuideModal({ onClose }) {
  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-card" onClick={(event) => event.stopPropagation()}>
        <button className="guide-close" aria-label="Close guide" onClick={onClose}>×</button>

        <p className="eyebrow">How to play</p>
        <h2 className="guide-title">CHOP FIRST</h2>
        <p className="guide-lede">
          Two ways to race, four cars, three circuits — a mountain touge, the streets of
          Accra, and a neon highway in orbit.
        </p>
        <div className="guide-modes">
          <div>
            <h4>Time Attack</h4>
            <p>
              Set a lap time, then send the challenge link. Your friends have 24 hours to
              chop it — they race your ghost and can leave a note on the road.
            </p>
          </div>
          <div>
            <h4>Arcade</h4>
            <p>
              Line up against Ananse, a trickster AI who brakes late, boosts on sight and
              talks the whole way. Real car-to-car contact, four pace settings.
            </p>
          </div>
        </div>

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
                <li><kbd>F</kbd> / <kbd>X</kbd> Fire laser (Orbital Highway)</li>
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
                <li><b>FIRE ◎</b> — laser, on the Orbital Highway only</li>
                <li><b>❚❚</b> top-left — pause</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="guide-section">
          <h3>On the road</h3>
          <ul className="guide-tips">
            <li><b>Boost</b> — start with 3 charges; every 15 coins banks another (max 5 stocked). Best on straights; the pips show charges and cooldown.</li>
            <li><b>Boost stars</b> — rare glowing stars sit on the straights and refill boost to full in one grab. They come back every lap, so learn where they are and plan the lap around them.</li>
            <li><b>Drift</b> — hold the handbrake into a corner to slide and build drift score. Counter-steer to recover.</li>
            <li><b>Coins</b> — lines and arcs trace the fast line, clusters sit off it; they return every lap. Collect 15 for an extra boost.</li>
            <li><b>Rails</b> — glancing hits scrape speed off; head-on hits stop you. Steer away from the rail (or reverse out) to recover.</li>
            <li><b>Asteroids</b> — on the Orbital Highway, rocks sit on the road. Blast them with your laser (<kbd>F</kbd> or FIRE) before you reach them; ram one and it shatters, costing most of your speed. Same rocks every lap — learn where they wait.</li>
            <li><b>Reverse</b> — stop, then keep holding brake. The car backs and steers like a real car.</li>
            <li><b>Ghosts</b> — a gold ghost races your personal best on every run; on a challenge link, blue and purple ghosts replay your rivals&apos; best runs. Name tags show who&apos;s who (toggle in pause), and the gap timer shows live how far ahead or behind you are.</li>
            <li><b>Medals</b> — bronze, silver, and gold target times on every run. Press <kbd>R</kbd> anytime for an instant restart.</li>
            <li><b>Road messages</b> — after a run you can leave a note; it pops up for the next drivers mid-race.</li>
          </ul>
        </section>

        <section className="guide-section">
          <h3>Racing Ananse</h3>
          <ul className="guide-tips">
            <li><b>Pick his pace</b> — <b>Cruising</b> hangs back and rarely boosts; <b>Race pace</b> keeps it honest and close; <b>Full trickster</b> brakes late and boosts on sight; <b>Unleashed</b> stops racing you and races the clock — roughly 1:40 for three laps of Akina, flat out, every boost spent.</li>
            <li><b>He&apos;s a real car</b> — not a ghost. You can lean on him and he&apos;ll lean back, and contact scrubs speed off you both. Shove him hard and he bites back for a few seconds.</li>
            <li><b>The first three settings pace off you</b> — build a big lead and he eases so you stay in touch; drop back and he waits. Unleashed does none of that.</li>
            <li><b>He overtakes properly</b> — catch him and he&apos;ll pull off the line and go around rather than sit on your bumper. Expect to be passed back.</li>
            <li><b>Akina only, for now</b> — the other two circuits are coming.</li>
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
