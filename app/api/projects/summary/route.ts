import { requireAuth } from "@/lib/auth/auth";
import { overdueCount, openLinesAcrossProjects } from "@/lib/projects/insights";
import { loadAllProjectsWithLines } from "@/lib/projects/projects";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const projects = await loadAllProjectsWithLines();
    const items = openLinesAcrossProjects(projects);
    return NextResponse.json({ overdueCount: overdueCount(items) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Samenvatting ophalen mislukt";
    logger.error({ route: "projects/summary", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
