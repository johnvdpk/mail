import { requireAuth } from "@/lib/auth/auth";
import { getCampaign } from "@/lib/outreach/campaigns";
import { getSend, listCampaignSends, updateSendResponseStatus } from "@/lib/outreach/send";
import { getTarget } from "@/lib/outreach/targets";
import type { ResponseStatus } from "@/lib/outreach/types";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STATUSES: ResponseStatus[] = ["pending", "replied", "no_interest", "deal"];

function parseId(id: string): number | null {
  const value = Number(id);
  return Number.isInteger(value) ? value : null;
}

function isResponseStatus(value: string): value is ResponseStatus {
  return STATUSES.includes(value as ResponseStatus);
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
    const sends = await listCampaignSends(campaignId);
    return NextResponse.json({ sends });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verzonden mails ophalen mislukt";
    logger.error({ route: "outreach/campaigns/[id]/sends", method: "GET", err }, message);
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
    const body = (await request.json()) as { sendId?: number; responseStatus?: string };
    const sendId = Number(body.sendId);
    if (!Number.isInteger(sendId) || !body.responseStatus || !isResponseStatus(body.responseStatus)) {
      return NextResponse.json({ error: "sendId en geldige responseStatus verplicht" }, { status: 400 });
    }

    const send = await getSend(sendId);
    if (!send) return NextResponse.json({ error: "Verzonden mail niet gevonden" }, { status: 404 });

    const target = await getTarget(send.targetId);
    if (!target || target.campaignId !== campaignId) {
      return NextResponse.json({ error: "Verzonden mail niet gevonden" }, { status: 404 });
    }

    const updated = await updateSendResponseStatus(sendId, body.responseStatus);
    return NextResponse.json({ send: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status bijwerken mislukt";
    logger.error({ route: "outreach/campaigns/[id]/sends", method: "PATCH", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
