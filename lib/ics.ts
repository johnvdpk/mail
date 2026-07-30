/**
 * Minimal ICS / VEVENT parser for meeting invites.
 * Handles folded lines and common DTSTART/DTEND forms (UTC Z and TZID).
 */

export type CalendarInvite = {
  uid?: string;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  organizer?: string;
  /** ISO-8601 start */
  start: string;
  /** ISO-8601 end, if present */
  end?: string;
  /** IANA timezone when known (e.g. Europe/Amsterdam) */
  timeZone?: string;
  allDay?: boolean;
};

function unfold(ics: string): string[] {
  const normalized = ics.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const raw = normalized.split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeIcs(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseProp(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(";");
  const name = parts[0]?.toUpperCase() ?? "";
  const params: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name, params, value };
}

/** Parse ICS datetime into ISO string + optional timeZone / allDay. */
function parseDateTime(
  value: string,
  params: Record<string, string>
): { iso: string; timeZone?: string; allDay?: boolean } | null {
  const tzid = params.TZID;
  const trimmed = value.trim();

  // VALUE=DATE → all-day YYYYMMDD
  if (params.VALUE === "DATE" || /^\d{8}$/.test(trimmed)) {
    const y = trimmed.slice(0, 4);
    const m = trimmed.slice(4, 6);
    const d = trimmed.slice(6, 8);
    return { iso: `${y}-${m}-${d}`, allDay: true, timeZone: tzid };
  }

  // YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
  const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!match) return null;

  const [, y, mo, d, h, mi, s, z] = match;
  if (z) {
    return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}Z`, timeZone: "UTC" };
  }

  // Floating / TZID local time — keep as local ISO without Z; caller uses timeZone
  return {
    iso: `${y}-${mo}-${d}T${h}:${mi}:${s}`,
    timeZone: tzid,
  };
}

function extractEmail(raw: string): string {
  const mailto = raw.match(/mailto:([^;]+)/i);
  if (mailto) return decodeURIComponent(mailto[1].trim());
  return unescapeIcs(raw).trim();
}

/** Parse the first VEVENT from an ICS payload. */
export function parseIcs(raw: string): CalendarInvite | null {
  if (!raw || !/BEGIN:VEVENT/i.test(raw)) return null;

  const lines = unfold(raw);
  let inEvent = false;
  const fields: Record<string, { params: Record<string, string>; value: string }> = {};

  for (const line of lines) {
    if (line.toUpperCase() === "BEGIN:VEVENT") {
      inEvent = true;
      continue;
    }
    if (line.toUpperCase() === "END:VEVENT") break;
    if (!inEvent) continue;

    const prop = parseProp(line);
    if (!prop) continue;
    // Keep first occurrence of each property
    if (!fields[prop.name]) {
      fields[prop.name] = { params: prop.params, value: prop.value };
    }
  }

  const startRaw = fields.DTSTART;
  if (!startRaw) return null;
  const start = parseDateTime(startRaw.value, startRaw.params);
  if (!start) return null;

  let end: ReturnType<typeof parseDateTime> | undefined;
  if (fields.DTEND) {
    end = parseDateTime(fields.DTEND.value, fields.DTEND.params) ?? undefined;
  }

  const summary = fields.SUMMARY
    ? unescapeIcs(fields.SUMMARY.value).trim()
    : "Agenda-afspraak";

  const invite: CalendarInvite = {
    summary,
    start: start.iso,
    end: end?.iso,
    timeZone: start.timeZone || end?.timeZone,
    allDay: start.allDay,
  };

  if (fields.UID) invite.uid = unescapeIcs(fields.UID.value).trim();
  if (fields.DESCRIPTION) invite.description = unescapeIcs(fields.DESCRIPTION.value).trim();
  if (fields.LOCATION) invite.location = unescapeIcs(fields.LOCATION.value).trim();
  if (fields.URL) invite.url = unescapeIcs(fields.URL.value).trim();
  if (fields.ORGANIZER) invite.organizer = extractEmail(fields.ORGANIZER.value);

  // Conference URL sometimes only in description / location
  if (!invite.url) {
    const haystack = `${invite.location ?? ""}\n${invite.description ?? ""}`;
    const link = haystack.match(/https?:\/\/[^\s<>"')\]]+/);
    if (link) invite.url = link[0];
  }

  return invite;
}

export function isCalendarAttachment(contentType: string, filename: string): boolean {
  const ct = contentType.toLowerCase();
  const name = filename.toLowerCase();
  return (
    ct.includes("text/calendar") ||
    ct.includes("application/ics") ||
    name.endsWith(".ics")
  );
}
