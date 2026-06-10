import { NextResponse } from "next/server";
import { addRun } from "../../../../../lib/challenges";

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const result = await addRun(id, body);
  if (result.error === "missing") {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }
  if (result.error === "expired") {
    return NextResponse.json({ error: "Challenge expired", challenge: result.challenge }, { status: 410 });
  }
  return NextResponse.json(result.challenge, { status: 201 });
}
