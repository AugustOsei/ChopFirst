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
    return NextResponse.json({ error: "This run could not be verified — refresh the game and race again." }, { status: 422 });
  }
  if (result.error === "missing") {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }
  if (result.error === "wrongTrack") {
    return NextResponse.json({ error: "This challenge was raced on a different track", challenge: result.challenge }, { status: 409 });
  }
  if (result.error === "expired") {
    return NextResponse.json({ error: "Challenge expired", challenge: result.challenge }, { status: 410 });
  }
  return NextResponse.json(result.challenge, { status: 201 });
}
