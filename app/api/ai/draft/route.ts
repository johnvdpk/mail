import { requireAuth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";
import { streamDraftReply } from "@/lib/ai/ai-mail";
import { ndjsonStream, streamResponse } from "@/lib/ai/ai-stream";
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

    const body = (await request.json()) as {
      threadId?: string;
      intent?: string;
      draft?: string;
    };
    const threadId = body.threadId?.trim();
    const intent = body.intent?.trim();
    const draft = body.draft?.trim();

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

    const context = toThreadContext(detail);

    return streamResponse(
      ndjsonStream(async (emit) => {
        let lastBody = "";

        for await (const update of streamDraftReply(context, intent, draft)) {
          if (update.body !== lastBody) {
            lastBody = update.body;
            emit({ type: "chunk", body: update.body });
          }

          if (update.final) {
            emit({
              type: "done",
              body: update.final.body,
              intent: update.final.intent,
            });
          }
        }
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI-draft mislukt";
    logger.error({ route: "ai/draft", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
