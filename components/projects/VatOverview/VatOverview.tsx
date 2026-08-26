"use client";

import { formatEuro } from "@/lib/projects/period";
import type { VatQuarter } from "@/lib/projects/types";
import styles from "./VatOverview.module.css";

type Props = {
  quarters: VatQuarter[];
};

const QUARTER_LABELS = ["jan–mrt", "apr–jun", "jul–sep", "okt–dec"] as const;

export function VatOverview({ quarters }: Props) {
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
        </li>
      ))}
    </ul>
  );
}
