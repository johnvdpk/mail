import { requireAuth } from "@/lib/auth/auth";
import { deleteCategory, renameCategory } from "@/lib/projects/categories";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) {
    return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) return NextResponse.json({ error: "name verplicht" }, { status: 400 });

    const result = await renameCategory(categoryId, name);
    if (result === "missing") return NextResponse.json({ error: "Categorie niet gevonden" }, { status: 404 });
    if (result === "duplicate") {
      return NextResponse.json({ error: "Er bestaat al een categorie met deze naam" }, { status: 400 });
    }
    return NextResponse.json({ category: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Categorie hernoemen mislukt";
    logger.error({ route: "projects/categories/[id]", method: "PATCH", err }, message);
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
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) {
    return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  }

  try {
    const deleted = await deleteCategory(categoryId);
    if (!deleted) return NextResponse.json({ error: "Categorie niet gevonden" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Categorie verwijderen mislukt";
    logger.error({ route: "projects/categories/[id]", method: "DELETE", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
