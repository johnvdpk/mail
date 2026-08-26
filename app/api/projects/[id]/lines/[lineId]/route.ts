import { requireAuth } from "@/lib/auth/auth";
import { deleteLine, parseLineInput, updateLine } from "@/lib/projects/projects";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseIds(id: string, lineId: string): { projectId: number; lineId: number } | null {
  const projectId = Number(id);
  const parsedLineId = Number(lineId);
  if (!Number.isInteger(projectId) || !Number.isInteger(parsedLineId)) return null;
  return { projectId, lineId: parsedLineId };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, lineId } = await params;
  const ids = parseIds(id, lineId);
  if (!ids) {
    return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = parseLineInput(body);
    if (typeof input === "string") {
      return NextResponse.json({ error: input }, { status: 400 });
    }
    const line = await updateLine(ids.projectId, ids.lineId, input);
    if (!line) return NextResponse.json({ error: "Regel niet gevonden" }, { status: 404 });
    return NextResponse.json({ line });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regel bijwerken mislukt";
    logger.error({ route: "projects/[id]/lines/[lineId]", method: "PATCH", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, lineId } = await params;
  const ids = parseIds(id, lineId);
  if (!ids) {
    return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  }

  try {
    const deleted = await deleteLine(ids.projectId, ids.lineId);
    if (!deleted) return NextResponse.json({ error: "Regel niet gevonden" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regel verwijderen mislukt";
    logger.error({ route: "projects/[id]/lines/[lineId]", method: "DELETE", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
