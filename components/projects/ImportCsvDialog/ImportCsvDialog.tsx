"use client";

import { useState } from "react";
import Papa from "papaparse";
import type { LineDirection } from "@/lib/projects/types";
import type { LineSuggestion } from "@/lib/ai/projects-finance";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import { CategorySelect } from "../CategorySelect/CategorySelect";
import styles from "./ImportCsvDialog.module.css";

type ProjectOption = { id: number; name: string; isOverhead: boolean };

type DraftRow = LineSuggestion & { include: boolean };

type Props = {
  projects: ProjectOption[];
  onClose: () => void;
  onImported: (created: number) => void;
};

type SuggestResponse = { suggestions: LineSuggestion[] };
type ConfirmResponse = { created: number; skipped: string[] };

export function ImportCsvDialog({ projects, onClose, onImported }: Props) {
  const action = useAsyncAction();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DraftRow[] | null>(null);

  function parseFile(file: File) {
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0 && result.data.length === 0) {
          setError("CSV kon niet worden gelezen");
          return;
        }
        void suggest(result.data);
      },
      error: () => setError("CSV kon niet worden gelezen"),
    });
  }

  async function suggest(data: Record<string, string>[]) {
    const result = await action.run(async () => {
      return apiRequest<SuggestResponse>("/api/ai/projects-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: data.slice(0, 80) }),
      });
    }, "Suggesties ophalen mislukt");
    if (!result) {
      setError(action.error);
      return;
    }
    setRows(result.suggestions.map((item) => ({ ...item, include: item.amount > 0 })));
  }

  async function confirm() {
    if (!rows) return;
    const selected = rows.filter((row) => row.include);
    if (selected.length === 0) {
      setError("Selecteer minstens één rij");
      return;
    }
    const result = await action.run(async () => {
      return apiRequest<ConfirmResponse>("/api/projects/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: selected.map((row) => ({
            direction: row.direction,
            billing: "one_off",
            name: row.name,
            note: row.note,
            amount: row.amount,
            hours: null,
            cadence: null,
            occurredOn: row.occurredOn,
            paidOn: row.occurredOn,
            vatRate: row.vatRate,
            category: row.category,
            amountIncludesVat: true,
            startsOn: null,
            endsOn: null,
            sourceMessageId: null,
            projectId: row.projectId,
          })),
        }),
      });
    }, "Opslaan mislukt");
    if (!result) {
      setError(action.error);
      return;
    }
    onImported(result.created);
  }

  function update(index: number, patch: Partial<DraftRow>) {
    setRows((current) => current?.map((row, i) => (i === index ? { ...row, ...patch } : row)) ?? null);
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="CSV importeren">
      <div className={styles.dialog}>
        <header className={styles.head}>
          <h2 className={styles.title}>Bankmutaties importeren</h2>
          <button type="button" onClick={onClose}>
            Sluiten
          </button>
        </header>
        {error && <p className={styles.error}>{error}</p>}
        {!rows ? (
          <>
            <p className={styles.hint}>
              Kies een CSV-export van je bank. Er wordt niets opgeslagen tot je de voorstellen
              bevestigt.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={action.loading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) parseFile(file);
              }}
            />
            {action.loading && <p className={styles.hint}>Suggesties worden opgesteld…</p>}
          </>
        ) : (
          <>
            <p className={styles.hint}>Vink uit wat je niet wilt boeken. Pas velden aan waar nodig.</p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th />
                  <th>Naam</th>
                  <th>Bedrag</th>
                  <th>Richting</th>
                  <th>Project</th>
                  <th>Categorie</th>
                  <th>Datum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className={row.include ? undefined : styles.skip}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(event) => update(index, { include: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input value={row.name} onChange={(event) => update(index, { name: event.target.value })} />
                      {row.note && <div className={styles.hint}>{row.note}</div>}
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        value={String(row.amount)}
                        onChange={(event) => update(index, { amount: Number(event.target.value.replace(",", ".")) || 0 })}
                      />
                    </td>
                    <td>
                      <select
                        value={row.direction}
                        onChange={(event) => update(index, { direction: event.target.value as LineDirection })}
                      >
                        <option value="income">In</option>
                        <option value="expense">Uit</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.projectId ?? ""}
                        onChange={(event) =>
                          update(index, { projectId: event.target.value ? Number(event.target.value) : null })
                        }
                      >
                        <option value="">Bedrijf</option>
                        {projects
                          .filter((project) => !project.isOverhead)
                          .map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <CategorySelect
                        direction={row.direction}
                        value={row.category}
                        onChange={(category) => update(index, { category })}
                        allowEmpty={row.direction === "income"}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={row.occurredOn ?? ""}
                        onChange={(event) => update(index, { occurredOn: event.target.value || null })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.actions}>
              <button type="button" disabled={action.loading} onClick={() => void confirm()}>
                {action.loading ? "Opslaan…" : "Bevestig en boek"}
              </button>
              <button type="button" onClick={onClose}>
                Annuleren
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
