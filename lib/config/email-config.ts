import { query, queryOne } from "../shared/db";
import {
  DEFAULT_EMAIL_CONFIG,
  type EmailAccount,
  type EmailConfig,
  type QuickReplyTemplate,
} from "./email-config-shared";

export type {
  ContactReplySet,
  EmailAccount,
  EmailConfig,
  QuickReplyTemplate,
  ReplyIntent,
  WritingProfile,
} from "./email-config-shared";

export {
  DEFAULT_EMAIL_CONFIG,
  DEFAULT_SIGNATURE_TEXT,
  FONT_FAMILY_OPTIONS,
  buildReplyPromptContext,
  buildTonePromptContext,
  repliesForContact,
} from "./email-config-shared";

export async function readEmailConfig(): Promise<EmailConfig> {
  const row = await queryOne<{ config: EmailConfig; updated_at: Date }>(
    "SELECT config, updated_at FROM email_config WHERE id = 1"
  );
  if (!row) {
    await writeEmailConfig(DEFAULT_EMAIL_CONFIG);
    return structuredClone(DEFAULT_EMAIL_CONFIG);
  }
  const merged = mergeWithDefaults(row.config);
  merged.updatedAt = row.updated_at.toISOString();
  return merged;
}

export async function writeEmailConfig(config: EmailConfig): Promise<EmailConfig> {
  const merged = mergeWithDefaults(config);
  const saved: EmailConfig = {
    ...merged,
    updatedAt: new Date().toISOString(),
  };
  await query(
    `INSERT INTO email_config (id, config, updated_at)
     VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = $1, updated_at = NOW()`,
    [JSON.stringify(saved)]
  );
  return saved;
}

function mergeWithDefaults(partial: Partial<EmailConfig>): EmailConfig {
  const defaults = structuredClone(DEFAULT_EMAIL_CONFIG);
  return {
    updatedAt: partial.updatedAt,
    toneOfVoice: { ...defaults.toneOfVoice, ...partial.toneOfVoice },
    aboutMe: { ...defaults.aboutMe, ...partial.aboutMe },
    formatting: { ...defaults.formatting, ...partial.formatting },
    signature: { ...defaults.signature, ...partial.signature },
    accounts: mergeAccounts(partial.accounts),
    activeAccountId:
      typeof partial.activeAccountId === "string" && partial.activeAccountId.trim()
        ? partial.activeAccountId
        : defaults.activeAccountId,
    replies: mergeReplies(partial.replies, defaults.replies),
    contactReplies: Array.isArray(partial.contactReplies) ? partial.contactReplies : [],
  };
}

function mergeAccounts(incoming: EmailAccount[] | undefined): EmailAccount[] {
  if (!Array.isArray(incoming)) return [];
  return incoming.filter((a) => typeof a?.email === "string" && a.email.trim());
}

function mergeReplies(
  incoming: QuickReplyTemplate[] | undefined,
  defaults: QuickReplyTemplate[]
): QuickReplyTemplate[] {
  if (!incoming?.length) return defaults;
  // Keep user's custom list if they have edited it; still fill missing default fields per id
  return incoming.map((item) => {
    const def = defaults.find((d) => d.id === item.id);
    return def ? { ...def, ...item } : item;
  });
}
