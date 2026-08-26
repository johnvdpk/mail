import { requireAuth } from "@/lib/auth/auth";
import { createCategory, listCategories } from "@/lib/projects/categories";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseDirection(raw: string | null): "income" | "expense" | null | undefined {
  if (raw === null) return null;
  return raw === "income" || raw === "expense" ? raw : undefined;
}

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const direction = parseDirection(url.searchParams.get("direction"));
    if (direction === undefined) {
      return NextResponse.json({ error: "direction ongeldig" }, { status: 400 });
    }
    const categories = await listCategories(direction ?? undefined);
    return NextResponse.json({ categories });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Categorieën ophalen mislukt";
    logger.error({ route: "projects/categories", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) {
      return NextResponse.json({ error: "name verplicht" }, { status: 400 });
    }
    if (body.direction !== "income" && body.direction !== "expense") {
      return NextResponse.json({ error: "direction ongeldig" }, { status: 400 });
    }
    const category = await createCategory(name, body.direction);
    return NextResponse.json({ category });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Categorie aanmaken mislukt";
    logger.error({ route: "projects/categories", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
