import { requireAuth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getGoogleAuthUrl, isGoogleConfigured } from "@/lib/calendar/google-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google Calendar niet geconfigureerd — zet GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI" },
      { status: 503 }
    );
  }

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(getGoogleAuthUrl(state));
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.AUTH_SECURE === "true",
  });
  return response;
}
