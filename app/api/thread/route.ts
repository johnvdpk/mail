import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  getFolderView,
  getThreadDetail,
  markThreadSeen,
  resolveFolderPath,
} from "@/lib/mailbox-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id verplicht" }, { status: 400 });
    }

    const detail = await getThreadDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Conversatie niet gevonden" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Conversatie ophalen mislukt";
    console.error("[thread/get]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      id?: string;
      folder?: string;
      seen?: boolean;
    };

    if (!body.id) {
      return NextResponse.json({ error: "id verplicht" }, { status: 400 });
    }
    if (typeof body.seen !== "boolean") {
      return NextResponse.json({ error: "seen verplicht" }, { status: 400 });
    }

    await markThreadSeen(body.id, body.seen);
    const folder = await resolveFolderPath(body.folder);
    const view = await getFolderView(folder);

    return NextResponse.json({ ok: true, ...view });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bijwerken mislukt";
    console.error("[thread/patch]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
