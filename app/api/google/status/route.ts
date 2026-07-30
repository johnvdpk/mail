import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getGoogleStatus, isGoogleConfigured } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isGoogleConfigured()) {
    return NextResponse.json({ connected: false, configured: false });
  }
  const status = await getGoogleStatus();
  return NextResponse.json({ ...status, configured: true });
}
