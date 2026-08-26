import { ImapFlow } from "imapflow";
import { loadEnvFromFile } from "../config/env";
import {
  activeAccountEnv,
  currentMailAccount,
  getActiveMailAccountId,
  type MailAccountId,
} from "../config/mail-accounts";
import { normalizeEmail } from "../shared/normalize";

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

/**
 * One persistent IMAP connection per account, reused across requests instead of
 * reconnecting (TCP + TLS + LOGIN) on every call — that handshake dominates the
 * latency of a single sync/move/send action otherwise. Kept on globalThis so a
 * Next.js dev-mode module reload doesn't orphan the previous instance's socket.
 */
const globalForImap = globalThis as unknown as { __imapClients?: Map<MailAccountId, ImapFlow> };
const sharedClients = globalForImap.__imapClients ?? new Map<MailAccountId, ImapFlow>();
globalForImap.__imapClients = sharedClients;

async function getSharedClient(): Promise<ImapFlow> {
  const accountId = getActiveMailAccountId();
  const existing = sharedClients.get(accountId);
  if (existing?.usable) return existing;
  if (existing) sharedClients.delete(accountId);

  const client = await createImapClient();
  // The server (or an idle timeout) can close the socket between requests;
  // drop it from the cache so the next call transparently reconnects.
  const drop = () => {
    if (sharedClients.get(accountId) === client) sharedClients.delete(accountId);
  };
  client.on("close", drop);
  client.on("error", drop);
  sharedClients.set(accountId, client);
  return client;
}

/** Close every cached connection. Called on process shutdown. */
export async function closeAllImapClients(): Promise<void> {
  const closing = Array.from(sharedClients.values()).map((client) =>
    client.logout().catch(() => client.close())
  );
  sharedClients.clear();
  await Promise.allSettled(closing);
}

const globalForShutdown = globalThis as unknown as { __imapShutdownHooked?: boolean };
if (!globalForShutdown.__imapShutdownHooked) {
  globalForShutdown.__imapShutdownHooked = true;
  const shutdown = () => void closeAllImapClients();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

/** Run work against the shared connection for the currently active account. */
export async function withImap<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = await getSharedClient();
  return fn(client);
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
