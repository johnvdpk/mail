import { queryOne } from "../shared/db";
import type { CampaignSend } from "./types";

type SendJoinRow = {
  id: number;
  target_id: number;
  message_id: string;
  subject: string;
  body_text: string;
  sent_at: Date;
  is_test: boolean;
  response_status: CampaignSend["responseStatus"];
  response_at: Date | null;
  campaign_name: string;
};

function toSend(row: Omit<SendJoinRow, "campaign_name">): CampaignSend {
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

export class DuplicateSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateSendError";
  }
}

export async function findExistingSend(emailNormalized: string): Promise<
  (CampaignSend & { campaignName: string }) | null
> {
  const row = await queryOne<SendJoinRow>(
    `SELECT cs.id, cs.target_id, cs.message_id, cs.subject, cs.body_text,
            cs.sent_at, cs.is_test, cs.response_status, cs.response_at,
            c.name AS campaign_name
     FROM campaign_sends cs
     JOIN campaign_targets ct ON ct.id = cs.target_id
     JOIN campaigns c ON c.id = ct.campaign_id
     WHERE ct.email_normalized = $1 AND cs.is_test = FALSE
     ORDER BY cs.sent_at ASC
     LIMIT 1`,
    [emailNormalized]
  );
  if (!row) return null;
  return { ...toSend(row), campaignName: row.campaign_name };
}

export async function assertNotDuplicate(emailNormalized: string): Promise<void> {
  const existing = await findExistingSend(emailNormalized);
  if (!existing) return;
  const date = new Date(existing.sentAt).toLocaleDateString("nl-NL");
  throw new DuplicateSendError(
    `Dit adres is al benaderd op ${date} vanuit campagne ${existing.campaignName}`
  );
}
