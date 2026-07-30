import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { buildMailHtml, ensureSignature } from "./email-template";
import { env, loadEnvFromFile } from "./env";
import type { OutgoingAttachment } from "./outgoing-attachments";

export function isSmtpConfigured(): boolean {
  loadEnvFromFile();
  return Boolean(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS") && env("SMTP_FROM"));
}

function getTransporter() {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP niet geconfigureerd — vul .env.local in (projectroot)");
  }

  const port = Number(env("SMTP_PORT") ?? 465);
  const secure = env("SMTP_SECURE") === "true" || port === 465;

  return nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port,
    secure,
    auth: {
      user: env("SMTP_USER"),
      pass: env("SMTP_PASS"),
    },
    authMethod: "LOGIN",
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
    ...(port === 587 && !secure ? { requireTLS: true } : {}),
  });
}

/**
 * Extra envelope-only recipients. Kept out of the headers so recipients never
 * see them, and no longer needed as a "sent copy" now that we append to Sent.
 */
function envelopeBcc(): string[] {
  const explicit = env("SMTP_BCC");
  if (!explicit || explicit === "false" || explicit === "0") return [];
  return explicit
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function formatMessageId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
}

export async function verifySmtpConnection(): Promise<void> {
  await getTransporter().verify();
}

export type OutgoingMail = {
  to: string;
  subject: string;
  /** Body without signature — the signature is appended here */
  text: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: OutgoingAttachment[];
};

export type SentMail = {
  messageId: string;
  /** Exact MIME message that was sent, so it can be appended to Sent */
  raw: Buffer;
};

function buildMessage(input: OutgoingMail): Mail.Options {
  const fromName = env("SMTP_FROM_NAME") ?? "John van der Pouw Kraan";
  const from = env("SMTP_FROM")!;

  return {
    from: `"${fromName}" <${from}>`,
    to: input.to,
    ...(input.cc ? { cc: input.cc } : {}),
    ...(input.bcc ? { bcc: input.bcc } : {}),
    replyTo: from,
    subject: input.subject,
    text: ensureSignature(input.text),
    html: buildMailHtml(input.text),
    ...(input.inReplyTo ? { inReplyTo: formatMessageId(input.inReplyTo) } : {}),
    ...(input.references?.length
      ? { references: input.references.map(formatMessageId).join(" ") }
      : {}),
    ...(input.attachments?.length
      ? {
          attachments: input.attachments.map((file) => ({
            filename: file.filename,
            content: file.content,
            contentType: file.contentType,
          })),
        }
      : {}),
  };
}

/** Compose the MIME message once so the sent copy is byte-identical. */
async function composeRaw(message: Mail.Options): Promise<{ raw: Buffer; messageId: string }> {
  const composer = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "windows",
  });

  const info = await composer.sendMail(message);
  const raw = Buffer.isBuffer(info.message) ? info.message : Buffer.from(String(info.message));
  return { raw, messageId: info.messageId ?? "" };
}

export async function sendMail(input: OutgoingMail): Promise<SentMail> {
  const from = env("SMTP_FROM")!;
  const message = buildMessage(input);
  const { raw, messageId } = await composeRaw(message);

  await getTransporter().sendMail({
    raw,
    envelope: {
      from,
      to: [input.to, ...envelopeBcc()],
    },
  });

  return { messageId, raw };
}
