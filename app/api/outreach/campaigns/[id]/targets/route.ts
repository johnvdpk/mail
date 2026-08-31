import { requireAuth } from "@/lib/auth/auth";
import { getCampaign } from "@/lib/outreach/campaigns";
import {
  getTarget,
  getTargetStats,
  importTargets,
  isTargetStatus,
  listTargets,
  updateTargetStatus,
} from "@/lib/outreach/targets";
import { isValidEmail } from "@/lib/shared/email-validation";
import { logger } from "@/lib/shared/logger";
import { TARGET_PAGE_SIZE, type TargetImportRow } from "@/lib/outreach/types";
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
    const pageNum = Math.max(1, Number(search.get("page")) || 1);
    const limit = Math.min(200, Math.max(1, Number(search.get("limit")) || TARGET_PAGE_SIZE));
    const offset = (pageNum - 1) * limit;
    const sortField = search.get("sort") || undefined;
    const sortDir = search.get("dir") === "desc" ? "desc" : "asc";
    const listColumnKeys = new Set(campaign.profile.listColumns.map((c) => c.key));

    const [page, stats] = await Promise.all([
      listTargets(campaignId, { status, q, limit, offset, sortField, sortDir, listColumnKeys }),
      getTargetStats(campaignId),
    ]);
    return NextResponse.json({
      targets: page.targets,
      total: page.total,
      stats,
      page: pageNum,
      pageSize: limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Leads ophalen mislukt";
    logger.error({ route: "outreach/campaigns/[id]/targets", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
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

    const body = (await request.json()) as { rows?: TargetImportRow[] };
    if (!Array.isArray(body.rows)) {
      return NextResponse.json({ error: "rows moet een array zijn" }, { status: 400 });
    }

    const rows = body.rows.map((row) => ({
      email: String(row.email ?? ""),
      name: String(row.name ?? ""),
      website: row.website ? String(row.website) : undefined,
      attributes:
        row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes)
          ? row.attributes
          : {},
    }));

    const extraSkips: string[] = [];
    for (const [i, row] of rows.entries()) {
      if (row.email && !isValidEmail(row.email)) {
        extraSkips.push(`Rij ${i + 1}: ongeldig e-mailadres (${row.email})`);
      }
    }

    const result = await importTargets(campaignId, rows);
    return NextResponse.json({
      ...result,
      skipReasons: [...extraSkips.filter((r) => !result.skipReasons.includes(r)), ...result.skipReasons],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import mislukt";
    logger.error({ route: "outreach/campaigns/[id]/targets", method: "POST", err }, message);
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
    const body = (await request.json()) as { targetId?: number; status?: string };
    const targetId = Number(body.targetId);
    if (!Number.isInteger(targetId) || !body.status || !isTargetStatus(body.status)) {
      return NextResponse.json({ error: "targetId en geldige status verplicht" }, { status: 400 });
    }

    const target = await getTarget(targetId);
    if (!target || target.campaignId !== campaignId) {
      return NextResponse.json({ error: "Lead niet gevonden" }, { status: 404 });
    }

    const updated = await updateTargetStatus(targetId, body.status);
    const stats = await getTargetStats(campaignId);
    return NextResponse.json({ target: updated, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status bijwerken mislukt";
    logger.error({ route: "outreach/campaigns/[id]/targets", method: "PATCH", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
