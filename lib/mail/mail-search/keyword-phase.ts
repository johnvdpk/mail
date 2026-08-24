import { chatCompletion, getHeavyModel } from "../../ai/openrouter";
import { query } from "../../shared/db";
import { parseJsonObject } from "../../ai/llm-json";
import { ownAddresses } from "../imap";
import { normalizeEmail } from "../../shared/normalize";
import type {
  AssessedMatch,
  CandidateRow,
  ParsedAssessedMatch,
  SearchCandidateRef,
} from "./types";

const KEYWORD_CANDIDATE_LIMIT = 40;
const ASSESS_BATCH_SIZE = 8;
// Cap concurrent LLM batch calls to stay within OpenRouter rate limits.
const ASSESS_MAX_CONCURRENCY = 4;

export function parseKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((k): k is string => typeof k === "string")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Run async work over a list with a max concurrency, preserving result order.
 * Used to parallelize LLM batch calls without exceeding provider rate limits.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, runNext));
  return results;
}

/** Fallback keyword list when the LLM returns nothing useful. */
export function fallbackKeywordsFromPrompt(prompt: string): string[] {
  return prompt
    .split(/[\s,.;:!?]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3)
    .slice(0, 6);
}

/**
 * Parse one LLM assess row using batch index (pure, testable).
 * `mine` holds the user's own (normalized) email addresses: when the candidate
 * was sent by the user (outgoing mail), we never fall back to from_name/from_email
 * as "the customer", since that would just be the user themselves.
 */
export function parseAssessedMatchRow(
  row: Record<string, unknown>,
  batch: SearchCandidateRef[],
  mine: Set<string> = new Set()
): ParsedAssessedMatch | null {
  if (row.isMatch !== true) return null;

  const index =
    typeof row.index === "number"
      ? row.index
      : typeof row.index === "string"
        ? Number(row.index)
        : NaN;
  if (!Number.isInteger(index) || index < 0 || index >= batch.length) return null;

  const candidate = batch[index];
  const isOwnSender = candidate.from_email ? mine.has(normalizeEmail(candidate.from_email)) : false;
  const fallbackName = isOwnSender ? null : candidate.from_name ?? null;
  const fallbackEmail = isOwnSender ? null : candidate.from_email ?? null;

  let contactEmail =
    typeof row.contactEmail === "string" && row.contactEmail.trim()
      ? row.contactEmail.trim()
      : fallbackEmail;
  // Defensive: never register the user's own address as "the customer",
  // even if the LLM ignored the isOwnSender instruction.
  if (contactEmail && mine.has(normalizeEmail(contactEmail))) contactEmail = null;

  return {
    messageId: candidate.id,
    isMatch: true,
    relevance:
      typeof row.relevance === "number" ? Math.min(1, Math.max(0, row.relevance)) : 0.6,
    contactName:
      typeof row.contactName === "string" && row.contactName.trim()
        ? row.contactName.trim()
        : fallbackName,
    contactEmail,
    contactCompany: typeof row.contactCompany === "string" ? row.contactCompany.trim() : null,
    reasoning: typeof row.reasoning === "string" ? row.reasoning.trim() : "Relevante match",
  };
}

/**
 * Derive search keywords from a natural-language prompt via LLM.
 */
export async function extractKeywords(prompt: string): Promise<string[]> {
  const raw = await chatCompletion(
    [
      {
        role: "system",
        content: `Je leidt zoektermen af uit een zoekprompt over e-mail (bijv. potentiële klanten).
Antwoord uitsluitend als JSON:
- keywords (array van 3-8 korte strings, Nederlands én Engels waar nuttig)
Geen stopwoorden, geen volledige zinnen.`,
      },
      {
        role: "user",
        content: `Zoekprompt:\n${prompt}\n\nWelke zoektermen?`,
      },
    ],
    { jsonMode: true, temperature: 0.2 }
  );

  const parsed = parseJsonObject(raw);
  const keywords = parseKeywords(parsed?.keywords);
  if (keywords.length > 0) return keywords;

  // Fallback: split prompt into words longer than 3 chars
  return fallbackKeywordsFromPrompt(prompt);
}

/** Drop candidates sent by the user's own account (outgoing mail, not a customer). */
export function excludeOwnSender(rows: CandidateRow[]): CandidateRow[] {
  const mine = ownAddresses();
  if (mine.size === 0) return rows;
  return rows.filter((r) => !r.from_email || !mine.has(normalizeEmail(r.from_email)));
}

