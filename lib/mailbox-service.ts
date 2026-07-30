import { query } from "./db";
import { getFolders, getInboxPath } from "./folders";
import { ownAddresses, withMailbox } from "./imap";
import { normalizeEmail } from "./normalize";
import { patchSummary, readAllSummaries, readFolderCache } from "./store";
import { loadBody } from "./sync";
import { buildThreads } from "./threads";
import type {
  FolderSummary,
  MailAddress,
  MessageSummary,
  Thread,
  ThreadDetail,
  ThreadMessage,
} from "./types";

async function getActiveSnoozedIds(): Promise<Set<string>> {
  try {
    const { rows } = await query<{ thread_id: string }>(
      "SELECT thread_id FROM snoozed_threads WHERE wake_at > NOW()"
    );
    return new Set(rows.map((r) => r.thread_id));
  } catch {
    return new Set();
  }
}

/**
 * Resolve a folder path, defaulting to Inbox if not found or null.
 * @param requested Requested folder path (or null/undefined for Inbox)
 * @returns Valid folder path that exists in synced mailbox
 */
export async function resolveFolderPath(requested?: string | null): Promise<string> {
  if (!requested) return getInboxPath();

  const folders = await getFolders();
  return folders.find((f) => f.path === requested)?.path ?? getInboxPath();
}

/**
 * Conversations are threaded across every synced folder, so a reply stored in
 * Sent shows up in the same conversation as the message it answers.
 */
async function getAllThreads(): Promise<{ threads: Thread[]; byId: Map<string, MessageSummary> }> {
  const messages = await readAllSummaries();
  return {
    threads: buildThreads(messages, ownAddresses()),
    byId: new Map(messages.map((m) => [m.id, m])),
  };
}

/**
 * Get all IMAP folders with unread/total counts.
 * Counts reflect messages synced so far (not complete mailbox).
 *
 * @param options Configuration options
 * @param options.refresh Force refresh IMAP folder list (default: use cache)
 * @returns Folder summaries with unread counts
 */
export async function getFolderSummaries(options?: {
  refresh?: boolean;
}): Promise<FolderSummary[]> {
  const folders = await getFolders(options);
  const summaries: FolderSummary[] = [];

  for (const folder of folders) {
    const cache = await readFolderCache(folder.path);
    summaries.push({
      ...folder,
      unread: cache.messages.filter((m) => !m.seen).length,
      total: cache.messages.length,
    });
  }

  return summaries;
}

export type FolderView = {
  folders: FolderSummary[];
  folder: string;
  threads: Thread[];
  syncedAt?: string;
};

/**
 * Get view for a specific folder: folders list, threads, and sync timestamp.
 * Threads are built from messages across all folders to show full conversations.
 *
 * @param requested Requested folder path (defaults to Inbox)
 * @returns Folder view with folder list, active folder, and its threads
 */
export async function getFolderView(requested?: string | null): Promise<FolderView> {
  const folder = await resolveFolderPath(requested);
  const [folders, cache, all, snoozed] = await Promise.all([
    getFolderSummaries(),
    readFolderCache(folder),
    getAllThreads(),
    getActiveSnoozedIds(),
  ]);

  const threads = all.threads.filter((thread) => {
    if (!thread.folders.includes(folder)) return false;
    // Hide actively snoozed conversations from the inbox list
    if (snoozed.has(thread.id) && folders.find((f) => f.path === folder)?.role === "inbox") {
      return false;
    }
    return true;
  });

  return {
    folders,
    folder,
    threads,
    syncedAt: cache.syncedAt,
  };
}

function isOutbound(summary: MessageSummary, mine: Set<string>): boolean {
  return summary.from ? mine.has(normalizeEmail(summary.from.email)) : false;
}

/**
 * Load full thread conversation with all message bodies.
 * Reconstructs complete email thread across all folders.
 *
 * @param threadId Thread ID to load
 * @returns Full thread with message bodies and metadata, or null if not found
 */
export async function getThreadDetail(threadId: string): Promise<ThreadDetail | null> {
  const { threads, byId } = await getAllThreads();
  const thread = threads.find((t) => t.id === threadId);
  if (!thread) return null;

  const mine = ownAddresses();
  const messages: ThreadMessage[] = [];

  for (const id of thread.messageIds) {
    const summary = byId.get(id);
    if (!summary) continue;

    let body;
    try {
      body = await loadBody(summary.folder, summary.uid);
    } catch {
      body = undefined;
    }

    messages.push({ ...summary, body, outbound: isOutbound(summary, mine) });
  }

  return { thread, messages };
}

/**
 * Resolve a local message id (folder#uid) to its conversation thread.
 */
export async function resolveThreadFromMessage(
  messageId: string
): Promise<{ threadId: string; folder: string } | null> {
  const { threads, byId } = await getAllThreads();
  const summary = byId.get(messageId);
  if (!summary) return null;

  const thread = threads.find((t) => t.messageIds.includes(messageId));
  if (!thread) return null;

  return { threadId: thread.id, folder: summary.folder };
}

/** Mark every message in a conversation read or unread, locally and on the server. */
export async function markThreadSeen(threadId: string, seen: boolean): Promise<void> {
  const { threads, byId } = await getAllThreads();
  const thread = threads.find((t) => t.id === threadId);
  if (!thread) return;

  const targets = thread.messageIds
    .map((id) => byId.get(id))
    .filter((m): m is MessageSummary => m !== undefined && m.seen !== seen);

  const byFolder = new Map<string, number[]>();
  for (const target of targets) {
    const uids = byFolder.get(target.folder) ?? [];
    uids.push(target.uid);
    byFolder.set(target.folder, uids);
  }

  for (const [folder, uids] of byFolder) {
    await withMailbox(folder, async (client) => {
      if (seen) await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
      else await client.messageFlagsRemove(uids, ["\\Seen"], { uid: true });
    });
  }

  for (const target of targets) {
    await patchSummary(target.folder, target.id, { seen });
  }
}

/** The person on the other side of the conversation. */
export function counterpartOf(detail: ThreadDetail): MailAddress | undefined {
  const mine = ownAddresses();
  const inbound = [...detail.messages].reverse().find((m) => !m.outbound);
  if (inbound?.from) return inbound.from;

  const other = detail.thread.participants.find((p) => !mine.has(normalizeEmail(p.email)));
  return other ?? detail.thread.participants[0];
}

export type ThreadContext = {
  subject: string;
  counterpart: string;
  counterpartName?: string;
  messages: Array<{
    outbound: boolean;
    from: string;
    subject: string;
    bodyText: string;
    at: string;
  }>;
};

/**
 * Convert thread detail to AI-friendly context format.
 * Extracts messages, counterpart info, and subject for AI processing.
 *
 * @param detail Full thread detail with messages
 * @returns Simplified thread context for AI analysis
 */
export function toThreadContext(detail: ThreadDetail): ThreadContext {
  const counterpart = counterpartOf(detail);

  return {
    subject: detail.thread.subject,
    counterpart: counterpart?.email ?? "",
    counterpartName: counterpart?.name,
    messages: detail.messages.map((message) => ({
      outbound: message.outbound,
      from: message.from?.email ?? "",
      subject: message.subject,
      bodyText: message.body?.text ?? message.snippet,
      at: message.date,
    })),
  };
}
