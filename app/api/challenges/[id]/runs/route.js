import { NextResponse } from "next/server";
import { addRun } from "../../../../../lib/challenges";

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  let result;
  try {
    result = await addRun(id, body);
  } catch (error) {
    return NextResponse.json({ error: `Storage error: ${error.message}` }, { status: 500 });
  }
  if (result.error === "invalid") {
    // Log the underlying reason (player sees only the friendly text); buildId
    // flags a run posted by a stale, pre-deploy tab.
    console.warn("[run rejected] addRun", {
      challengeId: id,
      reason: result.reason,
      trackId: body?.trackId ?? null,
      timeMs: body?.timeMs ?? null,
      ghostSamples: Array.isArray(body?.ghost) ? body.ghost.length : 0,
      buildId: body?.buildId ?? null,
    });
    return NextResponse.json({ error: "This run could not be verified — refresh the game and race again.", reason: result.reason }, { status: 422 });
  }
  if (result.error === "missing") {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }
  if (result.error === "wrongTrack") {
    return NextResponse.json({ error: "This challenge was raced on a different track", challenge: result.challenge }, { status: 409 });
  }
  // revived: this run brought a lapsed-but-unpruned challenge back to life
  return NextResponse.json({ ...result.challenge, revived: result.revived }, { status: 201 });
}
