import { requireAuth } from "@/lib/auth/auth";
import { getAutomailStatus, upsertAutomailRule, type AutomailRuleInput } from "@/lib/outreach/automail";
import { getCampaign } from "@/lib/outreach/campaigns";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseId(id: string): number | null {
  const value = Number(id);
  return Number.isInteger(value) ? value : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;

  const campaignId = parseId((await params).id);
  if (campaignId === null) {
    return NextResponse.json({ error: "Ongeldig campagne-id" }, { status: 400 });
  }

  try {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne niet gevonden" }, { status: 404 });

    const status = await getAutomailStatus(campaignId);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Automail-status ophalen mislukt";
    logger.error({ route: "outreach/campaigns/[id]/automail", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;

  const campaignId = parseId((await params).id);
  if (campaignId === null) {
    return NextResponse.json({ error: "Ongeldig campagne-id" }, { status: 400 });
  }

  try {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne niet gevonden" }, { status: 404 });

    const body = (await request.json()) as AutomailRuleInput;
    const rule = await upsertAutomailRule(campaignId, body);
    return NextResponse.json({ rule });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Automail-regel opslaan mislukt";
    logger.error({ route: "outreach/campaigns/[id]/automail", method: "PUT", err }, message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
