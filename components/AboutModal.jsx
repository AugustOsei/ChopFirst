"use client";

import { useState } from "react";
import { ABOUT } from "../lib/about";

// Initials for the fallback monogram, so the panel reads as intentional rather
// than broken while there is no portrait file in /public.
function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export default function AboutModal({ onClose }) {
  // Flips the moment the <img> 404s — no build step or file check needed, so
  // dropping the photo in later is the only action required to show it.
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = ABOUT.photo && !photoFailed;

  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-card about-card" onClick={(event) => event.stopPropagation()}>
        <button className="guide-close" aria-label="Close about" onClick={onClose}>×</button>
        <p className="eyebrow">About</p>

        <div className="about-head">
          {showPhoto ? (
            <img
              className="about-photo"
              src={ABOUT.photo}
              alt={ABOUT.name}
              onError={() => setPhotoFailed(true)}
              draggable={false}
            />
          ) : (
            <div className="about-photo about-monogram" aria-hidden="true">
              {initials(ABOUT.name)}
            </div>
          )}
          <div className="about-id">
            <h2 className="guide-title about-name">{ABOUT.name}</h2>
            <p className="about-role">{ABOUT.role}</p>
            <p className="about-bases">{ABOUT.bases}</p>
          </div>
        </div>

        <div className="about-body">
          {ABOUT.paragraphs.map((text) => (
            <p key={text.slice(0, 24)}>{text}</p>
          ))}
        </div>

        <section className="guide-section about-projects">
          <h3>Elsewhere</h3>
          <ul>
            {ABOUT.projects.map((project) => (
              <li key={project.name}>
                {project.url ? (
                  <a href={project.url} target="_blank" rel="noopener noreferrer">
                    {project.name} <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <b>{project.name}</b>
                )}
                <span>{project.blurb}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="guide-section about-contact">
          <h3>Get in touch</h3>
          <p>
            Collaborations, questions, or just to say the summit hairpin is unfair —{" "}
            <a href={`mailto:${ABOUT.email}`}>{ABOUT.email}</a>.
          </p>
          <a
            className="primary about-cta"
            href={`mailto:${ABOUT.email}?subject=${encodeURIComponent("Hello from CHOP FIRST")}`}
          >
            ✉ Email {ABOUT.shortName}
          </a>
          <p className="about-site">
            <a href={ABOUT.site.url} target="_blank" rel="noopener noreferrer">
              {ABOUT.site.label} <span aria-hidden="true">↗</span>
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
