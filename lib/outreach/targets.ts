import { isValidEmail } from "../shared/email-validation";
import { normalizeEmail } from "../shared/normalize";
import { query, queryOne, transaction } from "../shared/db";
import type {
  CampaignTarget,
  ImportResult,
  TargetImportRow,
  TargetStats,
  TargetStatus,
} from "./types";

export { normalizeEmail };

const TARGET_STATUSES: TargetStatus[] = ["new", "emailed", "excluded", "not_interested"];

type TargetRow = {
  id: number;
  campaign_id: number;
  email: string;
  email_normalized: string;
  name: string;
  website: string | null;
  status: TargetStatus;
  attributes: Record<string, unknown> | null;
  imported_at: Date;
  emailed_at: Date | null;
  excluded_at: Date | null;
  not_interested_at: Date | null;
};

function toTarget(row: TargetRow): CampaignTarget {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    email: row.email,
    emailNormalized: row.email_normalized,
    name: row.name,
    website: row.website,
    status: row.status,
    attributes: row.attributes ?? {},
    importedAt: row.imported_at.toISOString(),
    emailedAt: row.emailed_at?.toISOString() ?? null,
    excludedAt: row.excluded_at?.toISOString() ?? null,
    notInterestedAt: row.not_interested_at?.toISOString() ?? null,
  };
}

export function isTargetStatus(value: string): value is TargetStatus {
  return TARGET_STATUSES.includes(value as TargetStatus);
}

export type TargetFilters = {
  status?: TargetStatus;
  q?: string;
  limit?: number;
  offset?: number;
};

function targetWhere(
  campaignId: number,
  filters: TargetFilters
): { clauses: string[]; params: unknown[] } {
  const clauses = ["campaign_id = $1"];
  const params: unknown[] = [campaignId];

  if (filters.status) {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }
  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    clauses.push(
      `(name ILIKE $${params.length} OR email ILIKE $${params.length} OR COALESCE(website, '') ILIKE $${params.length})`
    );
  }
  return { clauses, params };
}

export async function listTargets(
  campaignId: number,
  filters: TargetFilters = {}
): Promise<{ targets: CampaignTarget[]; total: number }> {
  const { clauses, params } = targetWhere(campaignId, filters);
  const where = clauses.join(" AND ");

  const count = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM campaign_targets WHERE ${where}`,
    params
  );
  const total = Number(count?.total ?? 0);

  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : undefined;
  const offset = filters.offset && filters.offset > 0 ? filters.offset : 0;
  const pageParams = [...params];
  let limitSql = "";
  if (limit) {
    pageParams.push(limit);
    limitSql += ` LIMIT $${pageParams.length}`;
    pageParams.push(offset);
    limitSql += ` OFFSET $${pageParams.length}`;
  }

  const result = await query<TargetRow>(
    `SELECT * FROM campaign_targets
     WHERE ${where}
     ORDER BY name ASC, id ASC${limitSql}`,
    pageParams
  );
  return { targets: result.rows.map(toTarget), total };
}

export async function getTarget(id: number): Promise<CampaignTarget | null> {
  const row = await queryOne<TargetRow>("SELECT * FROM campaign_targets WHERE id = $1", [id]);
  return row ? toTarget(row) : null;
}

export async function getTargetStats(campaignId: number): Promise<TargetStats> {
  const row = await queryOne<{
    total: string;
    unique_emails: string;
    with_email: string;
    emailed: string;
    excluded: string;
    not_interested: string;
  }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(DISTINCT email_normalized) FILTER (WHERE email_normalized <> '')::text AS unique_emails,
       COUNT(*) FILTER (WHERE email_normalized <> '')::text AS with_email,
       COUNT(*) FILTER (WHERE status = 'emailed')::text AS emailed,
       COUNT(*) FILTER (WHERE status = 'excluded')::text AS excluded,
       COUNT(*) FILTER (WHERE status = 'not_interested')::text AS not_interested
     FROM campaign_targets
     WHERE campaign_id = $1`,
    [campaignId]
  );

  return {
    total: Number(row?.total ?? 0),
    uniqueEmails: Number(row?.unique_emails ?? 0),
    withEmail: Number(row?.with_email ?? 0),
    emailed: Number(row?.emailed ?? 0),
    excluded: Number(row?.excluded ?? 0),
    notInterested: Number(row?.not_interested ?? 0),
  };
}

export async function importTargets(
  campaignId: number,
  rows: TargetImportRow[]
): Promise<ImportResult> {
  const skipReasons: string[] = [];
  const unique = new Map<string, TargetImportRow>();

  for (const [index, row] of rows.entries()) {
    const email = row.email?.trim() ?? "";
    const name = row.name?.trim() ?? "";
    if (!email || !isValidEmail(email)) {
      skipReasons.push(`Rij ${index + 1}: geen geldig e-mailadres`);
      continue;
    }
    if (!name) {
      skipReasons.push(`Rij ${index + 1}: naam ontbreekt`);
      continue;
    }
    const key = normalizeEmail(email);
    if (unique.has(key)) {
      skipReasons.push(`Rij ${index + 1}: dubbel adres in dit bestand (${email})`);
      continue;
    }
    unique.set(key, { ...row, email, name });
  }

  const importedRows = [...unique.values()];
  let imported = 0;
  let updated = 0;

  await transaction(async (client) => {
    for (const row of importedRows) {
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM campaign_targets
         WHERE campaign_id = $1 AND email_normalized = $2`,
        [campaignId, normalizeEmail(row.email)]
      );
      if (existing.rows[0]) {
        await client.query(
          `UPDATE campaign_targets
           SET name = $2, website = $3, attributes = $4::jsonb
           WHERE id = $1`,
          [
            existing.rows[0].id,
            row.name,
            row.website?.trim() || null,
            JSON.stringify(row.attributes ?? {}),
          ]
        );
        updated += 1;
      } else {
        await client.query(
          `INSERT INTO campaign_targets (
             campaign_id, email, email_normalized, name, website, attributes
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            campaignId,
            row.email,
            normalizeEmail(row.email),
            row.name,
            row.website?.trim() || null,
            JSON.stringify(row.attributes ?? {}),
          ]
        );
        imported += 1;
      }
    }
  });

  return { imported, updated, skipped: skipReasons.length, skipReasons };
}

export async function updateTargetStatus(
  targetId: number,
  status: TargetStatus
): Promise<CampaignTarget> {
  const stamps: Record<TargetStatus, string> = {
    new: "emailed_at = NULL, excluded_at = NULL, not_interested_at = NULL",
    emailed: "emailed_at = COALESCE(emailed_at, NOW()), excluded_at = NULL, not_interested_at = NULL",
    excluded: "excluded_at = NOW()",
    not_interested: "not_interested_at = NOW()",
  };

  const row = await queryOne<TargetRow>(
    `UPDATE campaign_targets
     SET status = $2, ${stamps[status]}
     WHERE id = $1
     RETURNING *`,
    [targetId, status]
  );
  if (!row) throw new Error("Lead niet gevonden");
  return toTarget(row);
}
