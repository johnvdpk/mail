import { requireAuth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";
import { isImapConfigured } from "@/lib/mail/imap";
import { getFolderView, resolveFolderPath } from "@/lib/mail/mailbox-service";
import { syncFolder } from "@/lib/mail/sync";
import { logger } from "@/lib/shared/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isImapConfigured()) {
    return NextResponse.json(
      {
        error:
          "IMAP niet geconfigureerd. Zet IMAP_HOST/IMAP_USER/IMAP_PASS (of SMTP_USER/SMTP_PASS) in .env.local",
      },
      { status: 503 }
    );
  }

  try {
    const params = new URL(request.url).searchParams;
    const requested = params.get("folder");
    const refresh = params.get("refresh") === "1";
    const folder = await resolveFolderPath(requested);
    const result = await syncFolder(folder);
    const view = await getFolderView(folder, { refreshFolders: refresh });

    return NextResponse.json({ ok: true, ...result, ...view });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync mislukt";
    logger.error({ route: "sync", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
