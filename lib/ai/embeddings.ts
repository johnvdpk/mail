import { env, loadEnvFromFile } from "../config/env";
import { query, queryOne } from "../shared/db";
import { isOpenRouterConfigured } from "./openrouter";

const EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const MAX_INPUT_CHARS = 8000;

export function getEmbeddingModel(): string {
  loadEnvFromFile();
  return env("OPENROUTER_EMBEDDING_MODEL") ?? DEFAULT_EMBEDDING_MODEL;
}

/** Format a float vector for pgvector `$n::vector` parameters. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

/**
 * Create an embedding via OpenRouter.
 * Returns a 1536-dim vector for openai/text-embedding-3-small.
 */
export async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = env("OPENROUTER_AI");
  if (!apiKey) {
    throw new Error("OPENROUTER_AI niet geconfigureerd in .env.local (projectroot)");
  }

  const input = text.replace(/\s+/g, " ").trim().slice(0, MAX_INPUT_CHARS);
  if (!input) {
    throw new Error("Lege tekst kan niet worden geëmbed");
  }

  const response = await fetch(EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://aiadapt.nl",
      "X-OpenRouter-Title": "Mail AI",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getEmbeddingModel(),
      input,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`OpenRouter embeddings fout (${response.status}): ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    data?: { embedding?: number[] }[];
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const embedding = data.data?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Onverwachte embedding-dimensie: ${embedding?.length ?? 0} (verwacht ${EMBEDDING_DIMS})`
    );
  }

  return embedding;
}

/** Build embeddable text from message fields. */
export function buildEmbedText(parts: {
  subject?: string | null;
  snippet?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  textBody?: string | null;
}): string {
  const lines = [
    parts.subject?.trim(),
    [parts.fromName, parts.fromEmail].filter(Boolean).join(" "),
    parts.snippet?.trim(),
    parts.textBody?.trim(),
  ].filter(Boolean);
  return lines.join("\n").slice(0, MAX_INPUT_CHARS);
}

/** Upsert embedding for one message. */
export async function upsertMessageEmbedding(
  messageId: string,
  embedding: number[]
): Promise<void> {
  await query(
    `INSERT INTO message_embeddings (message_id, embedding, updated_at)
     VALUES ($1, $2::vector, NOW())
     ON CONFLICT (message_id) DO UPDATE SET
       embedding = EXCLUDED.embedding,
       updated_at = NOW()`,
    [messageId, toVectorLiteral(embedding)]
  );
}

/**
 * Ensure embeddings exist for the given message ids (subject/snippet/body).
 * Skips ids that already have an embedding. Best-effort; logs failures.
 */
export async function ensureEmbeddingsForMessageIds(
  messageIds: string[],
  options?: { limit?: number }
): Promise<number> {
  if (!isOpenRouterConfigured() || messageIds.length === 0) return 0;

  const limit = options?.limit ?? 40;
  const { rows } = await query<{
    id: string;
    subject: string;
    snippet: string;
    from_name: string | null;
    from_email: string | null;
    text_body: string | null;
  }>(
    `SELECT m.id, m.subject, m.snippet, m.from_name, m.from_email, b.text_body
     FROM messages m
     LEFT JOIN bodies b ON b.message_id = m.id
     LEFT JOIN message_embeddings e ON e.message_id = m.id
     WHERE m.id = ANY($1::text[])
       AND e.message_id IS NULL
       AND m.draft = FALSE
     LIMIT $2`,
    [messageIds, limit]
  );

  let created = 0;
  for (const row of rows) {
    try {
      const text = buildEmbedText({
        subject: row.subject,
        snippet: row.snippet,
        fromName: row.from_name,
        fromEmail: row.from_email,
        textBody: row.text_body,
      });
      if (!text.trim()) continue;
      const embedding = await createEmbedding(text);
      await upsertMessageEmbedding(row.id, embedding);
      created += 1;
    } catch (err) {
      console.error("[embeddings] failed for", row.id, err);
    }
  }
  return created;
}

/** Progress counts for the historical embedding backfill. */
export type EmbeddingBackfillStatus = {
  total: number;
  embedded: number;
  pending: number;
};

/** Count embedded vs pending non-draft messages. */
export async function getEmbeddingBackfillStatus(): Promise<EmbeddingBackfillStatus> {
  const row = await queryOne<{ total: number; embedded: number }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(e.message_id)::int AS embedded
     FROM messages m
     LEFT JOIN message_embeddings e ON e.message_id = m.id
     WHERE m.draft = FALSE`
  );
  const total = row?.total ?? 0;
  const embedded = row?.embedded ?? 0;
  return { total, embedded, pending: Math.max(0, total - embedded) };
}

/**
 * Backfill embeddings for recent messages missing vectors.
 * Used by the semantic search phase.
 */
export async function backfillRecentEmbeddings(limit = 50): Promise<number> {
  if (!isOpenRouterConfigured()) return 0;

  const { rows } = await query<{ id: string }>(
    `SELECT m.id
     FROM messages m
     LEFT JOIN message_embeddings e ON e.message_id = m.id
     WHERE e.message_id IS NULL
       AND m.draft = FALSE
     ORDER BY m.date DESC
     LIMIT $1`,
    [limit]
  );

  return ensureEmbeddingsForMessageIds(
    rows.map((r) => r.id),
    { limit }
  );
}

/** Default batch size for the background historical embedding backfill. */
export const EMBEDDING_BACKFILL_BATCH_SIZE = 50;

/**
 * Backfill embeddings for the oldest messages still missing vectors.
 * Runs independently of active search jobs to clear historical backlog.
 */
export async function backfillOldestEmbeddings(
  limit = EMBEDDING_BACKFILL_BATCH_SIZE
): Promise<number> {
  if (!isOpenRouterConfigured()) return 0;

  const { rows } = await query<{ id: string }>(
    `SELECT m.id
     FROM messages m
     LEFT JOIN message_embeddings e ON e.message_id = m.id
     WHERE e.message_id IS NULL
       AND m.draft = FALSE
     ORDER BY m.date ASC
     LIMIT $1`,
    [limit]
  );

  return ensureEmbeddingsForMessageIds(
    rows.map((r) => r.id),
    { limit }
  );
}

/** Find nearest messages by cosine distance (pgvector <=>). */
export async function findSimilarMessages(
  embedding: number[],
  options?: { limit?: number; excludeIds?: string[]; minSimilarity?: number }
): Promise<Array<{ messageId: string; similarity: number }>> {
  const limit = options?.limit ?? 20;
  const exclude = options?.excludeIds ?? [];
  const minSimilarity = options?.minSimilarity ?? 0.35;

  const { rows } = await query<{ message_id: string; similarity: number }>(
    `SELECT e.message_id,
            (1 - (e.embedding <=> $1::vector))::float AS similarity
     FROM message_embeddings e
     JOIN messages m ON m.id = e.message_id
     WHERE m.draft = FALSE
       AND ($2::text[] IS NULL OR cardinality($2::text[]) = 0 OR NOT (e.message_id = ANY($2::text[])))
     ORDER BY e.embedding <=> $1::vector
     LIMIT $3`,
    [toVectorLiteral(embedding), exclude, limit]
  );

  return rows
    .filter((r) => r.similarity >= minSimilarity)
    .map((r) => ({ messageId: r.message_id, similarity: r.similarity }));
}

/** Check whether a message already has an embedding. */
export async function hasEmbedding(messageId: string): Promise<boolean> {
  const row = await queryOne<{ message_id: string }>(
    `SELECT message_id FROM message_embeddings WHERE message_id = $1`,
    [messageId]
  );
  return Boolean(row);
}
