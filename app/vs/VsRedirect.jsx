"use client";

import { useEffect } from "react";

// Bounces a real visitor from the share target into the arcade. Deliberately
// client-side: link scrapers do not run JS, so they stop at the Open Graph card
// in the head and never see this. `replace` keeps the share URL out of history,
// so Back returns to wherever they came from rather than looping.
export default function VsRedirect() {
  useEffect(() => {
    window.location.replace("/?arcade=1");
  }, []);
  return null;
}
