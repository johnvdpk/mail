import { chatCompletion, getHeavyModel } from "./openrouter";
import { query, queryOne } from "./db";
import { parseJsonObject } from "./llm-json";
import { ownAddresses } from "./imap";
import { normalizeEmail } from "./normalize";
import {
  backfillRecentEmbeddings,
  createEmbedding,
  findSimilarMessages,
} from "./embeddings";
import type {
  ContactStatus,
  ContactView,
  SearchJobStatus,
  SearchJobSummary,
  SearchJobView,
  SearchMatchType,
  SearchResultView,
} from "./search-types";

const KEYWORD_CANDIDATE_LIMIT = 40;
const ASSESS_BATCH_SIZE = 8;
// Cap concurrent LLM batch calls to stay within OpenRouter rate limits.
const ASSESS_MAX_CONCURRENCY = 4;
const SEMANTIC_CANDIDATE_LIMIT = 15;
const CONTACT_STATUSES: ContactStatus[] = ["nieuw", "benaderd", "geen_interesse", "klant"];

type CandidateRow = {
  id: string;
  subject: string;
  snippet: string;
  from_name: string | null;
  from_email: string | null;
  date: Date;
  text_body: string | null;
};

type AssessedMatch = {
  messageId: string;
  isMatch: boolean;
  relevance: number;
  contactName: string | null;
  contactEmail: string | null;
  contactCompany: string | null;
  reasoning: string;
};

function asStatus(raw: string): SearchJobStatus {
  return asSearchJobStatus(raw);
}

/** Map a raw DB status string to a known SearchJobStatus. */
export function asSearchJobStatus(raw: string): SearchJobStatus {
  const allowed: SearchJobStatus[] = [
    "pending",
    "keyword_running",
    "keyword_done",
    "semantic_running",
    "done",
    "failed",
  ];
  return allowed.includes(raw as SearchJobStatus) ? (raw as SearchJobStatus) : "failed";
}

