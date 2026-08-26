import { requireAuth } from "@/lib/auth/auth";
import { getCampaign } from "@/lib/outreach/campaigns";
import { personalizeOutreachEmail } from "@/lib/outreach/personalize";
import { getTarget } from "@/lib/outreach/targets";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseId(id: string): number | null {
  const value = Number(id);
  return Number.isInteger(value) ? value : null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; targetId: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

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

    const result = await personalizeOutreachEmail(target, campaign);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Personalisatie mislukt";
    logger.error(
      { route: "outreach/campaigns/[id]/targets/[targetId]/personalize", method: "POST", err },
      message
    );
    const status = message.includes("OPENROUTER") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
