import {
  BOOKING_PLATFORMS,
  CHAIN_BRANDS,
  EXPENSIVE_PLATFORM_IDS,
  HOOK_HEADING_RE,
  HOOK_KEYWORDS,
  MULTI_LOCATION_PATTERNS,
} from "./presets/camping";

export type DetectedPlatform = {
  id: string;
  label: string;
  evidence: string;
};

export type WebsiteScanResult = {
  platforms: DetectedPlatform[];
  multiLocation: boolean;
  multiLocationEvidence: string[];
  chainBrand?: string;
  hooks: string[];
  ownerHint?: string;
  targetAudience: "primary" | "intro_only" | "unknown";
  summaryLines: string[];
};

function firstMatchSnippet(html: string, re: RegExp, max = 60): string {
  const m = html.match(re);
  if (!m) return "";
  const start = Math.max(0, (m.index ?? 0) - 10);
  return html
    .slice(start, start + max)
    .replace(/\s+/g, " ")
    .trim();
}

function detectPlatforms(html: string): DetectedPlatform[] {
  const found: DetectedPlatform[] = [];
  for (const p of BOOKING_PLATFORMS) {
    const hit = p.patterns.find((re) => re.test(html));
    if (!hit) continue;
    found.push({
      id: p.id,
      label: p.label,
      evidence: firstMatchSnippet(html, hit) || p.label,
    });
  }
  return found;
}

function detectChainBrand(html: string): string | undefined {
  for (const brand of CHAIN_BRANDS) {
    if (brand.patterns.some((re) => re.test(html))) return brand.label;
  }
  return undefined;
}

function detectMultiLocation(
  html: string,
  chainBrand?: string
): { multi: boolean; evidence: string[] } {
  const evidence: string[] = [];
  for (const { re, label } of MULTI_LOCATION_PATTERNS) {
    if (re.test(html)) evidence.push(label);
  }
  if (chainBrand) evidence.push(`keten: ${chainBrand}`);
  return { multi: evidence.length > 0, evidence: [...new Set(evidence)].slice(0, 4) };
}

function extractOwnerHint(text: string): string | undefined {
  const patterns = [
    /(?:wij zijn|we zijn)\s+([A-ZÀ-Ö][\wÀ-ö'-]+(?:\s+(?:en|&)\s+[A-ZÀ-Ö][\wÀ-ö'-]+)?)/i,
    /familie\s+([A-ZÀ-Ö][\wÀ-ö'-]+)/i,
    /(?:gerund|gerund door|eigenaren?)\s+([A-ZÀ-Ö][\wÀ-ö'-]+(?:\s+[A-ZÀ-Ö][\wÀ-ö'-]+)?)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[0] && m[0].length < 50) return m[0].trim();
  }
  const since = text.match(/sinds\s+(19|20)\d{2}/i);
  if (since) return since[0];
  return undefined;
}

function extractHooks(text: string, ownerHint?: string): string[] {
  const hooks: string[] = [];
  if (ownerHint) hooks.push(ownerHint);

  for (const { re, label } of HOOK_KEYWORDS) {
    if (re.test(text)) hooks.push(label);
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 8 && l.length < 80);

  const skip = /^(titel:|home|welkom|menu|contact|reserveren|boeken|cookies?)/i;
  for (const line of lines.slice(0, 30)) {
    if (skip.test(line)) continue;
    if (HOOK_HEADING_RE.test(line)) {
      hooks.push(line.replace(/^Titel:\s*/i, ""));
      break;
    }
  }

  return [...new Set(hooks)].slice(0, 5);
}

export function scanWebsiteContent(html: string, plainText = ""): WebsiteScanResult {
  const platforms = detectPlatforms(html);
  const chainBrand = detectChainBrand(html);
  const { multi: multiLocation, evidence: multiLocationEvidence } = detectMultiLocation(
    html,
    chainBrand
  );
  const text = plainText || html.replace(/<[^>]+>/g, " ");
  const ownerHint = extractOwnerHint(text);
  const hooks = extractHooks(text, ownerHint);

  const hasExpensive = platforms.some((p) => EXPENSIVE_PLATFORM_IDS.includes(p.id));
  let targetAudience: WebsiteScanResult["targetAudience"] = "unknown";
  if (multiLocation || chainBrand || hasExpensive) targetAudience = "intro_only";
  else if (hooks.length > 0 || platforms.length > 0) targetAudience = "primary";

  const summaryLines: string[] = [];
  if (platforms.length) {
    summaryLines.push(`Platform: ${platforms.map((p) => p.label).join(", ")}`);
  } else {
    summaryLines.push("Platform: niet herkend");
  }
  if (multiLocation) {
    summaryLines.push(
      `Type: meerdere locaties (${multiLocationEvidence.slice(0, 2).join(", ") || "signalen"})`
    );
  } else {
    summaryLines.push("Type: waarschijnlijk één locatie");
  }
  if (targetAudience === "intro_only") {
    summaryLines.push("Doelgroep: vooral kenbaar maken (niet primaire lead)");
  } else if (targetAudience === "primary") {
    summaryLines.push("Doelgroep: past bij kern");
  }
  if (hooks.length) {
    summaryLines.push(`Haakjes: ${hooks.join(" · ")}`);
  }

  return {
    platforms,
    multiLocation,
    multiLocationEvidence,
    chainBrand,
    hooks,
    ownerHint,
    targetAudience,
    summaryLines,
  };
}

export function formatScanForPrompt(scan: WebsiteScanResult): string {
  const lines: string[] = ["=== WEBSITE-SCAN (zekerheden uit HTML) ==="];
  lines.push(...scan.summaryLines);
  if (scan.platforms.length) {
    lines.push(
      "Gevonden platforms: " +
        scan.platforms.map((p) => `${p.label} (${p.evidence})`).join("; ")
    );
  }
  if (scan.multiLocation) {
    lines.push(
      "Meerdere locaties/keten: ja. Mail vooral om je kenbaar te maken, zachte pitch, geen hard sales."
    );
  }
  if (scan.hooks.length) {
    lines.push("Gebruik max één van deze haakjes in de mail: " + scan.hooks.join(" | "));
  }
  return lines.join("\n");
}

export function emptyWebsiteScan(): WebsiteScanResult {
  return {
    platforms: [],
    multiLocation: false,
    multiLocationEvidence: [],
    hooks: [],
    targetAudience: "unknown",
    summaryLines: ["Geen website-scan beschikbaar"],
  };
}
