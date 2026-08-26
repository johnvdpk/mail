import { requireAuth } from "@/lib/auth/auth";
import { getCampaign } from "@/lib/outreach/campaigns";
import { DuplicateSendError, sendOutreachMail } from "@/lib/outreach/send";
import { getTarget } from "@/lib/outreach/targets";
import { isSmtpConfigured } from "@/lib/mail/mail";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseId(id: string): number | null {
  const value = Number(id);
  return Number.isInteger(value) ? value : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; targetId: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isSmtpConfigured()) {
    return NextResponse.json({ error: "SMTP is niet geconfigureerd" }, { status: 503 });
  }

  const { id, targetId: targetIdRaw } = await params;
  const campaignId = parseId(id);
  const targetId = parseId(targetIdRaw);
  if (campaignId === null || targetId === null) {
    return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  }

  try {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne niet gevonden" }, { status: 404 });

    const target = await getTarget(targetId);
    if (!target || target.campaignId !== campaignId) {
      return NextResponse.json({ error: "Lead niet gevonden" }, { status: 404 });
    }

    const body = (await request.json()) as {
      subject?: string;
      text?: string;
      html?: string;
      isTest?: boolean;
    };
    const subject = body.subject?.trim();
    const text = body.text?.trim();
    if (!subject || !text) {
      return NextResponse.json({ error: "subject en text verplicht" }, { status: 400 });
    }

    const send = await sendOutreachMail(
      targetId,
      { subject, text, html: body.html },
      { isTest: Boolean(body.isTest), testEmail: campaign.profile.testEmail }
    );
    return NextResponse.json({ send });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Versturen mislukt";
    logger.error(
      { route: "outreach/campaigns/[id]/targets/[targetId]/send", method: "POST", err },
      message
    );
    if (err instanceof DuplicateSendError) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    const status = message.includes("testadres") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
