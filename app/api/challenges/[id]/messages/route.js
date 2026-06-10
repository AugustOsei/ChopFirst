import { NextResponse } from "next/server";
import { addMessage } from "../../../../../lib/challenges";

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const result = await addMessage(id, body);
  if (result.error === "missing") {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }
  if (result.error === "empty") {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  return NextResponse.json(result.challenge, { status: 201 });
}
