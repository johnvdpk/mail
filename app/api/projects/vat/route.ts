import { requireAuth } from "@/lib/auth/auth";
import { quarterlyVat } from "@/lib/projects/insights";
import { loadAllProjectsWithLines } from "@/lib/projects/projects";
import { yearFromSearchParams } from "@/lib/projects/period";
import { listVatFilings, withFilings } from "@/lib/projects/vat-filings";
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
    const filings = await listVatFilings(year);
    const quarters = withFilings(year, quarterlyVat(projects, year), filings);
    return NextResponse.json({ year, quarters });
  } catch (err) {
    const message = err instanceof Error ? err.message : "BTW-overzicht ophalen mislukt";
    logger.error({ route: "projects/vat", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
