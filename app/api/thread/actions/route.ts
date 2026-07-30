import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isImapConfigured, withMailbox } from "@/lib/imap";
import { getThreadDetail, getFolderView, resolveFolderPath } from "@/lib/mailbox-service";
import { moveMessages } from "@/lib/mail-actions";
import { patchSummary, removeSummaries } from "@/lib/store";
import type { MessageSummary } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isImapConfigured()) {
    return NextResponse.json({ error: "IMAP niet geconfigureerd" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      threadId?: string;
      folder?: string;
      action?: string;
      destination?: string;
    };

    const threadId = body.threadId?.trim();
    const action = body.action?.trim();
    if (!threadId || !action) {
      return NextResponse.json({ error: "threadId en action verplicht" }, { status: 400 });
    }

    const detail = await getThreadDetail(threadId);
    if (!detail) {
      return NextResponse.json({ error: "Conversatie niet gevonden" }, { status: 404 });
    }

    switch (action) {
      case "flag":
      case "unflag":
        await toggleFlag(detail.messages, action === "flag");
        break;
      case "move": {
        const destination = body.destination?.trim();
        if (!destination) {
          return NextResponse.json(
            { error: "destination verplicht voor move" },
            { status: 400 }
          );
        }
        await moveMessages(detail.messages, destination);
        break;
      }
      case "delete":
        await deleteMessages(detail.messages);
        break;
      default:
        return NextResponse.json({ error: `Onbekende actie: ${action}` }, { status: 400 });
    }

    const folder = await resolveFolderPath(body.folder);
    const view = await getFolderView(folder);
    return NextResponse.json({ ok: true, ...view });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Actie mislukt";
    console.error("[thread/actions]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function toggleFlag(messages: MessageSummary[], flagged: boolean) {
  const byFolder = new Map<string, number[]>();
  for (const message of messages) {
    const uids = byFolder.get(message.folder) ?? [];
    uids.push(message.uid);
    byFolder.set(message.folder, uids);
  }

  for (const [folder, uids] of byFolder) {
    await withMailbox(folder, async (client) => {
      if (flagged) await client.messageFlagsAdd(uids, ["\\Flagged"], { uid: true });
      else await client.messageFlagsRemove(uids, ["\\Flagged"], { uid: true });
    });

    for (const message of messages.filter((m) => m.folder === folder)) {
      await patchSummary(folder, message.id, { flagged });
    }
  }
}

async function deleteMessages(messages: MessageSummary[]) {
  const byFolder = new Map<string, number[]>();
  for (const message of messages) {
    const uids = byFolder.get(message.folder) ?? [];
    uids.push(message.uid);
    byFolder.set(message.folder, uids);
  }

  for (const [folder, uids] of byFolder) {
    await withMailbox(folder, async (client) => {
      await client.messageDelete(uids, { uid: true });
    });
    await removeSummaries(
      folder,
      messages.filter((m) => m.folder === folder).map((m) => m.id)
    );
  }
}
