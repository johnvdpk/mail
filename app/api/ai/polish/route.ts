import { requireAuth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";
import { streamPolishDraft } from "@/lib/ai/ai-mail";
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

    const body = (await request.json()) as { threadId?: string; text?: string };
    const text = body.text?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ error: "Tekst verplicht" }, { status: 400 });
    }

    const detail = body.threadId ? await getThreadDetail(body.threadId) : null;
    const context = detail ? toThreadContext(detail) : null;

    return streamResponse(
      ndjsonStream(async (emit) => {
        let lastBody = "";

        for await (const update of streamPolishDraft(context, text)) {
          if (update.body !== lastBody) {
            lastBody = update.body;
            emit({ type: "chunk", body: update.body });
          }

          if (update.final) {
            emit({
              type: "done",
              body: update.final.body,
              notes: update.final.notes || undefined,
            });
          }
        }
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Correctie mislukt";
    logger.error({ route: "ai/polish", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
