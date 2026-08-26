import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFromFile } from "../lib/config/env";
import pool from "../lib/shared/db";
import { query } from "../lib/shared/db";
import { mergeWithDefaults, type CampaignProfile } from "../lib/outreach/campaign-profile";
import {
  createCampaign,
  deleteCampaign,
  getCampaignBySlug,
  updateCampaignProfile,
} from "../lib/outreach/campaigns";
import { importTargets, listTargets, normalizeEmail } from "../lib/outreach/targets";
import { insertHistoricalSend } from "../lib/outreach/send";
import { isValidEmail } from "../lib/shared/email-validation";
import type { ResponseStatus, TargetImportRow, TargetStatus } from "../lib/outreach/types";

loadEnvFromFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, "../camping-scraper/output");

type CampingRow = {
  osmId: string;
  name: string;
  country?: string;
  website?: string;
  email?: string;
  phone?: string;
  finalUrl?: string;
  scrapedEmail?: string;
  bookingType?: string;
  qualityScore?: number;
  signals?: string[];
  fetchError?: string;
  emailedAt?: string;
  excludedAt?: string;
  notInterestedAt?: string;
};

type SentRow = {
  to?: string;
  subject?: string;
  bodyText?: string;
  messageId?: string;
  sentAt?: string;
  isTest?: boolean;
  responseStatus?: string;
  responseAt?: string;
};

const LIST_COLUMNS = [
  { key: "qualityScore", label: "Score" },
  {
    key: "bookingType",
    label: "Boeken",
    values: {
      online: "Online",
      email: "E-mail",
      phone: "Telefoon",
      unknown: "Onbekend",
      none: "Geen",
    },
  },
];

const RESPONSE_STATUSES = new Set<ResponseStatus>(["pending", "replied", "no_interest", "deal"]);

function cleanEmail(raw: string): string {
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep raw if it is not encoded
  }
  return value.replace(/^["'%22]+|["']+$/g, "").trim();
}

function campingStatus(row: CampingRow): { status: TargetStatus; at: string | null } {
  if (row.notInterestedAt) return { status: "not_interested", at: row.notInterestedAt };
  if (row.excludedAt) return { status: "excluded", at: row.excludedAt };
  if (row.emailedAt) return { status: "emailed", at: row.emailedAt };
  return { status: "new", at: null };
}

async function main() {
  const campings = JSON.parse(await readFile(path.join(OUTPUT, "campings.json"), "utf-8")) as CampingRow[];
  const sentMails = JSON.parse(await readFile(path.join(OUTPUT, "sent-mails.json"), "utf-8")) as SentRow[];
  const rawConfig = JSON.parse(await readFile(path.join(OUTPUT, "email-config.json"), "utf-8")) as Partial<CampaignProfile> & {
    updatedAt?: string;
  };
  delete rawConfig.updatedAt;

  const existing = await getCampaignBySlug("campings");
  if (existing) {
    await deleteCampaign(existing.id);
    console.log(`Removed existing campaign "${existing.name}" (id ${existing.id})`);
  }

  const campaign = await createCampaign({ name: "Campings", slug: "campings" });
  await updateCampaignProfile(campaign.id, mergeWithDefaults({
    ...rawConfig,
    listColumns: LIST_COLUMNS,
    testEmail: process.env.SMTP_FROM ?? "",
  }));
  console.log(`Created campaign Campings (id ${campaign.id})`);

  const rows: TargetImportRow[] = [];
  const statusByEmail = new Map<string, { status: TargetStatus; at: string | null }>();
  for (const camping of campings) {
    const email = cleanEmail(camping.scrapedEmail || camping.email || "");
    if (!email || !isValidEmail(email)) continue;
    const key = normalizeEmail(email);
    rows.push({
      email,
      name: camping.name || email,
      website: camping.finalUrl || camping.website,
      attributes: {
        osmId: camping.osmId,
        qualityScore: camping.qualityScore ?? 0,
        bookingType: camping.bookingType ?? "unknown",
        signals: camping.signals ?? [],
        country: camping.country ?? "",
        phone: camping.phone ?? "",
        fetchError: camping.fetchError ?? "",
      },
    });
    if (!statusByEmail.has(key)) statusByEmail.set(key, campingStatus(camping));
  }

  const imported = await importTargets(campaign.id, rows);
  console.log(
    `Imported leads: ${imported.imported} new, ${imported.updated} updated, ${imported.skipped} skipped`
  );

  const { targets } = await listTargets(campaign.id);
  const byEmail = new Map(targets.map((t) => [t.emailNormalized, t]));

  let statusUpdates = 0;
  for (const [email, info] of statusByEmail) {
    if (info.status === "new") continue;
    const target = byEmail.get(email);
    if (!target) continue;
    if (info.status === "emailed") {
      await query(
        `UPDATE campaign_targets
         SET status = 'emailed', emailed_at = COALESCE($2::timestamptz, NOW())
         WHERE id = $1`,
        [target.id, info.at]
      );
    } else if (info.status === "excluded") {
      await query(
        `UPDATE campaign_targets
         SET status = 'excluded', excluded_at = COALESCE($2::timestamptz, NOW())
         WHERE id = $1`,
        [target.id, info.at]
      );
    } else {
      await query(
        `UPDATE campaign_targets
         SET status = 'not_interested', not_interested_at = COALESCE($2::timestamptz, NOW())
         WHERE id = $1`,
        [target.id, info.at]
      );
    }
    statusUpdates += 1;
  }
  console.log(`Applied lead statuses: ${statusUpdates}`);

  let sends = 0;
  let sendMisses = 0;
  for (const mail of sentMails) {
    const email = cleanEmail(mail.to || "");
    if (!email) {
      sendMisses += 1;
      continue;
    }
    const target = byEmail.get(normalizeEmail(email));
    if (!target) {
      sendMisses += 1;
      continue;
    }
    const responseStatus = RESPONSE_STATUSES.has(mail.responseStatus as ResponseStatus)
      ? (mail.responseStatus as ResponseStatus)
      : "pending";
    await insertHistoricalSend({
      targetId: target.id,
      messageId: mail.messageId || `imported-${target.id}-${mail.sentAt || sends}`,
      subject: mail.subject || "",
      bodyText: mail.bodyText || "",
      sentAt: mail.sentAt || new Date().toISOString(),
      isTest: Boolean(mail.isTest),
      responseStatus,
      responseAt: mail.responseAt ?? mail.sentAt ?? null,
    });
    if (!mail.isTest) {
      await query(
        `UPDATE campaign_targets
         SET status = 'emailed', emailed_at = COALESCE(emailed_at, $2::timestamptz, NOW())
         WHERE id = $1`,
        [target.id, mail.sentAt ?? null]
      );
    }
    sends += 1;
  }
  console.log(`Imported sent mails: ${sends} (unmatched ${sendMisses})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
