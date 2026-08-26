import { requireAuth } from "@/lib/auth/auth";
import { deleteProject, getProjectDetail, parseProjectInput, updateProject } from "@/lib/projects/projects";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseId(id: string): number | null {
  const projectId = Number(id);
  return Number.isInteger(projectId) ? projectId : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const projectId = parseId(id);
  if (projectId === null) {
    return NextResponse.json({ error: "Ongeldig project id" }, { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const project = await getProjectDetail(projectId, url.searchParams);
    if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
    return NextResponse.json({ project });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Project ophalen mislukt";
    logger.error({ route: "projects/[id]", method: "GET", err }, message);
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
  const projectId = parseId(id);
  if (projectId === null) {
    return NextResponse.json({ error: "Ongeldig project id" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = parseProjectInput(body);
    if (typeof input === "string") {
      return NextResponse.json({ error: input }, { status: 400 });
    }
    const project = await updateProject(projectId, input);
    if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
    return NextResponse.json({ project });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Project bijwerken mislukt";
    logger.error({ route: "projects/[id]", method: "PATCH", err }, message);
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
  const projectId = parseId(id);
  if (projectId === null) {
    return NextResponse.json({ error: "Ongeldig project id" }, { status: 400 });
  }

  try {
    const result = await deleteProject(projectId);
    if (result === "missing") {
      return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
    }
    if (result === "overhead") {
      return NextResponse.json({ error: "Het bakje Bedrijf kan niet verwijderd worden" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Project verwijderen mislukt";
    logger.error({ route: "projects/[id]", method: "DELETE", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
