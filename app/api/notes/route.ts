import { requireAuth } from "@/lib/auth/auth";
import { createNote, listNotes } from "@/lib/notes/notes";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const notes = await listNotes();
    return NextResponse.json({ notes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notities ophalen mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as { title?: string; body?: string };
    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: "title verplicht" }, { status: 400 });
    }

    const note = await createNote(title, body.body?.trim() ?? "");
    return NextResponse.json({ note });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notitie aanmaken mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
