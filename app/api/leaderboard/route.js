import { NextResponse } from "next/server";
import { getGlobalLeaderboard, resolveTrackId } from "../../../lib/challenges";

export async function GET(request) {
  const track = new URL(request.url).searchParams.get("track");
  const board = await getGlobalLeaderboard(resolveTrackId(track));
  return NextResponse.json(board);
}
