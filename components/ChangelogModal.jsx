"use client";

import { CHANGELOG } from "../lib/changelog";

export default function ChangelogModal({ onClose }) {
  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-card" onClick={(event) => event.stopPropagation()}>
        <button className="guide-close" aria-label="Close changelog" onClick={onClose}>×</button>
        <p className="eyebrow">What&apos;s new</p>
        <h2 className="guide-title">Changelog</h2>
        {CHANGELOG.map((release) => (
          <section key={release.version} className="guide-section changelog-entry">
            <h3>
              v{release.version} — {release.title}
              <small>{release.date}</small>
            </h3>
            <ul className="guide-tips">
              {release.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
