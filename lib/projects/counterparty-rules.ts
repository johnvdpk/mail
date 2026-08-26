import { query, queryOne } from "../shared/db";
import { touchProject } from "./projects";
import type { CounterpartyRule, CounterpartyRuleTarget, ProjectLine } from "./types";

type RuleRow = {
  id: number;
  pattern: string;
  category: string | null;
  project_id: number | null;
  created_at: Date;
};

type LineRow = { id: number; project_id: number };

function toRule(row: RuleRow): CounterpartyRule {
  return {
    id: row.id,
    pattern: row.pattern,
    category: row.category,
    projectId: row.project_id,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listRules(): Promise<CounterpartyRule[]> {
  const { rows } = await query<RuleRow>("SELECT * FROM counterparty_rules ORDER BY lower(pattern)");
  return rows.map(toRule);
}

export async function upsertRule(pattern: string, target: CounterpartyRuleTarget): Promise<CounterpartyRule> {
  const category = target.kind === "category" ? target.category : null;
  const projectId = target.kind === "project" ? target.projectId : null;
  const row = await queryOne<RuleRow>(
    `INSERT INTO counterparty_rules (pattern, category, project_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (lower(pattern)) DO UPDATE SET category = EXCLUDED.category, project_id = EXCLUDED.project_id
     RETURNING *`,
    [pattern, category, projectId]
  );
  if (!row) throw new Error("Regel opslaan mislukt");
  return toRule(row);
}

export async function deleteRule(id: number): Promise<boolean> {
  const result = await query("DELETE FROM counterparty_rules WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Applies a target directly to one line (used for the row the user just tagged). */
export async function applyTargetToLine(
  lineId: number,
  target: CounterpartyRuleTarget
): Promise<ProjectLine["projectId"] | null> {
  const row =
    target.kind === "category"
      ? await queryOne<LineRow>(
          "UPDATE project_lines SET category = $2 WHERE id = $1 RETURNING id, project_id",
          [lineId, target.category]
        )
      : await queryOne<LineRow>(
          "UPDATE project_lines SET project_id = $2 WHERE id = $1 RETURNING id, project_id",
          [lineId, target.projectId]
        );
  if (!row) return null;
  await touchProject(row.project_id);
  return row.project_id;
}

/**
 * Retroactively applies a rule to existing lines whose name/note contains `pattern`
 * (case-insensitive), regardless of direction.
 */
export async function applyRuleToExistingLines(pattern: string, target: CounterpartyRuleTarget): Promise<number> {
  const needle = `%${pattern.toLowerCase()}%`;
  const { rows } =
    target.kind === "category"
      ? await query<LineRow>(
          `UPDATE project_lines
           SET category = $2
           WHERE (lower(name) LIKE $1 OR lower(note) LIKE $1)
             AND category IS DISTINCT FROM $2
           RETURNING id, project_id`,
          [needle, target.category]
        )
      : await query<LineRow>(
          `UPDATE project_lines
           SET project_id = $2
           WHERE (lower(name) LIKE $1 OR lower(note) LIKE $1)
             AND project_id IS DISTINCT FROM $2
           RETURNING id, project_id`,
          [needle, target.projectId]
        );
  if (rows.length > 0) await touchProject(target.kind === "project" ? target.projectId : rows[0].project_id);
  return rows.length;
}

/** Shared body-parsing for the rules API routes: exactly one of category/projectId must be set. */
export function parseRuleTarget(body: Record<string, unknown>): CounterpartyRuleTarget | string {
  const hasCategory = typeof body.category === "string" && body.category.trim().length > 0;
  const hasProjectId = typeof body.projectId === "number" && Number.isInteger(body.projectId);
  if (hasCategory === hasProjectId) return "geef precies één van category of projectId op";
  if (hasCategory) {
    return { kind: "category", category: (body.category as string).trim().slice(0, 60) };
  }
  return { kind: "project", projectId: body.projectId as number };
}

/** Longest matching pattern wins when multiple rules match the same text. */
export function matchRule(text: string, rules: CounterpartyRule[]): CounterpartyRule | null {
  const haystack = text.toLowerCase();
  let best: CounterpartyRule | null = null;
  for (const rule of rules) {
    const needle = rule.pattern.toLowerCase();
    if (!needle || !haystack.includes(needle)) continue;
    if (!best || needle.length > best.pattern.length) best = rule;
  }
  return best;
}
