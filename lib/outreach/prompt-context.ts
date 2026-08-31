import type { CampaignProfile, ReplyIntent, SegmentHint } from "./campaign-profile";
import { EXPENSIVE_PLATFORM_IDS } from "./presets/camping";
import type { CampaignTarget } from "./types";
import type { WebsiteScanResult } from "./website-scan";

function stringAttr(attributes: Record<string, unknown>, key: string): string {
  const value = attributes[key];
  return typeof value === "string" ? value : "";
}

function stringListAttr(attributes: Record<string, unknown>, key: string): string[] {
  const value = attributes[key];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) return value.split(",").map((s) => s.trim());
  return [];
}

export function pickSegmentHint(
  profile: CampaignProfile,
  target: CampaignTarget,
  scan?: WebsiteScanResult
): SegmentHint | undefined {
  const signals = stringListAttr(target.attributes, "signals");
  const bookingType = stringAttr(target.attributes, "bookingType");

  if (scan?.multiLocation || scan?.chainBrand) {
    return profile.segments.find((s) => s.id === "multi_location");
  }
  if (scan?.platforms.some((p) => EXPENSIVE_PLATFORM_IDS.includes(p.id))) {
    return profile.segments.find((s) => s.id === "known_platform");
  }
  if (signals.includes("facebook_only")) {
    return profile.segments.find((s) => s.id === "facebook_only");
  }
  if (signals.includes("email_booking") || bookingType === "email") {
    return profile.segments.find((s) => s.id === "email_booking");
  }
  if (bookingType === "online") {
    return profile.segments.find((s) => s.id === "online");
  }
  if (bookingType === "none" || signals.includes("no_website") || !target.website) {
    return profile.segments.find((s) => s.id === "no_website");
  }
  return undefined;
}

export function buildConfigPromptContext(
  profile: CampaignProfile,
  target: CampaignTarget,
  scan?: WebsiteScanResult
): string {
  const lines: string[] = [];

  lines.push(profile.context);
  lines.push(`\nMaximaal ~${profile.maxWords} woorden.`);

  lines.push(`\n=== ONDERWERPREGEL ===`);
  lines.push(`Standaardformaat: ${profile.subjectLine}`);
  lines.push("Vervang {naam} door de naam van de lead.");

  const segmentHint = pickSegmentHint(profile, target, scan);
  if (segmentHint?.hint.trim()) {
    lines.push("\n=== SEGMENT-HINT VOOR DEZE LEAD ===");
    lines.push(`${segmentHint.label}: ${segmentHint.hint}`);
  }

  return lines.join("\n");
}

export function buildReplyPromptContext(profile: CampaignProfile, intent: ReplyIntent): string {
  const lines: string[] = [];
  const template = profile.replies.find((r) => r.id === intent);

  lines.push(profile.context);
  lines.push(`\nMaximaal ~${Math.min(profile.maxWords, 150)} woorden.`);

  if (template) {
    lines.push(`\n=== REPLY-TEMPLATE: ${template.label.toUpperCase()} ===`);
    lines.push(template.text);
    if (template.personalNote.trim()) {
      lines.push(`Persoonlijke noot voor AI: ${template.personalNote}`);
    }
    if (template.hint) lines.push(`Doel: ${template.hint}`);
  }

  return lines.join("\n");
}

export function formatTargetMetadata(target: CampaignTarget): string {
  const attrs = target.attributes;
  const country = typeof attrs.country === "string" ? attrs.country : "";
  const bookingType = typeof attrs.bookingType === "string" ? attrs.bookingType : "";
  const signals = Array.isArray(attrs.signals) ? attrs.signals.map(String).join(", ") : "";
  const phone = typeof attrs.phone === "string" ? attrs.phone : "";
  const fetchError = typeof attrs.fetchError === "string" ? attrs.fetchError : "";

  return `Lead: ${target.name}
Land: ${country || "onbekend"}
Website: ${target.website || "onbekend"}
Booking type (metadata): ${bookingType || "onbekend"}
Signalen: ${signals || "geen"}
Telefoon: ${phone || "onbekend"}
E-mail: ${target.email}
Scraper-status: ${fetchError || "onbekend"}`;
}
