import { NextRequest, NextResponse } from "next/server";
import { login, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password?: string };

  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const token = await login(password);
  if (!token) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const { name, value, options } = setSessionCookie(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(name, value, options);
  return res;
}
