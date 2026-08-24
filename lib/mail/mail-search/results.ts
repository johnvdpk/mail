import { query, queryOne } from "../../shared/db";
import { normalizeEmail } from "../../shared/normalize";
import type { SearchMatchType, SearchResultView } from "../../shared/search-types";
import type { AssessedMatch, ResultRow } from "./types";

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

export async function insertResults(
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

export async function loadJobResults(jobId: number): Promise<SearchResultView[]> {
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
