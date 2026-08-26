import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { readEmailConfig } from "../config/email-config";
import {
  appendSignatureToHtml,
  buildMailHtml,
  ensureSignature,
  type MailFormatting,
} from "../shared/email-template";
import { parseEmailList } from "../shared/email-validation";
import { env, loadEnvFromFile } from "../config/env";
import { activeAccountEnv, currentMailAccount } from "../config/mail-accounts";
import type { OutgoingAttachment } from "./outgoing-attachments";

export function isSmtpConfigured(): boolean {
  loadEnvFromFile();
  return Boolean(
    activeAccountEnv("SMTP_HOST") &&
      activeAccountEnv("SMTP_USER") &&
      activeAccountEnv("SMTP_PASS") &&
      activeAccountEnv("SMTP_FROM")
  );
}

function getTransporter() {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP niet geconfigureerd — vul .env.local in (projectroot)");
  }

  const port = Number(activeAccountEnv("SMTP_PORT") ?? 465);
  const secure = activeAccountEnv("SMTP_SECURE") === "true" || port === 465;

  return nodemailer.createTransport({
    host: activeAccountEnv("SMTP_HOST"),
    port,
    secure,
    auth: {
      user: activeAccountEnv("SMTP_USER"),
      pass: activeAccountEnv("SMTP_PASS"),
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
  /** Optional pre-built HTML. Signature is still appended. */
  html?: string;
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

function buildMessage(input: OutgoingMail, formatting: MailFormatting): Mail.Options {
  const fromName = activeAccountEnv("SMTP_FROM_NAME") ?? env("SMTP_FROM_NAME") ?? "John van der Pouw Kraan";
  const from = activeAccountEnv("SMTP_FROM") ?? currentMailAccount().email;

  return {
    from: `"${fromName}" <${from}>`,
    to: input.to,
    ...(input.cc ? { cc: input.cc } : {}),
    ...(input.bcc ? { bcc: input.bcc } : {}),
    replyTo: from,
    subject: input.subject,
    text: ensureSignature(input.text, formatting),
    html: input.html
      ? appendSignatureToHtml(input.html, formatting)
      : buildMailHtml(input.text, formatting),
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
  const from = activeAccountEnv("SMTP_FROM") ?? currentMailAccount().email;
  const config = await readEmailConfig();
  const message = buildMessage(input, {
    fontFamily: config.formatting.fontFamily,
    fontSize: config.formatting.fontSize,
    signatureText: config.signature.text,
  });
  const { raw, messageId } = await composeRaw(message);

  await getTransporter().sendMail({
    raw,
    envelope: {
      from,
      to: [
        ...parseEmailList(input.to),
        ...parseEmailList(input.cc ?? ""),
        ...parseEmailList(input.bcc ?? ""),
        ...envelopeBcc(),
      ],
    },
  });

  return { messageId, raw };
}
