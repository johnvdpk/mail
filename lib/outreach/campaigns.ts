import { query, queryOne } from "../shared/db";
import { mergeWithDefaults, type CampaignProfile } from "./campaign-profile";
import type { Campaign } from "./types";

type CampaignRow = {
  id: number;
  name: string;
  slug: string;
  profile: unknown;
  created_at: Date;
  updated_at: Date;
};

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    profile: mergeWithDefaults(row.profile as Partial<CampaignProfile>),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "campagne";
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && err.code === "23505");
}

export async function listCampaigns(): Promise<Campaign[]> {
  const result = await query<CampaignRow>(
    "SELECT * FROM campaigns ORDER BY created_at ASC"
  );
  return result.rows.map(toCampaign);
}

export async function getCampaign(id: number): Promise<Campaign | null> {
  const row = await queryOne<CampaignRow>("SELECT * FROM campaigns WHERE id = $1", [id]);
  return row ? toCampaign(row) : null;
}

export async function getCampaignBySlug(slug: string): Promise<Campaign | null> {
  const row = await queryOne<CampaignRow>("SELECT * FROM campaigns WHERE slug = $1", [slug]);
  return row ? toCampaign(row) : null;
}

export async function deleteCampaign(id: number): Promise<boolean> {
  const row = await queryOne<{ id: number }>("DELETE FROM campaigns WHERE id = $1 RETURNING id", [id]);
  return Boolean(row);
}

export async function createCampaign(input: { name: string; slug?: string }): Promise<Campaign> {
  const name = input.name.trim();
  if (!name) throw new Error("Naam is verplicht");
  const slug = slugify(input.slug?.trim() || name);

  try {
    const row = await queryOne<CampaignRow>(
      `INSERT INTO campaigns (name, slug, profile)
       VALUES ($1, $2, $3::jsonb)
       RETURNING *`,
      [name, slug, JSON.stringify(mergeWithDefaults({}))]
    );
    if (!row) throw new Error("Campagne aanmaken mislukt");
    return toCampaign(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new Error(`Er bestaat al een campagne met de slug "${slug}"`);
    }
    throw err;
  }
}

export async function updateCampaignProfile(
  id: number,
  profile: Partial<CampaignProfile>
): Promise<Campaign> {
  const existing = await getCampaign(id);
  if (!existing) throw new Error("Campagne niet gevonden");

  const merged = mergeWithDefaults({ ...existing.profile, ...profile });
  const row = await queryOne<CampaignRow>(
    `UPDATE campaigns
     SET profile = $2::jsonb, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(merged)]
  );
  if (!row) throw new Error("Campagne bijwerken mislukt");
  return toCampaign(row);
}
