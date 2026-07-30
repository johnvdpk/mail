import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth";
import { exchangeCode, isGoogleConfigured } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/?google=config", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) {
    return NextResponse.redirect(new URL(`/?google=error&msg=${encodeURIComponent(err)}`, request.url));
  }

  const cookieStore = await cookies();
  const expected = cookieStore.get("google_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/?google=state", request.url));
  }

  try {
    await exchangeCode(code);
    const response = NextResponse.redirect(new URL("/?google=connected", request.url));
    response.cookies.set("google_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "koppelen mislukt";
    console.error("[google/callback]", message, e);
    return NextResponse.redirect(
      new URL(`/?google=error&msg=${encodeURIComponent(message.slice(0, 120))}`, request.url)
    );
  }
}
