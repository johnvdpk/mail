"use client";

import { formatEuro } from "@/lib/projects/period";
import { OVERDUE_DAYS } from "@/lib/projects/insights";
import type { OpenLineItem } from "@/lib/projects/types";
import { DIRECTION_LABELS } from "../labels";
import styles from "./OpenItemsList.module.css";

type Props = {
  items: OpenLineItem[];
  onRemind?: (item: OpenLineItem) => void;
  remindingId?: number | null;
};

function ageClass(daysOpen: number): string {
  if (daysOpen >= 60) return styles.ageOld;
  if (daysOpen >= OVERDUE_DAYS) return styles.ageWarn;
  return styles.ageFresh;
}

export function OpenItemsList({ items, onRemind, remindingId }: Props) {
  if (items.length === 0) {
    return <p className={styles.empty}>Geen openstaande posten.</p>;
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={`${item.projectId}-${item.lineId}-${item.occurredOn ?? "open"}`} className={ageClass(item.daysOpen)}>
          <div className={styles.main}>
            <span className={styles.name}>{item.name}</span>
            <span className={styles.meta}>
              {item.projectName}
              {item.clientName ? ` · ${item.clientName}` : ""}
              {" · "}
              {DIRECTION_LABELS[item.direction].toLowerCase()}
              {" · "}
              {item.daysOpen === 0 ? "vandaag" : `${item.daysOpen} dagen open`}
            </span>
          </div>
          <strong className={item.direction === "income" ? styles.income : styles.expense}>
            {formatEuro(item.amount)}
          </strong>
          {item.direction === "income" && onRemind && (
            <button
              type="button"
              className={styles.remind}
              disabled={remindingId === item.lineId}
              onClick={() => onRemind(item)}
            >
              {remindingId === item.lineId ? "Bezig…" : "Stuur herinnering"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
