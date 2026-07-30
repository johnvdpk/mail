import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { query, queryOne } from "./db";
import { loadEnvFromFile } from "./env";

loadEnvFromFile();

const SESSION_COOKIE = "mail_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function passwordsMatch(provided: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function useSecureCookie(): boolean {
  if (process.env.AUTH_SECURE === "true") return true;
  if (process.env.AUTH_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function createRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function login(password: string): Promise<string | null> {
  const expected = process.env.AUTH_PASSWORD;
  if (!expected || !passwordsMatch(password, expected)) return null;

  const token = createRawToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await query("INSERT INTO sessions (token, expires_at) VALUES ($1, $2)", [token, expiresAt]);
  return token;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await query("DELETE FROM sessions WHERE token = $1", [token]);
  }
}

export async function getSession(): Promise<boolean> {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return false;

    const row = await queryOne(
      "SELECT token FROM sessions WHERE token = $1 AND expires_at > NOW()",
      [token]
    );
    return !!row;
  } catch {
    return false;
  }
}

/** Returns 401 if not authenticated, otherwise null. */
export async function requireAuth(): Promise<NextResponse | null> {
  const valid = await getSession();
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function setSessionCookie(token: string): {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
} {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      secure: useSecureCookie(),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000,
    },
  };
}

export { SESSION_COOKIE };
