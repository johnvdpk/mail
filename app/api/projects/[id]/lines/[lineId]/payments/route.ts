import { requireAuth } from "@/lib/auth/auth";
import { parseMonthKey, setLinePaidMonths } from "@/lib/projects/projects";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, lineId } = await params;
  const projectId = Number(id);
  const parsedLineId = Number(lineId);
  if (!Number.isInteger(projectId) || !Number.isInteger(parsedLineId)) {
    return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const month = parseMonthKey(body.month);
    const monthsRaw = Array.isArray(body.months) ? body.months : month ? [month] : [];
    const months = monthsRaw
      .map((value) => parseMonthKey(value))
      .filter((value): value is string => value !== null);
    if (months.length === 0) return NextResponse.json({ error: "Maand ongeldig" }, { status: 400 });
    if (typeof body.paid !== "boolean") return NextResponse.json({ error: "paid ongeldig" }, { status: 400 });

    const result = await setLinePaidMonths(projectId, parsedLineId, months, body.paid);
    if (result === "missing") return NextResponse.json({ error: "Regel niet gevonden" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Betaalstatus bijwerken mislukt";
    logger.error({ route: "projects/[id]/lines/[lineId]/payments", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
