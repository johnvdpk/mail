import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { suggestInboxSort } from "@/lib/ai-sort";
import { isImapConfigured } from "@/lib/imap";
import { isOpenRouterConfigured } from "@/lib/openrouter";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isImapConfigured()) {
    return NextResponse.json({ error: "IMAP niet geconfigureerd" }, { status: 503 });
  }
  if (!isOpenRouterConfigured()) {
    return NextResponse.json({ error: "OPENROUTER_AI niet geconfigureerd" }, { status: 503 });
  }

  try {
    const suggestions = await suggestInboxSort();
    return NextResponse.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sorteren mislukt";
    console.error("[sort/preview]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
