import { requireAuth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";
import { createGoogleEvent, getGoogleStatus, isGoogleConfigured } from "@/lib/calendar/google-calendar";
import { loadBody } from "@/lib/mail/sync";
import type { CalendarInvite } from "@/lib/calendar/ics";
import { logger } from "@/lib/shared/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: "Google Calendar niet geconfigureerd" }, { status: 503 });
  }

  const status = await getGoogleStatus();
  if (!status.connected) {
    return NextResponse.json(
      { error: "Google Agenda niet gekoppeld — koppel eerst in Instellingen" },
      { status: 400 }
    );
  }

  try {
    const body = (await request.json()) as {
      folder?: string;
      uid?: number;
      invite?: CalendarInvite;
    };

    let invite = body.invite;

    if (!invite && body.folder && typeof body.uid === "number") {
      const loaded = await loadBody(body.folder, body.uid, { refresh: true });
      invite = loaded.calendarInvite;
    }

    if (!invite?.summary || !invite.start) {
      return NextResponse.json({ error: "Geen geldige agenda-uitnodiging gevonden" }, { status: 400 });
    }

    const result = await createGoogleEvent(invite);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Toevoegen mislukt";
    logger.error({ route: "calendar/add", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
