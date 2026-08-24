import { sync, type VEvent } from "node-ical";

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

type DateWithMeta = Date & { tz?: string; dateOnly?: true };

function isDateWithMeta(value: unknown): value is DateWithMeta {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** Unwrap node-ical ParameterValue (string or { val, params }). */
function textField(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (value && typeof value === "object" && "val" in value) {
    const inner = (value as { val: unknown }).val;
    if (typeof inner === "string") {
      const trimmed = inner.trim();
      return trimmed || undefined;
    }
  }
  return undefined;
}

function extractEmail(raw: string): string {
  const mailto = raw.match(/mailto:([^;]+)/i);
  if (mailto) return decodeURIComponent(mailto[1].trim());
  return raw.trim();
}

function organizerEmail(organizer: VEvent["organizer"]): string | undefined {
  if (!organizer) return undefined;
  const raw = typeof organizer === "string" ? organizer : organizer.val;
  if (!raw) return undefined;
  const email = extractEmail(raw);
  return email || undefined;
}

function timeZoneOf(date?: DateWithMeta): string | undefined {
  const tz = date?.tz;
  if (!tz) return undefined;
  if (tz === "Etc/UTC" || tz === "UTC") return "UTC";
  return tz;
}

/** All-day values stay date-only YYYY-MM-DD; timed values use ISO-8601. */
function formatInviteDate(date: DateWithMeta, allDay: boolean): string {
  if (allDay) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return date.toISOString();
}

/** Parse the first VEVENT from an ICS payload. */
export function parseIcs(raw: string): CalendarInvite | null {
  if (!raw) return null;

  try {
    const parsed = sync.parseICS(raw);
    const event = Object.values(parsed).find(
      (component): component is VEvent => !!component && component.type === "VEVENT"
    );
    if (!event || !isDateWithMeta(event.start)) return null;

    const allDay = event.start.dateOnly === true || event.datetype === "date";
    const endDate = isDateWithMeta(event.end) ? event.end : undefined;
    const endAllDay = allDay || endDate?.dateOnly === true;

    const invite: CalendarInvite = {
      summary: textField(event.summary) ?? "Agenda-afspraak",
      start: formatInviteDate(event.start, allDay),
      end: endDate ? formatInviteDate(endDate, endAllDay) : undefined,
      timeZone: timeZoneOf(event.start) || timeZoneOf(endDate),
      allDay: allDay || undefined,
    };

    const uid = textField(event.uid);
    if (uid) invite.uid = uid;

    const description = textField(event.description);
    if (description) invite.description = description;

    const location = textField(event.location);
    if (location) invite.location = location;

    const url = textField(event.url);
    if (url) invite.url = url;

    const organizer = organizerEmail(event.organizer);
    if (organizer) invite.organizer = organizer;

    // Conference URL sometimes only in description / location
    if (!invite.url) {
      const haystack = `${invite.location ?? ""}\n${invite.description ?? ""}`;
      const link = haystack.match(/https?:\/\/[^\s<>"')\]]+/);
      if (link) invite.url = link[0];
    }

    return invite;
  } catch {
    return null;
  }
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
