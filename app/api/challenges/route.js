import { NextResponse } from "next/server";
import { createChallenge } from "../../../lib/challenges";

export async function POST(request) {
  const body = await request.json();
  const challenge = await createChallenge(body);
  return NextResponse.json(challenge, { status: 201 });
}
