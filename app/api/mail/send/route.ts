import { requireAuth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";
import { isSmtpConfigured } from "@/lib/mail/mail";
import { validateOutgoingRecipients } from "@/lib/shared/email-validation";
import { parseMailForm } from "@/lib/mail/parse-mail-form";
import { sendNewMail } from "@/lib/mail/send-service";
import { logger } from "@/lib/shared/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    if (!isSmtpConfigured()) {
      return NextResponse.json(
        { error: "SMTP niet geconfigureerd. Zet .env.local in de projectroot." },
        { status: 503 }
      );
    }

    const { to, subject, text, cc, bcc, attachments } = await parseMailForm(request);

    const recipientError = validateOutgoingRecipients({ to, cc, bcc });
    if (recipientError) {
      return NextResponse.json({ error: recipientError }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: "Onderwerp verplicht" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Tekst verplicht" }, { status: 400 });
    }

    const result = await sendNewMail({ to, subject, text, cc, bcc, attachments });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Versturen mislukt";
    const status = message.includes("te groot") ? 413 : 500;
    logger.error({ route: "mail/send", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status });
  }
}
