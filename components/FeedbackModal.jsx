"use client";

import { useState } from "react";
import { logEvent } from "../lib/log-event";

// `initialType` opens the form on a given tab — "pace" is used by the arcade
// finish screen so a player who just walked the race lands straight on the
// question we actually want answered. `context` is a short machine-written note
// (difficulty, time, winning margin) appended to the report so pace feedback
// arrives with the numbers attached instead of "he was too slow".
export default function FeedbackModal({ driverName, onClose, initialType = "bug", context = "" }) {
  const [type, setType] = useState(initialType);
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
        body: JSON.stringify({
          type,
          message: text.trim(),
          contact: contact.trim(),
          name: driverName || "",
          // sent separately so it can never be squeezed out by the 500-char cap
          context: type === "pace" ? context : "",
        }),
      });
      if (res.ok) logEvent("feedback_sent");
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
              <button
                type="button"
                className={`feedback-type${type === "pace" ? " selected" : ""}`}
                onClick={() => setType("pace")}
              >
                🏁 Ananse&apos;s pace
              </button>
            </div>
            <label className="field">
              {type === "bug" ? "What went wrong?"
                : type === "pace" ? "Was Ananse too slow, or too fast?"
                : "What should the game add?"}
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder={
                  type === "bug" ? "What happened, and what did you expect?"
                    : type === "pace" ? "e.g. I beat him on Unleashed without using a boost — he needs to be quicker"
                    : "Describe your idea"
                }
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
