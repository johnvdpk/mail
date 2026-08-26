import { requireAuth } from "@/lib/auth/auth";
import { deleteLines } from "@/lib/projects/projects";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as { items?: unknown };
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "Geen regels geselecteerd" }, { status: 400 });
    }
    if (body.items.length > 500) {
      return NextResponse.json({ error: "Maximaal 500 regels per keer" }, { status: 400 });
    }

    const items: Array<{ projectId: number; lineId: number }> = [];
    for (const raw of body.items) {
      if (!raw || typeof raw !== "object") continue;
      const record = raw as Record<string, unknown>;
      const projectId = Number(record.projectId);
      const lineId = Number(record.lineId);
      if (!Number.isInteger(projectId) || !Number.isInteger(lineId)) continue;
      items.push({ projectId, lineId });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "Geen geldige regels" }, { status: 400 });
    }

    const deleted = await deleteLines(items);
    return NextResponse.json({ deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk verwijderen mislukt";
    logger.error({ route: "projects/lines/bulk-delete", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
