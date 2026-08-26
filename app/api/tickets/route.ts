import { requireAuth } from "@/lib/auth/auth";
import { createTicket, listTickets } from "@/lib/tickets/tickets";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const tickets = await listTickets();
    return NextResponse.json({ tickets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tickets ophalen mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as { title?: string; description?: string };
    const title = body.title?.trim();
    const description = body.description?.trim();
    if (!title || !description) {
      return NextResponse.json({ error: "title en description verplicht" }, { status: 400 });
    }

    const ticket = await createTicket(title, description);
    return NextResponse.json({ ticket });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ticket aanmaken mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
