import { NextResponse } from "next/server";
import { storageHealth } from "../../../lib/challenges";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await storageHealth());
}
