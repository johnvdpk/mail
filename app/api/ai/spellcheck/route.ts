import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { checkSpelling } from "@/lib/ai-mail";
import { isOpenRouterConfigured } from "@/lib/openrouter";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

    const body = (await request.json()) as { text?: string };
    const text = body.text?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ error: "Tekst verplicht" }, { status: 400 });
    }

    const result = await checkSpelling(text);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Spellingcontrole mislukt";
    console.error("[ai/spellcheck]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
