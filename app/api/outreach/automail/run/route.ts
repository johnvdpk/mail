import { requireAuth } from "@/lib/auth/auth";
import { runAutomail } from "@/lib/outreach/automail";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Handmatige trigger (bv. voor testen); de normale run gebeurt via de interne timer in instrumentation.ts. */
export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const result = await runAutomail();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Automail-run mislukt";
    logger.error({ route: "outreach/automail/run", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
