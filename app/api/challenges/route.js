import { NextResponse } from "next/server";
import { createChallenge } from "../../../lib/challenges";

export async function POST(request) {
  const body = await request.json();
  try {
    const challenge = await createChallenge(body);
    if (challenge.error === "invalid") {
      // Surface *why* a run was rejected so production failures are diagnosable
      // (the player only ever sees the friendly message). buildId pinpoints
      // runs posted by a stale, pre-deploy tab.
      console.warn("[run rejected] createChallenge", {
        reason: challenge.reason,
        trackId: body?.trackId ?? null,
        timeMs: body?.timeMs ?? null,
        ghostSamples: Array.isArray(body?.ghost) ? body.ghost.length : 0,
        buildId: body?.buildId ?? null,
      });
      return NextResponse.json({ error: "This run could not be verified — refresh the game and race again.", reason: challenge.reason }, { status: 422 });
    }
    return NextResponse.json(challenge, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: `Storage error: ${error.message}` }, { status: 500 });
  }
}
