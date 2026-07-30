import { query, queryOne, transaction } from "./db";
import type { CalendarInvite } from "./ics";
import type { MailFolder, MessageBody, MessageSummary } from "./types";

export type FolderCache = {
  path: string;
  uidValidity?: string;
  lastUid: number;
  syncedAt?: string;
  messages: MessageSummary[];
};

// ── Folders ──────────────────────────────────────────────────────────

export async function readFoldersCache(): Promise<MailFolder[]> {
  const { rows } = await query<{
    path: string;
    name: string;
    role: string | null;
    parent_path: string;
    subscribed: boolean;
  }>("SELECT path, name, role, parent_path, subscribed FROM folders ORDER BY path");

  return rows.map((r) => ({
    path: r.path,
    name: r.name,
    role: r.role as MailFolder["role"],
    parentPath: r.parent_path,
    subscribed: r.subscribed,
  }));
}

export async function writeFoldersCache(folders: MailFolder[]): Promise<void> {
  await transaction(async (client) => {
    await client.query("DELETE FROM folders WHERE path NOT IN (SELECT unnest($1::text[]))", [
      folders.map((f) => f.path),
    ]);

    for (const f of folders) {
      await client.query(
        `INSERT INTO folders (path, name, role, parent_path, subscribed)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (path) DO UPDATE SET
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           parent_path = EXCLUDED.parent_path,
           subscribed = EXCLUDED.subscribed`,
        [f.path, f.name, f.role ?? null, f.parentPath, f.subscribed]
      );
    }
  });
}

// ── Folder sync state ────────────────────────────────────────────────

export async function readFolderCache(folderPath: string): Promise<FolderCache> {
  const sync = await queryOne<{
    uid_validity: string | null;
    last_uid: number;
    synced_at: Date | null;
  }>("SELECT uid_validity, last_uid, synced_at FROM folder_sync WHERE folder_path = $1", [
    folderPath,
  ]);

  const { rows: messages } = await query<MessageRow>(
    "SELECT * FROM messages WHERE folder = $1 ORDER BY date DESC",
    [folderPath]
  );

  return {
    path: folderPath,
    uidValidity: sync?.uid_validity ?? undefined,
    lastUid: sync?.last_uid ?? 0,
    syncedAt: sync?.synced_at?.toISOString(),
    messages: messages.map(rowToSummary),
  };
}

export async function writeFolderCache(cache: FolderCache): Promise<void> {
  await transaction(async (client) => {
    // Ensure folder exists
    await client.query(
      "INSERT INTO folders (path, name) VALUES ($1, $1) ON CONFLICT (path) DO NOTHING",
      [cache.path]
    );

    await client.query(
      `INSERT INTO folder_sync (folder_path, uid_validity, last_uid, synced_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (folder_path) DO UPDATE SET
         uid_validity = EXCLUDED.uid_validity,
         last_uid = EXCLUDED.last_uid,
         synced_at = EXCLUDED.synced_at`,
      [cache.path, cache.uidValidity ?? null, cache.lastUid, cache.syncedAt ?? new Date().toISOString()]
    );

    for (const m of cache.messages) {
      await client.query(
        `INSERT INTO messages (id, folder, uid, message_id, in_reply_to, "references",
           from_name, from_email, "to", cc, subject, snippet, date,
           seen, flagged, answered, draft, has_attachments)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (id) DO UPDATE SET
           seen = EXCLUDED.seen,
           flagged = EXCLUDED.flagged,
           answered = EXCLUDED.answered,
           draft = EXCLUDED.draft,
           snippet = EXCLUDED.snippet`,
        [
          m.id, m.folder, m.uid, m.messageId ?? null, m.inReplyTo ?? null, m.references,
          m.from?.name ?? null, m.from?.email ?? null, JSON.stringify(m.to), JSON.stringify(m.cc),
          m.subject, m.snippet, m.date,
          m.seen, m.flagged, m.answered, m.draft, m.hasAttachments,
        ]
      );
    }
  });
}

