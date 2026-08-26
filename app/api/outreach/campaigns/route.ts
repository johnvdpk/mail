import { requireAuth } from "@/lib/auth/auth";
import { createCampaign, listCampaigns } from "@/lib/outreach/campaigns";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const campaigns = await listCampaigns();
    return NextResponse.json({ campaigns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Campagnes ophalen mislukt";
    logger.error({ route: "outreach/campaigns", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as { name?: string; slug?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Naam is verplicht" }, { status: 400 });
    }
    const campaign = await createCampaign({ name, slug: body.slug });
    return NextResponse.json({ campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Campagne aanmaken mislukt";
    logger.error({ route: "outreach/campaigns", method: "POST", err }, message);
    const status = message.includes("slug") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
