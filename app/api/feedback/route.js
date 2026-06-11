import { NextResponse } from "next/server";
import { addFeedback, listFeedback } from "../../../lib/challenges";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    const result = await addFeedback(body);
    if (result.error) {
      return NextResponse.json({ error: "Write a short message first." }, { status: 400 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: `Storage error: ${error.message}` }, { status: 500 });
  }
}

// Owner-only read: set FEEDBACK_ADMIN_KEY in the environment, then visit
// /api/feedback?key=<that value> to see everything players sent.
export async function GET(request) {
  const key = new URL(request.url).searchParams.get("key");
  const adminKey = process.env.FEEDBACK_ADMIN_KEY;
  if (!adminKey || key !== adminKey) {
    return NextResponse.json(
      { error: "Set FEEDBACK_ADMIN_KEY and pass it as ?key= to read feedback." },
      { status: 401 },
    );
  }
  try {
    return NextResponse.json({ feedback: await listFeedback() });
  } catch (error) {
    return NextResponse.json({ error: `Storage error: ${error.message}` }, { status: 500 });
  }
}
