import { requireAuth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";
import { disconnectGoogle } from "@/lib/calendar/google-calendar";

export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    await disconnectGoogle();
    return NextResponse.json({ ok: true, connected: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ontkoppelen mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
