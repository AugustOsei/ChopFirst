// Fire-and-forget funnel event from the client. keepalive lets the request
// survive a navigation (e.g. tapping the WhatsApp share link).
export function logEvent(event) {
  try {
    fetch("/api/track", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    }).catch(() => {});
  } catch {
    // analytics must never break the game
  }
}
