import { getFolderByRole } from "./folders";
import { withImap, withMailbox } from "./imap";
import { sendMail, type OutgoingMail } from "./mail";
import { forwardSubject, normalizeMessageId, replySubject } from "./normalize";
import { counterpartOf, getThreadDetail } from "./mailbox-service";
import type { OutgoingAttachment } from "./outgoing-attachments";
import { syncFolder } from "./sync";
import type { ThreadDetail, ThreadMessage } from "./types";

/** Store our own copy in the Sent folder so it is not lost after sending. */
async function appendToSent(raw: Buffer): Promise<void> {
  const sent = await getFolderByRole("sent");
  if (!sent) return;

  await withImap(async (client) => {
    await client.append(sent.path, raw, ["\\Seen"]);
  });
  await syncFolder(sent.path);
}

async function markAnswered(detail: ThreadDetail): Promise<void> {
  const byFolder = new Map<string, number[]>();
  for (const message of detail.messages) {
    if (message.outbound || message.answered) continue;
    const uids = byFolder.get(message.folder) ?? [];
    uids.push(message.uid);
    byFolder.set(message.folder, uids);
  }

  for (const [folder, uids] of byFolder) {
    await withMailbox(folder, async (client) => {
      await client.messageFlagsAdd(uids, ["\\Answered"], { uid: true });
    });
    await syncFolder(folder);
  }
}

export type SendResult = {
  messageId: string;
  to: string;
  subject: string;
};

export async function sendNewMail(input: {
  to: string;
  subject: string;
  text: string;
  attachments?: OutgoingAttachment[];
}): Promise<SendResult> {
  const { messageId, raw } = await sendMail(input);
  await appendToSent(raw);
  return { messageId, to: input.to, subject: input.subject };
}

function threadingHeaders(detail: ThreadDetail): Pick<OutgoingMail, "inReplyTo" | "references"> {
  return buildThreadingHeaders(detail);
}

/** Build In-Reply-To / References headers from a thread (pure, testable). */
export function buildThreadingHeaders(
  detail: ThreadDetail
): Pick<OutgoingMail, "inReplyTo" | "references"> {
  const references: string[] = [];
  const seen = new Set<string>();

  for (const message of detail.messages) {
    if (!message.messageId) continue;
    const key = normalizeMessageId(message.messageId);
    if (seen.has(key)) continue;
    seen.add(key);
    references.push(message.messageId);
  }

  const last = [...detail.messages].reverse().find((m) => m.messageId);
  return {
    inReplyTo: last?.messageId,
    references: references.length ? references : undefined,
  };
}

type ForwardMessageInput = Pick<
  ThreadMessage,
  "from" | "date" | "subject" | "to" | "body" | "snippet"
>;

/** Build the forwarded message block appended to a forward (pure, testable). */
export function buildForwardedBody(messages: ForwardMessageInput[]): string {
  return messages
    .map((m) => {
      const from = m.from ? `${m.from.name || ""} <${m.from.email}>`.trim() : "onbekend";
      const date = new Date(m.date).toLocaleString("nl-NL");
      const body = m.body?.text ?? m.snippet;
      return `---------- Doorgestuurd bericht ----------\nVan: ${from}\nDatum: ${date}\nOnderwerp: ${m.subject}\nAan: ${m.to.map((t) => t.email).join(", ")}\n\n${body}`;
    })
    .join("\n\n");
}

export async function sendThreadReply(input: {
  threadId: string;
  text: string;
  cc?: string;
  bcc?: string;
  attachments?: OutgoingAttachment[];
}): Promise<SendResult> {
  const detail = await getThreadDetail(input.threadId);
  if (!detail) throw new Error("Conversatie niet gevonden");

  const counterpart = counterpartOf(detail);
  if (!counterpart?.email) throw new Error("Geen ontvanger gevonden in deze conversatie");

  const last = detail.messages[detail.messages.length - 1];
  const subject = replySubject(last?.subject ?? detail.thread.subject);

  const { messageId, raw } = await sendMail({
    to: counterpart.email,
    subject,
    text: input.text,
    cc: input.cc || undefined,
    bcc: input.bcc || undefined,
    attachments: input.attachments,
    ...threadingHeaders(detail),
  });

  await appendToSent(raw);
  await markAnswered(detail);

  return { messageId, to: counterpart.email, subject };
}

export async function forwardThread(input: {
  threadId: string;
  to: string;
  text: string;
  cc?: string;
  bcc?: string;
  attachments?: OutgoingAttachment[];
}): Promise<SendResult> {
  const detail = await getThreadDetail(input.threadId);
  if (!detail) throw new Error("Conversatie niet gevonden");

  const last = detail.messages[detail.messages.length - 1];
  const subject = forwardSubject(last?.subject ?? detail.thread.subject);

  const forwardedBody = buildForwardedBody(detail.messages);

  const fullText = input.text ? `${input.text}\n\n${forwardedBody}` : forwardedBody;

  const { messageId, raw } = await sendMail({
    to: input.to,
    subject,
    text: fullText,
    cc: input.cc || undefined,
    bcc: input.bcc || undefined,
    attachments: input.attachments,
  });

  await appendToSent(raw);
  return { messageId, to: input.to, subject };
}
