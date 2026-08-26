import { requireAuth } from "@/lib/auth/auth";
import { applyRuleToExistingLines, parseRuleTarget } from "@/lib/projects/counterparty-rules";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const pattern = typeof body.pattern === "string" ? body.pattern.trim() : "";
    if (!pattern) {
      return NextResponse.json({ error: "pattern verplicht" }, { status: 400 });
    }
    const target = parseRuleTarget(body);
    if (typeof target === "string") {
      return NextResponse.json({ error: target }, { status: 400 });
    }
    const updated = await applyRuleToExistingLines(pattern, target);
    return NextResponse.json({ updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regel toepassen mislukt";
    logger.error({ route: "projects/rules/apply", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
