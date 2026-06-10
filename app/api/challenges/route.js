import { NextResponse } from "next/server";
import { createChallenge } from "../../../lib/challenges";

export async function POST(request) {
  const body = await request.json();
  try {
    const challenge = await createChallenge(body);
    return NextResponse.json(challenge, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: `Storage error: ${error.message}` }, { status: 500 });
  }
}
