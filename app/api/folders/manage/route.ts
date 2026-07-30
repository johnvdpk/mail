import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isImapConfigured, withImap } from "@/lib/imap";
import { fetchFolders } from "@/lib/folders";

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
    console.error("[folders/manage]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
