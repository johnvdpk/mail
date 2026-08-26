import { simpleParser, type ParsedMail } from "mailparser";
import type { FetchMessageObject, MessageStructureObject } from "imapflow";
import { isImapConfigured, withMailbox } from "./imap";
import { isCalendarAttachment, parseIcs } from "../calendar/ics";
import { normalizeEmail, parseMessageIdList } from "../shared/normalize";
import {
  mergeSummaries,
  readBody,
  readFolderCache,
  writeBody,
  writeFolderCache,
} from "../shared/store";
import type { Attachment, MailAddress, MessageBody, MessageSummary } from "../shared/types";

/** Enough of the message to get headers plus a preview, without pulling attachments. */
const HEADER_FETCH_BYTES = 16 * 1024;
const FIRST_SYNC_LOOKBACK_DAYS = 90;
const SNIPPET_LENGTH = 180;

export type SyncResult = {
  folder: string;
  added: number;
  updated: number;
  removed: number;
  resynced: boolean;
  syncedAt: string;
};

/**
 * Sync messages from an IMAP folder to the local cache.
 * Handles UIDVALIDITY changes by resyncing when needed.
 * Incremental syncs only fetch new UIDs, reducing bandwidth.
 *
 * @param folderPath IMAP folder path (e.g., "INBOX", "INBOX/Archive")
 * @returns Sync result with counts of added/updated/removed messages
 * @throws Error if IMAP not configured
 */
export async function syncFolder(folderPath: string): Promise<SyncResult> {
  if (!isImapConfigured()) {
    throw new Error("IMAP niet geconfigureerd — vul IMAP_ of SMTP_ credentials in .env.local");
  }

  let cache = await readFolderCache(folderPath);

  return withMailbox(folderPath, async (client) => {
    const mailbox = client.mailbox;
    const uidValidity =
      mailbox && typeof mailbox !== "boolean" ? String(mailbox.uidValidity) : undefined;

    // A changed UIDVALIDITY invalidates every cached UID for this folder.
    const resynced = Boolean(
      uidValidity && cache.uidValidity && cache.uidValidity !== uidValidity
    );
    if (resynced) {
      cache = { path: folderPath, uidValidity, lastUid: 0, messages: [] };
    }

    const newSummaries = await fetchNewSummaries(client, folderPath, cache.lastUid);
    const { removed, refreshed } = await refreshKnownFlags(client, cache.messages);

    const messages = mergeSummaries(
      cache.messages.filter((m) => !removed.includes(m.id)),
      [...refreshed, ...newSummaries]
    );

    const highestUid = messages.reduce((max, m) => (m.uid > max ? m.uid : max), 0);
    const syncedAt = new Date().toISOString();

    await writeFolderCache({
      path: folderPath,
      uidValidity: uidValidity ?? cache.uidValidity,
      lastUid: Math.max(highestUid, cache.lastUid),
      syncedAt,
      messages,
    });

    // Best-effort embeddings for new mail (subject/snippet); body enrich later.
    if (newSummaries.length > 0) {
      void import("../ai/embeddings")
        .then(({ ensureEmbeddingsForMessageIds }) =>
          ensureEmbeddingsForMessageIds(
            newSummaries.map((m) => m.id),
            { limit: 30 }
          )
        )
        .catch((err) => console.error("[sync] embeddings", err));
    }

    return {
      folder: folderPath,
      added: newSummaries.length,
      updated: refreshed.length,
      removed: removed.length,
      resynced,
      syncedAt,
    };
  });
}

async function fetchNewSummaries(
  client: Parameters<Parameters<typeof withMailbox>[1]>[0],
  folderPath: string,
  lastUid: number
): Promise<MessageSummary[]> {
  let range: string;
  if (lastUid > 0) {
    range = `${lastUid + 1}:*`;
  } else {
    const since = new Date();
    since.setDate(since.getDate() - FIRST_SYNC_LOOKBACK_DAYS);
    const uids = await client.search({ since }, { uid: true });
    const list = Array.isArray(uids) ? uids : [];
    if (list.length === 0) return [];
    range = list.join(",");
  }

  const summaries: MessageSummary[] = [];

  for await (const message of client.fetch(
    range,
    {
      uid: true,
      flags: true,
      envelope: true,
      bodyStructure: true,
      source: { maxLength: HEADER_FETCH_BYTES },
    },
    { uid: true }
  )) {
    // An open-ended range always returns at least the last message, even when it is known.
    if (lastUid > 0 && message.uid <= lastUid) continue;
    summaries.push(await toSummary(folderPath, message));
  }

  return summaries;
}

/** Pick up flag changes and disappeared messages for what we already cached. */
async function refreshKnownFlags(
  client: Parameters<Parameters<typeof withMailbox>[1]>[0],
  known: MessageSummary[]
): Promise<{ removed: string[]; refreshed: MessageSummary[] }> {
  if (known.length === 0) return { removed: [], refreshed: [] };

  const byUid = new Map(known.map((m) => [m.uid, m]));
  const uids = [...byUid.keys()].sort((a, b) => a - b);
  const seenUids = new Set<number>();
  const refreshed: MessageSummary[] = [];

  for await (const message of client.fetch(uids, { uid: true, flags: true }, { uid: true })) {
    seenUids.add(message.uid);
    const cached = byUid.get(message.uid);
    if (!cached) continue;

    const flags = readFlags(message.flags);
    if (
      flags.seen !== cached.seen ||
      flags.flagged !== cached.flagged ||
      flags.answered !== cached.answered
    ) {
      refreshed.push({ ...cached, ...flags });
    }
  }

  const removed = known.filter((m) => !seenUids.has(m.uid)).map((m) => m.id);
  return { removed, refreshed };
}

