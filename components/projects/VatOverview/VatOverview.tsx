"use client";

import { formatEuro } from "@/lib/projects/period";
import type { VatQuarter } from "@/lib/projects/types";
import styles from "./VatOverview.module.css";

type Props = {
  quarters: VatQuarter[];
  onToggleFiling: (quarter: 1 | 2 | 3 | 4, filed: boolean) => void;
};

const QUARTER_LABELS = ["jan–mrt", "apr–jun", "jul–sep", "okt–dec"] as const;

export function VatOverview({ quarters, onToggleFiling }: Props) {
  if (quarters.length === 0) {
    return <p className={styles.empty}>Geen BTW-gegevens.</p>;
  }

  return (
    <ul className={styles.list}>
      {quarters.map((item) => (
        <li key={`${item.year}-q${item.quarter}`}>
          <div>
            <span className={styles.name}>
              Q{item.quarter} {item.year}
            </span>
            <span className={styles.meta}>{QUARTER_LABELS[item.quarter - 1]}</span>
          </div>
          <strong className={item.balance < 0 ? styles.expense : undefined}>
            {formatEuro(item.balance)}
          </strong>
          <span className={styles.meta}>
            {formatEuro(item.vatIncome)} te ontvangen / {formatEuro(item.vatExpense)} te betalen
          </span>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={item.filedOn != null}
              onChange={(event) => onToggleFiling(item.quarter, event.target.checked)}
            />
            {item.filedOn ? `Aangegeven op ${item.filedOn}` : "Markeer als aangegeven"}
          </label>
        </li>
      ))}
    </ul>
  );
}
