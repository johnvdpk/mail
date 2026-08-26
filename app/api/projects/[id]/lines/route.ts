import { requireAuth } from "@/lib/auth/auth";
import { createLine, parseLineInput } from "@/lib/projects/projects";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) {
    return NextResponse.json({ error: "Ongeldig project id" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = parseLineInput(body);
    if (typeof input === "string") {
      return NextResponse.json({ error: input }, { status: 400 });
    }
    const line = await createLine(projectId, input);
    if (!line) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
    return NextResponse.json({ line });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regel aanmaken mislukt";
    logger.error({ route: "projects/[id]/lines", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
