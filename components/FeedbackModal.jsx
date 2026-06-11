"use client";

import { useState } from "react";

export default function FeedbackModal({ driverName, onClose }) {
  const [type, setType] = useState("bug");
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error

  async function submit(event) {
    event.preventDefault();
    if (!text.trim() || state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message: text.trim(), contact: contact.trim(), name: driverName || "" }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-card feedback-card" onClick={(event) => event.stopPropagation()}>
        <button className="guide-close" aria-label="Close feedback" onClick={onClose}>×</button>
        <p className="eyebrow">Help improve the game</p>
        <h2 className="guide-title">{state === "sent" ? "Sent — thank you!" : "Feedback"}</h2>

        {state === "sent" ? (
          <>
            <p className="guide-lede">Every report makes the mountain better. Back to the road. 🏁</p>
            <button className="primary" onClick={onClose}>Done</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="feedback-types">
              <button
                type="button"
                className={`feedback-type${type === "bug" ? " selected" : ""}`}
                onClick={() => setType("bug")}
              >
                🐞 Report a bug
              </button>
              <button
                type="button"
                className={`feedback-type${type === "idea" ? " selected" : ""}`}
                onClick={() => setType("idea")}
              >
                💡 Suggest a feature
              </button>
            </div>
            <label className="field">
              {type === "bug" ? "What went wrong?" : "What should the game add?"}
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder={type === "bug" ? "What happened, and what did you expect?" : "Describe your idea"}
                autoFocus
              />
            </label>
            <label className="field">
              Contact (optional)
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                maxLength={80}
                placeholder="Email or @handle, if you'd like a reply"
              />
            </label>
            <button className="primary" type="submit" disabled={!text.trim() || state === "sending"}>
              {state === "sending" ? "Sending…" : "Send feedback"}
            </button>
            {state === "error" && <p className="status">Could not send right now — try again in a moment.</p>}
          </form>
        )}
      </div>
    </div>
  );
}
