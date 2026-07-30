import { env, loadEnvFromFile } from "./env";
import { query, queryOne } from "./db";
import type { CalendarInvite } from "./ics";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "openid", "email"].join(
  " "
);

export type GoogleTokenRow = {
  email: string | null;
  access_token: string;
  refresh_token: string | null;
  expiry: Date;
};

/**
 * Check if Google Calendar OAuth is configured in environment.
 * @returns true if GOOGLE_CLIENT_ID, CLIENT_SECRET, and REDIRECT_URI are set
 */
export function isGoogleConfigured(): boolean {
  loadEnvFromFile();
  return Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET") && env("GOOGLE_REDIRECT_URI"));
}

function clientConfig() {
  loadEnvFromFile();
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  const redirectUri = env("GOOGLE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Calendar niet geconfigureerd (CLIENT_ID/SECRET/REDIRECT_URI)");
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Generate Google OAuth consent URL for user authorization.
 * User is redirected here to grant calendar access.
 *
 * @param state Unique state string for CSRF protection
 * @returns Google OAuth authorization URL
 */
export function getGoogleAuthUrl(state: string): string {
  const { clientId, redirectUri } = clientConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

/**
 * Exchange Google OAuth authorization code for access tokens.
 * Stores refresh token in database for future API calls.
 *
 * @param code Authorization code from Google OAuth callback
 * @throws Error if token exchange fails or user info fetch fails
 */
export async function exchangeCode(code: string): Promise<void> {
  const { clientId, clientSecret, redirectUri } = clientConfig();
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token exchange mislukt (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const email = await fetchUserEmail(data.access_token);
  const expiry = new Date(Date.now() + data.expires_in * 1000);

  await query(
    `INSERT INTO google_tokens (id, email, access_token, refresh_token, expiry, updated_at)
     VALUES (1, $1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, google_tokens.refresh_token),
       expiry = EXCLUDED.expiry,
       updated_at = NOW()`,
    [email, data.access_token, data.refresh_token ?? null, expiry.toISOString()]
  );
}

async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

async function readTokens(): Promise<GoogleTokenRow | null> {
  return queryOne<GoogleTokenRow>(
    "SELECT email, access_token, refresh_token, expiry FROM google_tokens WHERE id = 1"
  );
}

/**
 * Get current Google Calendar connection status.
 * @returns Connection status and user's Google email if authenticated
 */
export async function getGoogleStatus(): Promise<{ connected: boolean; email?: string }> {
  const row = await readTokens();
  if (!row) return { connected: false };
  return { connected: true, email: row.email ?? undefined };
}

/**
 * Revoke Google Calendar access and clear stored tokens.
 * User must re-authenticate to use calendar features again.
 */
export async function disconnectGoogle(): Promise<void> {
  await query("DELETE FROM google_tokens WHERE id = 1");
}

async function getValidAccessToken(): Promise<string> {
  const row = await readTokens();
  if (!row) throw new Error("Google Agenda niet gekoppeld");

  if (row.expiry.getTime() > Date.now() + 60_000) {
    return row.access_token;
  }

  if (!row.refresh_token) {
    throw new Error("Google-sessie verlopen — koppel opnieuw");
  }

  const { clientId, clientSecret } = clientConfig();
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token refresh mislukt (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const expiry = new Date(Date.now() + data.expires_in * 1000);

  await query(
    `UPDATE google_tokens SET access_token = $1, expiry = $2, updated_at = NOW() WHERE id = 1`,
    [data.access_token, expiry.toISOString()]
  );

  return data.access_token;
}

function toGoogleDate(invite: CalendarInvite, which: "start" | "end") {
  const iso = which === "start" ? invite.start : (invite.end ?? invite.start);
  if (invite.allDay) {
    return { date: iso.slice(0, 10) };
  }
  if (iso.endsWith("Z") || !invite.timeZone || invite.timeZone === "UTC") {
    return { dateTime: iso.endsWith("Z") ? iso : `${iso}Z`, timeZone: "UTC" };
  }
  return { dateTime: iso, timeZone: invite.timeZone };
}

/**
 * Create a Google Calendar event from a parsed email invite.
 * Uses OAuth token to add event to user's primary calendar.
 * Does not send RSVP to organizer.
 *
 * @param invite Parsed calendar invite from email
 * @returns Event creation result with Google Calendar URL and event ID
 * @throws Error if token invalid or calendar API fails
 */
export async function createGoogleEvent(
  invite: CalendarInvite
): Promise<{ htmlLink?: string; id?: string }> {
  const accessToken = await getValidAccessToken();

  const body: Record<string, unknown> = {
    summary: invite.summary,
    description: invite.description,
    location: invite.location,
    start: toGoogleDate(invite, "start"),
    end: toGoogleDate(invite, "end"),
  };

  if (invite.url) {
    body.description = [invite.description, invite.url].filter(Boolean).join("\n\n");
  }

  const res = await fetch(GOOGLE_EVENTS, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Calendar fout (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { id?: string; htmlLink?: string };
  return { id: data.id, htmlLink: data.htmlLink };
}
