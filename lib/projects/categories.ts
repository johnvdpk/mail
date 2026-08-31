import { query, queryOne } from "../shared/db";
import type { Category, LineDirection } from "./types";

type CategoryRow = {
  id: number;
  name: string;
  direction: LineDirection;
  created_at: Date;
};

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    direction: row.direction,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listCategories(direction?: LineDirection): Promise<Category[]> {
  const { rows } = direction
    ? await query<CategoryRow>(
        "SELECT * FROM categories WHERE direction = $1 ORDER BY lower(name)",
        [direction]
      )
    : await query<CategoryRow>("SELECT * FROM categories ORDER BY direction, lower(name)");
  return rows.map(toCategory);
}

export async function createCategory(name: string, direction: LineDirection): Promise<Category> {
  const row = await queryOne<CategoryRow>(
    `INSERT INTO categories (name, direction)
     VALUES ($1, $2)
     ON CONFLICT (lower(name), direction) DO UPDATE SET name = categories.name
     RETURNING *`,
    [name, direction]
  );
  if (!row) throw new Error("Categorie aanmaken mislukt");
  return toCategory(row);
}

export async function deleteCategory(id: number): Promise<boolean> {
  const result = await query("DELETE FROM categories WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Renames a category and cascades the free-text name everywhere it's stored verbatim
 * (project_lines.category, counterparty_rules.category aren't a foreign key to categories.id).
 * Returns "duplicate" if another category with that name+direction already exists.
 */
export async function renameCategory(
  id: number,
  name: string
): Promise<Category | "missing" | "duplicate"> {
  const existing = await queryOne<CategoryRow>("SELECT * FROM categories WHERE id = $1", [id]);
  if (!existing) return "missing";
  if (existing.name === name) return toCategory(existing);

  const conflict = await queryOne<{ id: number }>(
    "SELECT id FROM categories WHERE lower(name) = lower($1) AND direction = $2 AND id != $3",
    [name, existing.direction, id]
  );
  if (conflict) return "duplicate";

  const row = await queryOne<CategoryRow>(
    "UPDATE categories SET name = $2 WHERE id = $1 RETURNING *",
    [id, name]
  );
  if (!row) return "missing";

  await query("UPDATE project_lines SET category = $3 WHERE direction = $2 AND category = $1", [
    existing.name,
    existing.direction,
    name,
  ]);
  await query("UPDATE counterparty_rules SET category = $2 WHERE category = $1", [
    existing.name,
    name,
  ]);
  return toCategory(row);
}
