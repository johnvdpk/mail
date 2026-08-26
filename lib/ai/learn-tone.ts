import { chatCompletion, getHeavyModel } from "./openrouter";
import { query, queryOne } from "../shared/db";
import { getFolderByRole } from "../mail/folders";
import { parseJsonObject } from "./llm-json";
import { readBody, readFolderCache } from "../shared/store";
import type { WritingProfile } from "../config/email-config-shared";

export type { WritingProfile } from "../config/email-config-shared";

const STOP_WORDS = new Set([
  "de", "het", "een", "en", "van", "ik", "je", "jij", "hij", "zij", "we", "wij",
  "in", "op", "te", "dat", "die", "is", "was", "voor", "met", "als", "maar",
  "om", "aan", "er", "nog", "ook", "dan", "wel", "niet", "zo", "al", "of",
  "the", "a", "an", "to", "of", "and", "in", "on", "for", "is", "are", "be",
  "this", "that", "with", "you", "i", "me", "my", "it", "at", "by", "from",
]);

const GREETING_RE = /^(hey|hoi|hallo|hi|dear|beste|goedemorgen|goedemiddag)\b/i;
const CLOSING_RE = /^(groeten|groet|mvg|met vriendelijke groet|cheers|thanks|dank|regards)\b/i;

type SentSample = {
  id: string;
  to: string;
  text: string;
  wordCount: number;
};

/**
 * Load recent sent-mail bodies for tone analysis (newest first).
 */
async function loadSentSamples(limit: number): Promise<SentSample[]> {
  const sent = await getFolderByRole("sent");
  if (!sent) return [];

  const cache = await readFolderCache(sent.path);
  const newest = [...cache.messages].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);

  const samples: SentSample[] = [];
  for (const summary of newest) {
    const body = await readBody(summary.id);
    const text = (body?.text || summary.snippet || "").trim();
    if (!text || text.length < 20) continue;

    const words = text.split(/\s+/).filter(Boolean);
    samples.push({
      id: summary.id,
      to: summary.to[0]?.email ?? "",
      text,
      wordCount: words.length,
    });
  }

  return samples;
}

function topWords(texts: string[], limit = 40): Record<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return Object.fromEntries(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
  );
}

function detectPatterns(samples: SentSample[]): string {
  const openers: string[] = [];
  const closers: string[] = [];

  for (const sample of samples) {
    const lines = sample.text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    const lastFew = lines.slice(-3).join(" ");

    const openerMatch = first.match(GREETING_RE);
    if (openerMatch) openers.push(openerMatch[1].toLowerCase());

    const closerMatch = lastFew.match(CLOSING_RE);
    if (closerMatch) closers.push(closerMatch[1].toLowerCase());
  }

  const top = (items: string[]) => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item, (map.get(item) ?? 0) + 1);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k} (${v}x)`)
      .join(", ");
  };

  const avg = samples.length
    ? Math.round(samples.reduce((sum, s) => sum + s.wordCount, 0) / samples.length)
    : 0;

  return [
    `Gemiddelde lengte: ~${avg} woorden.`,
    openers.length ? `Openers: ${top(openers)}.` : "Geen duidelijke openers gevonden.",
    closers.length ? `Afsluiters: ${top(closers)}.` : "Geen duidelijke afsluiters gevonden.",
    `Samples: ${samples.length} verzonden mails.`,
  ].join(" ");
}

/**
 * Ask the model to turn statistical patterns + sample mails into tone rules.
 */
async function generateDetectedRules(
  patterns: string,
  samples: SentSample[]
): Promise<{ rules: string; confidence: number }> {
  const excerpt = samples
    .slice(0, 12)
    .map((s, i) => `--- MAIL ${i + 1} (naar ${s.to || "?"}, ${s.wordCount} woorden) ---\n${s.text.slice(0, 800)}`)
    .join("\n\n");

  const raw = await chatCompletion(
    [
      {
        role: "system",
        content: `Je analyseert verzonden e-mails van John om tone-of-voice regels te schrijven.
Schrijf concrete, korte regels in het Nederlands die een AI kan volgen bij het opstellen van replies.
Geen marketingtaal. Focus op lengte, formaliteit, openers/closers, woordkeuze.