export function mergeSummaries(
  existing: MessageSummary[],
  incoming: MessageSummary[]
): MessageSummary[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// ── Message patching ─────────────────────────────────────────────────

export async function patchSummary(
  folderPath: string,
  id: string,
  patch: Partial<MessageSummary>
): Promise<MessageSummary | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const allowed: Record<string, string> = {
    seen: "seen",
    flagged: "flagged",
    answered: "answered",
    draft: "draft",
    snippet: "snippet",
    subject: "subject",
  };

  for (const [key, col] of Object.entries(allowed)) {
    if (key in patch) {
      sets.push(`"${col}" = $${idx}`);
      params.push((patch as Record<string, unknown>)[key]);
      idx++;
    }
  }

  if (sets.length === 0) return null;

  params.push(id, folderPath);
  const result = await queryOne<MessageRow>(
    `UPDATE messages SET ${sets.join(", ")} WHERE id = $${idx} AND folder = $${idx + 1} RETURNING *`,
    params
  );

  return result ? rowToSummary(result) : null;
}

export async function removeSummaries(folderPath: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await query("DELETE FROM messages WHERE folder = $1 AND id = ANY($2::text[])", [folderPath, ids]);
}

export async function readAllSummaries(): Promise<MessageSummary[]> {
  const { rows } = await query<MessageRow>("SELECT * FROM messages ORDER BY date DESC");
  return rows.map(rowToSummary);
}

// ── Bodies ───────────────────────────────────────────────────────────

export async function readBody(id: string): Promise<MessageBody | null> {
  const row = await queryOne<{
    message_id: string;
    text_body: string;
    html_body: string | null;
    attachments: unknown;
    calendar_invite: unknown;
    loaded_at: Date;
  }>("SELECT * FROM bodies WHERE message_id = $1", [id]);

  if (!row) return null;
  return {
    id: row.message_id,
    text: row.text_body,
    html: row.html_body ?? undefined,
    attachments: row.attachments as MessageBody["attachments"],
    calendarInvite: (row.calendar_invite as CalendarInvite | null) ?? undefined,
    loadedAt: row.loaded_at.toISOString(),
  };
}

export async function writeBody(body: MessageBody): Promise<void> {
  await query(
    `INSERT INTO bodies (message_id, text_body, html_body, attachments, calendar_invite, loaded_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (message_id) DO UPDATE SET
       text_body = EXCLUDED.text_body,
       html_body = EXCLUDED.html_body,
       attachments = EXCLUDED.attachments,
       calendar_invite = EXCLUDED.calendar_invite,
       loaded_at = EXCLUDED.loaded_at`,
    [
      body.id,
      body.text,
      body.html ?? null,
      JSON.stringify(body.attachments),
      body.calendarInvite ? JSON.stringify(body.calendarInvite) : null,
      body.loadedAt,
    ]
  );
}

// ── Row mapping ──────────────────────────────────────────────────────

type MessageRow = {
  id: string;
  folder: string;
  uid: number;
  message_id: string | null;
  in_reply_to: string | null;
  references: string[];
  from_name: string | null;
  from_email: string | null;
  to: unknown;
  cc: unknown;
  subject: string;
  snippet: string;
  date: Date;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  draft: boolean;
  has_attachments: boolean;
};

function rowToSummary(r: MessageRow): MessageSummary {
  return {
    id: r.id,
    folder: r.folder,
    uid: r.uid,
    messageId: r.message_id ?? undefined,
    inReplyTo: r.in_reply_to ?? undefined,
    references: r.references ?? [],
    from: r.from_email ? { name: r.from_name ?? undefined, email: r.from_email } : undefined,
    to: (typeof r.to === "string" ? JSON.parse(r.to) : r.to) as MessageSummary["to"],
    cc: (typeof r.cc === "string" ? JSON.parse(r.cc) : r.cc) as MessageSummary["cc"],
    subject: r.subject,
    snippet: r.snippet,
    date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
    seen: r.seen,
    flagged: r.flagged,
    answered: r.answered,
    draft: r.draft,
    hasAttachments: r.has_attachments,
  };
}
