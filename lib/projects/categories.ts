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
