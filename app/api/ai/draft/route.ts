import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { draftReply } from "@/lib/ai-mail";
import { getThreadDetail, toThreadContext } from "@/lib/mailbox-service";
import { isOpenRouterConfigured } from "@/lib/openrouter";

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

    const body = (await request.json()) as { threadId?: string; intent?: string };
    const threadId = body.threadId?.trim();
    const intent = body.intent?.trim();

    if (!threadId) {
      return NextResponse.json({ error: "threadId verplicht" }, { status: 400 });
    }
    if (!intent) {
      return NextResponse.json({ error: "intent verplicht" }, { status: 400 });
    }

    const detail = await getThreadDetail(threadId);
    if (!detail) {
      return NextResponse.json({ error: "Conversatie niet gevonden" }, { status: 404 });
    }

    const draft = await draftReply(toThreadContext(detail), intent);
    return NextResponse.json({ ok: true, ...draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI-draft mislukt";
    console.error("[ai/draft]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
