import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getFolderView } from "@/lib/mailbox-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const folder = new URL(request.url).searchParams.get("folder");
    const view = await getFolderView(folder);
    return NextResponse.json(view);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Berichten ophalen mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
