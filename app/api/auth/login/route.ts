import { NextRequest, NextResponse } from "next/server";
import { login, setSessionCookie } from "@/lib/auth/auth";
import { clearLoginAttempts, isLoginRateLimited, registerFailedLogin } from "@/lib/auth/login-rate-limit";

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);

  if (isLoginRateLimited(key)) {
    return NextResponse.json(
      { error: "Te veel mislukte pogingen. Probeer het over 15 minuten opnieuw." },
      { status: 429 }
    );
  }

  const { password } = (await req.json()) as { password?: string };

  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const token = await login(password);
  if (!token) {
    registerFailedLogin(key);
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  clearLoginAttempts(key);
  const { name, value, options } = setSessionCookie(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(name, value, options);
  return res;
}
