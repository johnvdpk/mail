import { requireAuth } from "@/lib/auth/auth";
import { isOpenRouterConfigured } from "@/lib/ai/openrouter";
import {
  deleteSearchJob,
  getSearchJob,
  listSearchJobs,
  startSearchJob,
} from "@/lib/mail/mail-search";
import { NextResponse } from "next/server";
import { logger } from "@/lib/shared/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** List jobs, or fetch one job with results (?id=). */
export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const idRaw = searchParams.get("id");

    if (idRaw) {
      const id = Number(idRaw);
      if (!Number.isFinite(id) || id <= 0) {
        return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
      }
      const job = await getSearchJob(id);
      if (!job) {
        return NextResponse.json({ error: "Zoekopdracht niet gevonden" }, { status: 404 });
      }
      return NextResponse.json({ job });
    }

    const jobs = await listSearchJobs();
    return NextResponse.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zoekopdrachten ophalen mislukt";
    logger.error({ route: "ai/search", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Start a search job and run the keyword phase; returns job + keyword results. */
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

    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim() ?? "";
    if (!prompt) {
      return NextResponse.json({ error: "prompt verplicht" }, { status: 400 });
    }

    const job = await startSearchJob(prompt);
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zoekopdracht mislukt";
    logger.error({ route: "ai/search", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Delete a search job (?id=). */
export async function DELETE(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const idRaw = new URL(request.url).searchParams.get("id");
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
    }

    const ok = await deleteSearchJob(id);
    if (!ok) {
      return NextResponse.json({ error: "Zoekopdracht niet gevonden" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verwijderen mislukt";
    logger.error({ route: "ai/search", method: "DELETE", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
