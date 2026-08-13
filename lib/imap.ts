import { ImapFlow } from "imapflow";
import { loadEnvFromFile } from "./env";
import { activeAccountEnv, currentMailAccount } from "./mail-accounts";
import { normalizeEmail } from "./normalize";

export function isImapConfigured(): boolean {
  loadEnvFromFile();
  const user = activeAccountEnv("IMAP_USER") ?? activeAccountEnv("SMTP_USER");
  const pass = activeAccountEnv("IMAP_PASS") ?? activeAccountEnv("SMTP_PASS");
  return Boolean(user && pass);
}

export type ImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

export function getImapConfig(): ImapConfig {
  loadEnvFromFile();
  const user = activeAccountEnv("IMAP_USER") ?? activeAccountEnv("SMTP_USER");
  const pass = activeAccountEnv("IMAP_PASS") ?? activeAccountEnv("SMTP_PASS");
  if (!user || !pass) {
    throw new Error("IMAP niet geconfigureerd — zet IMAP_USER/IMAP_PASS of SMTP_USER/SMTP_PASS");
  }

  const port = Number(activeAccountEnv("IMAP_PORT") ?? 993);
  const secureEnv = activeAccountEnv("IMAP_SECURE");
  const secure = secureEnv === undefined ? true : secureEnv === "true" || port === 993;

  return {
    host: activeAccountEnv("IMAP_HOST") ?? "imap.strato.com",
    port,
    secure,
    user,
    pass,
  };
}

/** Addresses that count as "me" when deciding inbound vs outbound. */
export function ownAddresses(): Set<string> {
  const set = new Set<string>();
  set.add(normalizeEmail(currentMailAccount().email));
  for (const key of ["SMTP_FROM", "SMTP_USER", "IMAP_USER"]) {
    const value = activeAccountEnv(key);
    if (value) set.add(normalizeEmail(value));
  }
  return set;
}

async function createImapClient(): Promise<ImapFlow> {
  const cfg = getImapConfig();
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
  await client.connect();
  return client;
}

/** Run work against a connected client and always close the connection. */
export async function withImap<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = await createImapClient();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

/** Run work with a mailbox opened and locked. */
export async function withMailbox<T>(
  path: string,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  return withImap(async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  });
}
