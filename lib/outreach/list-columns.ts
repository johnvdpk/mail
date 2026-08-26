import type { ListColumn } from "./campaign-profile";

export function formatListColumnValue(column: ListColumn, raw: unknown): string {
  if (raw == null || raw === "") return "—";
  if (Array.isArray(raw)) {
    const mapped = raw.map((item) => column.values?.[String(item)] ?? String(item));
    return mapped.filter(Boolean).join(", ") || "—";
  }
  const asString = String(raw);
  return column.values?.[asString] ?? asString;
}
