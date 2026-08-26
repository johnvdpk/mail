import { requireAuth } from "@/lib/auth/auth";
import { createLine, getOverheadProject, parseLineInput } from "@/lib/projects/projects";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as { rows?: unknown };
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "Geen rijen om op te slaan" }, { status: 400 });
    }

    const overhead = await getOverheadProject();
    const created: number[] = [];
    const skipped: string[] = [];

    for (const [index, raw] of body.rows.entries()) {
      if (!raw || typeof raw !== "object") {
        skipped.push(`rij ${index + 1}: ongeldig`);
        continue;
      }
      const record = raw as Record<string, unknown>;
      const input = parseLineInput(record);
      if (typeof input === "string") {
        skipped.push(`rij ${index + 1}: ${input}`);
        continue;
      }
      const projectId =
        typeof record.projectId === "number" && Number.isInteger(record.projectId)
          ? record.projectId
          : overhead.id;
      const line = await createLine(projectId, input);
      if (!line) {
        skipped.push(`rij ${index + 1}: project niet gevonden`);
        continue;
      }
      created.push(line.id);
    }

    return NextResponse.json({ created: created.length, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import bevestigen mislukt";
    logger.error({ route: "projects/import/confirm", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
