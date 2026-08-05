import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isOpenRouterConfigured, transcribeAudio } from "@/lib/openrouter";

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

    const body = (await request.json()) as { audio?: string; format?: string };
    const audio = body.audio?.trim() ?? "";
    const format = body.format?.trim() || "webm";
    if (!audio) {
      return NextResponse.json({ error: "Audio verplicht" }, { status: 400 });
    }

    const text = await transcribeAudio(audio, format);
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcriptie mislukt";
    console.error("[ai/transcribe]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
