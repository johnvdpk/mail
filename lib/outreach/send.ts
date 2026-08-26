import { sendNewMail } from "../mail/send-service";
import { query, queryOne } from "../shared/db";
import { assertNotDuplicate, DuplicateSendError } from "./dedup";
import { getTarget, updateTargetStatus } from "./targets";
import type { CampaignSend, ResponseStatus } from "./types";

export { DuplicateSendError };

type SendRow = {
  id: number;
  target_id: number;
  message_id: string;
  subject: string;
  body_text: string;
  sent_at: Date;
  is_test: boolean;
  response_status: CampaignSend["responseStatus"];
  response_at: Date | null;
};

function toSend(row: SendRow): CampaignSend {
  return {
    id: row.id,
    targetId: row.target_id,
    messageId: row.message_id,
    subject: row.subject,
    bodyText: row.body_text,
    sentAt: row.sent_at.toISOString(),
    isTest: row.is_test,
    responseStatus: row.response_status,
    responseAt: row.response_at?.toISOString() ?? null,
  };
}

export type OutreachDraft = {
  subject: string;
  text: string;
  html?: string;
};

export async function sendOutreachMail(
  targetId: number,
  draft: OutreachDraft,
  options?: { isTest?: boolean; testEmail?: string }
): Promise<CampaignSend> {
  const target = await getTarget(targetId);
  if (!target) throw new Error("Lead niet gevonden");
  if (!target.email.trim()) throw new Error("Deze lead heeft geen e-mailadres");

  const isTest = Boolean(options?.isTest);
  if (isTest) {
    const testEmail = options?.testEmail?.trim();
    if (!testEmail) {
      throw new Error("Stel eerst een testadres in bij de campagne-instellingen");
    }
  } else {
    await assertNotDuplicate(target.emailNormalized);
  }

  const to = isTest ? options!.testEmail!.trim() : target.email;
  const result = await sendNewMail({
    to,
    subject: draft.subject,
    text: draft.text,
    html: draft.html,
  });

  const row = await queryOne<SendRow>(
    `INSERT INTO campaign_sends (target_id, message_id, subject, body_text, is_test)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [targetId, result.messageId, draft.subject, draft.text, isTest]
  );
  if (!row) throw new Error("Verzenden opgeslagen, maar de send-rij ontbreekt");

  if (!isTest) {
    await updateTargetStatus(targetId, "emailed");
  }

  return toSend(row);
}

export async function getSend(id: number): Promise<CampaignSend | null> {
  const row = await queryOne<SendRow>("SELECT * FROM campaign_sends WHERE id = $1", [id]);
  return row ? toSend(row) : null;
}

export async function listCampaignSends(campaignId: number): Promise<
  Array<
    CampaignSend & {
      targetName: string;
      targetEmail: string;
      inboxMessageId: string | null;
    }
  >
> {
  const result = await query<
    SendRow & {
      target_name: string;
      target_email: string;
      inbox_message_id: string | null;
    }
  >(
    `SELECT cs.*, ct.name AS target_name, ct.email AS target_email,
            (
              SELECT m.id
              FROM messages m
              WHERE lower(trim(both '<>' from coalesce(m.message_id, '')))
                  = lower(trim(both '<>' from cs.message_id))
              LIMIT 1
            ) AS inbox_message_id
     FROM campaign_sends cs
     JOIN campaign_targets ct ON ct.id = cs.target_id
     WHERE ct.campaign_id = $1
     ORDER BY cs.sent_at DESC`,
    [campaignId]
  );

  return result.rows.map((row) => ({
    ...toSend(row),
    targetName: row.target_name,
    targetEmail: row.target_email,
    inboxMessageId: row.inbox_message_id,
  }));
}

export async function updateSendResponseStatus(
  sendId: number,
  responseStatus: CampaignSend["responseStatus"]
): Promise<CampaignSend> {
  const row = await queryOne<SendRow>(
    `UPDATE campaign_sends
     SET response_status = $2,
         response_at = CASE WHEN $2 = 'pending' THEN NULL ELSE COALESCE(response_at, NOW()) END
     WHERE id = $1
     RETURNING *`,
    [sendId, responseStatus]
  );
  if (!row) throw new Error("Verzonden mail niet gevonden");
  return toSend(row);
}

export async function insertHistoricalSend(input: {
  targetId: number;
  messageId: string;
  subject: string;
  bodyText: string;
  sentAt: string;
  isTest?: boolean;
  responseStatus?: ResponseStatus;
  responseAt?: string | null;
}): Promise<CampaignSend> {
  const row = await queryOne<SendRow>(
    `INSERT INTO campaign_sends
       (target_id, message_id, subject, body_text, sent_at, is_test, response_status, response_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.targetId,
      input.messageId,
      input.subject,
      input.bodyText,
      input.sentAt,
      Boolean(input.isTest),
      input.responseStatus ?? "pending",
      input.responseAt ?? null,
    ]
  );
  if (!row) throw new Error("Historische send opslaan mislukt");
  return toSend(row);
}
