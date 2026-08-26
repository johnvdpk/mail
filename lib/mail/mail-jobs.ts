import { query, queryOne } from "../shared/db";
import { logger } from "../shared/logger";
import { getThreadDetail } from "./mailbox-service";
import { sendNewMail, sendThreadReply } from "./send-service";

export type SnoozeOption = "1h" | "tomorrow" | "friday" | "nextweek";

export function computeWakeAt(option: SnoozeOption, now = new Date()): Date {
  const date = new Date(now);

  if (option === "1h") {
    date.setHours(date.getHours() + 1);
    return date;
  }

  if (option === "tomorrow") {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date;
  }

  if (option === "friday") {
    const day = date.getDay(); // 0 Sun .. 5 Fri
    const daysUntilFri = (5 - day + 7) % 7 || 7;
    date.setDate(date.getDate() + daysUntilFri);
    date.setHours(9, 0, 0, 0);
    return date;
  }

  // next week Monday 09:00
  const day = date.getDay();
  const daysUntilMon = ((1 - day + 7) % 7) || 7;
  date.setDate(date.getDate() + daysUntilMon);
  date.setHours(9, 0, 0, 0);
  return date;
}

export async function snoozeThread(
  threadId: string,
  returnFolder: string,
  option: SnoozeOption
): Promise<{ wakeAt: string }> {
  const wakeAt = computeWakeAt(option);
  await query(
    `INSERT INTO snoozed_threads (thread_id, wake_at, return_folder)
     VALUES ($1, $2, $3)
     ON CONFLICT (thread_id) DO UPDATE SET
       wake_at = EXCLUDED.wake_at,
       return_folder = EXCLUDED.return_folder,
       created_at = NOW()`,
    [threadId, wakeAt.toISOString(), returnFolder]
  );
  return { wakeAt: wakeAt.toISOString() };
}

export async function getActiveSnoozedIds(): Promise<Set<string>> {
  const { rows } = await query<{ thread_id: string }>(
    "SELECT thread_id FROM snoozed_threads WHERE wake_at > NOW()"
  );
  return new Set(rows.map((r) => r.thread_id));
}

/** Clear snoozes that are due; returns woken thread ids. */
export async function wakeDueSnoozes(): Promise<string[]> {
  const { rows } = await query<{ thread_id: string }>(
    "DELETE FROM snoozed_threads WHERE wake_at <= NOW() RETURNING thread_id"
  );
  return rows.map((r) => r.thread_id);
}

export async function createFollowUp(
  threadId: string,
  days: number,
  note?: string
): Promise<{ remindAt: string }> {
  const remindAt = new Date();
  remindAt.setDate(remindAt.getDate() + days);
  remindAt.setHours(9, 0, 0, 0);

  await query(
    `INSERT INTO follow_ups (thread_id, remind_at, note)
     VALUES ($1, $2, $3)`,
    [threadId, remindAt.toISOString(), note ?? null]
  );
  return { remindAt: remindAt.toISOString() };
}

export type DueFollowUp = {
  id: number;
  threadId: string;
  remindAt: string;
  note: string | null;
};

/**
 * Mark due follow-ups notified when the thread still has no newer inbound reply.
 */
export async function collectDueFollowUps(): Promise<DueFollowUp[]> {
  const { rows } = await query<{
    id: number;
    thread_id: string;
    remind_at: Date;
    note: string | null;
    created_at: Date;
  }>(
    `SELECT id, thread_id, remind_at, note, created_at
     FROM follow_ups
     WHERE notified = FALSE AND remind_at <= NOW()
     ORDER BY remind_at ASC
     LIMIT 20`
  );

  const due: DueFollowUp[] = [];

  for (const row of rows) {
    const detail = await getThreadDetail(row.thread_id);
    const createdMs = row.created_at.getTime();
    const hasInboundReply = detail?.messages.some(
      (m) => !m.outbound && new Date(m.date).getTime() > createdMs
    );

    if (hasInboundReply) {
      await query("UPDATE follow_ups SET notified = TRUE WHERE id = $1", [row.id]);
      continue;
    }

    await query("UPDATE follow_ups SET notified = TRUE WHERE id = $1", [row.id]);
    due.push({
      id: row.id,
      threadId: row.thread_id,
      remindAt: row.remind_at.toISOString(),
      note: row.note,
    });
  }

  return due;
}

