import { requireAuth } from "@/lib/auth";
import { getTicket } from "@/lib/tickets";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId)) {
    return NextResponse.json({ error: "Ongeldig ticket id" }, { status: 400 });
  }

  try {
    const ticket = await getTicket(ticketId);
    if (!ticket) return NextResponse.json({ error: "Ticket niet gevonden" }, { status: 404 });
    return NextResponse.json({ ticket });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ticket ophalen mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
