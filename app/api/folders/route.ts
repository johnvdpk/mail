import { requireAuth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";
import { isImapConfigured } from "@/lib/mail/imap";
import { getFolderSummaries } from "@/lib/mail/mailbox-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isImapConfigured()) {
    return NextResponse.json({ error: "IMAP niet geconfigureerd" }, { status: 503 });
  }

  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const folders = await getFolderSummaries({ refresh });
    return NextResponse.json({ folders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mappen ophalen mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
