import { requireAuth } from "@/lib/auth/auth";
import { applyRulesToSuggestions, suggestCsvLines, type CsvImportRow } from "@/lib/ai/projects-finance";
import { isOpenRouterConfigured } from "@/lib/ai/openrouter";
import { listRules } from "@/lib/projects/counterparty-rules";
import { loadAllProjectsWithLines } from "@/lib/projects/projects";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    if (!isOpenRouterConfigured()) {
      return NextResponse.json(
        { error: "OPENROUTER_AI niet geconfigureerd in .env.local" },
        { status: 503 }
      );
    }

    const body = (await request.json()) as { rows?: unknown };
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "Geen rijen" }, { status: 400 });
    }
    if (body.rows.length > 80) {
      return NextResponse.json({ error: "Maximaal 80 rijen per import" }, { status: 400 });
    }

    const rows: CsvImportRow[] = body.rows.map((row) => {
      if (!row || typeof row !== "object") return {};
      const record: CsvImportRow = {};
      for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
        record[key] = value == null ? "" : String(value);
      }
      return record;
    });

    const projects = await loadAllProjectsWithLines();
    const suggestions = await suggestCsvLines(
      rows,
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        clientName: project.clientName,
        isOverhead: project.isOverhead,
      }))
    );
    const rules = await listRules();
    return NextResponse.json({ suggestions: applyRulesToSuggestions(suggestions, rows, rules) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import-suggesties mislukt";
    logger.error({ route: "ai/projects-import", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
