import { requireAuth } from "@/lib/auth/auth";
import { deleteCampaign, getCampaign, updateCampaignProfile } from "@/lib/outreach/campaigns";
import type { CampaignProfile } from "@/lib/outreach/campaign-profile";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseId(id: string): number | null {
  const value = Number(id);
  return Number.isInteger(value) ? value : null;
}

export async function GET(
  _request: Request,
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
    return NextResponse.json({ campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Campagne ophalen mislukt";
    logger.error({ route: "outreach/campaigns/[id]", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
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
    const body = (await request.json()) as { profile?: Partial<CampaignProfile> };
    if (!body.profile || typeof body.profile !== "object") {
      return NextResponse.json({ error: "profile is verplicht" }, { status: 400 });
    }
    const campaign = await updateCampaignProfile(campaignId, body.profile);
    return NextResponse.json({ campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Profiel opslaan mislukt";
    logger.error({ route: "outreach/campaigns/[id]", method: "PATCH", err }, message);
    const status = message.includes("niet gevonden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const campaignId = parseId((await params).id);
  if (campaignId === null) {
    return NextResponse.json({ error: "Ongeldig campagne-id" }, { status: 400 });
  }

  try {
    const existing = await getCampaign(campaignId);
    if (!existing) return NextResponse.json({ error: "Campagne niet gevonden" }, { status: 404 });
    const ok = await deleteCampaign(campaignId);
    if (!ok) return NextResponse.json({ error: "Campagne niet gevonden" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Campagne verwijderen mislukt";
    logger.error({ route: "outreach/campaigns/[id]", method: "DELETE", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
