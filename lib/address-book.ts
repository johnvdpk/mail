import { query } from "./db";

export type AddressSuggestion = {
  email: string;
  name: string | null;
};

/**
 * Suggest email addresses for autocomplete in the To/CC/BCC fields, built from
 * everyone we've ever sent to or received mail from (from_name/from_email plus
 * the "to" and "cc" recipient lists), ranked by how often + how recently they appear.
 */
export async function suggestAddresses(term: string, limit = 8): Promise<AddressSuggestion[]> {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];

  const { rows } = await query<{ email: string; name: string | null }>(
    `WITH parties AS (
       SELECT from_email AS email, from_name AS name, date FROM messages WHERE from_email IS NOT NULL
       UNION ALL
       SELECT r->>'email' AS email, r->>'name' AS name, date
       FROM messages, jsonb_array_elements("to") AS r
       WHERE r->>'email' IS NOT NULL
       UNION ALL
       SELECT r->>'email' AS email, r->>'name' AS name, date
       FROM messages, jsonb_array_elements(cc) AS r
       WHERE r->>'email' IS NOT NULL
     ),
     ranked AS (
       SELECT
         lower(email) AS email_lc,
         email,
         name,
         count(*) AS hits,
         max(date) AS last_seen
       FROM parties
       WHERE email <> ''
         AND (lower(email) LIKE $1 OR lower(coalesce(name, '')) LIKE $1)
       GROUP BY lower(email), email, name
     )
     SELECT email, name FROM (
       SELECT DISTINCT ON (email_lc) email, name, hits, last_seen
       FROM ranked
       ORDER BY email_lc, hits DESC, last_seen DESC
     ) deduped
     ORDER BY hits DESC, last_seen DESC
     LIMIT $2`,
    [`${needle}%`, limit]
  );

  return rows.map((r) => ({ email: r.email, name: r.name }));
}
