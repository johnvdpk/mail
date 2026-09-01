import { currentMailAccount } from "../config/mail-accounts";
import { query, queryOne } from "../shared/db";
import { normalizeEmail, normalizeMessageId } from "../shared/normalize";
import type { ResponseStatus } from "./types";

type PendingSendRow = {
  id: number;
  message_id: string;
  sent_at: Date;
  response_status: ResponseStatus;
  email_normalized: string;
};

export type MatchOutreachResult = {
  matched: number;
  errors: string[];
};

function ownEmail(): string {
  try {
    return normalizeEmail(currentMailAccount().email);
  } catch {
    return "";
  }
}

async function findHeaderMatch(
  sendMessageId: string,
  mineEmail: string
): Promise<{ id: string; date: Date } | null> {
  const normalized = normalizeMessageId(sendMessageId);
  if (!normalized) return null;

  const result = await queryOne<{ id: string; date: Date }>(
    `SELECT m.id, m.date
     FROM messages m
     WHERE (
       lower(trim(both '<>' from coalesce(m.in_reply_to, ''))) = $1
       OR lower(trim(both '<>' from coalesce(m.message_id, ''))) = $1
       OR EXISTS (
         SELECT 1
         FROM unnest(coalesce(m.references, ARRAY[]::text[])) AS ref
         WHERE lower(trim(both '<>' from ref)) = $1
       )
     )
       AND (m.from_email IS NULL OR lower(m.from_email) != $2)
     ORDER BY m.date DESC
     LIMIT 1`,
    [normalized, mineEmail]
  );

  return result ?? null;
}

async function findFromMatch(
  targetEmail: string,
  sentAt: Date,
  mineEmail: string
): Promise<{ id: string; date: Date } | null> {
  const result = await queryOne<{ id: string; date: Date }>(
    `SELECT m.id, m.date
     FROM messages m
     WHERE lower(coalesce(m.from_email, '')) = $1
       AND (m.from_email IS NULL OR lower(m.from_email) != $2)
       AND m.date > $3
     ORDER BY m.date ASC
     LIMIT 1`,
    [normalizeEmail(targetEmail), normalizeEmail(mineEmail), sentAt]
  );

  return result ?? null;
}

export async function matchOutreachReplies(): Promise<MatchOutreachResult> {
  const errors: string[] = [];
  let matched = 0;

  const pending = await query<PendingSendRow>(
    `SELECT cs.id, cs.message_id, cs.sent_at, cs.response_status, ct.email_normalized
     FROM campaign_sends cs
     JOIN campaign_targets ct ON ct.id = cs.target_id
     WHERE cs.is_test = FALSE
       AND cs.response_status = 'pending'`
  );

  if (pending.rows.length === 0) return { matched: 0, errors };

  const mine = ownEmail();

  for (const send of pending.rows) {
    try {
      const byHeader = await findHeaderMatch(send.message_id, mine);

      const matchedMessage =
        byHeader ?? (await findFromMatch(send.email_normalized, send.sent_at, mine));

      if (!matchedMessage) continue;

      const updated = await query(
        `UPDATE campaign_sends
         SET response_status = 'replied', response_at = $2
         WHERE id = $1 AND response_status = 'pending'`,
        [send.id, matchedMessage.date]
      );
      if ((updated.rowCount ?? 0) > 0) matched += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Onbekende fout";
      errors.push(`Send ${send.id}: ${message}`);
    }
  }

  return { matched, errors };
}

export async function collectThreadText(targetEmail: string, sentAt: string): Promise<string> {
  const result = await query<{
    from_email: string | null;
    subject: string;
    date: Date;
    text_body: string | null;
  }>(
    `SELECT m.from_email, m.subject, m.date, b.text_body
     FROM messages m
     LEFT JOIN bodies b ON b.message_id = m.id
     WHERE lower(m.from_email) = lower($1)
       AND m.date > $2
     ORDER BY m.date ASC
     LIMIT 20`,
    [targetEmail, sentAt]
  );

  if (result.rows.length === 0) return "(geen inbound berichten gevonden)";

  return result.rows
    .map((row) => {
      const when = row.date.toISOString();
      return `--- INBOUND (${when}) ---\nVan: ${row.from_email ?? "?"}\nOnderwerp: ${row.subject}\n${row.text_body ?? ""}`;
    })
    .join("\n\n");
}
