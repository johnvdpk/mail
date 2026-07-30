import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { polishDraft } from "@/lib/ai-mail";
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

    const body = (await request.json()) as { threadId?: string; text?: string };
    const text = body.text?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ error: "Tekst verplicht" }, { status: 400 });
    }

    const detail = body.threadId ? await getThreadDetail(body.threadId) : null;
    const result = await polishDraft(detail ? toThreadContext(detail) : null, text);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Correctie mislukt";
    console.error("[ai/polish]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
