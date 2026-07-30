import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isSmtpConfigured } from "@/lib/mail";
import { getFolderView, resolveFolderPath } from "@/lib/mailbox-service";
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

    const body = (await request.json()) as {
      threadId?: string;
      folder?: string;
      text?: string;
      cc?: string;
      bcc?: string;
    };

    const threadId = body.threadId?.trim();
    const text = body.text?.trim() ?? "";

    if (!threadId) {
      return NextResponse.json({ error: "threadId verplicht" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Tekst verplicht" }, { status: 400 });
    }

    const result = await sendThreadReply({
      threadId,
      text,
      cc: body.cc?.trim() || undefined,
      bcc: body.bcc?.trim() || undefined,
    });
    const folder = await resolveFolderPath(body.folder);
    const view = await getFolderView(folder);

    return NextResponse.json({ ok: true, ...result, ...view });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reply versturen mislukt";
    console.error("[mail/reply]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
