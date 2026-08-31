"use client";

import { useState } from "react";
import { formatEuro } from "@/lib/projects/period";
import type { LedgerRow } from "@/lib/projects/types";
import { RuleTagDialog } from "../RuleTagDialog/RuleTagDialog";
import { BILLING_LABELS, DIRECTION_LABELS } from "../labels";
import styles from "./LedgerPanel.module.css";

type ProjectOption = { id: number; name: string; isOverhead: boolean };

type Props = {
  rows: LedgerRow[];
  projects: ProjectOption[];
  submitting: boolean;
  onSetLinePaidMonth: (id: number, lineId: number, month: string | string[], paid: boolean) => void;
  onSetLinePaidOn: (id: number, lineId: number, paid: boolean) => void;
  onDelete: (items: Array<{ projectId: number; lineId: number }>) => void;
  onReload: () => void;
};

function paidLabel(row: LedgerRow): string {
  if (row.paid) return "Betaald";
  if (row.partiallyPaid) return "Deels betaald";
  return "Open";
}

function paidBadgeClass(row: LedgerRow): string {
  if (row.paid) return styles.badgePaid;
  if (row.partiallyPaid) return styles.badgePartial;
  return styles.badgeOpen;
}

export function LedgerPanel({
  rows,
  projects,
  submitting,
  onSetLinePaidMonth,
  onSetLinePaidOn,
  onDelete,
  onReload,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tagging, setTagging] = useState<LedgerRow | null>(null);
  const allIds = rows.map((row) => row.lineId);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const incomeTotal = rows
    .filter((row) => row.direction === "income")
    .reduce((sum, row) => sum + row.amount, 0);
  const expenseTotal = rows
    .filter((row) => row.direction === "expense")
    .reduce((sum, row) => sum + row.amount, 0);

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function togglePaid(row: LedgerRow) {
    if (row.billing === "one_off") {
      onSetLinePaidOn(row.projectId, row.lineId, !row.paid);
      return;
    }
    if (row.periodMonths) onSetLinePaidMonth(row.projectId, row.lineId, row.periodMonths, !row.paid);
  }

  function removeSelected() {
    const items = rows
      .filter((row) => selected.has(row.lineId))
      .map((row) => ({ projectId: row.projectId, lineId: row.lineId }));
    if (items.length === 0) return;
    if (!window.confirm(`${items.length} regel(s) verwijderen?`)) return;
    onDelete(items);
    setSelected(new Set());
  }

  if (rows.length === 0) {
    return <p className={styles.empty}>Geen regels in deze periode.</p>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <label className={styles.check}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Alles selecteren
        </label>
        <button type="button" disabled={submitting || selected.size === 0} onClick={removeSelected}>
          {submitting ? "Verwijderen…" : `Verwijder selectie (${selected.size})`}
        </button>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th />
            <th>Datum</th>
            <th>Omschrijving</th>
            <th>Project</th>
            <th>In</th>
            <th>Uit</th>
            <th>Betaald</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.lineId}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.has(row.lineId)}
                  onChange={() => toggle(row.lineId)}
                  aria-label={`Selecteer ${row.name}`}
                />
              </td>
              <td className={styles.meta}>
                {row.occurredOn ?? (row.billing === "periodic" ? BILLING_LABELS.periodic : "—")}
              </td>
              <td>
                {row.name}
                {row.category && <span className={styles.meta}> · {row.category}</span>}
                {row.note && <div className={styles.meta}>{row.note}</div>}
              </td>
              <td className={styles.meta}>{row.projectName}</td>
              <td className={styles.income}>
                {row.direction === "income" ? formatEuro(row.amount) : ""}
              </td>
              <td className={styles.expense}>
                {row.direction === "expense" ? formatEuro(row.amount) : ""}
              </td>
              <td>
                <button
                  type="button"
                  className={paidBadgeClass(row)}
                  disabled={submitting}
                  onClick={() => togglePaid(row)}
                >
                  {paidLabel(row)}
                </button>
              </td>
              <td>
                <button type="button" onClick={() => setTagging(row)}>
                  Markeer als…
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Totaal ({rows.length} regels)</td>
            <td className={styles.income}>{formatEuro(incomeTotal)}</td>
            <td className={styles.expense}>{formatEuro(expenseTotal)}</td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
      <p className={styles.hint}>
        Alle {DIRECTION_LABELS.income.toLowerCase()} en {DIRECTION_LABELS.expense.toLowerCase()} in
        deze periode, van bankimport én handmatige regels, alle projecten.
      </p>
      {tagging && (
        <RuleTagDialog
          row={tagging}
          projects={projects}
          onClose={() => setTagging(null)}
          onDone={onReload}
        />
      )}
    </div>
  );
}