export type ScheduledPayload =
  | {
      kind: "reply";
      threadId: string;
      text: string;
      cc?: string;
      bcc?: string;
    }
  | {
      kind: "new";
      to: string;
      subject: string;
      text: string;
    };

export async function scheduleSend(
  payload: ScheduledPayload,
  sendAt: Date
): Promise<{ id: number; sendAt: string }> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO scheduled_sends (kind, payload, send_at, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [payload.kind, JSON.stringify(payload), sendAt.toISOString()]
  );
  return { id: rows[0].id, sendAt: sendAt.toISOString() };
}

export async function cancelScheduledSend(id: number): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `UPDATE scheduled_sends SET status = 'cancelled'
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [id]
  );
  return Boolean(row);
}

export async function processDueScheduledSends(): Promise<number> {
  const { rows } = await query<{
    id: number;
    kind: string;
    payload: ScheduledPayload;
  }>(
    `SELECT id, kind, payload FROM scheduled_sends
     WHERE status = 'pending' AND send_at <= NOW()
     ORDER BY send_at ASC
     LIMIT 10`
  );

  let sent = 0;
  for (const row of rows) {
    const payload =
      typeof row.payload === "string"
        ? (JSON.parse(row.payload) as ScheduledPayload)
        : row.payload;

    try {
      if (payload.kind === "reply") {
        await sendThreadReply({
          threadId: payload.threadId,
          text: payload.text,
          cc: payload.cc,
          bcc: payload.bcc,
        });
      } else {
        await sendNewMail({
          to: payload.to,
          subject: payload.subject,
          text: payload.text,
        });
      }
      await query(`UPDATE scheduled_sends SET status = 'sent' WHERE id = $1`, [row.id]);
      sent += 1;
    } catch (err) {
      console.error("[scheduled-send]", row.id, err);
      await query(`UPDATE scheduled_sends SET status = 'failed' WHERE id = $1`, [row.id]);
    }
  }

  return sent;
}

export type EmbeddingBackfillResult = {
  created: number;
  total: number;
  embedded: number;
  pending: number;
};

/** Run maintenance: wake snoozes, follow-ups, scheduled sends, semantic search. */
export async function processMailJobs(): Promise<{
  woken: string[];
  followUps: DueFollowUp[];
  scheduledSent: number;
  semanticJobs: number;
  embeddingBackfill: EmbeddingBackfillResult;
  outreachReplies: { matched: number; errors: string[] };
}> {
  const woken = await wakeDueSnoozes();
  const followUps = await collectDueFollowUps();
  const scheduledSent = await processDueScheduledSends();

  let semanticJobs = 0;
  try {
    const { processPendingSemanticJobs } = await import("./mail-search");
    semanticJobs = await processPendingSemanticJobs(2);
  } catch (err) {
    console.error("[mail-jobs] semantic search", err);
  }

  let embeddingBackfill: EmbeddingBackfillResult = {
    created: 0,
    total: 0,
    embedded: 0,
    pending: 0,
  };
  try {
    const {
      backfillOldestEmbeddings,
      getEmbeddingBackfillStatus,
      EMBEDDING_BACKFILL_BATCH_SIZE,
    } = await import("../ai/embeddings");
    const created = await backfillOldestEmbeddings(EMBEDDING_BACKFILL_BATCH_SIZE);
    const status = await getEmbeddingBackfillStatus();
    embeddingBackfill = { created, ...status };
  } catch (err) {
    console.error("[mail-jobs] embedding backfill", err);
  }

  let outreachReplies = { matched: 0, errors: [] as string[] };
  try {
    const { matchOutreachReplies } = await import("../outreach/reply-tracking");
    outreachReplies = await matchOutreachReplies();
  } catch (err) {
    logger.error({ route: "mail-jobs", method: "GET", err }, "outreach replies");
  }

  return { woken, followUps, scheduledSent, semanticJobs, embeddingBackfill, outreachReplies };
}
