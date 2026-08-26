import { query, queryOne } from "../shared/db";
import type { VatQuarter } from "./types";

type FilingRow = {
  year: number;
  quarter: number;
  filed_on: Date | string | null;
};

function toDateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function listVatFilings(year: number): Promise<Map<number, string | null>> {
  const { rows } = await query<FilingRow>(
    "SELECT year, quarter, filed_on FROM vat_filings WHERE year = $1",
    [year]
  );
  const map = new Map<number, string | null>();
  for (const row of rows) {
    map.set(row.quarter, toDateOnly(row.filed_on));
  }
  return map;
}

export async function toggleVatFiling(
  year: number,
  quarter: number,
  filed: boolean,
  today: string
): Promise<string | null> {
  if (filed) {
    const row = await queryOne<FilingRow>(
      `INSERT INTO vat_filings (year, quarter, filed_on)
       VALUES ($1, $2, $3)
       ON CONFLICT (year, quarter) DO UPDATE SET filed_on = EXCLUDED.filed_on
       RETURNING *`,
      [year, quarter, today]
    );
    return toDateOnly(row?.filed_on ?? today);
  }
  await query("DELETE FROM vat_filings WHERE year = $1 AND quarter = $2", [year, quarter]);
  return null;
}

export function withFilings(
  year: number,
  quarters: Array<{ quarter: 1 | 2 | 3 | 4; vatIncome: number; vatExpense: number; balance: number }>,
  filings: Map<number, string | null>
): VatQuarter[] {
  return quarters.map((item) => ({
    year,
    ...item,
    filedOn: filings.get(item.quarter) ?? null,
  }));
}
