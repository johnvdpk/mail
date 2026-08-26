import { requireAuth } from "@/lib/auth/auth";
import { addTicketComment, getTicket } from "@/lib/tickets/tickets";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
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
    const body = (await request.json()) as { body?: string };
    const text = body.body?.trim();
    if (!text) {
      return NextResponse.json({ error: "Reactie mag niet leeg zijn" }, { status: 400 });
    }

    const ticket = await getTicket(ticketId);
    if (!ticket) return NextResponse.json({ error: "Ticket niet gevonden" }, { status: 404 });

    const comment = await addTicketComment(ticketId, text);
    return NextResponse.json({ comment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reactie plaatsen mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
