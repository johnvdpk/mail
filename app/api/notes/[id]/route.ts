import { requireAuth } from "@/lib/auth";
import { deleteNote, getNote, updateNote } from "@/lib/notes";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseId(id: string): number | null {
  const noteId = Number(id);
  return Number.isInteger(noteId) ? noteId : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const noteId = parseId(id);
  if (noteId === null) {
    return NextResponse.json({ error: "Ongeldig notitie id" }, { status: 400 });
  }

  try {
    const note = await getNote(noteId);
    if (!note) return NextResponse.json({ error: "Notitie niet gevonden" }, { status: 404 });
    return NextResponse.json({ note });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notitie ophalen mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const noteId = parseId(id);
  if (noteId === null) {
    return NextResponse.json({ error: "Ongeldig notitie id" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { title?: string; body?: string };
    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: "title verplicht" }, { status: 400 });
    }

    const note = await updateNote(noteId, title, body.body?.trim() ?? "");
    if (!note) return NextResponse.json({ error: "Notitie niet gevonden" }, { status: 404 });
    return NextResponse.json({ note });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notitie bijwerken mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const noteId = parseId(id);
  if (noteId === null) {
    return NextResponse.json({ error: "Ongeldig notitie id" }, { status: 400 });
  }

  try {
    const deleted = await deleteNote(noteId);
    if (!deleted) return NextResponse.json({ error: "Notitie niet gevonden" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notitie verwijderen mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