function readFlags(flags?: Set<string>) {
  return {
    seen: flags?.has("\\Seen") ?? false,
    flagged: flags?.has("\\Flagged") ?? false,
    answered: flags?.has("\\Answered") ?? false,
    draft: flags?.has("\\Draft") ?? false,
  };
}

export function messageIdFor(folderPath: string, uid: number): string {
  return `${folderPath}#${uid}`;
}

async function toSummary(
  folderPath: string,
  message: FetchMessageObject
): Promise<MessageSummary> {
  const envelope = message.envelope ?? {};
  let parsed: ParsedMail | null = null;

  if (message.source) {
    try {
      parsed = await simpleParser(message.source);
    } catch {
      parsed = null;
    }
  }

  const references = parseMessageIdList(
    (parsed?.references as string | string[] | undefined) ?? undefined
  );

  const date =
    envelope.date instanceof Date && !Number.isNaN(envelope.date.getTime())
      ? envelope.date.toISOString()
      : (parsed?.date ?? new Date()).toISOString();

  return {
    id: messageIdFor(folderPath, message.uid),
    folder: folderPath,
    uid: message.uid,
    messageId: envelope.messageId ?? parsed?.messageId ?? undefined,
    inReplyTo: envelope.inReplyTo ?? undefined,
    references,
    from: toAddress(envelope.from?.[0]) ?? firstParsedAddress(parsed?.from),
    to: (envelope.to ?? []).map(toAddress).filter(isAddress),
    cc: (envelope.cc ?? []).map(toAddress).filter(isAddress),
    subject: envelope.subject?.trim() || parsed?.subject?.trim() || "(geen onderwerp)",
    snippet: buildSnippet(parsed),
    date,
    ...readFlags(message.flags),
    hasAttachments: hasAttachments(message.bodyStructure),
  };
}

function toAddress(value?: { name?: string; address?: string }): MailAddress | undefined {
  if (!value?.address) return undefined;
  return {
    email: normalizeEmail(value.address),
    name: value.name?.trim() || undefined,
  };
}

function isAddress(value: MailAddress | undefined): value is MailAddress {
  return Boolean(value);
}

function firstParsedAddress(from: ParsedMail["from"]): MailAddress | undefined {
  const entry = from?.value?.[0];
  if (!entry?.address) return undefined;
  return { email: normalizeEmail(entry.address), name: entry.name?.trim() || undefined };
}

function buildSnippet(parsed: ParsedMail | null): string {
  const raw = textFromParsed(parsed);
  if (!raw) return "";

  const withoutQuotes = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join(" ");

  return withoutQuotes.replace(/\s+/g, " ").trim().slice(0, SNIPPET_LENGTH);
}

function textFromParsed(parsed: ParsedMail | null): string {
  if (!parsed) return "";
  if (typeof parsed.text === "string" && parsed.text.trim()) return parsed.text.trim();
  if (typeof parsed.html === "string" && parsed.html.trim()) return htmlToText(parsed.html);
  return "";
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasAttachments(node?: MessageStructureObject): boolean {
  if (!node) return false;
  if (node.disposition === "attachment") return true;

  const children = node.childNodes ?? [];
  return children.some((child) => hasAttachments(child));
}

/** Load a full message body, fetching it from IMAP the first time. */
export async function loadBody(
  folderPath: string,
  uid: number,
  options?: { refresh?: boolean }
): Promise<MessageBody> {
  const id = messageIdFor(folderPath, uid);

  if (!options?.refresh) {
    const cached = await readBody(id);
    if (cached) {
      const needsInvite =
        !cached.calendarInvite &&
        cached.attachments.some((a) => isCalendarAttachment(a.contentType, a.filename));
      if (!needsInvite) return cached;
    }
  }

  const body = await withMailbox(folderPath, async (client) => {
    const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!message || typeof message === "boolean" || !message.source) {
      throw new Error("Bericht niet gevonden op de server");
    }

    const parsed = await simpleParser(message.source);
    const attachments: Attachment[] = (parsed.attachments ?? []).map((item) => ({
      filename: item.filename ?? "bijlage",
      contentType: item.contentType ?? "application/octet-stream",
      size: item.size ?? 0,
    }));

    let calendarInvite;
    for (const item of parsed.attachments ?? []) {
      const filename = item.filename ?? "bijlage";
      const contentType = item.contentType ?? "application/octet-stream";
      if (!isCalendarAttachment(contentType, filename)) continue;
      const raw = item.content?.toString("utf8") ?? "";
      calendarInvite = parseIcs(raw) ?? undefined;
      if (calendarInvite) break;
    }

    return {
      id,
      text: textFromParsed(parsed),
      html: typeof parsed.html === "string" ? parsed.html : undefined,
      attachments,
      calendarInvite,
      loadedAt: new Date().toISOString(),
    } satisfies MessageBody;
  });

  await writeBody(body);
  return body;
}

export type FetchedAttachment = {
  data: Buffer;
  contentType: string;
  filename: string;
};

export async function fetchAttachment(
  folderPath: string,
  uid: number,
  filename: string
): Promise<FetchedAttachment | null> {
  const all = await fetchAllAttachments(folderPath, uid);
  return all.find((a) => a.filename === filename) ?? null;
}

export async function fetchAllAttachments(
  folderPath: string,
  uid: number
): Promise<FetchedAttachment[]> {
  return withMailbox(folderPath, async (client) => {
    const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!message || typeof message === "boolean" || !message.source) return [];

    const parsed = await simpleParser(message.source);
    return (parsed.attachments ?? []).map((item) => ({
      data: item.content,
      contentType: item.contentType ?? "application/octet-stream",
      filename: item.filename ?? "bijlage",
    }));
  });
}
