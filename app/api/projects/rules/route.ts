import { requireAuth } from "@/lib/auth/auth";
import { listRules, parseRuleTarget, upsertRule } from "@/lib/projects/counterparty-rules";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const rules = await listRules();
    return NextResponse.json({ rules });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regels ophalen mislukt";
    logger.error({ route: "projects/rules", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    const rule = await upsertRule(pattern, target);
    return NextResponse.json({ rule });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regel opslaan mislukt";
    logger.error({ route: "projects/rules", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
