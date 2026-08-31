import { query, queryOne } from "../shared/db";
import { logger } from "../shared/logger";
import { getCampaign } from "./campaigns";
import { personalizeOutreachEmail } from "./personalize";
import { sendOutreachMail } from "./send";
import { countTargetsSentToday, isTargetStatus, selectAutomailCandidate } from "./targets";
import type { AutomailFilters, AutomailLogEntry, AutomailRule, TargetStatus } from "./types";

// Matches the setInterval in instrumentation.ts. Sends at most one lead per
// campaign per tick, so a spread-across-the-day probability model (see
// runAutomailTick) naturally paces sends instead of bursting them.
const TICK_MINUTES = 15;

const DEFAULT_RULE: Omit<AutomailRule, "campaignId" | "updatedAt"> = {
  enabled: false,
  dailyCount: 4,
  windowStart: "09:00",
  windowEnd: "17:00",
  statusFilter: "new",
  filters: {},
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type RuleRow = {
  campaign_id: number;
  enabled: boolean;
  daily_count: number;
  window_start: string;
  window_end: string;
  status_filter: TargetStatus;
  filters: AutomailFilters;
  updated_at: Date;
};

function toRule(row: RuleRow): AutomailRule {
  return {
    campaignId: row.campaign_id,
    enabled: row.enabled,
    dailyCount: row.daily_count,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    statusFilter: row.status_filter,
    filters: row.filters ?? {},
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getAutomailRule(campaignId: number): Promise<AutomailRule> {
  const row = await queryOne<RuleRow>(
    "SELECT * FROM campaign_automail_rules WHERE campaign_id = $1",
    [campaignId]
  );
  if (row) return toRule(row);
  return { campaignId, updatedAt: new Date(0).toISOString(), ...DEFAULT_RULE };
}

export type AutomailRuleInput = {
  enabled: boolean;
  dailyCount: number;
  windowStart: string;
  windowEnd: string;
  statusFilter: TargetStatus;
  filters: AutomailFilters;
};

export async function upsertAutomailRule(
  campaignId: number,
  input: AutomailRuleInput
): Promise<AutomailRule> {
  if (!Number.isInteger(input.dailyCount) || input.dailyCount < 1 || input.dailyCount > 50) {
    throw new Error("Aantal per dag moet tussen 1 en 50 liggen");
  }
  if (!TIME_RE.test(input.windowStart) || !TIME_RE.test(input.windowEnd)) {
    throw new Error("Ongeldig tijdvenster, gebruik HH:MM");
  }
  if (input.windowStart >= input.windowEnd) {
    throw new Error("Starttijd moet voor eindtijd liggen");
  }
  if (!isTargetStatus(input.statusFilter)) {
    throw new Error("Ongeldige status-filter");
  }

  const row = await queryOne<RuleRow>(
    `INSERT INTO campaign_automail_rules
       (campaign_id, enabled, daily_count, window_start, window_end, status_filter, filters, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
     ON CONFLICT (campaign_id) DO UPDATE SET
       enabled = $2, daily_count = $3, window_start = $4, window_end = $5,
       status_filter = $6, filters = $7::jsonb, updated_at = NOW()
     RETURNING *`,
    [
      campaignId,
      input.enabled,
      input.dailyCount,
      input.windowStart,
      input.windowEnd,
      input.statusFilter,
      JSON.stringify(input.filters),
    ]
  );
  if (!row) throw new Error("Automail-regel opslaan mislukt");
  return toRule(row);
}

async function logAutomailEvent(
  campaignId: number,
  targetId: number | null,
  status: "sent" | "error",
  message: string | null
): Promise<void> {
  await query(
    `INSERT INTO campaign_automail_log (campaign_id, target_id, status, message)
     VALUES ($1, $2, $3, $4)`,
    [campaignId, targetId, status, message]
  );
}

type LogRow = {
  id: number;
  campaign_id: number;
  target_id: number | null;
  target_name: string | null;
  status: "sent" | "error";
  message: string | null;
  created_at: Date;
};

export async function listAutomailLog(campaignId: number, limit = 20): Promise<AutomailLogEntry[]> {
  const result = await query<LogRow>(
    `SELECT l.*, ct.name AS target_name
     FROM campaign_automail_log l
     LEFT JOIN campaign_targets ct ON ct.id = l.target_id
     WHERE l.campaign_id = $1
     ORDER BY l.created_at DESC
     LIMIT $2`,
    [campaignId, limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    targetId: row.target_id,
    targetName: row.target_name,
    status: row.status,
    message: row.message,
    createdAt: row.created_at.toISOString(),
  }));
}

function amsterdamParts(date: Date): { minutes: number; dateKey: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Runs one tick of a campaign's automail rule. Outside the configured window,
 * or once today's quota is met, this is a no-op. Inside the window it sends
 * at most one lead, with a probability weighted so the remaining quota is
 * expected to land evenly across the remaining ticks (forced to 1 on the
 * last tick so a run of bad luck doesn't leave quota unsent).
 */
export async function runAutomailTick(campaignId: number, now: Date): Promise<void> {
  const rule = await getAutomailRule(campaignId);
  if (!rule.enabled) return;

  const { minutes: nowMinutes, dateKey } = amsterdamParts(now);
  const startMinutes = toMinutes(rule.windowStart);
  const endMinutes = toMinutes(rule.windowEnd);
  if (nowMinutes < startMinutes || nowMinutes >= endMinutes) return;

  const sentToday = await countTargetsSentToday(campaignId, dateKey);
  const remainingSlots = rule.dailyCount - sentToday;
  if (remainingSlots <= 0) return;

  const minutesUntilEnd = endMinutes - nowMinutes;
  const remainingTicks = Math.max(1, Math.ceil(minutesUntilEnd / TICK_MINUTES));
  const isLastTick = minutesUntilEnd <= TICK_MINUTES;
  const sendProbability = isLastTick ? 1 : remainingSlots / remainingTicks;
  if (Math.random() >= sendProbability) return;

  const campaign = await getCampaign(campaignId);
  if (!campaign) return;
  const listColumnKeys = new Set(campaign.profile.listColumns.map((c) => c.key));

  const target = await selectAutomailCandidate(campaignId, rule.statusFilter, rule.filters, listColumnKeys);
  if (!target) return;

  try {
    const draft = await personalizeOutreachEmail(target, campaign);
    await sendOutreachMail(target.id, draft);
    await logAutomailEvent(campaignId, target.id, "sent", null);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    logger.error({ route: "outreach/automail", campaignId, targetId: target.id, err }, message);
    await logAutomailEvent(campaignId, target.id, "error", message);
  }
}

export async function runAutomail(now: Date = new Date()): Promise<{ campaignsChecked: number }> {
  const result = await query<{ campaign_id: number }>(
    "SELECT campaign_id FROM campaign_automail_rules WHERE enabled = TRUE"
  );
  for (const row of result.rows) {
    await runAutomailTick(row.campaign_id, now);
  }
  return { campaignsChecked: result.rows.length };
}

export async function getAutomailStatus(campaignId: number): Promise<{
  rule: AutomailRule;
  sentToday: number;
  log: AutomailLogEntry[];
}> {
  const rule = await getAutomailRule(campaignId);
  const { dateKey } = amsterdamParts(new Date());
  const [sentToday, log] = await Promise.all([
    countTargetsSentToday(campaignId, dateKey),
    listAutomailLog(campaignId),
  ]);
  return { rule, sentToday, log };
}
