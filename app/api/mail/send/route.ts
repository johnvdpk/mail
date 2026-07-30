import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isSmtpConfigured } from "@/lib/mail";
import { sendNewMail } from "@/lib/send-service";

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
      to?: string;
      subject?: string;
      text?: string;
    };

    const to = body.to?.trim() ?? "";
    const subject = body.subject?.trim() ?? "";
    const text = body.text?.trim() ?? "";

    if (!to.includes("@")) {
      return NextResponse.json({ error: "Geldig e-mailadres verplicht" }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: "Onderwerp verplicht" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Tekst verplicht" }, { status: 400 });
    }

    const result = await sendNewMail({ to, subject, text });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Versturen mislukt";
    console.error("[mail/send]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
