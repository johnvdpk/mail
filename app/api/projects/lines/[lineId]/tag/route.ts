import { requireAuth } from "@/lib/auth/auth";
import { applyTargetToLine, parseRuleTarget } from "@/lib/projects/counterparty-rules";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Applies a category/project target to exactly one line, touching only that column —
 * unlike PATCH /api/projects/[id]/lines/[lineId] this doesn't require the full LineInput,
 * so it's safe to call from a ledger row that only has the LedgerRow projection.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lineId: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { lineId: lineIdRaw } = await params;
  const lineId = Number(lineIdRaw);
  if (!Number.isInteger(lineId)) {
    return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const target = parseRuleTarget(body);
    if (typeof target === "string") {
      return NextResponse.json({ error: target }, { status: 400 });
    }
    const projectId = await applyTargetToLine(lineId, target);
    if (projectId == null) return NextResponse.json({ error: "Regel niet gevonden" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regel taggen mislukt";
    logger.error({ route: "projects/lines/[lineId]/tag", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
