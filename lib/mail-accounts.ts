import { env } from "./env";
import { readEmailConfig, writeEmailConfig } from "./email-config";

export type MailAccountId = "aiadapt" | "convrsy";

export type MailAccountInfo = {
  id: MailAccountId;
  email: string;
  label: string;
};

/** The two mailboxes this app can send/receive from. Credentials come from env vars. */
export const MAIL_ACCOUNTS: MailAccountInfo[] = [
  { id: "aiadapt", email: "john@aiadapt.nl", label: "aiadapt.nl (Strato)" },
  { id: "convrsy", email: "john@convrsy.com", label: "convrsy.com (Google Workspace)" },
];

/** Env vars for a non-default account are suffixed, e.g. SMTP_HOST_CONVRSY. */
const ACCOUNT_ENV_SUFFIX: Record<MailAccountId, string> = {
  aiadapt: "",
  convrsy: "_CONVRSY",
};

/** Fallback values when the suffixed env var isn't set, so Google Workspace only needs user/pass. */
const ACCOUNT_ENV_DEFAULTS: Partial<Record<MailAccountId, Record<string, string>>> = {
  convrsy: {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_FROM: "john@convrsy.com",
    IMAP_HOST: "imap.gmail.com",
    IMAP_PORT: "993",
    IMAP_SECURE: "true",
  },
};

// Cached synchronously so IMAP/SMTP helpers (which run outside request scope, e.g.
// in cron-style syncs) don't need to become async just to read the active account.
let cachedActiveId: MailAccountId | null = null;

function isKnownId(id: string): id is MailAccountId {
  return MAIL_ACCOUNTS.some((a) => a.id === id);
}

export function getActiveMailAccountId(): MailAccountId {
  return cachedActiveId ?? "aiadapt";
}

/** Reload the active account from the database. Call this once per request (page load). */
export async function refreshActiveMailAccount(): Promise<MailAccountId> {
  const config = await readEmailConfig();
  cachedActiveId = isKnownId(config.activeAccountId) ? config.activeAccountId : "aiadapt";
  return cachedActiveId;
}

export async function setActiveMailAccount(id: MailAccountId): Promise<void> {
  const config = await readEmailConfig();
  await writeEmailConfig({ ...config, activeAccountId: id });
  cachedActiveId = id;
}

export function currentMailAccount(): MailAccountInfo {
  const id = getActiveMailAccountId();
  return MAIL_ACCOUNTS.find((a) => a.id === id) ?? MAIL_ACCOUNTS[0];
}

function accountEnv(id: MailAccountId, key: string): string | undefined {
  const suffix = ACCOUNT_ENV_SUFFIX[id];
  return env(`${key}${suffix}`) ?? ACCOUNT_ENV_DEFAULTS[id]?.[key];
}

/** Read an SMTP_/IMAP_ style env var scoped to the currently active mail account. */
export function activeAccountEnv(key: string): string | undefined {
  return accountEnv(getActiveMailAccountId(), key);
}

export function isMailAccountConfigured(id: MailAccountId): boolean {
  return Boolean(
    accountEnv(id, "SMTP_HOST") &&
      (accountEnv(id, "SMTP_USER") || accountEnv(id, "IMAP_USER")) &&
      (accountEnv(id, "SMTP_PASS") || accountEnv(id, "IMAP_PASS"))
  );
}
