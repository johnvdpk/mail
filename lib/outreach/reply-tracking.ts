import { currentMailAccount } from "../config/mail-accounts";
import { query } from "../shared/db";
import { normalizeEmail, normalizeMessageId } from "../shared/normalize";
import type { ResponseStatus } from "./types";

type PendingSendRow = {
  id: number;
  message_id: string;
  sent_at: Date;
  response_status: ResponseStatus;
  email_normalized: string;
};

type MessageRow = {
  id: string;
  message_id: string | null;
  in_reply_to: string | null;
  references: string[] | null;
  from_email: string | null;
  date: Date;
};

export type MatchOutreachResult = {
  matched: number;
  errors: string[];
};

function idsOf(value: string | null | undefined): string[] {
  if (!value) return [];
  return [normalizeMessageId(value)].filter(Boolean);
}

function refsOf(refs: string[] | null | undefined): string[] {
  if (!refs?.length) return [];
  return refs.map((r) => normalizeMessageId(r)).filter(Boolean);
}

function ownEmail(): string {
  try {
    return normalizeEmail(currentMailAccount().email);
  } catch {
    return "";
  }
}

function headerMatch(sendMessageId: string, message: MessageRow): boolean {
  const sendId = normalizeMessageId(sendMessageId);
  if (!sendId) return false;
  if (idsOf(message.in_reply_to).includes(sendId)) return true;
  if (idsOf(message.message_id).includes(sendId)) return true;
  return refsOf(message.references).includes(sendId);
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

  const messages = await query<MessageRow>(
    `SELECT id, message_id, in_reply_to, "references", from_email, date
     FROM messages
     ORDER BY date DESC
     LIMIT 5000`
  );

  const mine = ownEmail();

  for (const send of pending.rows) {
    try {
      const byHeader = messages.rows.find(
        (m) =>
          headerMatch(send.message_id, m) &&
          (!m.from_email || normalizeEmail(m.from_email) !== mine)
      );

      const byFrom =
        byHeader ??
        messages.rows.find((m) => {
          if (!m.from_email) return false;
          if (normalizeEmail(m.from_email) !== send.email_normalized) return false;
          if (mine && normalizeEmail(m.from_email) === mine) return false;
          return m.date.getTime() > send.sent_at.getTime();
        });

      if (!byFrom) continue;

      const updated = await query(
        `UPDATE campaign_sends
         SET response_status = 'replied', response_at = $2
         WHERE id = $1 AND response_status = 'pending'`,
        [send.id, byFrom.date]
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
