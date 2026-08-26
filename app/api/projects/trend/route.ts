import { requireAuth } from "@/lib/auth/auth";
import { monthlyTotals } from "@/lib/projects/insights";
import { loadAllProjectsWithLines } from "@/lib/projects/projects";
import { yearFromSearchParams } from "@/lib/projects/period";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const year = yearFromSearchParams(url.searchParams);
    const projects = await loadAllProjectsWithLines();
    return NextResponse.json({
      year,
      months: monthlyTotals(projects, year),
      previous: monthlyTotals(projects, year - 1),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trend ophalen mislukt";
    logger.error({ route: "projects/trend", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
