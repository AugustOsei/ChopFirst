import { NextResponse } from "next/server";
import { getMetrics } from "../../../lib/challenges";

// Owner-only funnel report: /api/metrics?key=<FEEDBACK_ADMIN_KEY>
export async function GET(request) {
  const key = new URL(request.url).searchParams.get("key");
  const adminKey = process.env.FEEDBACK_ADMIN_KEY;
  if (!adminKey || key !== adminKey) {
    return NextResponse.json(
      { error: "Set FEEDBACK_ADMIN_KEY and pass it as ?key= to read metrics." },
      { status: 401 },
    );
  }
  try {
    return NextResponse.json({ days: await getMetrics(14) });
  } catch (error) {
    return NextResponse.json({ error: `Storage error: ${error.message}` }, { status: 500 });
  }
}
