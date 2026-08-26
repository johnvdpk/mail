import { requireAuth } from "@/lib/auth/auth";
import type { ReplyIntent } from "@/lib/outreach/campaign-profile";
import { getCampaign } from "@/lib/outreach/campaigns";
import { personalizeReplyDraft } from "@/lib/outreach/personalize";
import { collectThreadText } from "@/lib/outreach/reply-tracking";
import { getSend } from "@/lib/outreach/send";
import { getTarget } from "@/lib/outreach/targets";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INTENTS: ReplyIntent[] = ["afronden", "opvolging"];

function parseId(id: string): number | null {
  const value = Number(id);
  return Number.isInteger(value) ? value : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sendId: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, sendId: sendIdRaw } = await params;
  const campaignId = parseId(id);
  const sendId = parseId(sendIdRaw);
  if (campaignId === null || sendId === null) {
    return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { intent?: string };
    const intent = body.intent;
    if (!intent || !INTENTS.includes(intent as ReplyIntent)) {
      return NextResponse.json({ error: "intent moet afronden of opvolging zijn" }, { status: 400 });
    }

    const campaign = await getCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne niet gevonden" }, { status: 404 });

    const send = await getSend(sendId);
    if (!send) return NextResponse.json({ error: "Verzonden mail niet gevonden" }, { status: 404 });

    const target = await getTarget(send.targetId);
    if (!target || target.campaignId !== campaignId) {
      return NextResponse.json({ error: "Verzonden mail niet gevonden" }, { status: 404 });
    }

    const threadText = await collectThreadText(target.email, send.sentAt);
    const draft = await personalizeReplyDraft({
      campaign,
      send,
      target,
      intent: intent as ReplyIntent,
      threadText,
    });
    return NextResponse.json(draft);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reply-concept genereren mislukt";
    logger.error(
      { route: "outreach/campaigns/[id]/sends/[sendId]/reply-draft", method: "POST", err },
      message
    );
    const status = message.includes("OPENROUTER") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
