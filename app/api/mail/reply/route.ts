import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isSmtpConfigured } from "@/lib/mail";
import { getFolderView, resolveFolderPath } from "@/lib/mailbox-service";
import { validateOutgoingRecipients } from "@/lib/email-validation";
import { parseMailForm } from "@/lib/parse-mail-form";
import { sendThreadReply } from "@/lib/send-service";

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

    const { threadId, folder, text, cc, bcc, attachments } = await parseMailForm(request);

    if (!threadId) {
      return NextResponse.json({ error: "threadId verplicht" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Tekst verplicht" }, { status: 400 });
    }

    const recipientError = validateOutgoingRecipients({ cc, bcc }, { requireTo: false });
    if (recipientError) {
      return NextResponse.json({ error: recipientError }, { status: 400 });
    }

    const result = await sendThreadReply({
      threadId,
      text,
      cc,
      bcc,
      attachments,
    });
    const resolvedFolder = await resolveFolderPath(folder);
    const view = await getFolderView(resolvedFolder);

    return NextResponse.json({ ok: true, ...result, ...view });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reply versturen mislukt";
    const status = message.includes("te groot") ? 413 : 500;
    console.error("[mail/reply]", message, err);
    return NextResponse.json({ error: message }, { status });
  }
}
