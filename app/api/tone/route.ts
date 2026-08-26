import { requireAuth } from "@/lib/auth/auth";
import {
  analyzeWritingStyle,
  getWritingProfile,
  refreshIfDue,
  setSuggestionStatus,
} from "@/lib/ai/learn-tone";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET current writing profile (+ optional continuous refresh check). */
export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const url = new URL(request.url);
  const autoRefresh = url.searchParams.get("refresh") === "1";

  try {
    if (autoRefresh) {
      const result = await refreshIfDue();
      return NextResponse.json(result);
    }

    const profile = await getWritingProfile();
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Profiel laden mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST run full analysis (or accept/reject/tweak suggestion). */
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "analyze" | "accept" | "reject" | "tweak";
      rules?: string;
      limit?: number;
    };

    const action = body.action ?? "analyze";

    if (action === "analyze") {
      const profile = await analyzeWritingStyle({
        limit: typeof body.limit === "number" ? body.limit : 80,
      });
      return NextResponse.json({ profile });
    }

    if (action === "accept") {
      const profile = await setSuggestionStatus("accepted");
      return NextResponse.json({ profile, acceptedRules: profile.pendingSuggestion });
    }

    if (action === "reject") {
      const profile = await setSuggestionStatus("rejected");
      return NextResponse.json({ profile });
    }

    if (action === "tweak") {
      if (typeof body.rules !== "string" || !body.rules.trim()) {
        return NextResponse.json({ error: "rules verplicht bij tweak" }, { status: 400 });
      }
      const profile = await setSuggestionStatus("pending", body.rules.trim());
      return NextResponse.json({ profile });
    }

    return NextResponse.json({ error: "Onbekende action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tone-analyse mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
