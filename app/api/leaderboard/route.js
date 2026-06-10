import { NextResponse } from "next/server";
import { getGlobalLeaderboard } from "../../../lib/challenges";

export async function GET() {
  const board = await getGlobalLeaderboard();
  return NextResponse.json(board);
}
