import { NextResponse } from "next/server";
import { CURRENT_VERSION } from "../../../lib/changelog";

// Reports the live deployment's identity. The client compares this against the
// build id baked into its own bundle; a mismatch means the tab is running
// pre-deploy code and should refresh before it loses a run to a changed
// payload format. Never cached, so it always reflects the latest deploy.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: CURRENT_VERSION, buildId: process.env.NEXT_PUBLIC_BUILD_ID || "dev" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
