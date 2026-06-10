import { NextResponse } from "next/server";
import { getChallenge } from "../../../../lib/challenges";

export async function GET(_request, { params }) {
  const { id } = await params;
  const challenge = await getChallenge(id);
  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }
  return NextResponse.json(challenge);
}
