import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  getFolderView,
  getThreadDetail,
  markThreadSeen,
  resolveFolderPath,
  resolveThreadFromMessage,
} from "@/lib/mailbox-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const messageId = params.get("messageId");

    let threadId = id?.trim() || null;
    let preferredFolder: string | null = null;

    if (!threadId && messageId) {
      const resolved = await resolveThreadFromMessage(messageId.trim());
      if (!resolved) {
        return NextResponse.json({ error: "Bericht niet gevonden" }, { status: 404 });
      }
      threadId = resolved.threadId;
      preferredFolder = resolved.folder;
    }

    if (!threadId) {
      return NextResponse.json({ error: "id of messageId verplicht" }, { status: 400 });
    }

    const detail = await getThreadDetail(threadId);
    if (!detail) {
      return NextResponse.json({ error: "Conversatie niet gevonden" }, { status: 404 });
    }

    return NextResponse.json({
      ...detail,
      folder: preferredFolder ?? detail.thread.folders[0] ?? null,
    });
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
