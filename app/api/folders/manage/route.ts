import { requireAuth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";
import { isImapConfigured, withImap } from "@/lib/mail/imap";
import { fetchFolders } from "@/lib/mail/folders";
import { logger } from "@/lib/shared/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isImapConfigured()) {
    return NextResponse.json({ error: "IMAP niet geconfigureerd" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      path?: string;
      newPath?: string;
    };

    const action = body.action?.trim();
    const path = body.path?.trim();

    if (!action || !path) {
      return NextResponse.json({ error: "action en path verplicht" }, { status: 400 });
    }

    switch (action) {
      case "create":
        await withImap((client) => client.mailboxCreate(path));
        break;
      case "rename": {
        if (!body.newPath?.trim()) {
          return NextResponse.json({ error: "newPath verplicht voor rename" }, { status: 400 });
        }
        await withImap((client) => client.mailboxRename(path, body.newPath!.trim()));
        break;
      }
      case "delete":
        await withImap((client) => client.mailboxDelete(path));
        break;
      default:
        return NextResponse.json({ error: `Onbekende actie: ${action}` }, { status: 400 });
    }

    const folders = await fetchFolders();
    return NextResponse.json({ ok: true, folders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Map-actie mislukt";
    logger.error({ route: "folders/manage", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
