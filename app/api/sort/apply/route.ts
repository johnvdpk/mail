import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { sanitizeFolderName } from "@/lib/ai-sort";
import { ensureFolder, moveMessages } from "@/lib/mail-actions";
import { getFolderView } from "@/lib/mailbox-service";
import { getInboxPath } from "@/lib/folders";
import { isImapConfigured } from "@/lib/imap";
import { readFolderCache } from "@/lib/store";
import type { SortApplyItem } from "@/lib/sort-types";
import type { MessageSummary } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isImapConfigured()) {
    return NextResponse.json({ error: "IMAP niet geconfigureerd" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { items?: SortApplyItem[] };
    const items = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ error: "Geen items om te verplaatsen" }, { status: 400 });
    }

    const inboxPath = await getInboxPath();
    const cache = await readFolderCache(inboxPath);
    const byId = new Map(cache.messages.map((m) => [m.id, m]));

    let moved = 0;

    for (const item of items) {
      const folderRaw = typeof item.folder === "string" ? item.folder.trim() : "";
      const folder = sanitizeFolderName(folderRaw);
      if (!folder || !Array.isArray(item.messageIds) || item.messageIds.length === 0) {
        continue;
      }

      if (item.createFolder) {
        await ensureFolder(folder);
      }

      const messages: MessageSummary[] = [];
      for (const id of item.messageIds) {
        const summary = byId.get(id);
        if (summary) messages.push(summary);
      }
      if (messages.length === 0) continue;

      await moveMessages(messages, folder);
      moved += messages.length;

      for (const m of messages) byId.delete(m.id);
    }

    const view = await getFolderView(inboxPath);
    return NextResponse.json({ ok: true, moved, ...view });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Toepassen mislukt";
    console.error("[sort/apply]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
