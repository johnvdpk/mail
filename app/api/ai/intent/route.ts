import { requireAuth } from "@/lib/auth";
import { detectBestIntent } from "@/lib/detect-intent";
import { getThreadDetail, toThreadContext } from "@/lib/mailbox-service";
import { isOpenRouterConfigured } from "@/lib/openrouter";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isOpenRouterConfigured()) {
    return NextResponse.json({ error: "AI niet geconfigureerd" }, { status: 503 });
  }

  const threadId = new URL(request.url).searchParams.get("threadId");
  if (!threadId) {
    return NextResponse.json({ error: "threadId verplicht" }, { status: 400 });
  }

  try {
    const detail = await getThreadDetail(threadId);
    if (!detail) {
      return NextResponse.json({ error: "Thread niet gevonden" }, { status: 404 });
    }

    const suggestion = await detectBestIntent(toThreadContext(detail));
    return NextResponse.json(suggestion);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Intent-detectie mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
