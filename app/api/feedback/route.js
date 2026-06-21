import { NextResponse } from "next/server";
import { addFeedback } from "../../../lib/challenges";

// Player feedback is emailed straight to the owner via Resend (https://resend.com)
// so it lands in an inbox instead of a data store you have to poll. We call the
// REST API with fetch — same pattern as the Upstash calls in lib/challenges.js —
// so there's no SDK dependency. Without email configured (local dev), feedback
// falls back to the data store so nothing is ever dropped.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FEEDBACK_EMAIL_TO = process.env.FEEDBACK_EMAIL_TO;
const FEEDBACK_EMAIL_FROM =
  process.env.FEEDBACK_EMAIL_FROM || "ChopFirst Feedback <onboarding@resend.dev>";

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function emailFeedback({ type, message, name, contact }) {
  const isIdea = type === "idea";
  const body = {
    from: FEEDBACK_EMAIL_FROM,
    to: [FEEDBACK_EMAIL_TO],
    subject: `${isIdea ? "💡 Feature idea" : "🐞 Bug report"} — ChopFirst`,
    text: [
      `Type:    ${isIdea ? "Feature idea" : "Bug report"}`,
      `From:    ${name || "(anonymous)"}`,
      `Contact: ${contact || "(none)"}`,
      `Time:    ${new Date().toISOString()}`,
      "",
      message,
    ].join("\n"),
  };
  // If the player left an email, let the owner reply to it directly.
  if (contact && looksLikeEmail(contact)) body.reply_to = contact;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`email send failed: ${res.status} ${detail.slice(0, 200)}`);
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const message = String(body?.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "Write a short message first." }, { status: 400 });
  }

  const payload = {
    type: body.type === "idea" ? "idea" : "bug",
    message: message.slice(0, 500),
    name: String(body.name || "").slice(0, 32),
    contact: String(body.contact || "").slice(0, 80),
  };

  try {
    if (RESEND_API_KEY && FEEDBACK_EMAIL_TO) {
      await emailFeedback(payload);
    } else {
      // Email not configured (local dev) — keep it in the data store so nothing
      // is lost. Set RESEND_API_KEY + FEEDBACK_EMAIL_TO to email instead.
      await addFeedback(payload);
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: `Could not send feedback: ${error.message}` }, { status: 500 });
  }
}
