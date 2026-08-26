"use client";

import { formatEuro } from "@/lib/projects/period";
import type { CategoryShare } from "@/lib/projects/types";
import styles from "./CategoryBreakdown.module.css";

type Props = {
  items: CategoryShare[];
  emptyLabel?: string;
};

export function CategoryBreakdown({ items, emptyLabel = "Nog geen uitgaven in deze periode." }: Props) {
  if (items.length === 0) {
    return <p className={styles.empty}>{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((item) => item.amount), 1);

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.category}>
          <span>{item.category}</span>
          <span className={styles.meta}>
            {formatEuro(item.amount)} · {item.percent}%
          </span>
          <span className={styles.bar} style={{ width: `${Math.round((item.amount / max) * 100)}%` }} />
        </li>
      ))}
    </ul>
  );
}
