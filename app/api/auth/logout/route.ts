import { NextResponse } from "next/server";
import { logout, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  await logout();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
