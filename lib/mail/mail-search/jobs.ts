import { query, queryOne } from "../../shared/db";
import type {
  SearchJobStatus,
  SearchJobSummary,
  SearchJobView,
  SearchResultView,
} from "../../shared/search-types";
import { assessCandidates, extractKeywords, findKeywordCandidates, parseKeywords } from "./keyword-phase";
import { insertResults, loadJobResults } from "./results";
import type { JobRow } from "./types";

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

export async function setJobStatus(
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
