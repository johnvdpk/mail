import { requireAuth } from "@/lib/auth/auth";
import { deleteRule } from "@/lib/projects/counterparty-rules";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const ruleId = Number(id);
  if (!Number.isInteger(ruleId)) {
    return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  }

  try {
    const deleted = await deleteRule(ruleId);
    if (!deleted) return NextResponse.json({ error: "Regel niet gevonden" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regel verwijderen mislukt";
    logger.error({ route: "projects/rules/[id]", method: "DELETE", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
