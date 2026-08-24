import { requireAuth } from "@/lib/auth/auth";
import { listContacts, updateContact } from "@/lib/mail/mail-search";
import type { ContactStatus } from "@/lib/shared/search-types";
import { NextResponse } from "next/server";
import { logger } from "@/lib/shared/logger";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ContactStatus[] = ["nieuw", "benaderd", "geen_interesse", "klant"];

function parseStatusFilter(raw: string | null): ContactStatus | undefined {
  if (!raw || raw === "all") return undefined;
  return (VALID_STATUSES as string[]).includes(raw) ? (raw as ContactStatus) : undefined;
}

/** List persistent contacts from the customer search, optionally filtered by status (?status=). */
export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const status = parseStatusFilter(searchParams.get("status"));
    const contacts = await listContacts(status);
    return NextResponse.json({ contacts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Contacten ophalen mislukt";
    logger.error({ route: "ai/contacts", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Update a contact's status and/or note (?id=). */
export async function PATCH(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const idRaw = new URL(request.url).searchParams.get("id");
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
    }

    const body = (await request.json()) as { status?: string; note?: string | null };

    if (body.status !== undefined && !VALID_STATUSES.includes(body.status as ContactStatus)) {
      return NextResponse.json({ error: "Ongeldige status" }, { status: 400 });
    }

    const contact = await updateContact(id, {
      status: body.status as ContactStatus | undefined,
      note: body.note,
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact niet gevonden" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, contact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bijwerken mislukt";
    logger.error({ route: "ai/contacts", method: "PATCH", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
