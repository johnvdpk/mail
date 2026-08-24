import { requireAuth } from "@/lib/auth/auth";
import { suggestAddresses } from "@/lib/shared/address-book";
import { NextResponse } from "next/server";
import { logger } from "@/lib/shared/logger";

export const dynamic = "force-dynamic";

/** Email address suggestions for To/CC/BCC autocomplete, built from mail history (?q=). */
export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const suggestions = q.trim() ? await suggestAddresses(q) : [];
    return NextResponse.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suggesties ophalen mislukt";
    logger.error({ route: "contacts/suggest", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
