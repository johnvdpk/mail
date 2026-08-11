import { query, queryOne } from "./db";

export type Note = {
  id: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type NoteRow = {
  id: number;
  title: string;
  body: string;
  created_at: Date;
  updated_at: Date;
};

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listNotes(): Promise<Note[]> {
  const { rows } = await query<NoteRow>("SELECT * FROM notes ORDER BY updated_at DESC");
  return rows.map(toNote);
}

export async function getNote(id: number): Promise<Note | null> {
  const row = await queryOne<NoteRow>("SELECT * FROM notes WHERE id = $1", [id]);
  return row ? toNote(row) : null;
}

export async function createNote(title: string, body: string): Promise<Note> {
  const row = await queryOne<NoteRow>(
    `INSERT INTO notes (title, body) VALUES ($1, $2) RETURNING *`,
    [title, body]
  );
  if (!row) throw new Error("Notitie aanmaken mislukt");
  return toNote(row);
}

export async function updateNote(id: number, title: string, body: string): Promise<Note | null> {
  const row = await queryOne<NoteRow>(
    `UPDATE notes SET title = $2, body = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, title, body]
  );
  return row ? toNote(row) : null;
}

export async function deleteNote(id: number): Promise<boolean> {
  const result = await query("DELETE FROM notes WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
