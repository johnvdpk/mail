import crypto from "node:crypto";
import { runAutomail } from "@/lib/outreach/automail";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** No user session here — this is hit by scripts/run-automail.sh via host cron. */
function isAuthorized(request: Request): boolean {
  const expected = process.env.AUTOMAIL_CRON_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-automail-secret") ?? "";
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!process.env.AUTOMAIL_CRON_SECRET) {
    return NextResponse.json({ error: "AUTOMAIL_CRON_SECRET niet geconfigureerd" }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAutomail();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Automail-run mislukt";
    logger.error({ route: "outreach/automail/run", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
