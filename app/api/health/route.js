import { NextResponse } from "next/server";
import { storageHealth } from "../../../lib/challenges";

export const dynamic = "force-dynamic";

// Public response is a bare liveness check. Full storage diagnostics (backend
// type, read/write errors) require FEEDBACK_ADMIN_KEY via ?key= so the details
// aren't free reconnaissance. With no admin key configured (local dev) the
// full report stays open.
export async function GET(request) {
  const adminKey = process.env.FEEDBACK_ADMIN_KEY;
  if (adminKey && new URL(request.url).searchParams.get("key") !== adminKey) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(await storageHealth());
}
