import { NextResponse } from "next/server";
import { recordEvent } from "../../../lib/challenges";

const ALLOWED_EVENTS = new Set([
  "link_opened",
  "race_started",
  "race_finished",
  "run_saved",
  "share_whatsapp",
  "share_sms",
  "share_copy",
  "feedback_sent",
]);

// Fire-and-forget funnel counter. Always answers 204 — analytics must never
// break or slow down the game flow.
export async function POST(request) {
  try {
    const { event } = await request.json();
    if (ALLOWED_EVENTS.has(event)) await recordEvent(event);
  } catch {
    // swallow malformed bodies and storage hiccups alike
  }
  return new NextResponse(null, { status: 204 });
}