export function parseKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((k): k is string => typeof k === "string")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function asContactStatus(raw: string): ContactStatus {
  return (CONTACT_STATUSES as string[]).includes(raw) ? (raw as ContactStatus) : "nieuw";
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

export type SearchCandidateRef = {
  id: string;
  from_name: string | null;
  from_email: string | null;
};

export type ParsedAssessedMatch = {
  messageId: string;
  isMatch: boolean;
  relevance: number;
  contactName: string | null;
  contactEmail: string | null;
  contactCompany: string | null;
  reasoning: string;
};

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

async function setJobStatus(
  jobId: number,
  status: SearchJobStatus,
  extra?: { keywords?: string[]; error?: string | null }
): Promise<void> {
  if (extra?.keywords) {
    await query(
      `UPDATE search_jobs
       SET status = $2, keywords = $3::jsonb, error = $4, updated_at = NOW()
       WHERE id = $1`,
      [jobId, status, JSON.stringify(extra.keywords), extra.error ?? null]
    );
    return;
  }
  await query(
    `UPDATE search_jobs SET status = $2, error = $3, updated_at = NOW() WHERE id = $1`,
    [jobId, status, extra?.error ?? null]
  );
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
function excludeOwnSender(rows: CandidateRow[]): CandidateRow[] {
  const mine = ownAddresses();
  if (mine.size === 0) return rows;
  return rows.filter((r) => !r.from_email || !mine.has(normalizeEmail(r.from_email)));
}

async function findKeywordCandidates(keywords: string[]): Promise<CandidateRow[]> {
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

async function loadCandidatesByIds(ids: string[]): Promise<CandidateRow[]> {
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
async function assessCandidates(
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

/** Keep only matches whose message_id still exists (avoids FK violations). */
async function filterExistingMatches(matches: AssessedMatch[]): Promise<AssessedMatch[]> {
  if (matches.length === 0) return [];
  const ids = [...new Set(matches.map((m) => m.messageId))];
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM messages WHERE id = ANY($1::text[])`,
    [ids]
  );
  const existing = new Set(rows.map((r) => r.id));
  return matches.filter((m) => existing.has(m.messageId));
}

/**
 * Upsert a contact by e-mail address (case-insensitive). Fills in name/company
 * when the LLM found better data, keeps the earliest first_seen_at, and bumps
 * last_seen_at on every match. Returns null when there's no usable e-mail.
 */
async function upsertContact(
  email: string | null,
  name: string | null,
  company: string | null
): Promise<number | null> {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const row = await queryOne<{ id: number }>(
    `INSERT INTO contacts (email, name, company, first_seen_at, last_seen_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, contacts.name),
       company = COALESCE(EXCLUDED.company, contacts.company),
       last_seen_at = NOW()
     RETURNING id`,
    [normalized, name, company]
  );
  return row?.id ?? null;
}

async function insertResults(
  jobId: number,
  matchType: SearchMatchType,
  matches: AssessedMatch[],
  relevanceOverride?: Map<string, number>
): Promise<void> {
  const valid = await filterExistingMatches(matches);
  for (const match of valid) {
    const relevance =
      relevanceOverride?.get(match.messageId) ?? match.relevance;
    const contactId = await upsertContact(match.contactEmail, match.contactName, match.contactCompany);
    // WHERE EXISTS: skip if the message was deleted between assess and insert
    await query(
      `INSERT INTO search_results
         (job_id, message_id, match_type, relevance, contact_name, contact_email,
          contact_company, reasoning, contact_id)
       SELECT $1, m.id, $3, $4, $5, $6, $7, $8, $9
       FROM messages m
       WHERE m.id = $2
       ON CONFLICT (job_id, message_id) DO NOTHING`,
      [
        jobId,
        match.messageId,
        matchType,
        relevance,
        match.contactName,
        match.contactEmail,
        match.contactCompany,
        match.reasoning,
        contactId,
      ]
    );
  }
}

type JobRow = {
  id: number;
  prompt: string;
  status: string;
  keywords: unknown;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

type ResultRow = {
  id: number;
  message_id: string;
  match_type: string;
  relevance: number | null;
  contact_id: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_company: string | null;
  reasoning: string | null;
  subject: string;
  from_name: string | null;
  from_email: string | null;
  date: Date;
  snippet: string;
};

function mapResult(row: ResultRow): SearchResultView {
  return {
    id: row.id,
    messageId: row.message_id,
    matchType: row.match_type === "semantic" ? "semantic" : "keyword",
    relevance: row.relevance,
    contactId: row.contact_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactCompany: row.contact_company,
    reasoning: row.reasoning,
    subject: row.subject,
    fromName: row.from_name,
    fromEmail: row.from_email,
    date: row.date.toISOString(),
    snippet: row.snippet,
    mailCount: 1,
  };
}

/**
 * Group results per contact (contact_id, falling back to contact/from e-mail
 * for older rows without a contact link) so the same person doesn't show up
 * multiple times. Keeps the highest-relevance mail per contact and tracks how
 * many underlying mails were deduped into it.
 */
function dedupeByContact(results: SearchResultView[]): SearchResultView[] {
  const groups = new Map<string, SearchResultView[]>();

  for (const result of results) {
    const email = result.contactEmail || result.fromEmail;
    const key =
      result.contactId != null
        ? `id:${result.contactId}`
        : email
          ? `email:${normalizeEmail(email)}`
          : `msg:${result.messageId}`;
    const group = groups.get(key);
    if (group) group.push(result);
    else groups.set(key, [result]);
  }

  const deduped = [...groups.values()].map((group) => {
    const best = group.reduce((a, b) => ((b.relevance ?? 0) > (a.relevance ?? 0) ? b : a));
    return { ...best, mailCount: group.length };
  });

  return deduped.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}

async function loadJobResults(jobId: number): Promise<SearchResultView[]> {
  const { rows } = await query<ResultRow>(
    `SELECT r.id, r.message_id, r.match_type, r.relevance, r.contact_id, r.contact_name,
            r.contact_email, r.contact_company, r.reasoning,
            m.subject, m.from_name, m.from_email, m.date, m.snippet
     FROM search_results r
     JOIN messages m ON m.id = r.message_id
     WHERE r.job_id = $1
     ORDER BY r.relevance DESC NULLS LAST, r.created_at ASC`,
    [jobId]
  );
  return dedupeByContact(rows.map(mapResult));
}

function mapJob(row: JobRow, results: SearchResultView[]): SearchJobView {
  return {
    id: row.id,
    prompt: row.prompt,
    status: asStatus(row.status),
    keywords: parseKeywords(row.keywords),
    error: row.error,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    results,
  };
}

export async function getSearchJob(jobId: number): Promise<SearchJobView | null> {
  const row = await queryOne<JobRow>(`SELECT * FROM search_jobs WHERE id = $1`, [jobId]);
  if (!row) return null;
  const results = await loadJobResults(jobId);
  return mapJob(row, results);
}

/** Delete a search job and its results (CASCADE). */
export async function deleteSearchJob(jobId: number): Promise<boolean> {
  const result = await query(`DELETE FROM search_jobs WHERE id = $1`, [jobId]);
  return (result.rowCount ?? 0) > 0;
}

type ContactRow = {
  id: number;
  email: string;
  name: string | null;
  company: string | null;
  status: string;
  note: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  result_count: string;
};

function mapContact(row: ContactRow): ContactView {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    company: row.company,
    status: asContactStatus(row.status),
    note: row.note,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    resultCount: Number(row.result_count) || 0,
  };
}

const CONTACT_SELECT = `
  SELECT c.id, c.email, c.name, c.company, c.status, c.note,
         c.first_seen_at, c.last_seen_at,
         COUNT(r.id)::text AS result_count
  FROM contacts c
  LEFT JOIN search_results r ON r.contact_id = c.id
`;

/** List persistent contacts discovered across all search jobs, optionally filtered by status. */
export async function listContacts(status?: ContactStatus): Promise<ContactView[]> {
  const { rows } = await query<ContactRow>(
    `${CONTACT_SELECT}
     WHERE $1::text IS NULL OR c.status = $1
     GROUP BY c.id
     ORDER BY c.last_seen_at DESC`,
    [status ?? null]
  );
  return rows.map(mapContact);
}

/** Update a contact's status and/or note. Returns the updated contact, or null if not found. */
export async function updateContact(
  id: number,
  fields: { status?: ContactStatus; note?: string | null }
): Promise<ContactView | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];

  if (fields.status !== undefined) {
    params.push(fields.status);
    sets.push(`status = $${params.length}`);
  }
  if (fields.note !== undefined) {
    params.push(fields.note);
    sets.push(`note = $${params.length}`);
  }

  if (sets.length > 0) {
    await query(`UPDATE contacts SET ${sets.join(", ")} WHERE id = $1`, params);
  }

  const row = await queryOne<ContactRow>(
    `${CONTACT_SELECT} WHERE c.id = $1 GROUP BY c.id`,
    [id]
  );
  return row ? mapContact(row) : null;
}

export async function listSearchJobs(limit = 30): Promise<SearchJobSummary[]> {
  const { rows } = await query<{
    id: number;
    prompt: string;
    status: string;
    created_at: Date;
    updated_at: Date;
    result_count: string;
  }>(
    // Count distinct contacts (not raw rows) so the number matches the
    // deduped result list shown when a job is opened.
    `SELECT j.id, j.prompt, j.status, j.created_at, j.updated_at,
            COUNT(DISTINCT COALESCE(
              r.contact_id::text, LOWER(r.contact_email), LOWER(m.from_email), r.message_id
            ))::text AS result_count
     FROM search_jobs j
     LEFT JOIN search_results r ON r.job_id = j.id
     LEFT JOIN messages m ON m.id = r.message_id
     GROUP BY j.id
     ORDER BY j.created_at DESC
     LIMIT $1`,
    [limit]
  );

  return rows.map((row) => ({
    id: row.id,
    prompt: row.prompt,
    status: asStatus(row.status),
    resultCount: Number(row.result_count) || 0,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * Run the fast keyword phase for an existing job.
 * Tracks which step is running so a failure can be attributed precisely
 * (keyword extraction vs. finding candidates vs. assessing them) instead of
 * only storing the generic error message.
 */
export async function runKeywordPhase(jobId: number): Promise<SearchJobView> {
  const job = await queryOne<JobRow>(`SELECT * FROM search_jobs WHERE id = $1`, [jobId]);
  if (!job) throw new Error(`Zoekopdracht ${jobId} niet gevonden`);

  let step = "keyword-extractie";
  try {
    await setJobStatus(jobId, "keyword_running");

    const keywords = await extractKeywords(job.prompt);
    await setJobStatus(jobId, "keyword_running", { keywords });

    step = "kandidaten ophalen";
    const candidates = await findKeywordCandidates(keywords);

    step = "kandidaten beoordelen";
    const matches = await assessCandidates(job.prompt, candidates);
    await insertResults(jobId, "keyword", matches);

    await setJobStatus(jobId, "keyword_done");
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const message = `Keyword-fase mislukt bij stap "${step}": ${rawMessage}`;
    console.error(`[mail-search] runKeywordPhase job=${jobId} step="${step}" failed:`, err);
    await setJobStatus(jobId, "failed", { error: message });
    throw err;
  }

  const view = await getSearchJob(jobId);
  if (!view) throw new Error("Zoekopdracht verdwenen na keyword-fase");
  return view;
}

/**
 * Create a job and run the keyword phase immediately.
 * Semantic enrichment continues asynchronously via mail-jobs.
 */
export async function startSearchJob(prompt: string): Promise<SearchJobView> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("prompt verplicht");

  const row = await queryOne<{ id: number }>(
    `INSERT INTO search_jobs (prompt, status)
     VALUES ($1, 'pending')
     RETURNING id`,
    [trimmed]
  );
  if (!row) throw new Error("Kon zoekopdracht niet aanmaken");

  return runKeywordPhase(row.id);
}

/**
 * Semantic enrichment: embed prompt, find similar mails, assess and store.
 * Same per-step logging as the keyword phase, so a failure here doesn't just
 * store a generic "Semantische zoekfase mislukt" message.
 */
export async function runSemanticPhase(jobId: number): Promise<SearchJobView> {
  const job = await queryOne<JobRow>(`SELECT * FROM search_jobs WHERE id = $1`, [jobId]);
  if (!job) throw new Error(`Zoekopdracht ${jobId} niet gevonden`);

  let step = "embeddings backfillen";
  try {
    await setJobStatus(jobId, "semantic_running");

    await backfillRecentEmbeddings(40);

    step = "prompt embedden";
    const promptEmbedding = await createEmbedding(job.prompt);

    step = "vergelijkbare mails zoeken";
    const existing = await query<{ message_id: string }>(
      `SELECT message_id FROM search_results WHERE job_id = $1`,
      [jobId]
    );
    const excludeIds = existing.rows.map((r) => r.message_id);

    const similar = await findSimilarMessages(promptEmbedding, {
      limit: SEMANTIC_CANDIDATE_LIMIT,
      excludeIds,
      minSimilarity: 0.35,
    });

    step = "kandidaten beoordelen";
    const candidates = excludeOwnSender(await loadCandidatesByIds(similar.map((s) => s.messageId)));
    const matches = await assessCandidates(job.prompt, candidates);

    const relevanceOverride = new Map(
      similar.map((s) => [s.messageId, Math.round(s.similarity * 1000) / 1000])
    );
    await insertResults(jobId, "semantic", matches, relevanceOverride);

    await setJobStatus(jobId, "done");
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const message = `Semantische fase mislukt bij stap "${step}": ${rawMessage}`;
    console.error(`[mail-search] runSemanticPhase job=${jobId} step="${step}" failed:`, err);
    // Keep keyword results usable; mark failed only if we never finished
    await setJobStatus(jobId, "failed", { error: message });
    throw err;
  }

  const view = await getSearchJob(jobId);
  if (!view) throw new Error("Zoekopdracht verdwenen na semantische fase");
  return view;
}

/**
 * Process jobs waiting for semantic enrichment (called from mail-jobs polling).
 */
export async function processPendingSemanticJobs(limit = 2): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `SELECT id FROM search_jobs
     WHERE status = 'keyword_done'
     ORDER BY updated_at ASC
     LIMIT $1`,
    [limit]
  );

  let processed = 0;
  for (const row of rows) {
    try {
      await runSemanticPhase(row.id);
      processed += 1;
    } catch (err) {
      console.error("[mail-search] semantic phase failed for job", row.id, err);
    }
  }
  return processed;
}
