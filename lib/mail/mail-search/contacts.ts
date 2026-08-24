import { query, queryOne } from "../../shared/db";
import type { ContactStatus, ContactView } from "../../shared/search-types";
import type { ContactRow } from "./types";

const CONTACT_STATUSES: ContactStatus[] = ["nieuw", "benaderd", "geen_interesse", "klant"];

function asContactStatus(raw: string): ContactStatus {
  return (CONTACT_STATUSES as string[]).includes(raw) ? (raw as ContactStatus) : "nieuw";
}

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
