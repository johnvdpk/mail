import { requireAuth } from "@/lib/auth/auth";
import { createProject, listProjectOverview, parseProjectInput } from "@/lib/projects/projects";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const overview = await listProjectOverview(url.searchParams);
    return NextResponse.json(overview);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Projecten ophalen mislukt";
    logger.error({ route: "projects", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = parseProjectInput(body);
    if (typeof input === "string") {
      return NextResponse.json({ error: input }, { status: 400 });
    }
    const project = await createProject(input);
    return NextResponse.json({ project });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Project aanmaken mislukt";
    logger.error({ route: "projects", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
