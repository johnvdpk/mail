import { requireAuth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";
import { suggestTips } from "@/lib/ai/ai-mail";
import { getThreadDetail, toThreadContext } from "@/lib/mail/mailbox-service";
import { isOpenRouterConfigured } from "@/lib/ai/openrouter";
import { logger } from "@/lib/shared/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    if (!isOpenRouterConfigured()) {
      return NextResponse.json(
        { error: "OPENROUTER_AI niet geconfigureerd in .env.local" },
        { status: 503 }
      );
    }

    const body = (await request.json()) as { threadId?: string };
    const threadId = body.threadId?.trim();
    if (!threadId) {
      return NextResponse.json({ error: "threadId verplicht" }, { status: 400 });
    }

    const detail = await getThreadDetail(threadId);
    if (!detail) {
      return NextResponse.json({ error: "Conversatie niet gevonden" }, { status: 404 });
    }

    const result = await suggestTips(toThreadContext(detail));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tips mislukt";
    logger.error({ route: "ai/tips", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
