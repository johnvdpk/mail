import { normalizeMessageId, normalizeSubject } from "../shared/normalize";
import type { MailAddress, MessageSummary, Thread } from "../shared/types";

/**
 * Group messages into threads using References/In-Reply-To, falling back to a
 * normalized subject so clients that drop those headers still group correctly.
 */
export function buildThreads(
  messages: MessageSummary[],
  ownEmails: Set<string> = new Set()
): Thread[] {
  const parent = new Map<string, string>();

  function find(key: string): string {
    let root = key;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    parent.set(key, root);
    return root;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  }

  for (const message of messages) {
    const keys = messageKeys(message, ownEmails);
    for (const key of keys) {
      if (!parent.has(key)) parent.set(key, key);
    }
    for (let i = 1; i < keys.length; i += 1) union(keys[0], keys[i]);
  }

  const groups = new Map<string, MessageSummary[]>();
  for (const message of messages) {
    const root = find(messageKeys(message, ownEmails)[0]);
    const group = groups.get(root) ?? [];
    group.push(message);
    groups.set(root, group);
  }

  const threads: Thread[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const newest = sorted[sorted.length - 1];

    threads.push({
      id: threadIdFor(sorted),
      subject: newest.subject || "(geen onderwerp)",
      participants: collectParticipants(sorted),
      folders: [...new Set(sorted.map((m) => m.folder))],
      lastDate: newest.date,
      unread: sorted.some((m) => !m.seen),
      flagged: sorted.some((m) => m.flagged),
      hasAttachments: sorted.some((m) => m.hasAttachments),
      snippet: newest.snippet,
      messageCount: sorted.length,
      messageIds: sorted.map((m) => m.id),
    });
  }

  return threads.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

/** Deterministic id so a thread keeps its identity between syncs. */
function threadIdFor(sortedGroup: MessageSummary[]): string {
  const withId = sortedGroup.find((m) => m.messageId);
  if (withId?.messageId) return normalizeMessageId(withId.messageId);

  const subject = normalizeSubject(sortedGroup[0].subject);
  return subject ? `subject:${subject}` : sortedGroup[0].id;
}

function messageKeys(message: MessageSummary, ownEmails: Set<string>): string[] {
  const keys: string[] = [];
  if (message.messageId) keys.push(`id:${normalizeMessageId(message.messageId)}`);
  if (message.inReplyTo) keys.push(`id:${normalizeMessageId(message.inReplyTo)}`);
  for (const ref of message.references) keys.push(`id:${normalizeMessageId(ref)}`);

  // Scoped by counterpart so unrelated mail with the same subject stays separate.
  const subject = normalizeSubject(message.subject);
  if (subject) keys.push(`subject:${subject}|${counterpartEmail(message, ownEmails)}`);

  if (keys.length === 0) keys.push(`msg:${message.id}`);
  return keys;
}

function counterpartEmail(message: MessageSummary, ownEmails: Set<string>): string {
  if (message.from && !ownEmails.has(message.from.email)) return message.from.email;

  const recipient = message.to.find((address) => !ownEmails.has(address.email));
  return recipient?.email ?? message.from?.email ?? "";
}

function collectParticipants(messages: MessageSummary[]): MailAddress[] {
  const byEmail = new Map<string, MailAddress>();
  for (const message of messages) {
    for (const address of [message.from, ...message.to, ...message.cc]) {
      if (!address?.email) continue;
      const key = address.email.toLowerCase();
      const existing = byEmail.get(key);
      if (!existing || (!existing.name && address.name)) {
        byEmail.set(key, address);
      }
    }
  }
  return [...byEmail.values()];
}