export async function findKeywordCandidates(keywords: string[]): Promise<CandidateRow[]> {
  if (keywords.length === 0) return [];

  const patterns = keywords.map((k) => `%${k.replace(/[%_]/g, "\\$&")}%`);
  const ownEmails = [...ownAddresses()];

  const { rows } = await query<CandidateRow>(
    `SELECT m.id, m.subject, m.snippet, m.from_name, m.from_email, m.date,
            b.text_body
     FROM messages m
     LEFT JOIN bodies b ON b.message_id = m.id
     WHERE m.draft = FALSE
       AND NOT (COALESCE(LOWER(m.from_email), '') = ANY($3::text[]))
       AND (
         m.subject ILIKE ANY($1::text[])
         OR m.snippet ILIKE ANY($1::text[])
         OR COALESCE(m.from_name, '') ILIKE ANY($1::text[])
         OR COALESCE(m.from_email, '') ILIKE ANY($1::text[])
         OR COALESCE(b.text_body, '') ILIKE ANY($1::text[])
       )
     ORDER BY m.date DESC
     LIMIT $2`,
    [patterns, KEYWORD_CANDIDATE_LIMIT, ownEmails]
  );

  return rows;
}

export async function loadCandidatesByIds(ids: string[]): Promise<CandidateRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<CandidateRow>(
    `SELECT m.id, m.subject, m.snippet, m.from_name, m.from_email, m.date,
            b.text_body
     FROM messages m
     LEFT JOIN bodies b ON b.message_id = m.id
     WHERE m.id = ANY($1::text[])`,
    [ids]
  );
  return rows;
}

/** Ask the LLM to assess a single batch of candidates. */
async function assessBatch(
  prompt: string,
  batch: CandidateRow[],
  mine: Set<string>
): Promise<AssessedMatch[]> {
  const payload = batch.map((c, index) => ({
    index,
    subject: c.subject,
    fromName: c.from_name,
    fromEmail: c.from_email,
    // True when the sender is the user's own account (outgoing mail): the
    // model must then look past from/fromEmail for the actual counterparty.
    isOwnSender: c.from_email ? mine.has(normalizeEmail(c.from_email)) : false,
    snippet: c.snippet.slice(0, 200),
    bodyPreview: (c.text_body ?? "").slice(0, 500),
  }));

  const raw = await chatCompletion(
    [
      {
        role: "system",
        content: `Je beoordeelt of e-mails passen bij een zoekopdracht (bijv. potentiële klanten).
Belangrijk: als "isOwnSender" true is, is fromName/fromEmail de gebruiker zelf (uitgaande mail) —
NIET de potentiële klant. Bepaal dan de tegenpartij (klant) uit bodyPreview/snippet (bijv. de
aanhef of ontvanger). Vul contactEmail/contactName in dat geval NOOIT met fromName/fromEmail; laat
ze null als de tegenpartij niet met zekerheid uit de inhoud is af te leiden.
Antwoord uitsluitend als JSON:
{
  "matches": [
    {
      "index": number (exact de index uit de kandidatenlijst),
      "isMatch": boolean,
      "relevance": number 0-1,
      "contactName": string|null,
      "contactEmail": string|null,
      "contactCompany": string|null,
      "reasoning": string (1 korte zin Nederlands)
    }
  ]
}
Neem alleen isMatch=true op als de mail echt relevant is.
Gebruik alleen index-waarden die in de kandidatenlijst staan.
contactEmail bij voorkeur fromEmail als die klopt en isOwnSender false is.`,
      },
      {
        role: "user",
        content: `Zoekopdracht: ${prompt}\n\nKandidaten:\n${JSON.stringify(payload)}`,
      },
    ],
    { jsonMode: true, temperature: 0.2, model: getHeavyModel() }
  );

  const parsed = parseJsonObject(raw);
  const list = Array.isArray(parsed?.matches) ? parsed.matches : [];
  const matches: AssessedMatch[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const match = parseAssessedMatchRow(row, batch, mine);
    if (match) matches.push(match);
  }

  return matches;
}

/**
 * Ask the LLM which candidates are real matches and extract contact fields.
 * Uses batch index (not free-form messageId) so the model cannot invent IDs.
 * Batches run with limited concurrency (respecting OpenRouter rate limits).
 * A single failing batch is logged and skipped rather than aborting the whole
 * phase — this previously caused a job to fail with 0 results whenever just
 * one out of several batches hit a transient LLM error. Only when *every*
 * batch fails do we surface an error, so the job doesn't falsely end up
 * "done" with zero results and no explanation.
 */
export async function assessCandidates(
  prompt: string,
  candidates: CandidateRow[]
): Promise<AssessedMatch[]> {
  if (candidates.length === 0) return [];
  const mine = ownAddresses();

  const batches: CandidateRow[][] = [];
  for (let i = 0; i < candidates.length; i += ASSESS_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + ASSESS_BATCH_SIZE));
  }

  const failures: unknown[] = [];
  const perBatch = await runWithConcurrency(batches, ASSESS_MAX_CONCURRENCY, async (batch, index) => {
    try {
      return await assessBatch(prompt, batch, mine);
    } catch (err) {
      console.error(
        `[mail-search] assessCandidates batch ${index + 1}/${batches.length} skipped after failure:`,
        err
      );
      failures.push(err);
      return [] as AssessedMatch[];
    }
  });

  if (failures.length > 0 && failures.length === batches.length) {
    const first = failures[0];
    throw first instanceof Error
      ? first
      : new Error(`Alle ${batches.length} beoordelingsbatches mislukten`);
  }

  return perBatch.flat();
}
