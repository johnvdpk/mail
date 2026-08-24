import { query, queryOne } from "../../shared/db";
import {
  backfillRecentEmbeddings,
  createEmbedding,
  findSimilarMessages,
} from "../../ai/embeddings";
import type { SearchJobView } from "../../shared/search-types";
import { getSearchJob, setJobStatus } from "./jobs";
import { assessCandidates, excludeOwnSender, loadCandidatesByIds } from "./keyword-phase";
import { insertResults } from "./results";
import type { JobRow } from "./types";

const SEMANTIC_CANDIDATE_LIMIT = 15;

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
