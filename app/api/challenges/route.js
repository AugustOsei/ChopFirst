import { NextResponse } from "next/server";
import { createChallenge } from "../../../lib/challenges";

export async function POST(request) {
  const body = await request.json();
  try {
    const challenge = await createChallenge(body);
    if (challenge.error === "invalid") {
      return NextResponse.json({ error: "This run could not be verified — refresh the game and race again." }, { status: 422 });
    }
    return NextResponse.json(challenge, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: `Storage error: ${error.message}` }, { status: 500 });
  }
}
