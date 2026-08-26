"use client";

import { useEffect, useState } from "react";
import { formatEuro } from "@/lib/projects/period";
import { paidExpense, paidIncome } from "@/lib/projects/insights";
import type { MonthTotals } from "@/lib/projects/types";
import { apiRequest } from "@/lib/shared/api-request";
import styles from "./TrendPanel.module.css";

type TrendResponse = {
  year: number;
  months: MonthTotals[];
  previous: MonthTotals[];
};

type Props = {
  year: number;
};

export function TrendPanel({ year }: Props) {
  const [data, setData] = useState<TrendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void apiRequest<TrendResponse>(`/api/projects/trend?year=${year}`)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Trend ophalen mislukt");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  if (loading) return <p className={styles.empty}>Trend laden…</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (!data) return null;

  const maxIncome = Math.max(...data.months.map((row) => row.totals.income), 1);

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Maand</th>
            <th>Inkomsten</th>
            <th>Ontvangen</th>
            <th>Uitgaven</th>
            <th>Betaald</th>
            <th>Marge</th>
          </tr>
        </thead>
        <tbody>
          {data.months.map((row, index) => {
            const prev = data.previous[index];
            const width = Math.round((row.totals.income / maxIncome) * 100);
            return (
              <tr key={row.key}>
                <td>
                  <span className={styles.month}>{row.label}</span>
                  <span className={styles.bar} style={{ width: `${width}%` }} />
                </td>
                <td className={styles.income}>
                  {formatEuro(row.totals.income)}
                  {prev && <span className={styles.prev}>{formatEuro(prev.totals.income)}</span>}
                </td>
                <td>{formatEuro(paidIncome(row.totals))}</td>
                <td className={styles.expense}>
                  {formatEuro(row.totals.expense)}
                  {prev && <span className={styles.prev}>{formatEuro(prev.totals.expense)}</span>}
                </td>
                <td>{formatEuro(paidExpense(row.totals))}</td>
                <td className={row.totals.margin < 0 ? styles.expense : styles.income}>
                  {formatEuro(row.totals.margin)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={styles.hint}>Lichtere bedragen ernaast zijn vorig jaar.</p>
    </div>
  );
}
