import { requireAuth } from "@/lib/auth/auth";
import { todayIso } from "@/lib/projects/period";
import { toggleVatFiling } from "@/lib/projects/vat-filings";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ year: string; quarter: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { year: yearRaw, quarter: quarterRaw } = await params;
  const year = Number(yearRaw);
  const quarter = Number(quarterRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Jaar ongeldig" }, { status: 400 });
  }
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    return NextResponse.json({ error: "Kwartaal ongeldig" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { filed?: unknown };
    if (typeof body.filed !== "boolean") {
      return NextResponse.json({ error: "filed ongeldig" }, { status: 400 });
    }
    const filedOn = await toggleVatFiling(year, quarter, body.filed, todayIso());
    return NextResponse.json({ year, quarter, filedOn });
  } catch (err) {
    const message = err instanceof Error ? err.message : "BTW-aangifte bijwerken mislukt";
    logger.error({ route: "projects/vat/[year]/[quarter]", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