Antwoord uitsluitend als JSON:
- rules (string, meerdere regels gescheiden door \\n)
- confidence (number 0-1)`,
      },
      {
        role: "user",
        content: `Patronen:\n${patterns}\n\nVoorbeelden:\n${excerpt}`,
      },
    ],
    { jsonMode: true, temperature: 0.3, model: getHeavyModel() }
  );

  const parsed = parseJsonObject(raw);
  const rules = typeof parsed?.rules === "string" ? parsed.rules.trim() : "";
  const confidence =
    typeof parsed?.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;

  if (!rules) throw new Error("Geen tone-regels gegenereerd");
  return { rules, confidence };
}

function rowToProfile(row: {
  id: number;
  avg_length: number;
  word_frequency: unknown;
  sentence_patterns: string | null;
  detected_rules: string | null;
  confidence: number;
  analyzed_at: Date;
  updated_at: Date;
  sample_count: number;
  pending_suggestion: string | null;
  suggestion_status: string;
}): WritingProfile {
  return {
    id: row.id,
    avgLength: row.avg_length,
    wordFrequency:
      typeof row.word_frequency === "string"
        ? (JSON.parse(row.word_frequency) as Record<string, number>)
        : ((row.word_frequency as Record<string, number>) ?? {}),
    sentencePatterns: row.sentence_patterns ?? "",
    detectedRules: row.detected_rules ?? "",
    confidence: row.confidence,
    analyzedAt: row.analyzed_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    sampleCount: row.sample_count,
    pendingSuggestion: row.pending_suggestion,
    suggestionStatus: (row.suggestion_status as WritingProfile["suggestionStatus"]) || "none",
  };
}

export async function getWritingProfile(): Promise<WritingProfile | null> {
  const row = await queryOne<{
    id: number;
    avg_length: number;
    word_frequency: unknown;
    sentence_patterns: string | null;
    detected_rules: string | null;
    confidence: number;
    analyzed_at: Date;
    updated_at: Date;
    sample_count: number;
    pending_suggestion: string | null;
    suggestion_status: string;
  }>("SELECT * FROM writing_profile WHERE id = 1");

  return row ? rowToProfile(row) : null;
}

export type AnalyzeOptions = {
  /** How many recent sent mails to inspect (default 80, continuous refresh uses 20) */
  limit?: number;
  /** When true, keep previous suggestion status unless rules changed significantly */
  continuous?: boolean;
};

/**
 * Analyze recent sent mail and upsert writing_profile.
 */
export async function analyzeWritingStyle(options?: AnalyzeOptions): Promise<WritingProfile> {
  const limit = options?.limit ?? 80;
  const samples = await loadSentSamples(limit);
  if (samples.length < 3) {
    throw new Error("Te weinig verzonden mails om te analyseren (minimaal 3 met body)");
  }

  const avgLength = Math.round(
    samples.reduce((sum, s) => sum + s.wordCount, 0) / samples.length
  );
  const wordFrequency = topWords(samples.map((s) => s.text));
  const sentencePatterns = detectPatterns(samples);
  const { rules, confidence } = await generateDetectedRules(sentencePatterns, samples);

  const existing = await getWritingProfile();
  const changed =
    !existing ||
    similarityScore(existing.detectedRules, rules) < 0.7;

  const pendingSuggestion = changed ? rules : existing?.pendingSuggestion ?? null;
  const suggestionStatus = changed
    ? "pending"
    : existing?.suggestionStatus ?? "pending";

  await query(
    `INSERT INTO writing_profile (
       id, avg_length, word_frequency, sentence_patterns, detected_rules,
       confidence, analyzed_at, updated_at, sample_count, pending_suggestion, suggestion_status
     ) VALUES (1, $1, $2, $3, $4, $5, NOW(), NOW(), $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       avg_length = EXCLUDED.avg_length,
       word_frequency = EXCLUDED.word_frequency,
       sentence_patterns = EXCLUDED.sentence_patterns,
       detected_rules = EXCLUDED.detected_rules,
       confidence = EXCLUDED.confidence,
       analyzed_at = NOW(),
       updated_at = NOW(),
       sample_count = EXCLUDED.sample_count,
       pending_suggestion = EXCLUDED.pending_suggestion,
       suggestion_status = EXCLUDED.suggestion_status`,
    [
      avgLength,
      JSON.stringify(wordFrequency),
      sentencePatterns,
      rules,
      confidence,
      samples.length,
      pendingSuggestion,
      suggestionStatus,
    ]
  );

  const profile = await getWritingProfile();
  if (!profile) throw new Error("writing_profile niet opgeslagen");
  return profile;
}

/** Rough token overlap score between two rule texts (0-1). */
function similarityScore(a: string, b: string): number {
  const tokens = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 2)
    );
  const setA = tokens(a);
  const setB = tokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap += 1;
  return overlap / Math.max(setA.size, setB.size);
}

export async function setSuggestionStatus(
  status: "accepted" | "rejected" | "pending",
  tweakedRules?: string
): Promise<WritingProfile> {
  const profile = await getWritingProfile();
  if (!profile) throw new Error("Nog geen writing profile — voer eerst analyse uit");

  const pending =
    status === "pending" && tweakedRules !== undefined
      ? tweakedRules
      : profile.pendingSuggestion;

  await query(
    `UPDATE writing_profile
     SET suggestion_status = $1,
         pending_suggestion = $2,
         updated_at = NOW()
     WHERE id = 1`,
    [status, pending]
  );

  const updated = await getWritingProfile();
  if (!updated) throw new Error("Update mislukt");
  return updated;
}

/** True when profile is older than 14 days (or missing). */
export function needsRefresh(profile: WritingProfile | null): boolean {
  if (!profile) return true;
  const ageMs = Date.now() - new Date(profile.analyzedAt).getTime();
  return ageMs > 14 * 24 * 60 * 60 * 1000;
}

/**
 * Continuous learning: re-analyze last 20 sent mails when due.
 * Returns whether a significant change was detected.
 */
export async function refreshIfDue(): Promise<{
  refreshed: boolean;
  significantChange: boolean;
  profile: WritingProfile | null;
}> {
  const existing = await getWritingProfile();
  if (!needsRefresh(existing)) {
    return { refreshed: false, significantChange: false, profile: existing };
  }

  const previousRules = existing?.detectedRules ?? "";
  const profile = await analyzeWritingStyle({ limit: 20, continuous: true });
  const significantChange =
    !previousRules || similarityScore(previousRules, profile.detectedRules) < 0.7;

  return { refreshed: true, significantChange, profile };
}
