import { requireAuth } from "@/lib/auth/auth";
import { getCampaign } from "@/lib/outreach/campaigns";
import { isTargetStatus, listAllMatchingTargets } from "@/lib/outreach/targets";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseId(id: string): number | null {
  const value = Number(id);
  return Number.isInteger(value) ? value : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const campaignId = parseId((await params).id);
  if (campaignId === null) {
    return NextResponse.json({ error: "Ongeldig campagne-id" }, { status: 400 });
  }

  try {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne niet gevonden" }, { status: 404 });

    const search = new URL(request.url).searchParams;
    const statusParam = search.get("status") ?? "";
    const q = search.get("q") ?? undefined;
    const status = isTargetStatus(statusParam) ? statusParam : undefined;

    const result = await listAllMatchingTargets(campaignId, { status, q });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Leads selecteren mislukt";
    logger.error({ route: "outreach/campaigns/[id]/targets/select-all", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
