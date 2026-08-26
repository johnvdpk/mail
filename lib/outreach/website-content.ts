import dns from "node:dns";
import * as cheerio from "cheerio";
import { EMBED_HINT_RE } from "./presets/camping";
import { emptyWebsiteScan, scanWebsiteContent, type WebsiteScanResult } from "./website-scan";

dns.setDefaultResultOrder("ipv4first");

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; MailOutreachBot/1.0; +https://aiadapt.nl)";
const MAX_TEXT_LENGTH = 12_000;

const CONTACT_PATHS = [
  "/",
  "/contact",
  "/contact.html",
  "/nl/contact",
  "/over-ons",
  "/overons",
  "/about",
];

export function normalizeWebsiteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/\//, "")}`;
}

function resolveUrl(base: string, path: string): string {
  try {
    return new URL(path, base).href;
  } catch {
    return base;
  }
}

function isHtmlContent(contentType: string, body: string): boolean {
  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    return true;
  }
  const start = body.slice(0, 500).toLowerCase();
  return start.includes("<html") || start.includes("<!doctype") || start.startsWith("<");
}

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    const html = await response.text();
    if (!html || !isHtmlContent(contentType, html)) return null;

    return { html, finalUrl: response.url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractEmbedHints(html: string): string {
  const $ = cheerio.load(html);
  const hints: string[] = [];
  $("script[src], iframe[src], a[href], link[href]").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("href") || "";
    if (src && EMBED_HINT_RE.test(src)) hints.push(src);
  });
  return hints.join("\n");
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();

  const parts: string[] = [];
  $("title").each((_, el) => {
    parts.push(`Titel: ${$(el).text().trim()}`);
  });
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text) parts.push(text);
  });
  $("p, li, td, th, label, button, a").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > 2) parts.push(text);
  });

  return [...new Set(parts)].join("\n").slice(0, MAX_TEXT_LENGTH);
}

function baseUrlsForFetch(websiteUrl: string, altUrl?: string): string[] {
  const bases = [normalizeWebsiteUrl(websiteUrl)];
  if (altUrl) {
    const alt = normalizeWebsiteUrl(altUrl);
    if (alt && !bases.includes(alt)) bases.push(alt);
  }
  return bases.filter(Boolean);
}

export type WebsiteFetchResult = {
  text: string;
  finalUrl: string;
  error?: string;
  scan: WebsiteScanResult;
};

export async function fetchWebsiteText(
  websiteUrl: string,
  altUrl?: string
): Promise<WebsiteFetchResult> {
  const bases = baseUrlsForFetch(websiteUrl, altUrl);
  if (bases.length === 0) {
    return { text: "", finalUrl: "", error: "Geen website-URL", scan: emptyWebsiteScan() };
  }

  const textChunks: string[] = [];
  const htmlChunks: string[] = [];
  let finalUrl = bases[0];
  const tried: string[] = [];

  for (const base of bases) {
    const urls = [...new Set(CONTACT_PATHS.map((p) => resolveUrl(base, p)))].slice(0, 6);

    for (const url of urls) {
      tried.push(url);
      const result = await fetchPage(url);
      if (result) {
        const embeds = extractEmbedHints(result.html);
        htmlChunks.push(result.html);
        if (embeds) htmlChunks.push(embeds);
        textChunks.push(`--- Pagina: ${url} ---\n${htmlToText(result.html)}`);
        finalUrl = result.finalUrl;
      }
    }

    if (textChunks.length > 0) break;
  }

  if (textChunks.length === 0) {
    return {
      text: "",
      finalUrl: bases[0],
      error: `Kon website niet bereiken (geprobeerd: ${tried.slice(0, 3).join(", ")}…)`,
      scan: emptyWebsiteScan(),
    };
  }

  const text = textChunks.join("\n\n");
  const scan = scanWebsiteContent(htmlChunks.join("\n"), text);
  return { text, finalUrl, scan };
}
