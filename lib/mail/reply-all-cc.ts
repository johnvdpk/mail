import type { MailAddress, ThreadDetail } from "@/lib/shared/types";

function replyToEmail(detail: ThreadDetail, account: string): string | undefined {
  const mine = account.toLowerCase();
  const inbound = [...detail.messages].reverse().find((m) => !m.outbound);
  if (inbound?.from?.email) return inbound.from.email.toLowerCase();
  return detail.thread.participants.find((p) => p.email.toLowerCase() !== mine)?.email.toLowerCase();
}

function collect(addrs: MailAddress[] | undefined, into: MailAddress[]) {
  if (!addrs) return;
  into.push(...addrs);
}

/** Extra CC addresses for reply-all (excludes self and the Reply-To person). */
export function replyAllCc(detail: ThreadDetail, account: string): string {
  const last = detail.messages[detail.messages.length - 1];
  if (!last) return "";

  const mine = account.toLowerCase();
  const toKey = replyToEmail(detail, account);
  const seen = new Set<string>();
  const extras: string[] = [];

  const candidates: MailAddress[] = [];
  if (last.from) candidates.push(last.from);
  collect(last.to, candidates);
  collect(last.cc, candidates);

  for (const addr of candidates) {
    const email = addr.email?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (key === mine || (toKey && key === toKey) || seen.has(key)) continue;
    seen.add(key);
    extras.push(email);
  }

  return extras.join(", ");
}
