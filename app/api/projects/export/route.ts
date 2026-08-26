import { requireAuth } from "@/lib/auth/auth";
import { loadAllProjectsWithLines } from "@/lib/projects/projects";
import { yearFromSearchParams } from "@/lib/projects/period";
import { logger } from "@/lib/shared/logger";
import Papa from "papaparse";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const year = yearFromSearchParams(url.searchParams);
    const projects = await loadAllProjectsWithLines();
    const rows = projects.flatMap((project) =>
      project.lines
        .filter((line) => {
          if (line.billing === "one_off") {
            return line.occurredOn?.startsWith(String(year));
          }
          if (line.endsOn && line.endsOn < `${year}-01-01`) return false;
          return true;
        })
        .map((line) => ({
          project: project.name,
          klant: project.clientName,
          richting: line.direction,
          type: line.billing,
          naam: line.name,
          bedrag: line.amount,
          uren: line.hours ?? "",
          datum: line.occurredOn ?? "",
          betaald: line.billing === "one_off" ? (line.paidOn ?? "") : line.paidMonths.join(" "),
          btw: line.vatRate ?? "",
          categorie: line.category ?? "",
        }))
    );

    const csv = Papa.unparse(rows, { header: true });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="financieel-${year}.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "CSV-export mislukt";
    logger.error({ route: "projects/export", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
